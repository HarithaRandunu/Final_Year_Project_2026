# Project Files Reference — Promex (Multi-Signal, Co-Scheduling Autoscaling Framework)

Every file under `project/` explained: what it does, its key functions/classes, the exact
formulas and config values it uses, and what it reads/writes. Verified directly against the
files on disk on 2026-08-09 — not reconstructed from memory or from the planning docs alone.

**Scope note:** this document covers `project/` in file-by-file depth. `docs/` itself is not
re-explained here — see `CLAUDE.md`'s own table for what each `docs/*.md` file is for.

**One correction to CLAUDE.md, confirmed on disk this session:** `project/desktop_app/`
("Phase 9") no longer exists — it was deleted and rebuilt from scratch as `project/webapp/`
(Next.js/TypeScript, not Python/FastAPI). CLAUDE.md's Phase 9 description is stale; the real,
current build is documented in `docs/WebApp_Plan_MultiSignal_Autoscaling.md` and
`docs/WebApp_Progress_Trace_MultiSignal_Autoscaling.md`, and in §13 below.

---

## 1. Folder structure

```
project/
├── requirements.txt              # Python deps for everything except webapp/ and eks/loadgen (Node)
├── configs/                      # One JSON config per module + preprocessing (all seed=42)
├── preprocessing/                # Phase 1 — Alibaba trace -> labeled feature table
├── module1_signal_fusion/        # Phase 2 — LightGBM risk classifier + TreeSHAP attribution
├── module2_co_scheduling/        # Phase 3A — discounted Thompson Sampling node placement
├── module3_adaptive_control/     # Phase 3B — PI controller + adaptive conformal inference
├── integration/                  # Phase 4 — simulated closed loop (offline, all 3 modules)
├── live_cluster/                 # Phases 5-6 — kind cluster, 4 live services, ablation harness
│   ├── module1_controller/       #   Module 1 as an HTTP service (GET /risk)
│   ├── module2_extender/         #   Module 2 as a kube-scheduler extender (POST /filter,/prioritize)
│   ├── module3_controller/       #   Module 3 as an HTTP service (GET /state)
│   ├── actuator/                 #   Reads M1+M3, PATCHes TeaStore's replica count
│   ├── teastore/                 #   TeaStore app manifest + HPA/KEDA baseline manifests
│   ├── ablation/                 #   run_trial.py / run_all_arms.py — the 5-arm study harness
│   ├── loadgen/                  #   k6 scripts + Alibaba-trace-to-k6-stages converter
│   └── backups/                  #   original kube-scheduler manifest (for reverting)
├── eks/                          # Phase 6.5 — AWS EKS deployment, written but never run
├── phase7_analysis/              # Phase 7 — statistics over the 25-trial ablation studies
├── dashboard/                    # Phase 8 (optional, superseded) — Streamlit results viewer
├── webapp/                       # Phase 9 (optional, current) — Next.js results/live viewer
├── data/processed/               # Generated: feature tables, residual/decision/trajectory logs
├── results/                      # Generated: Phase 1-4 + Phase 6 (ceiling=2) + Phase 7 outputs
├── results_v2/                   # Generated: Phase 6 follow-up study (ceiling=3) + its Phase 7
└── tests/                        # pytest — one synthetic-fixture test of the labeling logic
```

`__pycache__/`, `.pytest_cache/`, `node_modules/`, `.next/`, `tsconfig.tsbuildinfo` are build
artifacts, not source — omitted below.

---

## 2. Root: `requirements.txt`

```
pandas
pyarrow
matplotlib
pytest
lightgbm
shap
scikit-learn
```
Covers every offline Python script (`preprocessing/`, `module1-3/`, `integration/`,
`phase7_analysis/`, `dashboard/`, `tests/`). The `live_cluster/*/` services each carry their
own minimal `requirements.txt` (see §9) since they ship as separate Docker images.

---

## 3. `configs/` — one JSON per module, all `seed=42`

**`module1_default.json`** — LightGBM hyperparameters (`n_estimators=150, learning_rate=0.05,
num_leaves=7, max_depth=4, min_child_samples=5, subsample=0.8, colsample_bytree=0.8,
reg_alpha=0.1, reg_lambda=0.1, class_weight="balanced"`), `decision_threshold=0.5`,
`walk_forward_n_splits=5`, `walk_forward_min_train_size=150`, `lead_time_max_lookback=6`,
`lead_time_target_alert_rate=0.15`, `cpu_only_cols` (the 4 CPU-only baseline features),
`shap_perturbation_signals` (the 4 signals perturbed in the SHAP sanity check).

**`module2_default.json`** — `msname` (the case-study service's hashed ID),
`n_candidates=6`, `reward_window_minutes=5`, `node_max_cpu_for_candidate=0.9`,
`node_max_mem_for_candidate=0.9`, `discount_gamma=0.9`, `warmup_rounds=5`,
`non_stationary_bucket_range=[238,263]`, `bucket_seconds=120`.

**`module3_default.json`** — `setpoint=0.10`, `kp=0.6`, `ki=0.15`, `initial_threshold=0.10`,
`threshold_bounds=[0.01,0.9]`, `base_max_step=0.05`, `width_sensitivity=3.0`,
`alpha_target=0.10`, `alpha_bounds=[0.02,0.5]`, `aci_gamma=0.05`, `score_window=20`,
`oscillation_window=8`, `oscillation_k=4.0`, `step_response_high=0.6`,
`step_response_pre_steps=15`, `step_response_post_steps=40`.

**`preprocessing_default.json`** — `bucket_seconds=120`,
`provider_metrics=["providerRPC_MCR","providerRPC_RT","HTTP_MCR","HTTP_RT"]`,
`ffill_limit=2`, `delta_windows=[1,2,4]`, `violation_percentile=0.90`, `train_frac=0.75`,
`callgraph_chunksize/load_chunksize/resource_chunksize=500000`.

---

## 4. `preprocessing/` (Phase 1)

### `build_features.py`
The entire Phase 1 pipeline: raw Alibaba `cluster-trace-microservices-v2021` tables → one
labeled, time-split feature table. Two CLI subcommands:

- **`select-candidates`** — ranks `msname`s by call volume (`count_calls_per_receiver`,
  streams `MSCallGraph_*.csv` in chunks, counts by receiver column `dm`) and by distinct
  instance count (`count_instances_per_service`, streams `MSResource_*.csv`, counts unique
  `msinstanceid` per `msname`); writes `results/phase1_preprocessing/candidate_selection.json`.
- **`build --msname <id>`** — runs the full labeling pipeline for one service:
  1. `build_latency_signal` — filters `MSCallGraph` to rows where `dm == msname`, keeps
     `rt < 0` (downstream/callee latency, per the trace's sign convention) OR `rpctype=="mq"`,
     takes `abs(rt)`, buckets by `timestamp // bucket_ms`, aggregates `p95_latency_ms`,
     `p99_latency_ms` (both quantiles of `rt`), `call_count`.
  2. `build_load_signal` — filters `MSRTQps` to `msname`, keeps only the 4
     `provider_metrics`, pivots to one column per metric, bucketed and mean-aggregated.
  3. `build_resource_signal` — filters `MSResource` to `msname`, renames the real on-disk
     columns `instance_cpu_usage`/`instance_memory_usage` to `cpu_utilization`/
     `memory_utilization` (documented column-name correction vs. the original preprocessing
     manual), aggregates per bucket: mean CPU, mean memory, `nunique(msinstanceid)` as
     `active_instances`.
  4. `join_signal_tables` — outer-merges all three on `time_bucket`.
  5. `handle_gaps` — forward-fills every signal column with `limit=ffill_limit` (2 buckets),
     then drops any row still missing `p99_latency_ms`.
  6. `engineer_rolling_deltas` — for windows `(1,2,4)`, adds `{col}_delta{w} = col.diff(w)`
     for every signal column except `call_count`/`active_instances`.
  7. **`construct_label`** — `threshold = p99_latency_ms.quantile(0.90)` (global, over the
     whole 12h trace); `violation_now = (p99_latency_ms > threshold)`;
     **`label_next_violation = violation_now.shift(-1)`** (the forward-shifted label — "is the
     *next* bucket a violation" — is what Module 1 is actually trained to predict); drops the
     final row (no next-bucket label available).
  8. **`time_based_split`** — first `train_frac` (0.75) of rows (in time order, never
     shuffled) → train; rest → test.
  9. `run_sanity_checks` — row/column counts, NaN counts, label means (overall/train/test),
     the violation threshold, `call_count.describe()`.
- Saves `data/processed/features_<tag>[.parquet|_train.parquet|_test.parquet]` (falls back to
  CSV if `pyarrow` is missing) and `results/phase1_preprocessing/<tag>/{metrics.json,
  p99_latency.png}`.

`run_pipeline(cfg, msname)` is the reusable, disk-free core (steps 1–9 above) that both the
CLI and `tests/test_synthetic_pipeline.py` call directly.

---

## 5. `module1_signal_fusion/` (Phase 2 — Signal Fusion) ⭐ TreeSHAP attribution is the individual contribution

**`common.py`** — `Module1Config` dataclass (loads `configs/module1_default.json`).
`LABEL_COL = "label_next_violation"`. `load_feature_table(tag, split)` reads
`data/processed/features_<tag>[_<split>].parquet`. `feature_columns(df)` = every column
except `time_bucket`/the label. `train_lgbm(X, y, cfg)` fits
`lgb.LGBMClassifier(random_state=seed, verbosity=-1, **lgbm_params)`. `predict_risk(model,
signals: dict, feature_order)` — the single-row "decide now" function reused by the dashboard
and by `live_cluster/module1_controller/app.py`'s live scoring.

**`train.py`** — loads train/test splits, trains the model, saves
`artifacts/model_<tag>.joblib` (`{model, feature_order}`), and exports
`data/processed/module1_residual_stream_<tag>.parquet` (`time_bucket, predicted_risk,
actual_outcome` on the **held-out test set only** — the genuine out-of-sample stream). Asserts
`predict_risk()` reproduces `predict_proba` exactly (`< 1e-9` difference) as a wiring check.

**`shap_attribution.py`** — two things:
- `compute_attribution_vectors(model, X, time_buckets)` — `shap.TreeExplainer(model)(X)`,
  slices the positive-class SHAP values, and for each row picks
  `dominant_signal = argmax(|shap_values|)`; returns `(time_bucket, dominant_signal,
  dominant_weight, predicted_risk)` — the artifact Module 2 uses as bandit context offline.
- **`run_shap_sanity_check`** (the ⭐ individual-contribution proof): for each of the 4
  `shap_perturbation_signals`, perturbs that signal's whole feature family (itself +
  `_delta1/2/4`) to its **99th percentile** simultaneously, on top of a median-row baseline.
  `TOP_K_RANK=3`, `MIN_GROWTH_MULTIPLE=1.1`. Passes if the perturbed family's summed |SHAP|
  ranks in the top 3 individual features AND grows ≥1.1× its baseline AND predicted risk
  actually increases. Real result (from `results/module1/primary/shap_sanity_check.json`):
  3/4 signals pass individually; memory_utilization's perturbation gets misattributed to
  p99_latency_ms — disclosed, not hidden.
- `main()` exports `data/processed/module1_attribution_vectors_<tag>.parquet` and
  `results/module1/<tag>/{shap_sanity_check.json, shap_summary.png}`.

**`export_full_trace.py`** — re-scores **every** bucket of the full trace (not just held-out
test rows) for Phase 4's integration log; explicitly notes buckets 0–269 are in-sample
(trained on) predictions, kept for wiring demonstration, not a new accuracy claim. Writes
`data/processed/module1_full_trace_<tag>.parquet`.

**`export_walkforward_oos.py`** — thin export of `validate.py`'s walk-forward
out-of-sample series (genuinely out-of-sample, and covers the trace's bursty plateau, unlike
the calmer held-out test window) to `data/processed/module1_walkforward_oos_<tag>.parquet`,
so Module 3 can consume it without cross-module imports.

**`validate.py`** — the full validation suite:
- **Held-out vs. CPU-only baseline**: trains a `StandardScaler`+`LogisticRegression` on just
  the 4 CPU columns, compares AUC-ROC/AUC-PR/Brier against the fused model.
- **5-fold walk-forward CV** (`walk_forward_n_splits=5`, `min_train_size=150`) — expanding-
  window retrains of both models each fold, concatenated into one time-ordered OOS series.
- **Lead-time comparison**: matches fused/baseline alert rates at `target_alert_rate=0.15`
  via quantile cutoffs, then for each violation-onset episode counts how many of the prior
  `max_lookback=6` buckets already crossed that threshold. Real result: **fails** — fused mean
  lead time (0.44 buckets) is *shorter* than the CPU baseline's (1.06) — disclosed honestly.
- **Generalization check**: trains/tests fresh on a second `msname` (`secondary`).
- Calls `shap_attribution.py`'s sanity check.
- Writes `results/module1/<tag>/{metrics.json, calibration.png, walk_forward_auc_pr.png}`.

---

## 6. `module2_co_scheduling/` (Phase 3A — Co-Scheduling) ⭐ discounted Thompson Sampling is the individual contribution

**`bandit.py`** — `ThompsonSamplingBandit(gamma, seed)`:
```
update(nodeid, reward):
    reward = clip(reward, 0, 1)
    alpha[nodeid] = 1.0 + gamma*(alpha[nodeid] - 1.0) + reward
    beta[nodeid]  = 1.0 + gamma*(beta[nodeid]  - 1.0) + (1.0 - reward)
```
`gamma=1.0` is vanilla Beta-Bernoulli Thompson Sampling; `gamma<1` (0.9 by default) is the ⭐
individual contribution — each arm's accumulated statistics decay back toward the
uninformative `Beta(1,1)` prior before folding in a new observation, so stale evidence from
before a regime shift stops dominating. `select(candidates)` draws one `rng.beta(alpha,beta)`
sample per candidate and returns the arm with the highest draw. `heuristic_select(candidates)`
= `argmax((1-cpu)*(1-mem))` — the deliberately-simple cold-start/comparison baseline.

**`common.py`** — `Module2Config` dataclass. `load_node_table` reads real `Node_0.csv`
telemetry. `load_resource_rows_for_service` streams `MSResource_*.csv` filtered to one
`msname`. `select_node(candidates, state_path, gamma, seed)` — the dashboard's live "decide
now" function: reconstructs a bandit from `final_bandit_state.json`'s saved per-node
`(alpha,beta,pulls)`, gives unseen nodes an uninformative prior, and calls `bandit.select`.

**`simulator.py`** — `NodeSimulator`: pivots real Node_0 telemetry into wide CPU/memory
tables; `eligible_nodes(t)` finds nodes with headroom (`cpu<=0.9, mem<=0.9`) at the nearest
prior timestamp; `reward(nodeid, t)` = mean `((1-cpu)+(1-mem))/2` headroom over the next
`reward_window_minutes` (5) — a real, historically-observed trajectory, not a simulation.

**`extract_events.py`** — scans `MSResource` for each `(msinstanceid, nodeid)` pair's first
appearance. **Finding, documented in the file's own docstring**: the case-study service's 306
instances are all already present at t=0 — zero placement churn for this service in the 12h
window. A cluster-wide scan (no `msname` filter) shows this is trace-wide: of 96,444 distinct
pairs, 96,357 (99.9%) exist at t=0, and only **87** show genuine mid-trace placement anywhere
in the cluster. Module 2 therefore uses a hybrid design: the 306 static pairs *batch-initialize*
each node's bandit arm with real reward history, and the 87 genuine cluster-wide churn events
are the actual sequential rounds the bandit is evaluated on. Writes
`data/processed/module2_placement_events_{primary,churn}.parquet`.

**`validate.py`** — `batch_init_bandit` (folds in the 306 static events' rewards before any
sequential round), `precompute_events` (samples 6 candidates + reward per churn event once),
`run_combined_policy` (batch-init → heuristic for the first `warmup_rounds` sequential rounds
→ discounted TS thereafter — **this is Module 2's actual validated policy**, reused verbatim
by `export_decision_log.py`/`export_final_bandit_state.py`). Validates cumulative regret vs.
oracle/random/heuristic, and discounted-vs-vanilla TS on the real trace's one non-stationary
sub-window (`bucket_range=[238,263]`). **Real-data result: fails** — the real non-stationary
window has *uniform* drift across nodes, not a differential rank shuffle, so discounted TS had
nothing to exploit and vanilla TS edges it out on only 87 usable events — disclosed honestly.
Writes `results/module2/{metrics.json, regret_comparison.png, discounted_vs_vanilla.png,
convergence.png}`.

**`synthetic_rank_inversion.py`** (⭐ addendum, passes) — 6 synthetic arms, means
`[0.85,0.70,0.55,0.40,0.25,0.10]` reversed exactly at the midpoint (round 150 of 300), 50
repeats, one-sided Wilcoxon signed-rank test on discounted-minus-vanilla reward in both the
30-round recovery window and the full 150-round post-inversion phase. **Passes**: p < 0.0001
on both. Writes `results/module2/synthetic_rank_inversion.{json,png}` — a separate file, never
overwrites the real-data `metrics.json`.

**`export_decision_log.py`** — re-runs `run_combined_policy` on the real event data, then
left-merges in Module 1's `dominant_signal`/`predicted_risk` at each event's timestamp
(offline "attribution as bandit context" — logged for reporting, doesn't change the bandit's
own math). Writes `data/processed/module2_decision_log_primary.parquet`.

**`export_final_bandit_state.py`** — replays the full validated policy once more and saves
each touched node's final `{alpha, beta, pulls, posterior_mean}`, sorted by `pulls` descending,
to `results/module2/final_bandit_state.json` — what the dashboard's what-if panel loads so it
doesn't need the raw ~216GB dataset at demo time.

---

## 7. `module3_adaptive_control/` (Phase 3B — Adaptive Control) ⭐ oscillation-conditioned widening is the individual contribution

**`pi_controller.py`** — `PIController.step(measured_value, max_step)`:
```
error = measured_value - setpoint
blocked = (at_lower_bound and error > 0) or (at_upper_bound and error < 0)
if not blocked: integral = clip(integral + error, ±1/ki)      # complementary anti-windup
raw_output = kp*error + ki*integral
step  = clip(-raw_output, ±max_step)
value = clip(value + step, bounds)
```
The docstring documents a real bug found during Phase 4 integration testing: an earlier
version checked the *tentative output's* sign for the anti-windup block, which stayed
dominated by a stale, already-huge integral even after the real error had reversed — the
controller got stuck at the lower bound for ~230 of 360 buckets and never recovered. Fixed by
checking the *current error's own sign* directly.

**`conformal.py`** — `AdaptiveConformalInference(alpha_target, alpha_bounds, gamma,
score_window)`, an online ACI (Gibbs & Candès-style): `current_width()` = the
`(1-alpha)`-quantile of the last `score_window` nonconformity scores; `update(score)` computes
width from history *before* this score, checks coverage, then nudges
`alpha += gamma*(alpha_target - err)` (clipped to bounds). A PI controller calibrated by plain
ACI is BACC's published mechanism — not the individual contribution by itself.

The ⭐ individual contribution, in the same file: `rolling_reversal_count(trajectory, window)`
counts sign-reversals in the controlled parameter's own recent trajectory, and
`oscillation_widening_factor(count, k) = 1 + k*count` multiplies the calibrated conformal
width before it caps the controller's per-cycle movement — so a threshold that has been
oscillating gets its own movement clamped tighter, not just when the *forecast* is noisy
(all plain ACI can see). Docstring states the honest caveat proactively: this relaxes strict
conformal coverage guarantees to a practical safety heuristic (a normal move in this space,
since BACC's own ACI already relaxes strict exchangeability similarly).

**`common.py`** — `Module3Config` dataclass. `load_holdout_residual_stream`/
`load_walkforward_oos_series` read Module 1's two exported streams. `adjust_params(risk,
outcome, mode, tag)` — the dashboard's "decide now" function: replays the *entire* walk-forward
OOS series through a fresh controller to rebuild realistic accumulated state, then applies one
more real step for the given input. `mode="pi_conformal"` disables widening (`mult=1.0`
always) — this is how `validate.py`'s three-way comparison isolates the ⭐ contribution.

**`export_trajectory.py`** — runs the full validated design continuously over Module 1's
full-trace predictions for Phase 4. Writes `data/processed/module3_trajectory_<tag>.parquet`.

**`validate.py`** — `run_arm(df, cfg, mode)` where `mode ∈ {fixed, pi_conformal, full}` is the
core simulation loop (`max_step = base_max_step / (1 + width_sensitivity * widened_width)`,
`alert = risk > threshold`). `compute_elasticity_metrics` — `instability_reversals` (sign
flips in the threshold trajectory), `deviation_std`, `over_/under_provisioning_timeshare`.
Five checks: isolated PI step-response, conformal coverage (target 90%, real result 88.9% —
`close_to_target` since within 15pp), a synthetic step-response test, the **three-way
comparison** (fixed vs. pi_conformal vs. full — real result: **ties**, both non-fixed arms
show 4 reversals on the one real 210-row bursty segment — too few events to resolve a
difference, disclosed honestly, though `deviation_std` does drop monotonically and a
sensitivity check confirms width genuinely correlates with reversal count at r=0.97), and the
sensitivity check itself. Writes `results/module3/{metrics.json, isolated_pi_test.png,
step_response.png, three_way_comparison.png, sensitivity_check.png}`.

**`synthetic_multi_burst.py`** (⭐ addendum, passes on reversal count) — 15 alternating
quiet/busy synthetic segments, 50 repeats, one-sided Wilcoxon on `pi_conformal` vs. `full`
reversal counts and `deviation_std`. Real result: mean reversals **14.04 → 7.64** (full beats
pi_conformal, p < 0.0001); the deviation-std comparison does not reach significance — also
disclosed. Writes `results/module3/synthetic_multi_burst.{json,png}`.

---

## 8. `integration/` (Phase 4 — Simulated Closed Loop)

### `simulated_closed_loop.py`
Does **not** re-implement any module's logic — it runs each module's own export script
(`export_full_trace.py`, `export_decision_log.py`, `export_trajectory.py`) via `subprocess`,
loads the three resulting logs, and checks they're internally coherent:

**10 boolean checks**, `check_coherence()`: decision log covers all 360 buckets with unique
time_buckets; no NaNs in `predicted_risk`/`dominant_signal`; risk values in `[0,1]`; placement
log's attribution context fully matched; placement rewards in `[0,1]`; trajectory covers all
360 buckets; no NaNs in `threshold`/`width`; threshold stays within `configs/
module3_default.json`'s bounds `[0.01,0.9]`; **Module 1's and Module 3's own copies of
`predicted_risk` match exactly** (`np.allclose`, `atol=1e-9` — same source data, no divergence
introduced by re-deriving anything); Module 3's `alert` flag, independently recomputed here as
`predicted_risk > threshold`, matches what Module 3 itself recorded. `all_checks_passed` is
the AND of all 10 — real result: **all pass**.

Writes `results/integration/metrics.json` (`coherence_checks`, plus `summary_stats`: buckets
covered, placement rounds, alerts raised, mean predicted risk, mean placement reward, final
threshold) and `results/integration/closed_loop_overview.png` (M1 risk + M3 threshold/alert
band + M2 placement rewards, one combined timeline).

---

## 9. `live_cluster/` (Phases 5–6 — the live kind cluster)

### `README.md`
The full setup runbook (Parts A–E + troubleshooting + glossary): one-time tool install (Docker
Desktop, kind, kubectl, helm for KEDA); 11-step first-time cluster setup (create the 2-node
kind cluster, untaint the control-plane node so it's schedulable too, install/patch
metrics-server, optionally install KEDA, deploy TeaStore, apply exactly one autoscaling
baseline, build+`kind load` the 4 component images, apply their Deployments, wire Module 2
into the scheduler — the "fiddly step" — verify via `/risk` and `/state`); running a trial
(`run_trial.py`/`run_all_arms.py`); viewing results (`streamlit run project/dashboard/Home.py`
— no live cluster needed); teardown/resume.

### Live components (each a small stdlib-only `http.server`, no framework)

**`module1_controller/app.py`** — polls the K8s metrics API for CPU/memory and actively probes
`teastore-webui`'s own HTTP endpoint on a timer for p95/p99 latency, computes a live feature
vector, calls the same `predict_risk()` trained in Phase 2, exposes `GET /risk`. Documents
which features are real (latency/CPU/mem/replica count, all genuinely measured) vs.
approximated (`providerRPC_* = HTTP_*`, since TeaStore has no second outbound-RPC channel;
`violation_now` uses a rolling 90th percentile over its own recent history since there's no
global historical trace to reference live).

**`module2_extender/app.py`** — a real kube-scheduler extender webhook: `POST /filter` always
passes every node through (Module 2's job is scoring, not admission control); `POST
/prioritize` returns one Thompson-sampled score per candidate node
(`round(bandit.sample(name) * 10)`) from its own in-memory `ThompsonSamplingBandit` (exact
copy of `module2_co_scheduling/bandit.py`, `DISCOUNT_GAMMA=0.9`). A background thread polls
live pods to notice newly-bound `(pod, node)` pairs and feeds the bandit reward = **mean** of
real CPU + memory headroom from the K8s metrics API. **Has no dependency on Module 1** — no
attribution input, no HTTP call to Module 1 anywhere in this file (see
`docs/System_Architecture_Diagram_MultiSignal_Autoscaling.png` for the corrected wiring
diagram this fact drove).

**`module3_controller/app.py`** — polls Module 1's `/risk` on a ~2-minute cycle
(`POLL_SECONDS=120`), runs the same PI + ACI + oscillation-widening controller from
`module3_adaptive_control/`, exposes `GET /state` (mode, threshold, alert, conformal width,
reversal count, and — embedded — Module 2's own bandit state as `module2_bandit_state`). Env
`M3_MODE` toggles `risk` (normal) vs. `cpu_direct` (the `m3_only` ablation arm — controls off
raw CPU instead of Module 1's risk score).

**`actuator/app.py`** — the one component that actually changes cluster state. Reads a signal
+ threshold pair selected by its `ARM` env var (`m1_only`: Module 1 risk vs. a fixed threshold
`FIXED_THRESHOLD=0.08` — recalibrated from an initial 0.5 guess after a first-pass run found
real `predicted_risk` on TeaStore tops out around 0.1–0.3; `m3_only`: raw CPU vs. Module 3's
threshold in `cpu_direct` mode; `full`: Module 1 risk vs. Module 3's threshold in normal mode),
applies the same band rule for every arm (`signal > threshold` → +1 replica; `signal <
threshold*0.5` → -1 replica; else hold), bounded to `[MIN_REPLICAS=1, MAX_REPLICAS=3]`,
rate-limited by `COOLDOWN_SECONDS=90`. PATCHes `teastore-webui`'s replica count directly,
bypassing HPA/KEDA (which must be removed for these arms). At 0 replicas for `baseline`/
`m2_only` — HPA/KEDA drives scaling instead.

Each of the four ships its own `Dockerfile`, `requirements.txt`, and `deployment.yaml`
(RBAC + Deployment + Service; resource requests/limits and readiness/liveness probes on
`/healthz` for all four; the actuator's Deployment starts at `replicas: 0` on purpose).

### `ablation/` — the 5-arm study harness

**`metrics_common.py`** — `compute_elasticity_metrics(trajectory, alert, actual_outcome)`, the
exact same definitions as `module3_adaptive_control/validate.py`, generalized to score *any*
numeric trajectory (so `baseline`/`m2_only`, which have no adaptive threshold, can still be
scored using replica count as the trajectory).

**`run_trial.py`** — one invocation = one full trial. `ARM_CONFIGS` maps each of the 5 arms to
`(keda: bool, actuator_arm: str|None, scheduler: "default"|"extender")`. Per trial:
`configure_arm()` swaps the kube-scheduler's static-pod manifest in/out via `docker cp` when
the arm needs the extender (re-discovering Module 2's ClusterIP live, since it isn't stable
across cluster rebuilds), resets TeaStore to 1 replica, re-applies KEDA if needed, sets the
actuator's `ARM` env var and scales it to 1 (or 0), sets Module 3's `M3_MODE`, force-restarts
Modules 1 and 3 so every arm starts from identical clean state (Module 2's bandit is
deliberately **not** reset — it's a continuously-learning background process by design). If a
scheduler swap happened, sleeps an extra 80s "settling" time (a real cold-start latency spike
was found in the first-pass study right after scheduler swaps). Then: builds k6 replay stages
from the real trace, opens `kubectl port-forward`s to Modules 1 and 3, launches the
`ablation-trial` k6 Job, polls every 30s for replicas/risk/threshold/free-RAM (aborting early
on low memory or a failed k6 Job), and on completion writes
`<results_dir>/<run_id>/metrics.json` — SLA violation count, p95/p99 latency (max of polled
samples), `cost_proxy_pod_seconds` (replica-count integral), the 4 elasticity metrics, and the
full raw risk/threshold/replica traces. `run_id = <UTC timestamp>_<arm>_<run_tag>`.

**`run_all_arms.py`** — orchestrates all 5 arms in the order `[baseline, m1_only, m3_only,
m2_only, full]` (chosen so the 3 default-scheduler arms run together, then the 2
extender-needing arms — one scheduler swap total instead of the first-pass run's ad-hoc 3
swaps), with a stricter pre-trial free-RAM floor than the in-trial one.

### `loadgen/`
**`generate_replay_stages.py`** — block-averages the real 360-bucket `call_count` curve down
to `n_stages=30`, min-max normalizes, rescales into `[min_rps, max_rps]` — replays the trace's
*shape* (quiet periods, elevated plateau), not its absolute magnitude, which is meaningless
against a single-pod TeaStore. **`ablation_trial.js`** — the k6 script actually run in a
trial; reads its whole stage list from the `STAGES_JSON` env var. **`capacity_probe.js`** — a
short fixed-step probe (8/16/24/32 req/s) used to find a good load range before committing to
an hour-long ablation run.

### `teastore/`
**`teastore.yaml`** — TeaStore's 7 Deployments+Services (db, registry, persistence, auth,
image, recommender, webui), adapted from upstream only by adding resource requests/limits
(needed for HPA's CPU-percentage target; upstream ships none) — `webui` given extra headroom
(640Mi/1536Mi) after a real observed near-OOM at idle. **`hpa-baseline.yaml`** /
**`keda-baseline.yaml`** — mutually exclusive autoscaling baselines for `teastore-webui`
(`minReplicas=1, maxReplicas=3`, target 50% CPU utilization); `teastore-image` pinned to
`min=max=1` in both (it isn't the deployment either M1 or the actuator ever targets, and used
to cause a real OOM when both webui and image scaled to 3 simultaneously).

### `kind-cluster.yaml`, `metrics-server-patch.json`, `backups/`
2-node kind topology (`fyp-autoscaling`; control-plane node's default taint removed
post-creation so it's a real second schedulable node, giving Module 2 the same 2-way choice a
3-node attempt would, for one fewer node's overhead). The metrics-server patch adds
`--kubelet-insecure-tls` (needed for kind's self-signed certs). `backups/
kube-scheduler.yaml.orig` is the original static-pod manifest `run_trial.py` restores when
swapping back to the default scheduler.

---

## 10. `eks/` (Phase 6.5 — AWS EKS, written but **never run**)

`README.md` states this explicitly up front: every claim about EKS behavior is marked
`[verify]`. The blocker: Module 2 is a scheduler extender wired via `docker cp` onto kind's
control-plane node — impossible on EKS's managed control plane. Fix: `module2_scheduler/` runs
`kube-scheduler` as an ordinary in-cluster Deployment with its own `schedulerName:
module2-scheduler` (so it doesn't race the AWS-managed scheduler for the default name),
`leaderElect: false`, and the extender addressed by cluster DNS instead of a hardcoded
ClusterIP (removing kind's fragile IP-rewrite step, since this scheduler runs as a normal pod
with real DNS access, not a host-network static pod). `cluster.yaml` (an `eksctl`
ClusterConfig): 4× fixed-size `m5.large` nodes (switched from `t3.large` to avoid CPU-credit
throttling confounding the CPU-scaling arms), single AZ (latency-measurement validity — cross-
AZ differences would confound Module 2's bandit), no NAT gateway, spot disabled (a Free-Tier
account restriction being investigated). `ecr_push.py` builds+pushes the 4 component images
and can rewrite each `deployment.yaml`'s image reference to the ECR URI. `teardown.ps1`
deletes the cluster and *verifies* it's actually gone plus checks for orphaned EBS
volumes/load balancers, since the EKS control plane bills ~$0.10/hr regardless of use.
`loadgen/capacity_probe.js` is a separate, parameterized version of the kind probe (rates via
env var, default sweep `25,50,100,150,200` req/s — an explicit guess, not validated) since the
kind probe's 8–24 req/s band would be absorbed with no scaling on 4×m5.large.

---

## 11. `phase7_analysis/` (Phase 7 — Statistics)

### `statistical_analysis.py`
Analyzes the live 5-arm × 5-trial ablation dataset. `ARMS = [baseline, m1_only, m2_only,
m3_only, full]`. `METRICS` (all lower-is-better): `sla_violation_count, p99_latency_ms,
cost_proxy_pod_seconds, instability_reversals, deviation_std, over_provisioning_timeshare,
under_provisioning_timeshare`.

- `load_dataset()` — walks `<ablation_dir>/<run_id>/metrics.json`, filters to run tags
  matching the given `--tag-prefixes` (default `scaleup1_t,scaleup2_t` — excludes the earlier
  `firstpass`/`recalibrated` single-trial runs), skips aborted runs. **Asserts exactly 5
  trials per arm** or raises.
- `omnibus_test()` — Kruskal-Wallis across all 5 arms per metric.
- `pairwise_tests()` — all 10 pairs, two-sided Mann-Whitney U,
  `rank_biserial_effect_size()` (Cliff's delta), Benjamini-Hochberg FDR correction across the
  10 pairs (`benjamini_hochberg()`).
- `ablation_decomposition()` — each arm's mean delta from baseline; whether `full` beats every
  single-module arm on that metric.
- Writes `metadata` including a hard-coded honest **power caveat**: at n=5/arm, the minimum
  achievable two-sided p-value for a single pairwise comparison is ≈0.008 (2 / C(10,5)) even
  under perfect rank separation.

Outputs (default `results/phase7/`, or `--output-dir results_v2/phase7 --tag-prefixes v2_t`
for the follow-up study): `statistical_analysis.json`, `trial_level_data.csv`,
`metric_distributions_by_arm.png` (2×4 boxplot grid).

---

## 12. `dashboard/` (Phase 8, optional, superseded by `webapp/` — kept, not deleted)

Streamlit app, read-only against `project/results*` (no live cluster needed).
- **`Home.py`** — landing page, static content.
- **`colors.py`** — `ARM_ORDER`/`ARM_COLORS`/`ARM_LABELS` (baseline blue, m1_only orange,
  m2_only aqua, m3_only yellow, full magenta) shared by every chart.
- **`pages/1_Training_Results.py`** — 4 tabs (Integration, Module 1, Module 2, Module 3),
  each reading that phase's `metrics.json`/plots straight off disk, disclosed findings shown
  plainly (fused lead-time loss, vanilla-beats-discounted-TS on real data, the three-way tie).
- **`pages/2_Ablation_Results.py`** — reads `results/phase7/statistical_analysis.json` +
  `trial_level_data.csv`; omnibus table, 7-metric bar-chart grid, significant-pairwise table,
  ablation-decomposition selector, raw-data expanders.
- **`pages/3_Live_WhatIf.py`** — Tier-1 "what-if" panel: loads each module's own `common.py`
  (via `importlib` with unique aliases, since all three are named `common.py`) and calls its
  real decide-now function (`predict_risk`, `select_node`, `adjust_params`) live, on demand —
  never a re-implementation. An Integration tab chains all three and reproduces the actuator's
  own band rule directly.

---

## 13. `webapp/` (Phase 9, optional, current — **supersedes the deleted `desktop_app/`**)

Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 + shadcn/ui (Base UI). Runs on
`127.0.0.1:8878`. Zero charting/diagramming libraries — every chart and diagram is hand-authored
inline SVG. Serves `project/results/`, `project/results_v2/`, and (read-only) a live cluster
via `kubectl port-forward`; never installs, bootstraps, or mutates cluster state.

### `lib/` — server-side data access
- **`config.ts`** — path constants, `MODULE3_THRESHOLD_BOUNDS=[0.01,0.9]` and
  `ACTUATOR_REPLICA_BOUNDS=[1,3]` (hand-duplicated from the Python components' own constants,
  flagged to keep in sync manually), `PORT_FORWARDS` map (module1→18000:8000,
  module3→18091:8091, actuator→18092:8092).
- **`data.ts`** — generic `readJson`/`readCsv` (a deliberately minimal CSV parser built only
  for the project's own flat numeric trial tables)/`fileExists` helpers.
- **`results.ts`** — TypeScript interfaces + loaders for every `metrics.json` (Module 1/2/3,
  Integration, both Phase 7 studies via `loadStatisticalAnalysis("v1"|"v2")`), plus a hardcoded
  `REFERENCE_TRIAL_DIR` (`2026-07-28T20-41-11_full_scaleup2_t2`) used as the TeaStore page's
  recorded comparison trial.
- **`live.ts`** — typed HTTP GETs (2.5s timeout, `no-store`) against the 3 live components
  through the local port-forwards; never writes.
- **`live-history.ts`** — an in-memory (not persisted), 2-second-interval polling buffer,
  capped at 5000 points (~2.8h) as a safety cap, not a sliding window; module-scope singleton
  living for the Node process's life, lazily started on first `/api/live/state` hit.
- **`port-forwards.ts`** — spawns `kubectl port-forward` child processes per component,
  tracks status (stopped/starting/running/crashed) from stdout/stderr, auto-restarts.
- **`colors.ts`** — the arm color/tone system, ported from the deleted `desktop_app`'s
  `colors.py` (itself matching `dashboard/colors.py`); theme-aware CSS-var variants for
  anything rendered live (vs. static hex for anything exported as an image).
- **`utils.ts`** — `cn()`, the standard shadcn class-merge helper.

### `app/` — pages (App Router)
`/` Research Overview (problem, RQs, literature gap, the three ⭐ novelty claims, methodology
diagram) · `/overview` Project Overview (architecture diagram, per-module technical detail,
tech stack, dataset, per-member individual-contribution cards) · `/knowledge` (MAPE-K framing;
diagram + a literal code-location table mapping each module's own private state to exact
files/lines) · `/data-pipeline` (the full offline path — dataset → preprocessing → per-module
train/validate — with real code snippets and a diagram) · `/teastore` (what TeaStore is, the
5-arm design, the traffic-replay derivation, one recorded reference trial charted) ·
`/results` (Training Results + both Ablation studies side by side, tabbed) · `/conclusion`
(headline before/after numbers for both studies, disclosed findings, limitations, future work)
· `/live` (the live cluster view — `LiveDashboard`). Plus `layout.tsx`/`error.tsx`/
`loading.tsx`/`not-found.tsx` (framework conventions).

**API routes**: `GET /api/live/state` (bootstraps port-forwards + polling, returns current
readings + full history), `GET /api/live/reference` (the recorded comparison trial),
`GET /api/results/image/[...segments]` (serves `results*/**.png` through a path-traversal-safe
allowlist).

### `components/` (selected — see `docs/WebApp_Progress_Trace_MultiSignal_Autoscaling.md` for
the full build history of each)
`diagram-figure.tsx` (the shared hand-SVG primitives every diagram is built from),
`architecture-diagram.tsx`, `pipeline-diagram.tsx`, `knowledge-diagram.tsx`, `step-flow.tsx`,
`code-snippet.tsx`; `results/*` (one section component per module + integration + the ablation
panel + a dependency-free HTML/CSS bar chart); `live/*` (the live dashboard, a hand-SVG
multi-line chart with "nice" tick rounding and auto-fit y-domain, an analog speedometer gauge,
status tiles, a no-cluster empty state); `status-badge.tsx` (two vocabularies sharing one
component: `pass/partial/disclosed` for closed research findings vs.
`healthy/elevated/unreachable` for live reachability); `ui/*` (10 shadcn/Base UI primitives).

`package.json`: Next 16.3.0, React 19.2.8, Tailwind 4, `@base-ui/react`, `next-themes`,
`lucide-react`, `sonner`. Scripts: `dev`→`next dev -p 8878`, `build`, `start`, `lint`.

---

## 14. `data/processed/` — generated intermediate data (all Parquet)

| File | Produced by | Contents | Consumed by |
|---|---|---|---|
| `features_primary[.parquet\|_train\|_test]` | `preprocessing/build_features.py` | Phase 1's labeled feature table for the case-study service | `module1_signal_fusion/{train,validate}.py` (train/test); `export_full_trace.py`, `tests/test_synthetic_pipeline.py` exercises the same function, not this file itself |
| `features_secondary[...]` | same, `--msname` = secondary service | For Module 1's generalization check | `module1_signal_fusion/validate.py`'s generalization-check step only |
| `features_primary_preview.csv` / `features_secondary_preview.csv` | same | Small CSV previews for quick inspection | Nothing downstream reads these — human-inspection convenience only |
| `module1_residual_stream_primary.parquet` | `module1_signal_fusion/train.py` | Held-out test predictions (`time_bucket, predicted_risk, actual_outcome`) | `module3_adaptive_control/common.py::load_holdout_residual_stream` (dashboard what-if) |
| `module1_walkforward_oos_primary.parquet` | `module1_signal_fusion/export_walkforward_oos.py` | Genuinely-OOS, bursty walk-forward series — Module 3's real validation input | `module3_adaptive_control/validate.py` (the actual validation run), `common.py::adjust_params` |
| `module1_full_trace_primary.parquet` | `module1_signal_fusion/export_full_trace.py` | Every bucket of the trace re-scored, for Phase 4 | `module3_adaptive_control/export_trajectory.py`; `integration/simulated_closed_loop.py` (as `decision_log`) |
| `module1_attribution_vectors_primary.parquet` | `module1_signal_fusion/shap_attribution.py` | Per-test-row dominant SHAP signal + weight | `module2_co_scheduling/export_decision_log.py` (left-merged in as bandit context) |
| `module2_placement_events_primary.parquet` | `module2_co_scheduling/extract_events.py` | 306 static (msinstanceid,nodeid) batch-init events | `module2_co_scheduling/validate.py::batch_init_bandit` (and its callers `export_decision_log.py`, `export_final_bandit_state.py`) |
| `module2_placement_events_churn.parquet` | same | 87 genuine cluster-wide mid-trace placement events | `module2_co_scheduling/validate.py::precompute_events` (and the same two export scripts) |
| `module2_decision_log_primary.parquet` | `module2_co_scheduling/export_decision_log.py` | Real combined-policy placement log + Module 1 attribution context | `integration/simulated_closed_loop.py` (as `placement_log`) |
| `module3_trajectory_primary.parquet` | `module3_adaptive_control/export_trajectory.py` | Full-trace threshold/width/alert trajectory | `integration/simulated_closed_loop.py` (as `trajectory`) |

---

## 15. `results/` and `results_v2/` — generated outputs

**`results/phase1_preprocessing/`** — `candidate_selection.json` + `{primary,secondary}/
{metrics.json, p99_latency.png}`.

**`results/module1/primary/`** — `metrics.json`, `shap_sanity_check.json`, `calibration.png`,
`shap_summary.png`, `walk_forward_auc_pr.png`.

**`results/module2/`** — `metrics.json`, `synthetic_rank_inversion.json`,
`final_bandit_state.json`, `regret_comparison.png`, `discounted_vs_vanilla.png`,
`convergence.png`, `synthetic_rank_inversion.png`.

**`results/module3/`** — `metrics.json`, `synthetic_multi_burst.json`, `isolated_pi_test.png`,
`step_response.png`, `three_way_comparison.png`, `sensitivity_check.png`,
`synthetic_multi_burst.png`.

**`results/integration/`** — `metrics.json`, `closed_loop_overview.png`.

**`results/ablation/`** — one folder per trial, named `<UTC timestamp>_<arm>_<tag>/
metrics.json` (schema: see `run_trial.py`'s `build_metrics()` in §9). 31 folders total:

| Tag group | Trials | Included in Phase 7? |
|---|---|---|
| `firstpass` (5 arms × 1) | 5 | No — excluded by `--tag-prefixes` |
| `recalibrated` (m1_only × 1) | 1 | No |
| `scaleup1_t1..t3` (5 arms × 3) | 15 | Yes |
| `scaleup2_t1..t2` (5 arms × 2) | 10 | Yes |
| `_excluded_broken_runs/` | 1 + README | No — explicitly excluded, reason in its own README |

`scaleup1` + `scaleup2` = 5 trials/arm × 5 arms = the 25-trial study Phase 7 actually analyzes
(replica ceiling 2, local dev host).

**`results/phase7/`** — `statistical_analysis.json`, `trial_level_data.csv`,
`metric_distributions_by_arm.png` — the analysis of the 25 `results/ablation` trials above.

**`results_v2/ablation/`** — the same 5-arm design, 25 trials (`v2_t1..t5` × 5 arms), run on a
dedicated Hetzner cloud VM with the replica ceiling raised to 3 — see
`docs/Results_v2_Study_Report_MultiSignal_Autoscaling.md`.

**`results_v2/phase7/`** — same schema as `results/phase7/`, generated via `--tag-prefixes
v2_t --output-dir results_v2/phase7`.

---

## 16. `tests/`

### `test_synthetic_pipeline.py`
Builds a synthetic Alibaba-schema fixture (50 buckets, a deliberate latency/CPU burst injected
at bucket 30) matching the real on-disk column names/schema exactly, runs it through
`preprocessing/build_features.py`'s real `run_pipeline()`, and asserts
`label_next_violation == 1` at bucket 29 (exactly one bucket before the burst — proving the
forward-shift is neither off-by-one nor leaking), `== 0` at two earlier quiet buckets (guards
against label leakage), and that the label isn't degenerate (`0 < mean < 1`). No files under
`project/` are read or written — everything lives in a pytest `tmp_path`.

---

## 17. File-to-file wiring — the full data-flow graph

Every section above explains files in isolation. This section is the part that was missing:
which file's *output* is the next file's *input*, in the order data actually moves, across
module boundaries. Three separate graphs — offline pipeline, live cluster, and the
reporting layer that reads both — plus one cross-cutting note on how modules stay decoupled.

### 17.1 Offline pipeline (Phases 1–4) — one straight line, then a fan-in at Phase 4

```
Raw Alibaba CSVs (MSCallGraph, MSRTQps, MSResource, Node_0)
        │
        ▼
preprocessing/build_features.py  ──►  data/processed/features_primary[_train|_test].parquet
                                       data/processed/features_secondary[...].parquet
        │                                      │
        │                                      ▼
        │                      module1_signal_fusion/train.py
        │                              │            │
        │                              ▼            ▼
        │                artifacts/model_primary   data/processed/
        │                     .joblib               module1_residual_stream_primary.parquet
        │                              │                       │
        │                              ▼                       ▼
        │          module1_signal_fusion/{shap_attribution,    module3_adaptive_control/
        │          export_full_trace,export_walkforward_oos}.py common.py (dashboard what-if)
        │                  │           │              │
        │                  ▼           ▼              ▼
        │   attribution_vectors  full_trace   walkforward_oos
        │   _primary.parquet    _primary.pq   _primary.parquet
        │          │                 │                 │
        │          ▼                 │                 ▼
        │   module2_co_scheduling/   │      module3_adaptive_control/validate.py
        │   export_decision_log.py   │           (the actual Module 3 validation run)
        │          │                 │                 │
        │          ▼                 ▼                 ▼
        │   module2_decision_    module3_adaptive_   module3_adaptive_control/
        │   log_primary.parquet  control/export_      export_trajectory.py
        │          │             trajectory.py               │
        │          │                    │                    ▼
        │          │                    ▼           module3_trajectory_
        │          │            (consumes full_trace  primary.parquet
        │          │             _primary.parquet          │
        │          │             from the left branch)      │
        │          ▼                    ▼                    ▼
        └──────────┴────────────────────┴────────────────────┘
                                  │
                                  ▼
                integration/simulated_closed_loop.py
                (re-runs the 3 export scripts via subprocess, loads all 3 logs,
                 cross-checks them, e.g. M1's and M3's own copies of predicted_risk
                 must match exactly)
                                  │
                                  ▼
                results/integration/{metrics.json, closed_loop_overview.png}
```

Also feeding this graph independently: `module2_co_scheduling/extract_events.py` reads raw
`MSResource` directly (not through `build_features.py`) and produces
`module2_placement_events_{primary,churn}.parquet`, which `module2_co_scheduling/validate.py`
combines with live Node telemetry (`simulator.py`) — this is the input `export_decision_log.py`
actually runs its policy on before merging in Module 1's attribution vectors.

### 17.2 Live cluster (Phases 5–6) — HTTP polling chain + one file copy

```
artifacts/model_primary.joblib  ──(copied at build time, not imported)──►
                                        live_cluster/module1_controller/model_primary.joblib
                                                        │
                                          loaded by module1_controller/app.py
                                                        │
                                          GET /risk  (port 8000)
                                    ┌───────────────────┼────────────────────┐
                                    ▼                   ▼                    ▼
                        module3_controller/app.py   actuator/app.py    webapp lib/live.ts
                        (polls every ~2 min)         (arm=m1_only/full) (via kubectl port-forward)
                                    │                   ▲
                              GET /state (port 8091)    │
                                    │                   │
                        ┌───────────┴──────────┐        │
                        ▼                       ▼        │
                 actuator/app.py          webapp lib/live.ts
                 (arm=m3_only/full,      (via kubectl port-forward)
                  reads .threshold) ─────────────────────┘
                        │
                        ▼
              PATCHes teastore-webui's replica count directly
              (live_cluster/teastore/teastore.yaml's Deployment)
```

Separately, `module2_extender/app.py` is wired **not** by HTTP call from another component but
by the cluster's own scheduler config: `module2_extender/scheduler-extender-config.yaml` +
`kube-scheduler-with-extender.yaml` are `docker cp`'d onto the kind control-plane node (by
`live_cluster/ablation/run_trial.py::configure_arm`, or manually per `live_cluster/README.md`),
which makes `kube-scheduler` itself call `POST /filter` and `/prioritize` on Module 2 for every
new pod. Module 2's reward loop closes separately again: a background thread inside
`module2_extender/app.py` polls the K8s metrics API directly — no other component is involved.

**Important design point, not a gap:** `module2_extender/app.py`'s `ThompsonSamplingBandit`
class is a hand-copied duplicate of `module2_co_scheduling/bandit.py`, not an import — each
live component ships as an independent Docker image with no shared package, so Modules 1/2/3's
live `app.py` files re-embed the validated offline logic (same formulas, verified line-by-line
in §5–7 vs. §9) rather than depending on the offline codebase at runtime.

`live_cluster/ablation/run_trial.py` sits above all four components: it starts/reconfigures
them via `kubectl`/`docker cp`, drives load through `loadgen/ablation_trial.js` (whose stage
list comes from `loadgen/generate_replay_stages.py` reading the same real Alibaba
`call_count` curve `build_features.py` used), polls Modules 1/3 and the Deployment directly
(not through the actuator), and writes the trial's own `results/ablation/<run_id>/metrics.json`
— an entirely separate output path from anything the offline pipeline (§17.1) produces.

### 17.3 Reporting layer — both `dashboard/` and `webapp/` are pure downstream readers

Neither ever writes into `data/processed/`, `results/`, or `results_v2/` — both only read
files §17.1/§17.2 already produced, plus (for the "what-if"/live views) talk to already-running
processes.

| Reads | `dashboard/` (Phase 8) | `webapp/` (Phase 9) |
|---|---|---|
| `results/module{1,2,3}/*`, `results/integration/*` | `pages/1_Training_Results.py` | `components/results/module{1,2,3}-section.tsx`, `integration-section.tsx` via `lib/results.ts` |
| `results/phase7/*`, `results_v2/phase7/*` | `pages/2_Ablation_Results.py` (v1 only) | `components/results/ablation-study-panel.tsx` via `lib/results.ts` (both v1 and v2) |
| `results/module2/final_bandit_state.json` | `pages/3_Live_WhatIf.py` (reconstructs a bandit for a live decision) | not read |
| One `results/ablation/<run_id>/metrics.json` | not read | `lib/results.ts::loadReferenceTrial()` — hardcoded to `2026-07-28T20-41-11_full_scaleup2_t2`, shown on `/teastore` |
| `module{1,2,3}_signal_fusion/common.py` etc., imported live via `importlib` | `pages/3_Live_WhatIf.py` | not used — webapp has no offline-Python what-if panel |
| Live components' `/risk`, `/state` over HTTP | not used (dashboard has no live view) | `lib/live.ts` + `lib/port-forwards.ts`, surfaced on `/live` |

The webapp's own `/data-pipeline` and `/knowledge` pages are, in effect, a second, narrower,
UI-native version of §17.1 and this section — they cite the same files (e.g.
`module3_controller/app.py:81` for `self.integral`) as `CodeSnippet`s rather than re-deriving
them, so this document and those two pages should never be allowed to drift apart on a fact.

---

## Appendix: reading order for a first-time reviewer

1. `docs/Full_Plan_MultiSignal_Autoscaling.md` — the technical plan this whole tree implements.
2. `preprocessing/build_features.py` → `module1_signal_fusion/` → `module2_co_scheduling/` →
   `module3_adaptive_control/` → `integration/simulated_closed_loop.py` — the offline pipeline,
   in the order data actually flows.
3. `live_cluster/README.md`, then the four `live_cluster/*/app.py` services and
   `live_cluster/ablation/run_trial.py` — how the same modules run live.
4. `phase7_analysis/statistical_analysis.py` — how the live trials become reported statistics.
5. `project/webapp/` — how all of the above gets shown to a reader (`app/data-pipeline`,
   `app/knowledge`, and `app/results` are the closest webapp pages to this document itself).
