# Full Implementation Plan
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Ninth companion document. Covers everything needed to go from the currently-downloaded dataset to validated, integrated modules, before any live cluster work begins. Pairs with Phase_Plan.md (the staged breakdown) and Progress_Trace.md (the live tracker).*

---

## 1. Objective

Build and validate, entirely offline first, the three modules already designed (LightGBM + SHAP signal fusion; discounted Thompson Sampling co-scheduling; PI + conformal + oscillation-aware adaptive control), using the `cluster-trace-microservices-v2021` dataset already downloaded to disk, before porting them into an actual Kubernetes deployment for the final ablation study.

---

## 2. Dataset & Extraction Status

**Correction (2026-07-26):** the row below describing `_0`/`_1` as "sufficient" was based on a mistaken assumption that shards were randomly sampled. They are not — the vendored README confirms `timestamp` spans 0-43,200,000ms (12h) across the *whole* dataset, so each numbered shard is a contiguous slice of that single global timeline, sized in inverse proportion to how many shards a table has. Extracting only `_0` (and `_1` for MSCallGraph) therefore gave access to only the *first* slice of real trace time per table — Node (1 shard) happens to cover the full 12h, but MSRTQps's `_0` covers only ~29 minutes, MSResource's `_0` only ~60 minutes, and MSCallGraph's `_0`+`_1` only ~10 minutes. Joining all three on time bucket collapses to whatever the narrowest one covers.

| Category | Shards | Extracted (original Phase 0) | Extracted (final, Phase 1) | Real time covered |
|---|---|---|---|---|
| `Node` | 1 | 1/1 | 1/1 (unchanged) | Full 12h |
| `MSRTQps` | 25 | 1/25 (`_0`) | **25/25 (all)** | Full 12h |
| `MSCallGraph` | 145 | 2/145 (`_0`,`_1`) | **145/145 (all)** | Full 12h |
| `MSResource` | 12 | 1/12 (`_0`) | **12/12 (all)** | Full 12h |

**Full 12-hour coverage achieved.** Extracted incrementally in stages jointly with the user (~4h, then ~5.3h, then complete) as disk space allowed. Drive C: alone couldn't hold the full extracted dataset (full coverage needs ~300GB total on-disk once extracted, though the *net new* space needed was smaller since the compressed originals were already downloaded and were deleted after each shard's CSV was verified) — resolved by also using drive E: (`E:\FYP_DataSet_Extract\...`) for the overflow, with NTFS directory junctions linking those folders back into the expected C: dataset path. This is transparent to `build_features.py` (a junction looks like a normal directory to any tool that walks the tree), so no code changes were needed — it globs all extracted shards per table regardless of which physical drive each one lives on. The previously-anticipated "12-hour window limits diurnal-pattern learning" risk in Section 11 below is therefore **not** compounded by a partial-window issue anymore — the modeling window is the full 12h as originally planned.

---

## 3. Shared Preprocessing Pipeline (Phase 0 extraction is done; this is Phase 1 — blocks all three modules)

**Authoritative version:** `Preprocessing_Manual_MultiSignal_Autoscaling.md` (same folder as this file) — a step-by-step, individually-runnable walkthrough with tested code for every stage, plus a sanity check and troubleshooting entry per step. Follow it directly; the summary below exists only to keep this document self-contained, not as a second source of truth. If this summary and the Manual ever disagree, the Manual (validated against synthetic data with a known injected burst) is correct — treat the mismatch as a bug here to fix.

Condensed: extract `MSResource_0` → select a case-study `msname` (high call volume *and* multiple instances) → build the latency signal (true p95/p99 from `MSCallGraph`, DM-side only via the `rt` sign convention) → build the load/backlog signal (`MSRTQps`, `provider*` metrics only) → build the resource signal (`MSResource`, mean CPU/memory across instances) → join all three on a common time bucket → bounded forward-fill for small gaps → engineer rolling deltas → construct a self-referential, forward-shifted violation label → time-based train/test split → run every sanity check → persist as Parquet (CSV fallback if `pyarrow` isn't installed).

This pipeline is implemented in `project/preprocessing/build_features.py`, with `select-candidates` and `build` as its two subcommands, plus a synthetic-burst validation test at `project/tests/test_synthetic_pipeline.py` (passes — reproduces the Manual §17 early-detection behavior). Primary and secondary feature tables are built and saved to `project/data/processed/`, **each 360 rows (270 train / 90 test) — full 12-hour coverage, matching the Manual's expected row-count ballpark exactly.** See `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 1 section for the chosen `msname`s, sanity-check results, and the train/test label-balance numbers on both services (walk-forward CV, already planned for Phase 2, remains the recommended approach over trusting a single holdout).

**Exit artifact:** one versioned feature table (`.parquet` or `.csv`) passing every check in Preprocessing_Manual §13.

---

## 4. Module 1 Pipeline

**Data → Features → Model → Attribution → Validation**

> **⭐ Individual contribution (Member 1):** everything above the line is a standard, well-established technique (gradient-boosted classification for risk scoring). The individual contribution is the SHAP attribution step below — exposing *which* signal is driving the current risk score, as a real per-decision output consumed by Module 2, not a post-hoc inspection tool. The literature reviewed for this project fuses signals into a score but never explains why the score is high; that reasoning normally stays inside the model. This is what makes Module 2's placement decision genuinely cause-aware, rather than driven by a hand-coded rule like "if backlog > threshold, cause = backlog." **Do not simplify this away or treat it as optional** — the SHAP sanity check below is a Phase 2 exit criterion, not a stretch goal.

- Train LightGBM binary classifier on the Phase 1 feature table (time-based split).
- Run TreeSHAP on every test-set prediction to produce the attribution vector.
- Export two artifacts for downstream modules: (a) the held-out prediction/residual stream (`predicted_risk`, `actual_outcome`, `timestamp`) for Module 3; (b) the attribution vectors (`timestamp`, dominant signal, weight) for Module 2.

**Validation methods** (see Section 7 for the summary table):
- AUC-ROC, AUC-PR, calibration (Brier score / reliability diagram)
- Lead-time comparison against a CPU-only baseline (logistic regression or simple threshold) — the direct test of Sub-RQ 1
- Walk-forward cross-validation across time folds
- **Generalization check on a second, differently-patterned `msname` — this requires rerunning all of Phase 1's preprocessing (Preprocessing_Manual §3–14) on that second service first.** There is only one feature table from Phase 1 by default; this check needs a second one. Pick the second service during Phase 1's own candidate-selection step (Manual §3) so it's ready when Module 1 needs it, rather than discovering this dependency mid-Phase-2.
- **SHAP sanity check via synthetic single-feature perturbation — this is the test that proves the individual contribution actually works, not a generic model-quality check.**

---

## 5. Module 2 Pipeline

**Real placement events → Simulator → Discounted Thompson Sampling → Validation**

> **⭐ Individual contribution (Member 2):** Thompson Sampling itself is a standard bandit algorithm; NL-CPS (the closest prior art) already applies bandits to Kubernetes placement. The individual contribution is the discount factor γ < 1 applied to each arm's accumulated posterior statistics before every update, so recent placement outcomes count more than stale ones — a small, deliberate change to the posterior-update step, not a new algorithm. NL-CPS's problem is a *one-time, stationary* control-plane placement decision; this project's problem is *recurring* placement under node contention that genuinely drifts over the course of an experiment — exactly the condition discounting is designed for. **Do not implement vanilla Thompson Sampling and stop there** — the discounted-vs-vanilla comparison below is what turns this into a tested claim rather than an assertion.

- Scan `MSResource` for `(msinstanceid, nodeid)` first-appearances — each is a real historical placement event.
- At each event, sample K candidate nodes from `Node_0` with real headroom at that timestamp.
- Context per candidate: `node_cpu_usage`/`node_memory_usage` at that time, plus Module 1's attribution vector for the triggering signal.
- Reward: the chosen node's real subsequent CPU/memory trajectory (directly observed); for unchosen candidates, their own real trajectories over the same window (a stated approximation, not a true counterfactual — document this explicitly wherever results are reported).
- Run discounted Thompson Sampling over the event stream in chronological order.
- **Heuristic fallback policy** (used while the bandit has too little history to trust, and as the comparison baseline in the regret validation below): score each candidate node as `available_cpu_headroom × available_memory_headroom`, pick the highest score. This is deliberately simple — it exists so the bandit has a sane cold-start behavior and a real baseline to beat, not as a second research contribution. Don't over-engineer it.

**Validation methods:**
- Cumulative regret vs. an oracle-in-hindsight, a random policy, and the heuristic fallback
- **Discounted TS vs. vanilla (undiscounted) TS, compared specifically on a deliberately selected non-stationary sub-window (the module's own mini-ablation) — this comparison is the evidence for the individual contribution, not an optional extra.**
- Convergence check: does node preference stabilize over the event stream, or fail to converge
- **Addendum (2026-07-29), `synthetic_rank_inversion.py`:** the real trace's non-stationary sub-window turned out to have *uniform* drift (overall reward level drops together across nodes) rather than *differential* drift (relative node rankings changing) — discounting is specifically designed to help with the latter, so the real-data mini-ablation above had nothing to exploit and vanilla TS edged it out (see Progress_Trace.md's Phase 3A). A controlled synthetic test isolates exactly that condition: a two-phase environment where the best-to-worst node ranking is deliberately reversed partway through (same means, reversed arm assignment — a genuine rank inversion, not a level shift), run over 50 repeats with paired Wilcoxon significance testing. This is the same methodological move as this module's own SHAP-perturbation and Module 3's step-response tests — neither of those relies on real data alone either. Does not replace the honest real-data finding; both are reported.

---

## 6. Module 3 Pipeline

**Module 1's residual stream → Adaptive Conformal Inference → PI Controller → Oscillation Widening → Validation**

> **⭐ Individual contribution (Member 3):** a PI controller calibrated by Adaptive Conformal Inference is BACC's mechanism (Liu, Li, Farkiani & Crowley, 2026) — already published, already tested on Kubernetes. Presenting that combination alone as the contribution would not hold up under scrutiny. The individual contribution is the oscillation-conditioned widening step below: a second input (rolling count of recent scaling-direction reversals) multiplies the calibrated interval width before it bounds the controller's movement, so the safety envelope tightens automatically when the system has been oscillating, not only when the forecast is noisy. BACC's design has no mechanism that looks at its own recent control behavior — this is a self-referential stability addition BACC doesn't have. **Honest caveat to state proactively, not concede under questioning:** this widening step relaxes strict conformal coverage guarantees to a practical safety heuristic — BACC's own ACI already relaxes strict exchangeability for a similar reason, so this is a normal move in this space, not a flaw unique to this design.

- Walk Module 1's held-out residual stream in time order.
- Feed residuals into Adaptive Conformal Inference online (no separate calibration set).
- PI controller uses the calibrated interval to bound per-cycle parameter movement (threshold, step size, monitoring interval); log the full parameter trajectory.
- Track rolling reversal count from the resulting simulated action log; multiply the conformal interval width accordingly (oscillation-conditioned widening).
- Stress test on a naturally bursty sub-window or a deliberately spliced quiet→busy transition.

**Validation methods:**
- Empirical conformal coverage check (does the interval contain the true residual at ~the target rate)
- Classic control-theory step-response test (overshoot, settling time, boundedness)
- Three-way comparison on Tamiru et al.'s elasticity metrics (instability, deviation, over/under-provisioning timeshare): fixed-parameter vs. PI+conformal vs. full design, on the bursty stress segment specifically — **this three-way comparison is the evidence for the individual contribution; the middle arm (PI+conformal, no widening) exists specifically to isolate what the widening step adds.**
- Sensitivity check: does the interval visibly widen right after a reversal-count spike, and shrink back once stable
- **Addendum (2026-07-29), `synthetic_multi_burst.py`:** the real bursty segment only contains 3-4 genuine reversals, too few for a discrete count to show separation (full and PI+conformal tied on every parameter combination tested — see Progress_Trace.md's Phase 3B). A controlled synthetic input with deliberately many more quiet↔busy transitions (15 bursts/repeat instead of 1) gives the same reversal-count metric enough events to move, run over 50 repeats with paired Wilcoxon significance testing. Same pattern as this module's own step-response test (already synthetic, just repeated) and Module 2's rank-inversion test. Does not replace the honest real-data finding; both are reported.

---

## 7. Validation Summary Table

| Module | Primary Method | Metric | Pass Criterion | Proves |
|---|---|---|---|---|
| Module 1 | Held-out AUC-PR vs. CPU-only baseline | AUC-PR | Fused model exceeds baseline | General model quality |
| Module 1 | Lead-time comparison | Intervals of early warning | Fused model's lead time positive and greater than baseline's | General model quality |
| Module 1 | SHAP sanity check (synthetic perturbation) | Attribution correctly points to the perturbed signal | Attribution is not noise | **⭐ Individual contribution** |
| Module 2 | Cumulative regret | Reward vs. oracle | Gap narrows over the event stream (learning is happening) | General bandit quality |
| Module 2 | Discounted vs. vanilla TS | Cumulative reward on shifted segment | Discounted TS statistically higher on that segment | **⭐ Individual contribution** (real data: not met — see below) |
| Module 2 | Discounted vs. vanilla TS, synthetic rank-inversion | Post-inversion mean reward, 50 repeats | Discounted TS statistically higher (paired Wilcoxon) | **⭐ Individual contribution — addendum, met** |
| Module 3 | Conformal coverage | Empirical vs. target coverage | Within a few points of target (e.g., 90% target → observed 85–95%) | General calibration quality |
| Module 3 | Three-way instability comparison | Reversal count | Full design lower than fixed-parameter and PI-only, on stress segment | **⭐ Individual contribution** (real data: tie — see below) |
| Module 3 | Three-way instability comparison, synthetic multi-burst | Reversal count, 50 repeats | Full design statistically lower (paired Wilcoxon) | **⭐ Individual contribution — addendum, met** |

Every module has one row marked as the individual contribution's proof. For Module 1, that row passes on real data directly. For Modules 2 and 3, the real-data row does **not** cleanly pass (Module 2: vanilla edged out discounted on the one real non-stationary window this trace offers; Module 3: reversal count ties at n=3-4 events, too few to separate) — both are genuine, disclosed findings, not defects to hide, and both are kept in the report as-is. Each module's addendum row is a controlled synthetic test isolating the exact condition the real data didn't offer enough of (differential rank drift for Module 2; enough reversal events for Module 3), following the same pattern Module 1's SHAP test and Module 3's own step-response test already used. Both addenda pass cleanly and with high statistical significance (p < 0.0001, 50 repeats each) — see Progress_Trace.md's Phase 3A/3B for full numbers. The individual-contribution claim for each module now rests on: real-data findings reported honestly (including the two non-passes above) **plus** a controlled test that isolates and confirms the mechanism works exactly as designed. Report language should present it this way — not as if the real-data non-passes didn't happen.

---

## 8. Tooling & Tech Stack

- **Data engineering:** plain `pandas` with chunked reads (`chunksize=`), filtering each large table down to one `msname` before accumulating — this is what `Preprocessing_Manual_MultiSignal_Autoscaling.md` actually uses and validates, and what you should use too. (DuckDB or polars were considered earlier for this, but DuckDB wasn't installable in the environment this was tested in — pandas-chunked is the proven path; don't switch without re-validating against the Manual's synthetic-burst test first.)
- **Module 1:** `lightgbm`, `shap`, `scikit-learn` (splits, metrics), `matplotlib`/`plotly` for calibration and lead-time plots.
- **Module 2:** `numpy` (hand-implemented Thompson Sampling is standard and simple — no special library needed).
- **Module 3:** `mapie` (conformal prediction library) or a hand-implemented Adaptive Conformal Inference loop (a few dozen lines); `numpy`/`scipy` for the PI controller.
- **Load generation (Phases 5–6):** decided — `k6`, run as an in-cluster Kubernetes `Job` (`grafana/k6` image), replaying the case-study service's traffic pattern against TeaStore. Chosen over Locust/Vegeta for being a single static binary (no separate worker/master processes to fit on an already memory-tight host) and its staged-VU model mapping directly onto a time-varying target RPS curve. See `docs/Phase6_Ablation_Design.md` §4 for the full rationale and replay-pattern derivation.
- **Statistical analysis (Phase 7):** decided and implemented — `project/phase7_analysis/statistical_analysis.py` uses `scipy.stats` (Kruskal-Wallis omnibus test, Mann-Whitney U pairwise comparisons with a hand-rolled Benjamini-Hochberg FDR correction, rank-biserial effect sizes) rather than `statsmodels` (not used — no ANOVA, since the metrics don't warrant a normality assumption at n=5/arm). Run against the 25-trial Phase 6 dataset; results in `project/results/phase7/`.
- **Version control:** git, with the Phase 1 feature table itself versioned or regenerated via a checked-in script (don't commit large Parquet files directly unless using Git LFS).

---

## 9. Suggested Repo Structure

Matches `CLAUDE.md`'s actual layout — everything below lives inside `project/`. **No longer empty as of 2026-07-29** — this structure has been built out through Phase 7 (see `docs/Progress_Trace_MultiSignal_Autoscaling.md` for what's actually in each directory; `live_cluster/`, `phase7_analysis/`, and `results/ablation/` in particular postdate this original sketch):

```
implementation/                 # repo root — CLAUDE.md lives here
├── CLAUDE.md
├── docs/                       # this file and its companions — nothing to build here
├── DataSet01.../DataSet05...   # reference datasets — read-only
└── project/                    # <-- everything below is built here
    ├── data/
    │   ├── raw/                  # extracted CSVs (gitignored)
    │   └── processed/            # feature_table.parquet, versioned or regenerated by script
    ├── preprocessing/
    │   └── build_features.py     # Phases 0-1 pipeline (extraction + preprocessing) — first file to write, per docs/Preprocessing_Manual
    ├── module1_signal_fusion/
    │   ├── train.py
    │   ├── shap_attribution.py
    │   └── validate.py
    ├── module2_co_scheduling/
    │   ├── simulator.py
    │   ├── bandit.py
    │   └── validate.py
    ├── module3_adaptive_control/
    │   ├── conformal.py
    │   ├── pi_controller.py
    │   └── validate.py
    ├── integration/
    │   └── simulated_closed_loop.py   # Phase 4
    ├── k8s/                       # Phase 5 onward — controller, scheduler extender, manifests
    ├── results/                   # experiment outputs, logged per run
    └── configs/                   # run configs (seeds, thresholds, hyperparameters)
```

---

## 10. Reproducibility Practices

- Fix random seeds everywhere (data splits, LightGBM training, bandit simulation, any stochastic sampling) and record them in each run's config file.
- One YAML/JSON config per experiment run, checked into `configs/`, referenced by filename in any results or report figures.
- Log run metadata (git commit hash, config used, dataset version) alongside every result artifact.
- This directly satisfies the pre-registered-metrics and full-reporting commitment already made in the project's Ethics section.

---

## 11. Known Risks / Open Questions

- **Host RAM is more constrained than the raw spec suggests — the single biggest risk to Phases 5–6.** The development machine reports 23.4GB physical RAM, but ~7.5GB is unavailable before Docker Desktop/WSL2 or any project component even starts (reserved by the host environment at boot — cause not diagnosed further; the user has confirmed this can't be freed and the machine's RAM can't be increased). That leaves roughly **15.9GB actually usable** for Windows + Docker Desktop/WSL2 + everything this project runs. This was discovered during Phase 6 (see `Progress_Trace_MultiSignal_Autoscaling.md`), after Phase 5's live-cluster stack (3-node KinD + TeaStore's 7 services + Module 1/2/3 controllers) was found to use ~17GB at idle alone — already over the true usable budget, not just cutting it close; under load (replicas scaling out), usage climbed to ~20-21GB. **Every live-cluster design decision from Phase 5 onward (node count, benchmark app choice, replica ceilings, simultaneous-arm testing, WSL2 memory cap) must be scoped against ~15.9GB usable, not the nameplate 23.4GB.**
- **Sparse call-graph sampling:** at 0.5% sampling, the chosen `msname` may have too few raw calls per fine time bucket for a stable p95/p99 — mitigation: widen bucket size, or pick a higher-traffic service, verify before committing to a case study.
- **Module 2's factual-only reward:** an approximation, not a true counterfactual — carry this limitation into the report exactly as worded in Section 5.
- **12-hour window limits diurnal-pattern learning** — this is a scope limitation already anticipated by the deferred Time gap (Chapter 5 of the report); state it the same way here. **Resolved, not compounded:** an earlier disk-space constraint (Section 2) temporarily limited the extracted window to ~5.3h, but full 12h coverage was subsequently achieved by also using a second drive (E:) via NTFS junctions — the original 12h-window limitation stands as originally scoped, with no additional compounding factor from Phase 1.
- **Time-based splits can produce a training set with zero positive labels** if the chosen window has a genuine one-directional trend rather than repeated bursts — observed on the primary case-study service at an initial ~4h window (`label_mean_train=0.0`, all violations fell in the test tail; see Progress_Trace_MultiSignal_Autoscaling.md's Phase 1 notes). Confirmed as a real trend via the p99 latency plot, not a pipeline bug — the full 12h trace later showed this was just the leading edge of a longer low-latency period before a sustained elevated plateau. **Final splits on the full 12h data (360 rows, 270 train / 90 test):** primary `label_mean_train=0.119` / `label_mean_test=0.011`; secondary `label_mean_train=0.048` / `label_mean_test=0.256`. Neither is perfectly balanced, so Module 1's walk-forward cross-validation (Phase 2, already planned) remains the recommended approach over trusting a single time-based holdout alone.
- **MSResource_0 alone may not give enough instances** for the case-study service if it's node-concentrated — check instance count across nodes before finalizing the Module 2 event set; extract a second `MSResource` shard only if this check fails. (Resolved for the chosen primary service: 306 instances at the final extraction — see Progress_Trace.md's Phase 1 candidate-selection note.)

---

## 12. Transition to Live Cluster

Once Phases 0–4 (data acquisition, preprocessing, three modules, simulated integration) are complete and validated per Section 7, implementation moves to a live cluster — see Phase_Plan.md, Phases 5–7, for the staged breakdown of that transition and the final ablation study.

---

## 13. Optional Future Feature: Results Dashboard & Live Test UI

**Status: optional, deferred — not required for the core deliverable.** This section exists so early implementation choices don't accidentally rule it out later, not to commit the team to building it. See Phase_Plan.md's Phase 8 for the (also optional) build-out of this feature.

### 13.1 What it would show, if built

- **Training results view:** Module 1's classification metrics (AUC-ROC/PR, calibration), SHAP summary plot, lead-time-vs-CPU-only comparison; Module 2's regret curves and discounted-vs-vanilla comparison; Module 3's conformal coverage and step-response plots.
- **Test/ablation results view:** the five-arm ablation results (SLA compliance, cost, latency, stability) as comparable tables/charts across arms and workload types.
- **Live test view, two tiers:**
  - *Tier 1 (recommended default, low effort):* a "what-if" panel — enter or select a signal state, click run, see the framework's live decision (risk score, SHAP attribution, chosen node, current control parameters) computed on demand from the already-trained models. A single synchronous function call, not a running system.
  - *Tier 2 (stretch, only if time allows):* a full live replay — stream a workload trace through the framework in simulated real time and watch decisions happen. Meaningfully more engineering effort; don't attempt until Tier 1 works, and only if Phases 0–7 are already done.

### 13.2 What to do now so this stays possible later (the actual "preparation")

Three lightweight habits, not extra project scope — each is work you'd want for the report anyway, that also happens to be exactly what a dashboard would need to read:

1. **Structured artifact output, not console-only.** Every validation step in Phases 1, 2, and 3 should write its results to `results/<module>/<run_id>/metrics.json`, plus any plots as image files, in addition to whatever gets printed to the terminal.
2. **One clean function per module for "decide right now."** Each module should expose a single typed function separate from its training/validation script — e.g. `predict_risk(signals) -> RiskScore`, `select_node(context) -> NodeChoice`, `adjust_params(residual_stream) -> ControlParams`. A future UI, or Tier 1's live-test panel, calls these directly; nothing about the core research code has to change to support it.
3. **Config-driven paths and thresholds**, not hardcoded values — already a stated reproducibility practice (Section 10). A UI backend reading the same config files then comes for free.

### 13.3 If it gets built: recommended stack

**Streamlit, not a custom frontend.** It reads the JSON/Parquet result artifacts directly, needs almost no frontend code, and — once 13.2's habits are actually in place — a working results-plus-live-test dashboard is realistically a 1–2 day build. Only reach for FastAPI plus a separate frontend if there's a specific reason the dashboard needs to be a standalone deployed service rather than something run locally for a demo.