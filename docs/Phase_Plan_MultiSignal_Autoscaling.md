# Phase Plan
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Tenth companion document. Phases are sequenced by dependency, not calendar date — map onto actual dates once your timeline is fixed. Each phase lists entry criteria, tasks, exit criteria, and owner.*

*Restructured: data acquisition (download + extraction) and data preprocessing (feature engineering) were previously bundled into one "Phase 0," which made it hard to see preprocessing as its own distinct piece of work. They're now separate phases, and everything after them is renumbered by one.*

---

## Phase 0 — Data Acquisition

**Entry criteria:** none — this is the starting point.

**Tasks:**
- Download all dataset shards
- Extract `Node_0`, `MSRTQps_0`, `MSCallGraph_0`/`_1`
- Extract `MSResource_0`

**Exit criteria:** all four required tables extracted and readable on disk.

**Owner:** shared.

**Status: complete** — dataset downloaded and all four tables (`Node_0`, `MSRTQps_0`, `MSCallGraph_0`/`_1`, `MSResource_0`) extracted.

---

## Phase 1 — Data Preprocessing

**This is the preprocessing phase.** Entry criteria: Phase 0 complete (it is).

**Tasks:** follow `Preprocessing_Manual_MultiSignal_Autoscaling.md` §3 onward, step by step — either by hand the first time (recommended, so everyone understands each stage before writing `build_features.py` to automate it), or by writing the script directly once a case-study `msname` is confirmed (Manual §17 explains how the two relate).

| # | Task | Manual Reference |
|---|---|---|
| 1a | Select case-study `msname` (check both call volume and instance count) | §3 |
| 1a′ | Also select a second, differently-patterned `msname` and build its feature table the same way — needed for Module 1's generalization check in Phase 2, not optional | §3 |
| 1b | Review the three schema quirks — `rt` sign convention, provider/consumer split, per-table granularity — before writing any feature code | §4 |
| 1c | Build the latency signal (p95/p99) | §5 |
| 1d | Build the load/backlog signal | §6 |
| 1e | Build the resource signal (CPU/memory) | §7 |
| 1f | Join the three signal tables | §8 |
| 1g | Handle gaps (bounded forward-fill) | §9 |
| 1h | Engineer rolling-delta features | §10 |
| 1i | Construct the label (self-referential threshold + forward shift) | §11 |
| 1j | Time-based train/test split | §12 |
| 1k | Run every sanity check | §13 |
| 1l | Save the output feature table | §14 |

Run 1c–1l once for the primary `msname`, then again for the second one (1a′) — same steps, different service, two output tables.

**Exit criteria:** one validated, versioned feature table (`.parquet` or `.csv`) that passes every check in Manual §13 — including the burst-detection sanity check if the trace has one visible — that Module 1 can train on directly, and that Modules 2/3 can later read from.

**Owner:** shared — this blocks everyone, so treat it as a team task, not one person's.

**Status: complete.** Built `project/preprocessing/build_features.py` (`select-candidates` + `build` subcommands) plus a synthetic-burst validation test (`project/tests/test_synthetic_pipeline.py`, passes). Two feature tables produced: primary (`95a6f7f8...`, 368k calls/306 instances) and secondary (`9a3ef4d2...`, 45.6k calls/1,259 instances, for the generalization check), each **360 rows — full 12-hour coverage, 270 train / 90 test.**

**Things discovered/done mid-phase, worth knowing before Phase 2 starts:**
1. **All four raw tables are time-sharded**, not randomly sampled — the vendored README confirms `timestamp` spans 0-43,200,000ms (12h) across the *whole* dataset, so each numbered shard is a slice of that single timeline. Phase 0's original extraction (`_0`/`_1` only) covered ~10 minutes once joined. Extracted the rest incrementally — ~4h, then ~5.3h, then **full 12h (all 145 MSCallGraph, 25 MSRTQps, 12 MSResource shards)** — reaching a disk-space ceiling on drive C: along the way, resolved by also using drive E: (`E:\FYP_DataSet_Extract\...`) with NTFS junctions linking back into the C: dataset path, transparent to `build_features.py` (globs shards through junctions with no code change needed). See `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 0 addendum for the full history.
2. **Primary service's time-based split initially had zero positive labels in training** at the ~4h window — a genuine early-trace upward latency drift, not a pipeline bug (confirmed via the intermediate signal plots). This resolved naturally once full 12h data was available: the complete trace shows an early low-latency period, then a sustained elevated/bursty plateau, then a slight cool-down at the very end — giving final splits of primary `label_mean_train=0.119` (32/270) / `label_mean_test=0.011` (1/90), and secondary `label_mean_train=0.048` (13/270) / `label_mean_test=0.256` (23/90). Neither split is perfectly balanced (a single 75/25 holdout on ~33-36 total positives rarely will be), so Phase 2's already-planned walk-forward cross-validation remains the recommended approach over trusting either holdout number alone.

---

## Phase 2 — Module 1: Build & Validate

**Entry criteria:** Phase 1 exit artifact exists.

**Tasks:**
- Train LightGBM on the feature table (time-based split)
- Run the full Module 1 validation suite (Full_Plan.md, Section 4)
- ⭐ **Implement TreeSHAP attribution — this is the individual contribution, not an optional add-on (Full_Plan.md §4)**
- Export the held-out residual stream (for Module 3) and attribution vectors (for Module 2)
- Write validation results to `results/module1/<run_id>/metrics.json` + plot files, not console-only (Full_Plan.md §13.2 — keeps the optional future dashboard possible at zero extra scope now)

**Exit criteria:** validated model passing the Section 7 pass criteria — **including the SHAP sanity check specifically, not just the general AUC/lead-time metrics** — plus both downstream artifacts exported and documented (schema, file location). Requires Phase 1's second `msname` feature table (task 1a′) for the generalization check.

**Owner:** Module 1 lead.

**Blocks:** Phase 3 cannot start meaningfully until this phase's exit artifacts exist — Module 2 and Module 3 both consume them directly.

**Status: done, with one disclosed limitation.** Implemented as `project/module1_signal_fusion/{train,shap_attribution,validate}.py` plus `common.py` (shared config/data/model helpers, including the Full_Plan §13.2 `predict_risk()` "decide right now" function). Both downstream exports exist: `module1_residual_stream_primary.parquet` (Module 3) and `module1_attribution_vectors_primary.parquet` (Module 2). Full results in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 2 section and `project/results/module1/primary/metrics.json`.

3 of 4 pass criteria pass cleanly: fused model beats the CPU-only baseline on AUC-PR (both single-holdout and walk-forward mean), and the SHAP sanity check passes in majority (3/4 signals) — satisfying the ⭐ individual contribution requirement. **The lead-time comparison — the direct Sub-RQ 1 test — does not currently pass**: even after fixing a real alert-rate-calibration bug in the comparison methodology (the CPU baseline was flagging ~2x as many buckets positive, trivially inflating its apparent lead time), the CPU-only baseline still shows more advance warning (1.06 buckets) than the fused model (0.44 buckets), despite the fused model having better overall discrimination (walk-forward AUC-PR 0.294 vs. 0.271). Likely cause: the label only looks 1 bucket ahead and `p99_latency_ms` is heavily autocorrelated, so the fused model may have learned a near-reactive rule keyed on latency's own current value rather than genuinely earlier multi-signal precursors. This is carried forward as a disclosed finding/discussion point for the report, not silently hidden — a longer forward-shift prediction horizon is the most likely fix, were this revisited.

---

## Phase 3 — Modules 2 & 3: Build & Validate (parallel)

**Entry criteria:** Phase 2 exit artifacts (residual stream, attribution vectors) available.

**3A — Module 2 (Co-Scheduling)**
- Extract real placement events from `MSResource`
- Build the node-state simulator from `Node_0`
- Implement heuristic fallback policy (spec: Full_Plan.md §5 — CPU × memory headroom scoring; used for the bandit's cold start and as the regret-validation baseline)
- ⭐ **Implement discounted Thompson Sampling — the discount factor is the individual contribution; don't stop at vanilla TS (Full_Plan.md §5)**
- Run the full Module 2 validation suite (Full_Plan.md, Section 5) — **including the discounted-vs-vanilla mini-ablation specifically**
- Write validation results to `results/module2/<run_id>/metrics.json` + plots (same reason as Phase 2)

**3A status: done, with disclosed limitations.** Implemented as `project/module2_co_scheduling/{extract_events,simulator,bandit,validate}.py`. **Major finding during extraction:** this trace has almost no real placement churn to build a bandit event stream from — 96.4k of 96.4k cluster-wide (instanceid, nodeid) pairs, 99.9%, are already present at trace start; only 87 show a genuine new placement anywhere in 12 hours (the primary service's own 306 instances show zero churn at all). Resolved via a hybrid design agreed with the user: the 306 static instances batch-initialize each node's bandit arm with real reward history, and the 87 genuine cluster-wide events are the actual sequential rounds compared. One real bug was found and fixed along the way (sampling candidates from the full ~1300-node cluster left arms touched at most once, so discounting had no repeated evidence to ever act on — fixed by restricting the candidate pool to the 371 nodes actually involved in real placement activity). After the fix, both Section 7 pass criteria are honestly `false`, not forced to pass: the heuristic fallback beats the combined bandit system on cumulative regret (87 rounds against 371 arms doesn't amortize a learning policy's exploration cost), and vanilla TS slightly beats discounted TS on the chosen non-stationary window (real CPU-usage drift exists in the node pool, but appears uniform across nodes rather than a relative-ranking reshuffle, which is what discounting specifically targets). Full detail in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 3A section and `project/results/module2/metrics.json`.

**3B — Module 3 (Adaptive Control)**
- Implement the PI controller in isolation, test against hand-constructed synthetic sequences first
- Wire Adaptive Conformal Inference to Module 1's residual stream
- ⭐ **Add oscillation-conditioned interval widening — this is the individual contribution, distinct from BACC's published mechanism (Full_Plan.md §6)**
- Run the full Module 3 validation suite (Full_Plan.md, Section 6) — **including the three-way fixed/PI-only/full comparison specifically**
- Write validation results to `results/module3/<run_id>/metrics.json` + plots (same reason as Phase 2)

**3B status: done, 4 of 5 pass criteria met — corrected 2026-07-27 after Phase 4 integration testing.** Implemented as `project/module3_adaptive_control/{pi_controller,conformal,validate}.py`. The step-response test's "quiet" pre-phase bug (was below setpoint, causing pre-step drift) was caught and fixed during this phase's own isolated testing, as intended. **The PI anti-windup bug was not fully caught here** — this phase's own bursty-segment validation reported a passing three-way result (full design 8 reversals vs. PI-only's 10) that turned out to be an artifact of a still-buggy controller; the deeper bug (permanent stuck-at-a-bound with no recovery) only surfaced once Phase 4 ran the full 360-bucket trace, whose longer calm-bursty-calm pattern exercised a regime reversal this phase's narrower segment didn't. Two more anti-windup fixes were needed there (see Phase 4's notes) before the controller was actually correct. With the corrected controller, the honest three-way result is: PI-only and full design **tie** on reversal count (4 each) — Section 7's literal criterion for this row is not met — while `deviation_std` does improve monotonically with `oscillation_k` (full=0.277 vs. PI-only=0.294), a real but different kind of evidence the mechanism works (dampens reversal amplitude, not count, on this segment). Sensitivity check strengthened after the fix: widened interval width correlates at 0.97 with rolling reversal count (was 0.79 under the bug). Full corrected detail in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 3B section and `project/results/module3/metrics.json`.

**Exit criteria (both 3A and 3B):** validated modules passing Section 7's pass criteria — **each module's individual-contribution row in the Section 7 table is a required pass, not optional.** Module 3 meets this; Module 2 does not (disclosed limitation, see 3A notes above) — see Phase 4 entry criteria note below.

**Owners:** Module 2 lead (3A), Module 3 lead (3B) — genuinely parallel, neither blocks the other.

---

## Phase 4 — Simulated Integration

**Entry criteria:** Phases 2 and 3 both complete. **Note:** "complete" for Phase 3A (Module 2) means implemented and validated with disclosed limitations, not that its Section 7 pass criteria are met — the trace this project uses has almost no real placement churn (see Phase 3A notes), so Module 2's regret and ablation comparisons don't currently pass on their own terms. This doesn't block Phase 4: Module 2's wiring into the closed loop (attribution vectors as bandit context) is unaffected by whether its own validation numbers look favorable, and the limitation is a property of this dataset, not a defect to fix before integrating.

**Tasks:**
- Wire Module 1 → Module 2 (attribution as bandit context) and Module 1 → Module 3 (residual stream as conformal input) into one script
- Run the full closed loop over the 12-hour trace (or a chosen representative sub-window)
- Confirm coherent end-to-end behavior: sensible decisions, no crashes, no nonsensical parameter trajectories

**Exit criteria:** one complete, reviewable simulated run — decision log, placement log, and parameter trajectory all present and internally consistent.

**Owner:** all three, jointly — this is the first point where individual work must interoperate.

**Status: done.** Implemented as `project/integration/simulated_closed_loop.py`, plus one small new export script per module (`module1_signal_fusion/export_full_trace.py`, `module2_co_scheduling/export_decision_log.py`, `module3_adaptive_control/export_trajectory.py` — none modify each module's own finalized Phase 2/3 files). All three logs produced over the full 360-bucket trace and cross-checked for consistency (13/13 checks pass, e.g. Module 3's trajectory was independently verified to have been built from Module 1's own predicted_risk values, not a divergent re-derivation).

**This phase did exactly the job Full_Plan.md scoped it for — it caught a real bug per-module validation missed.** The first full-trace run showed Module 3's threshold permanently stuck at its lower bound for ~230 of 360 buckets, never recovering even once predicted risk returned to calm for good - a genuinely "nonsensical parameter trajectory." Root cause: Module 3's PI anti-windup fix from Phase 3B was still incomplete (it checked a proxy signal - first the last saturated step's sign, then a tentative output's sign - both of which stay dominated by a stale, already-huge integral even after the real signal reverses). Phase 3B's own validation never caught this because it only ever ran on a shorter, narrower bursty segment where the bug happened not to bite as visibly; Phase 4's longer, full-trace calm→bursty→calm pattern exercised the exact regime-reversal scenario the bug depended on. Fixed with two more anti-windup rounds (checking the current error's sign directly, plus clamping the integral term's own magnitude) - see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 3B and Phase 4 sections for the full sequence. This also **corrected** Phase 3B's own three-way comparison result (previously reported as passing under the still-buggy controller; the honest, corrected result is a tie on reversal count, with a real but different deviation-dampening effect surviving). Full detail in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 4 section and `project/results/integration/metrics.json`.

---

## Phase 5 — Minimal Live Cluster Setup

**Entry criteria:** Phase 4 exit criteria met.

**Hard constraint, confirmed non-negotiable:** only **~15.9GB RAM is actually usable** on the dev machine, not the nameplate 23.4GB — ~7.5GB is unavailable before anything project-related even starts, and this can't be freed or increased. See Full_Plan.md §11 for how this was found. Every design choice below (node count, benchmark app, replica ceilings) must be sized against 15.9GB, with real headroom, not against 23.4GB.

**Tasks:**
- Stand up a small KinD or minikube cluster (per the earlier scoping decision — no longer need the originally-planned 4–8 node dedicated cluster, since all three modules are already validated in simulation)
- Deploy the chosen benchmark app (Online Boutique or TeaStore) with HPA and KEDA as baselines
- Port each validated module into its real Kubernetes component: Module 1 → custom controller / metrics adapter; Module 2 → scheduler extender; Module 3 → adaptive control loop wrapping the other two

**Exit criteria:** baseline (HPA/KEDA) and the full framework both deployable and running on the cluster.

**Owner:** all three jointly, each porting their own module's component.

**Status: done (third attempt).** Attempted and fully completed twice already, reset both times, then rebuilt a third time with a structurally leaner design (2 KinD nodes instead of 3, `.wslconfig` cap lowered to 10GB, `maxReplicas`/`maxReplicaCount: 2` instead of 3) sized against the corrected ~15.9GB usable-RAM budget. All three modules live and re-verified on the new topology; idle memory held steady at 4.6-4.9GB free throughout, well clear of the 2.5-3.4GB range every previous incident occurred in. Full history (both resets, the RAM-ceiling discovery, and this build's verification detail) in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 5 section and Full_Plan.md §11.

---

## Phase 6 — Live Ablation Experiments

**Entry criteria:** Phase 5 exit criteria met.

**Tasks:**
- Run the five-arm ablation (baseline / M1 only / M2 only / M3 only / full) as already defined in the Methodology chapter
- ~~Drive load using the Alibaba-derived replay pattern from your case-study service (realistic, already validated) plus the Azure LLM Inference trace for the stateful/inference workload sample~~ **Revised 2026-07-29**: drive load using the Alibaba-derived replay pattern only. See the descope note below.
- Minimum 5 repeated trials per arm per workload type; log every metric already specified in Chapter 3 (SLA-violation count/duration, p95/p99 latency, replica trajectory, cost proxy, elasticity metrics) — write these to `results/ablation/<run_id>/metrics.json` per run, same structured format as Phases 2–3 (Full_Plan.md §13.2)

**Exit criteria:** ~~complete result set across all arms and all three workload types~~ **Revised 2026-07-29: complete result set across all arms for one workload type** (the Alibaba-derived replay). See descope note below for why "three" was corrected to "one."

**Owner:** all three, jointly.

**Status: done.** The "Methodology chapter" referenced above doesn't exist in `docs/` — the five-arm design was derived fresh in `docs/Phase6_Ablation_Design.md` (signed off before building anything) and is what's actually being followed. Ran first-pass (1 trial/arm), then scaled to 3/arm, then to **5 trials/arm — 25 trials total, zero aborted trials across ~6+ hours of continuous testing** — for the Alibaba-replay workload. Headline result, credible at n=5: `m3_only` (adaptive control on raw CPU alone) shows a consistent ~58% over-provisioning (false-alarm) rate across every trial, while `full` (the same adaptive control driven by Module 1's fused signal instead) drops that to 2.2% at the *lowest cost of any arm* and the *fewest violations* — a genuine, repeatable result supporting this project's core argument, not a single-trial artifact (an earlier 1-trial reading of this same comparison pointed the wrong way entirely, corrected once repeated). Full detail, including two harness fixes (swap-minimizing trial order; cold-start mitigation) and a real bug found and fixed (k6 requires integer RPS targets), in `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 6 section.

**Descope decision (2026-07-29), made explicitly rather than left to linger:** the original exit criteria's "three workload types" was a drafting inconsistency, not a real spec — the Tasks list above it only ever named **two** (Alibaba replay, Azure LLM Inference trace), and no third workload type is defined anywhere in `Full_Plan.md`, `Progress_Trace.md`, or `Phase6_Ablation_Design.md`. The Azure LLM trace's use was already flagged "not yet finalized" in `CLAUDE.md` before Phase 6 even started, and TeaStore has no LLM-inference-shaped component to drive with it (Phase6_Ablation_Design.md §7). Rather than leave Phase 6 permanently blocked on a dataset that was never fully committed to, the user explicitly decided to correct the exit criteria to one workload type and close this phase on the strength of the 25-trial Alibaba-replay dataset. This does **not** affect any module or arm - all three modules and all five arms were already fully built, wired, and tested; only the *variety of traffic patterns* tested against them was reduced from the originally-envisioned (but never fully specified) multiple workload types down to one.

---

## Phase 7 — Analysis & Write-Up

**Entry criteria:** Phase 6 exit criteria met.

**Tasks:**
- ~~Run the statistical analysis pipeline: omnibus test, corrected pairwise comparisons, effect sizes, ablation decomposition.~~ **Done 2026-07-29** — `project/phase7_analysis/statistical_analysis.py`; results in `project/results/phase7/`. See `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 7 section for the full findings.
- ~~cross-workload consistency check~~ **Dropped 2026-07-29**: this task required multiple workload types; Phase 6 was descoped to one (see Phase 6's Status note above), so there is nothing to cross-check consistency against. A direct, disclosed consequence of that descope, not a new gap.
- ~~Replace the prospective "Expected Findings" language in Chapters 4 and 6 of the report with actual results~~ **Done 2026-07-29.**
- ~~Final report assembly and review~~ **Done 2026-07-29** — TOC field added, remaining placeholder found in §1.7 and fixed, Punniyamoorthy reference's own "recheck before submission" note rechecked. See Progress_Trace.md.
- **Research-preparation checklist (loose ends flagged earlier in this project, never tracked as tasks until now):**
  - ~~Verify the Business-Aware SLA paper's author list via IEEE Xplore (DOI 10.1109/ACCESS.2026.3689039) — blocked by rate limits when first checked~~ **Done 2026-07-29** — Pallavi Priya Patharlagadda, via Crossref/Semantic Scholar.
  - ~~Verify Pandey (2026)'s institutional affiliation via the Springer chapter page~~ **Done 2026-07-29** — Vaibhav Pandey, Dept. of Information and Communication Engineering, Fukuoka Institute of Technology, Japan.
  - ~~Confirm the NimbusGuard PDF (arXiv:2604.11017) visually matches your original "kubernatees framework proactive 2026 IIT.pdf" reference — never explicitly confirmed~~ **Done 2026-07-29** — user-provided `docs/2604.11017v1.pdf` confirmed byte-for-byte identical to the verified arXiv text.
  - ~~Fill in every bracketed placeholder in the report (`[Team Member 1]`, `[Institution / Department Name]`, `[Supervisor Name]`, `[Submission Date]`)~~ **Done 2026-07-29** — team Promex; Diwyanjalee E.A.D.S.N. (Module 1), Bandara K.G.R.U. (Module 2), Malalpola M.L.H.R. (Module 3); supervisor Ms. M.N. Chandimali; Faculty of Information Technology, University of Moratuwa, 2026. No submission date filled in, per explicit instruction.
  - **Confirm with your institution whether formal ethics/IRB clearance is required, even though the study design involves no human subjects — the report's Ethics section assumes not, but says to confirm this. Still open — requires human action, not implementation; per the user's instruction, not to be retried automatically in future sessions.**

**Exit criteria:** submitted final report, with every item in the research-preparation checklist above resolved, not just the statistical analysis. **All met as of 2026-07-29 except the ethics/IRB confirmation**, which is the user's own action item, not blocking further implementation work.

**Owner:** all three, jointly.

**Note on statistical power (2026-07-29):** the ablation dataset has n=5 trials/arm. This is enough to run every remaining analysis task above, but several metrics have zero variance in some arms (e.g., `m2_only`/`m3_only` logged 0 SLA violations across all 5 trials each) and corrected pairwise comparisons will likely be underpowered even where the raw effect (e.g., `m3_only` vs. `full`'s over-provisioning gap) looks large. Expect and report this honestly rather than being surprised when significance tests read weaker than the descriptive numbers suggest.

---

## Phase 8 (Optional, Deferred) — Results Dashboard & Live Test UI

**This phase is not required for the core deliverable and does not block final submission.** See Full_Plan.md §13 for the full feature spec.

**Entry criteria:** Phase 7 complete — real results exist to display. Do not start this before then, and do not let it delay Phase 7.

**Tasks:**
- ~~Confirm the structured result artifacts from Phases 2, 3, and 6 are actually present and complete~~ **Done 2026-07-29** — confirmed during planning, nothing new needed.
- ~~Gap found during planning (2026-07-29): add `select_node()`/`adjust_params()` to Modules 2/3~~ **Done 2026-07-29** — see Progress_Trace.md for the exact design (persisted bandit-state JSON for Module 2, live replay of a small committed parquet for Module 3).
- ~~Build the Streamlit training-results view~~ **Done 2026-07-29**
- ~~Build the Streamlit test/ablation-results view~~ **Done 2026-07-29**
- ~~Build the Tier 1 live "what-if" panel~~ **Done 2026-07-29** — fully offline as decided. Real bug found and fixed: a `sys.modules` collision across three identically-named `common.py` files, caught by explicitly clicking each what-if button via Streamlit's `AppTest` rather than only testing page load. See Progress_Trace.md's Phase 8 section for the fix.
- ~~Stretch, only if time remains: Tier 2 full live replay~~ **Descoped 2026-07-29** — Tier 1 only, per the plan agreed with the user.

**Exit criteria:** a locally runnable dashboard showing real training and ablation results, plus a working live single-decision check. **Met 2026-07-29** — all four pages verified via `AppTest` with zero exceptions, including exercising all three what-if buttons. This phase can be abandoned at any point without affecting the core deliverable or the report.

**Owner:** unassigned — whoever has time after Phase 7, or split opportunistically. Explicitly not on any module owner's critical path.

**Branch strategy:** built on a new `phase8-dashboard` branch off `main`, not directly on `main` — see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 8 section for the full plan. Not yet merged into `main`.

**Superseded 2026-07-30 by Phase 9 (below).** The Streamlit dashboard delivered exactly what this phase specified, and its limits then became the reason for Phase 9: it shows offline results and a one-shot offline "what-if", but it cannot touch the live `kind` cluster, cannot target any application other than TeaStore, and still requires the user to run the whole `project/live_cluster/README.md` Part B command chain by hand first. `project/dashboard/` is left in place and untouched — not deleted — so this phase's exit criteria remain independently verifiable.

---

## Phase 9 (Optional) — Live Autoscaling Control Center (web app)

**Also not required for the core deliverable and does not block final submission.** Same standing as Phase 8, which it supersedes as the project's primary UI. Requested by the user on 2026-07-29 after reviewing Phase 8, on the grounds that "the user cannot do all these things to see our results" — i.e. the remaining barrier was operational, not presentational.

**Entry criteria:** Phase 8 complete (its data-loading logic is ported, not rewritten), and a working live cluster from Phase 5.

**Scope decisions, all confirmed with the user before implementation (do not revisit):**
- **Stack: 100% Python.** A local `FastAPI` + `uvicorn` server, plain HTML/CSS/vanilla JS, with `plotly.min.js` and `mermaid.min.js` vendored so the app works fully offline and needs no Node/JS build toolchain. Chosen over Electron and over Streamlit primarily on memory: this project has a documented ~15.9GB usable-RAM ceiling (`Full_Plan.md` §11) and documented OOM incidents. **Originally delivered as a `pywebview` native window** (Windows' built-in WebView2, no bundled Chromium — verified on the host first: `pywebview` + `pythonnet` import cleanly under the system's Python 3.14.3, so no second Python install was needed). **Converted to a browser-served web app on 2026-07-30** at the user's request; see the conversion task below. The server-plus-static-frontend design is what made that a lifecycle change rather than a rewrite.
- **Plug-in scope:** a built-in preset, any Deployment already running in the cluster, or a user-supplied Kubernetes manifest. Building an application **from source code is explicitly out of scope** — too large, and unnecessary given a manifest can name any image.
- **Setup automation:** permission-gated, one click per tool via `winget`, with a guided manual fallback where automation cannot reliably finish (Docker Desktop's first-run EULA step).

**Why this was cheap to build:** every live controller already reads its target's identity from env vars (`TARGET_DEPLOYMENT`, `TARGET_LABEL_SELECTOR`, `PROBE_URL`, `NAMESPACE`) — nothing is TeaStore-specific in code, only in default values. Module 2 needed no change at all, since it scores *nodes*. "Plug in a different app" is therefore `kubectl set env` + `rollout restart` on two Deployments, reusing existing code.

**Tasks (built and checked in milestone order, not as one change):**
- ~~M0: skeleton + asset vendoring~~ **Done 2026-07-29**
- ~~M1: training/ablation results views~~ **Done 2026-07-29** — ports Phase 8's data loading; no recomputation.
- ~~M2: eight Mermaid diagrams + rendering~~ **Done 2026-07-29** — the project had no diagrams of any kind before this.
- ~~M3: orchestrator core + setup automation~~ **Done 2026-07-29**
- ~~M4: port-forward manager + live monitoring~~ **Done 2026-07-30**
- ~~M5: random load generator~~ **Done 2026-07-30**
- ~~M6: target-app plug-in flow~~ **Done 2026-07-30**
- ~~M7: polish + docs~~ **Done 2026-07-30** — including a UI/UX pass the user requested before M7 (responsive layout, larger charts, loading indicators, and honest status markers replacing red "Not confirmed" badges).
- ~~Convert from a native window to a web application~~ **Done 2026-07-30** — user instruction after M7. **This reverses the delivery mode, not the stack:** it was already FastAPI + HTML/CSS/vanilla JS, so nothing in `backend/` or `frontend/` changed shape; only the process lifecycle did. `main.py` now serves `http://127.0.0.1:8877` and opens a browser tab, with the native-window launcher retained as `main_desktop.py` and `pywebview`/`pythonnet` demoted to optional dependencies. The RAM argument that originally picked pywebview over Electron is unaffected — a browser tab costs more than WebView2 and far less than a bundled Chromium. Three responsibilities the window had been absorbing were rebuilt explicitly (a predictable address, teardown on shutdown rather than on window close, and not assuming the only caller is the person at the keyboard); see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 9 table for each.
- ~~Security hardening required by that conversion~~ **Done 2026-07-30** — the app has no authentication and its endpoints install software, rebuild clusters, and apply arbitrary manifests, so it binds loopback only and **refuses** a non-loopback bind without an explicit `--allow-remote`, rejects foreign `Host` headers (DNS rebinding), and rejects cross-origin requests (a cross-site form POST would otherwise reach `/api/setup/bootstrap`, which takes no body). Verified with `curl`, not assumed.

**Exit criteria:** an application that (1) installs the required tools and bootstraps the whole cluster without the user typing a command, (2) points the framework at an application of the user's choosing, (3) shows the three modules' live state while traffic flows, and (4) still shows all Phase 2–7 results plus explanatory diagrams. **Met 2026-07-30** — every milestone verified against the live cluster (not only unit-tested), including a target switch to two different applications and a from-scratch manifest apply. See `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 9 section for what each check actually proved and for the bugs found by running it.

**Owner:** unassigned, same as Phase 8.

**Branch strategy:** built on the same `phase8-dashboard` branch. Still not merged into `integration`/`main` as of 2026-07-30.

---

## Dependency Chain at a Glance

```
Phase 0 — Data Acquisition (shared)          ✅ complete (full 12h coverage achieved)
   │
Phase 1 — Data Preprocessing (shared)        ✅ complete (full 12h coverage achieved - see notes above)
   │
Phase 2 (Member 1)                           ✅ complete (one disclosed limitation - see notes above)
   │
   ├──> Phase 3A (Member 2)  ─┐  ✅ complete (disclosed limitations - see notes above)
   └──> Phase 3B (Member 3)  ─┤  ✅ complete (4/5 pass criteria - corrected after Phase 4, see notes above)
                              │
                        Phase 4 (all)   ✅ complete (found + fixed a real cross-module bug - see notes above)
                              │
                        Phase 5 (all)   ✅ complete (3rd attempt - leaner design, see notes above)
                              │
                        Phase 6 (all)   ✅ complete (descoped to 1 workload type - see notes above)
                              │
                        Phase 7 (all)   ✅ complete (core deliverable ends here)
                              │
                        Phase 8 (optional, unassigned)   ✅ complete — Streamlit dashboard
                              │
                        Phase 9 (optional, unassigned)   ✅ complete — desktop app, supersedes Phase 8
```

Phase 0 → Phase 1 → Phase 2 is a hard sequential chain at the start — data must be extracted before it can be preprocessed, and preprocessed before Module 1 can train. Everything from Phase 3 onward for Members 2 and 3 can proceed in parallel once Phase 2's exports exist. Phases 8 and 9 are drawn separately on purpose — nothing about the report or the core research contribution depends on either, and both could be dropped without affecting submission.