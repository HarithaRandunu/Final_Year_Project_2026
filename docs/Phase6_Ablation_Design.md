# Phase 6 — Live Ablation Design

**Status: executed and complete (2026-07-29).** This document exists because
the "Methodology chapter" referenced by `Phase_Plan_MultiSignal_Autoscaling.md`'s
Phase 6 task list ("the five-arm ablation... as already defined in the
Methodology chapter") does not exist anywhere in `docs/` — only `Full_Plan`,
`Phase_Plan`, `Progress_Trace`, and `Preprocessing_Manual` are present. This
doc derives a concrete, runnable ablation design from what IS documented
(`Full_Plan.md` §4–7, §13.2, and Phase 5's actual live components), so Phase
6 has a real spec to build against instead of a broken pointer. It was
signed off before any code was written against it, then actually built and
run: 25 trials (5 arms × 5 trials) against the Alibaba-replay workload,
zero aborts. Section 7's Azure LLM workload was formally descoped, not
silently dropped — see `Progress_Trace_MultiSignal_Autoscaling.md`'s and
`Phase_Plan_MultiSignal_Autoscaling.md`'s Phase 6 sections for the full
result set and the descope decision.

## 1. The gap this closes

Phase 5 wired all three modules to real live signals, but **none of them
take a scaling action.** Module 1 exposes `predicted_risk`. Module 2's
extender only scores node placement. Module 3 computes an adaptive
`threshold` and an `alert` flag, but nothing reads `alert` and calls the
Kubernetes API to change replica count. All scaling today is done by
whichever baseline (HPA/KEDA) is applied. An ablation that compares "M1
only" / "M3 only" / "full" against baseline is meaningless until something
actually turns each module's output into a replica change. That's the main
new component this phase adds: an **actuator**.

## 2. The five arms

Each arm is defined by three independent switches: *what signal drives
scaling*, *what sets the scale-up/down threshold*, and *which scheduler is
in front of the node*. Kept deliberately factorial so each arm isolates
one module's contribution, matching how each module already argues its own
individual contribution in `Full_Plan.md` §4/§5/§6.

| Arm | Scaling driven by | Threshold source | Scheduler | Mechanism |
|---|---|---|---|---|
| **baseline** | raw CPU utilization | fixed 50% (existing HPA) | default | `hpa-baseline.yaml`, unchanged from Phase 5 |
| **m1_only** | Module 1's `predicted_risk` | fixed 0.08 (static, no adaptivity) | default | new actuator, band rule (§3) |
| **m2_only** | raw CPU utilization | fixed 50% (existing HPA) | **M2 extender** | HPA unchanged, only the scheduler is swapped — isolates M2's placement effect alone |
| **m3_only** | raw CPU utilization *error*, fed through PI+ACI+widening | **adaptive** (M3's control loop, ablated to not depend on M1) | default | new actuator, band rule, M3-ablated-mode as threshold source |
| **full** | Module 1's `predicted_risk` | **adaptive** (M3's live control loop, as already wired in Phase 5) | **M2 extender** | new actuator, band rule, M3 (unablated) as threshold source |

This table is the reason each arm exists, not just a label:
- `m1_only` vs `baseline` isolates whether Module 1's fused signal beats
  raw CPU as the scaling trigger.
- `m2_only` vs `baseline` isolates Module 2's placement effect with
  scaling held constant.
- `m3_only` vs `baseline` isolates whether adaptive PI+conformal+widening
  control beats a fixed threshold, using the *same* raw CPU signal as
  baseline — this directly mirrors Module 3's own offline three-way test
  in `Full_Plan.md` §6.
- `full` vs the other three isolates whether combining all three beats
  each one alone.

**Module 1's controller keeps running as a passive observer in every arm**
(it already just polls and computes — nothing to disable), so
`predicted_risk` and `violation_now` are logged in all five arms even when
not driving that arm's scaling decision. This gives one consistent
ground-truth signal for SLA-violation and over/under-provisioning metrics
across all arms, rather than five incompatible measurements.

KEDA is not one of the five arms — Phase 5 already separately verified it
reactive against real CPU pressure, and running two CPU-based baselines
through the same ablation adds trials without adding a distinct research
question. HPA is the one baseline carried into Phase 6.

## 3. New component: the actuator

A new `project/live_cluster/actuator/` service, config'd by an `ARM` env
var. Every `ACT_INTERVAL_SECONDS` (default 30s) it:

1. Reads the relevant signal for its arm (`predicted_risk` from Module 1's
   `/risk`, or raw CPU utilization from the same K8s metrics API call
   Module 1's controller already uses) and the relevant threshold (a fixed
   constant for `m1_only` - `0.08`, recalibrated after the first-pass run
   found Module 1's `predicted_risk` on TeaStore actually occupies roughly
   a 0.003-0.3 range, not the originally-guessed 0.5 which never fired a
   single scaling action - or Module 3's `/state` `threshold` field for
   `m3_only`/`full`).
2. Applies a symmetric band rule: `signal > threshold` → +1 replica;
   `signal < threshold * 0.5` → −1 replica; else hold. Bounded to
   `[1, 2]` — the same `minReplicas`/`maxReplicas` bounds as Phase 5's HPA
   and KEDA baselines (lowered from the original `[1, 3]` after Phase 5's
   third rebuild found 3+3 simultaneous replicas across two deployments
   was directly implicated in this host's memory incidents — see
   Full_Plan.md §11), so replica ceiling isn't a confound.
3. Enforces a `COOLDOWN_SECONDS` (default 90s) between actions, mirroring
   HPA's default stabilization window so no arm gets an unfair reaction-speed
   advantage from a naive implementation.
4. Applies the decision via `PATCH /apis/apps/v1/namespaces/default/deployments/teastore-webui/scale`, the same K8s scale subresource HPA itself uses.

`m3_only`'s ablated M3 mode is a second control loop inside Module 3's
existing container (`M3_MODE=cpu_direct` env var), reusing the exact same
`PIController`/`AdaptiveConformalInference`/`rolling_reversal_count`/
`oscillation_widening_factor` code already ported in Phase 5, just fed
`(cpu_utilization/100 - 0.5)`-based error instead of Module 1's risk
residual. No new control-theory code, only a new input wire — keeps this
arm honestly comparable to `full`'s unablated loop.

**Arm switching procedure** (per trial): reset `teastore-webui` to 1
replica, apply/remove `hpa-baseline.yaml`, scale the actuator Deployment to
0/1 replicas with the right `ARM` value, and — only for `m2_only`/`full` —
swap the `kube-scheduler` static pod manifest to the extender config (same
mechanism already proven in Phase 5). To minimize control-plane churn
(each scheduler swap costs a `kube-scheduler` restart), trials are grouped
so the extender is toggled at most twice per full 5-arm cycle: run
`[baseline, m1_only, m3_only]` under the default scheduler, swap once, run
`[m2_only, full]`, swap back.

## 4. Load generation

**Tool: k6**, run as a Kubernetes `Job` inside the cluster (`grafana/k6`
image) so load originates in-cluster rather than adding host-side network
variables. Chosen over Locust/Vegeta because it's a single static binary
(no separate worker/master processes to fit in an already memory-tight
cluster), and its staged-VU model maps directly onto a time-varying target
RPS curve.

**Replay pattern**: derived from `data/processed/features_primary.parquet`
(the same case-study `msname` used throughout this project), specifically
its `call_count` column — 360 buckets × 120s covering the full 12h trace at
0.5% sampling (mean ≈38,805 calls/bucket ≈323 req/s at sampled scale).
That absolute rate is meaningless against a single-pod TeaStore on this
host — **the shape is what's replayed, not the magnitude**: the curve is
min-max normalized and rescaled to a target RPS range picked from the
harness-proving run's own observed capacity (§5, step 1), not guessed in
advance. A fixed 12h replay is also impractical for a trial budget — the
360-bucket curve is time-compressed into a `TRIAL_DURATION_SECONDS`-long
k6 stage sequence (default 900s / 15min, enough for ~7 of Module 1's
2-minute risk cycles), preserving relative shape (quiet periods, the
elevated plateau) rather than literal wall-clock duration.

## 5. First-pass scope (this is the harness-proving run, per your answer)

1. **Capacity probe** (not a trial): run k6 at a few fixed RPS levels
   against `teastore-webui` at 1 replica, observe CPU utilization and p99
   latency, to pick a target RPS range where CPU-based scaling actually
   has room to react (neither always-idle nor always-saturated).
2. **One workload type** (the Alibaba-derived replay above; the Azure
   LLM/stateful workload is deferred — see §6), **five arms, one trial
   each**, `TRIAL_DURATION_SECONDS=900`. Total wall time ≈5×15min trials +
   2 scheduler swaps + reset overhead, roughly 1.5–2h.
3. Memory watched between every trial (`Get-CimInstance
   Win32_OperatingSystem`, same as Phase 5); if free memory trends
   downward across trials rather than recovering, pause and reassess
   before continuing — same discipline as Phase 5.
4. Only after this passes cleanly: scale up to the full 5 trials/arm and
   revisit whether a second workload type is feasible on this host.

## 6. Metrics schema

Written to `results/ablation/<run_id>/metrics.json` per trial, matching
Phase 2–3's structured-JSON precedent (`Full_Plan.md` §13.2):

```json
{
  "run_id": "2026-07-28T14-00-00_baseline_trial1",
  "arm": "baseline",
  "workload_type": "alibaba_replay_primary",
  "trial": 1,
  "start_time": "...", "end_time": "...",
  "sla_violation_count": 0,
  "sla_violation_duration_s": 0,
  "p95_latency_ms": 0.0,
  "p99_latency_ms": 0.0,
  "replica_trajectory": [{"t": "...", "replicas": 1}],
  "cost_proxy_pod_seconds": 0.0,
  "elasticity": {
    "instability_reversals": 0,
    "deviation_std": 0.0,
    "over_provisioning_timeshare": 0.0,
    "under_provisioning_timeshare": 0.0
  },
  "module1_predicted_risk_trace": [...],
  "module3_threshold_trace": [...]
}
```

`elasticity.*` reuses the *exact* definitions already implemented in
`module3_adaptive_control/validate.py::compute_elasticity_metrics` (sign
reversals / std of a trajectory / alert-vs-actual-outcome timeshares) —
applied here to the **replica trajectory** (not a raw threshold
trajectory) so the same four numbers are comparable across all five arms,
including baseline and `m2_only` which have no adaptive threshold of
their own. `over_provisioning`/`under_provisioning` use Module 1's
independently-computed `violation_now` as ground truth (§2's point about
M1 always running as an observer).

## 7. Azure LLM workload — descoped (2026-07-29), not attempted

The Azure LLM Inference trace had no faithful target: TeaStore has no
LLM-inference component, and `CLAUDE.md` already flagged this dataset's use
as "not yet finalized" before this phase even started. Attempting it would
have meant either bolting a fake inference endpoint onto TeaStore (weakens
the case-study validity) or standing up a second benchmark app (real added
cost/risk, given host history).

Initially deferred as an open item; on review, `Phase_Plan.md`'s exit
criteria requiring "three workload types" turned out to be a drafting
inconsistency — only two were ever named anywhere in `docs/`, and no third
was ever specified at all. Rather than leave Phase 6 permanently blocked on
a dataset that was never fully committed to, the user explicitly decided
(2026-07-29) to correct the exit criteria to one workload type and close
Phase 6 on the strength of the 25-trial Alibaba-replay dataset. `Phase_Plan.md`
and `Progress_Trace_MultiSignal_Autoscaling.md` both record this decision.
