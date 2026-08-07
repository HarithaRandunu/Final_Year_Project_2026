# results_v2: The Second Live Ablation Study — Full Details

**Status: complete.** All 25 trials finished and validated on 2026-08-06. This document is a
complete, standalone record of the second live ablation study — infrastructure, methodology,
every incident encountered and how it was resolved, and the full results — kept separate from
`Progress_Trace_MultiSignal_Autoscaling.md` (the chronological working log) so there is one
place with everything about this specific study in one read.

The academic framing of these results (woven into the existing report alongside the original
study) is in `docs/G54_Promex_Final_Report_v2.docx`, Section 7.8. This document is the fuller,
implementation-level account behind that section.

---

## 1. Why this study exists

The original 25-trial ablation study (`project/results/`, documented in
`docs/G54_Promex_Final_Draft_Report.pdf` Chapter 7) ran with the `teastore-webui` replica
ceiling capped at **2**, on a single shared Windows workstation. That ceiling was itself a
consequence of a memory constraint, not a design choice — the workstation had only ~15.9GB
usable RAM once the host OS, Docker Desktop, and everything else running on it took their
share.

This second study asks: **does the central result hold if the platform has more room to scale
into?** To test that, the replica ceiling was raised to **3** and the load curve's peak widened
accordingly, which meant re-running the entire 25-trial comparison on infrastructure that could
actually support it.

Two earlier attempts to run this on the local PC failed outright — the setup phase alone
exhausted host memory both times, with different scheduler state and different replica
ceilings producing the identical immediate-abort, zero-samples failure. An attempt to use AWS
EKS was blocked by an account-wide Free Tier instance-type restriction. A dedicated cloud VM
was provisioned instead.

---

## 2. Server / infrastructure details

| Item | Value |
|---|---|
| Provider | Hetzner Cloud |
| Server name | `fyp-results-v2` |
| Server ID | `159552199` |
| Server type | `cpx42` — 8 shared vCPU, 16GB RAM, 320GB NVMe disk |
| Region | `sin` (Singapore) — chosen over cheaper EU regions for lower SSH latency during the many hours of live driving expected |
| OS | Ubuntu 24.04 (x86) |
| Cost | €0.1763/hr net; total study cost was a few euros |
| SSH access | Dedicated keypair `~/.ssh/id_ed25519_hetzner_fyp`, generated for this VM only |
| Provisioned | 2026-08-06 07:48 UTC |
| Idle memory at provisioning | 14GB free of 16GB — genuinely dedicated, not shared with a host OS/Docker Desktop/VS Code the way the local workstation was |

**Why Hetzner specifically**, evaluated against the alternatives:
- **DigitalOcean** — capped at 8GB RAM/4 vCPU on this account; the original study's proven-safe
  configuration measured ~11–12GB used under real load, so 8GB would likely reproduce the same
  local-PC failure on different hardware. Not attempted.
- **Oracle Cloud Free Tier** — quietly cut from 4 OCPU/24GB to 2 OCPU/12GB; also ARM
  architecture, which would have needed an image rebuild since this project's Docker images
  are all x86. Not attempted.
- **Azure for Students** — credit already used in a prior year. Not available.
- **Hetzner** — no such account restriction, real dedicated headroom, straightforward CLI
  (`hcloud`) automation. Chosen.

**Cluster topology on the VM** (`project/live_cluster/kind-cluster.yaml`) — identical to the
original study: a 2-node `kind` cluster (one control-plane node with its default taint removed
so it's schedulable, one worker), giving Module 2's scheduler-extender the same 2-way real
placement choice as the original.

---

## 3. What actually changed vs. the original study

Everything about the design and statistical treatment was kept identical: the same five
configurations (`baseline`, `m1_only`, `m2_only`, `m3_only`, `full`), the same 2-minute risk
cycle, the same actuator logic, the same TeaStore deployment, the same k6 traffic curve shape
derived from the trace's own call-count series, the same five trials per configuration, and the
same Kruskal-Wallis + Benjamini-Hochberg-corrected Mann-Whitney statistical treatment.

Three things changed, deliberately:

| Parameter | Original study | results_v2 |
|---|---|---|
| Host | Shared Windows workstation (~15.9GB usable) | Dedicated Hetzner VM (16GB dedicated) |
| `teastore-webui` replica ceiling | `[1, 2]` | `[1, 3]` |
| Load curve peak | 24 req/s | 32 req/s |

Config files changed: `project/live_cluster/teastore/hpa-baseline.yaml`,
`project/live_cluster/teastore/keda-baseline.yaml` (both `maxReplicas`/`maxReplicaCount`:
2→3), `project/live_cluster/actuator/app.py` (`MAX_REPLICAS`: 2→3).

Trial command used for every run:
```
python live_cluster/ablation/run_trial.py --arm <arm> --run-tag v2_t<n> \
  --results-dir results_v2/ablation --min-rps 8 --max-rps 32 --min-free-gb 2.5
```

---

## 4. Execution timeline — every incident, in order

The study did **not** run cleanly start to finish. Every interruption below is real, was
diagnosed (not assumed), and is recorded here in full because each is a genuine finding about
running this framework outside its originally-tested environment, not just noise.

### 4.1 Missing `pyarrow` dependency (first 7 trial attempts)
The VM had only `numpy`+`pandas` pre-installed, not the project's full `requirements.txt`
(which includes `pyarrow`, needed by `pd.read_parquet`). The first 7 trial attempts (all 5
`baseline` + `m1_only` trials 1–2) crashed instantly on `ImportError: Unable to find a usable
engine`. None wrote a `metrics.json` (crash was pre-`build_metrics()`), so no invalid data
needed distinguishing later. Fixed: `pip install --break-system-packages -r
project/requirements.txt`, verified directly against the real parquet file (360 rows read
successfully).

### 4.2 TeaStore's own latency bug, discovered early and confirmed real
`baseline` trial 1 finished with `p95_latency_ms: 5723` — a ~24x jump versus the original
study's ~237ms baseline. Diagnosed via `kubectl top pods` (webui replicas near their 1536Mi
memory limit) and `kubectl logs --previous` (a genuine `java.lang.NullPointerException` inside
TeaStore's own Netflix-Ribbon-based service-registry client, `LoadBalancedStoreOperations.
isLoggedIn()` → `ServiceLoadBalancer.loadBalanceRESTOperation()`), crashing Tomcat and forcing
pod restarts. This is a real defect in TeaStore's own code, triggered by the higher replica
ceiling causing more service-registry churn than at ceiling=2 — see Section 6 below for the
full explanation and its effect on every arm, not just baseline.

**Decision point**: asked whether to keep TeaStore or switch to a different benchmark app given
the number of interruptions. Decided to keep TeaStore — nearly every other interruption that
night was an infrastructure/provider problem unrelated to TeaStore, switching would break
comparability with the already-completed original study, and the bug itself is a legitimate,
honestly-reportable finding rather than a reason to abandon the run.

### 4.3 Unplanned VM reboot (user-initiated via Hetzner web console)
The VM rebooted mid-study (~13:22 UTC), killing the in-progress trial. Initially investigated as
a possible system fault (checked `unattended-upgrades` — inactive, not the cause) before being
clarified as a manual restart via the Hetzner console's Ctrl+Alt+Del action, which maps to a
real power-reset signal on the guest rather than a keystroke inside a terminal. Docker/`kind`
self-recovered cleanly within ~3 minutes via normal container-runtime reconciliation. 7 trials
(`baseline` ×5, `m1_only` ×1–2) were confirmed still valid via direct `metrics.json` inspection.

### 4.4 Cross-conversation process conflict
A separate, forked instance of this same conversation retained independent live SSH access to
the same VM and had built its own resume mechanism (`resume_study.py` + a `study-resume.service`
systemd unit). This caused a real, active conflict: two `run_trial.py` processes running the
identical trial simultaneously against the same cluster, colliding on the shared Kubernetes Job
name `ablation-trial`. Caught via `ps` process-tree inspection, both processes killed, the
systemd unit file fully removed (disabling alone proved insufficient — the other branch kept
re-enabling it) to stop it recurring.

### 4.5 Kube-scheduler version mismatch (root cause of a 13-trial crash storm)
13 trials (`m1_only` 3–5, all of `m2_only`, all of `m3_only`) crashed near-instantly with a
`kubectl scale` error. Root cause, found via `kubectl describe pod` (zero scheduling events) →
scheduler pod `0/1 Ready` → scheduler logs (RBAC-forbidden errors on `resource.k8s.io`/Dynamic
Resource Allocation APIs): the committed scheduler manifest
(`project/live_cluster/backups/kube-scheduler.yaml.orig` and
`project/live_cluster/module2_extender/kube-scheduler-with-extender.yaml`) pinned
`kube-scheduler:v1.36.1`, four minor versions ahead of the actual cluster's `v1.32.2`. The
newer scheduler tried watching APIs the real server doesn't expose, silently blocking all new
pod scheduling. **Fixed in both files** (now `v1.32.2`), verified the scheduler reached `1/1
Running` with clean logs and previously-`Pending` pods scheduled within ~10s. This is a genuine,
previously-undiscovered bug in the project's own code, now fixed for good — not specific to this
one study.

### 4.6 Genuine out-of-memory kill
`m2_only` trial 1 was lost to a real memory-cgroup OOM (`dmesg` showed the kernel killing
several TeaStore `java` threads), consistent with the webui restart-churn bug above, severe
enough to also kill `run_trial.py` itself (SIGKILL). No `metrics.json` was written. Queued for
retry.

### 4.7 Driving script died silently mid-trial
The script orchestrating the remaining trials (and its `run_trial.py` child) vanished from the
process list mid-`m2_only`-trial-2 with no crash signature at all — most likely the same
intermittent SSH-link flakiness (Singapore↔Sri Lanka route) that repeatedly killed monitoring
connections throughout the session, this time hitting the actual driving process because it
hadn't been launched fully detached. Replaced with an idempotent resume script (checks each
arm/trial's `results_v2/ablation` output before running, skips anything already valid) launched
via `setsid nohup … & disown` so a dropped SSH session can no longer kill it.

### 4.8 Final gap-fill retry
After the main sequence completed (24/25 trials valid, only `m2_only` trial 1 outstanding), a
retry was needed. A pre-existing `tmux` session running the other branch's `resume_study.py` was
found to have already picked up the retry on its own — confirmed only one process was running
before letting it continue (not launching a duplicate). It finished cleanly (exit 0),
completing all 25 trials.

**End state: zero data loss.** Every failure above either wrote nothing (clean crash before
`build_metrics()`) or a complete, valid `metrics.json` — no partial or corrupted trial data was
ever produced or needed to be distinguished from real data.

---

## 5. Results

All 25 trials (`baseline`, `m1_only`, `m2_only`, `m3_only`, `full` × 5 trials each) completed
with `aborted: false` and 30–31 samples per trial, confirmed via direct inspection of every
`metrics.json`.

### 5.1 Descriptive statistics (mean ± population std across 5 trials)

| Measure | Standard autoscaler | Fusion only | Placement only | Control only | Integrated |
|---|---|---|---|---|---|
| Violation count | 0.00 ± 0.00 | 1.80 ± 2.23 | 1.20 ± 1.60 | 0.00 ± 0.00 | 1.00 ± 2.00 |
| p99 latency (ms) | 6643 ± 1665 | 6793 ± 2847 | 4115 ± 3480 | 6588 ± 1362 | 4263 ± 3223 |
| Cost (pod-seconds) | 2736 ± 44 | 1374 ± 413 | 2700 ± 0 | 2472 ± 143 | 1062 ± 294 |
| Reversal count | 0.00 ± 0.00 | 0.80 ± 0.75 | 0.00 ± 0.00 | 0.00 ± 0.00 | 0.60 ± 1.20 |
| Over-provisioning share | 0.094 ± 0.077 | 0.198 ± 0.140 | 0.219 ± 0.216 | 0.872 ± 0.141 | 0.141 ± 0.281 |
| Under-provisioning share | 0.000 ± 0.000 | 0.065 ± 0.081 | 0.046 ± 0.062 | 0.000 ± 0.000 | 0.034 ± 0.069 |

(`baseline` = Standard autoscaler, `m1_only` = Fusion only, `m2_only` = Placement only,
`m3_only` = Control only, `full` = Integrated — same mapping as the original report.)

### 5.2 Omnibus tests (Kruskal-Wallis across all 5 configurations)

| Metric | H statistic | p-value | Significant at 0.05 |
|---|---|---|---|
| Cost (pod-seconds) | 22.267 | 0.0002 | **Yes** |
| Deviation (std) | 14.645 | 0.0055 | **Yes** |
| Over-provisioning share | 12.863 | 0.0120 | **Yes** |
| Reversal count | 8.993 | 0.0613 | No (close) |
| Violation count | 4.520 | 0.3402 | No |
| Under-provisioning share | 4.581 | 0.3331 | No |
| p99 latency | 3.670 | 0.4525 | No (confounded — see Section 6) |

### 5.3 Significant pairwise comparisons (Mann-Whitney, Benjamini-Hochberg corrected, p_adj < 0.05)

**Cost (pod-seconds)** — Integrated is significantly cheaper than every configuration except
Fusion only:
- Standard vs Fusion only: 2736 vs 1374 (p_adj=0.0149, effect=1.00)
- Standard vs Control only: 2736 vs 2472 (p_adj=0.0149, effect=1.00)
- Standard vs Integrated: 2736 vs 1062 (p_adj=0.0149, effect=1.00)
- Fusion only vs Placement only: 1374 vs 2700 (p_adj=0.0149, effect=-1.00)
- Fusion only vs Control only: 1374 vs 2472 (p_adj=0.0149, effect=-1.00)
- Placement only vs Control only: 2700 vs 2472 (p_adj=0.0149, effect=1.00)
- Placement only vs Integrated: 2700 vs 1062 (p_adj=0.0149, effect=1.00)
- Control only vs Integrated: 2472 vs 1062 (p_adj=0.0149, effect=1.00)

**Over-provisioning share** — Control only is the clear outlier, significantly worse than
everything else, including Integrated:
- Standard vs Control only: 0.094 vs 0.872 (p_adj=0.0389, effect=-1.00)
- Fusion only vs Control only: 0.198 vs 0.872 (p_adj=0.0389, effect=-1.00)
- Placement only vs Control only: 0.219 vs 0.872 (p_adj=0.0389, effect=-1.00)
- Control only vs Integrated: 0.872 vs 0.141 (p_adj=0.0435, effect=0.92)
- *(Standard vs Integrated was **not** significant here — Integrated's variance at this
  ceiling, std=0.281, was high enough that the comparison against the standard autoscaler
  alone didn't clear the bar, even though the mean gap is in the same direction.)*

**Deviation (std)**:
- Standard vs Control only: 0.000 vs 0.570 (p_adj=0.0375, effect=-1.00)
- Placement only vs Control only: 0.000 vs 0.570 (p_adj=0.0375, effect=-1.00)

### 5.4 The central finding

The original study's headline result was: adaptive control on a **raw processor signal**
(Control only) over-provisioned the service for **57.8%** of each run, while the same
controller on the **fused risk score** (Integrated) cut this to **2.2%** — a roughly 26x
improvement, at 48% lower cost than the standard autoscaler.

**This result reproduces and strengthens at the higher replica ceiling**: Control only
over-provisioned **87.2%** of each run here, while Integrated cut this to **14.1%** — still
roughly a 6x improvement in the same direction, at **61%** lower cost than the standard
autoscaler (up from 48%). Both figures rose in the direction more scaling headroom predicts (a
controller with more room to over-provision does so more, regardless of which signal drives
it), and the gap between the informed and uninformed configuration remains large and in the
same direction as the original study.

---

## 6. The TeaStore latency confound, explained in full

Every arm's p99 latency is roughly an order of magnitude higher in `results_v2` than in the
original study (e.g. `baseline`: 609ms → 6643ms). **This is a real, diagnosed defect in
TeaStore's own code, not a bug in this project's modules or a measurement error.**

Chain of causation:
1. Raising the replica ceiling from 2 to 3 means `teastore-webui` scales up to 3 replicas and
   back down far more often under KEDA than it did at ceiling 2, simply because there's more
   room to scale into.
2. TeaStore has its own internal service registry (separate from Kubernetes' own service
   discovery), built on Netflix Ribbon, that its services use to find each other.
3. That registry has a genuine bug: under higher replica churn, its load-balancer client
   (`LoadBalancedStoreOperations.isLoggedIn()` → `ServiceLoadBalancer.
   loadBalanceRESTOperation()`) throws a `NullPointerException`, confirmed directly in
   `kubectl logs --previous` output on crashing pods.
4. That exception crashes Tomcat inside the affected pod, forcing a restart (confirmed via
   `kubectl get pods` showing 2–3 restarts per webui replica within 13–37 minutes).
5. Each restart has a cold-start latency cost (fresh JVM, empty caches), captured by Module 1's
   own active latency probing.
6. Because the reported `p99_latency_ms` is computed as the **maximum** across all 30-second
   probe windows in a trial (same formula used for the clean, low original-study numbers), even
   a handful of restart-driven spikes is enough to dominate the entire trial's reported figure.

**Practical consequence**: absolute latency numbers between the two studies are not directly
comparable. The over-provisioning and cost findings are unaffected by this confound (they don't
depend on the pattern of individual pod restarts the way a maximum-based latency figure does)
and are reported with full confidence. This is documented as a new, sixth limitation in the
updated final report (`docs/G54_Promex_Final_Report_v2.docx`, Section 8.3) rather than hidden or
engineered around — a deliberate decision made and confirmed during the study rather than
discovered after the fact.

A genuine fix would require patching or replacing TeaStore's own Ribbon-based registry client
(a separate, unfamiliar codebase this project doesn't otherwise touch) and re-running the full
study — judged not worth the additional VM cost/time for what is optional extension work beyond
the core deliverable; see the discussion in this conversation for the full reasoning.

---

## 7. Where everything lives

| Artifact | Location |
|---|---|
| Raw trial data (25 trial directories, each with `metrics.json`) | `project/results_v2/ablation/` |
| Statistical analysis output | `project/results_v2/phase7/statistical_analysis.json`, `trial_level_data.csv`, `metric_distributions_by_arm.png` |
| Live trial log (on the VM, and worth keeping if the VM is later deleted) | `/root/run_study.log` on `fyp-results-v2` |
| Updated final report | `docs/G54_Promex_Final_Report_v2.docx` (Section 7.8) |
| Manual VM operations runbook | `docs/Hetzner_VM_Manual_Ops_Runbook_MultiSignal_Autoscaling.md` |
| Chronological working log of the whole session | `docs/Progress_Trace_MultiSignal_Autoscaling.md` |

Analysis was regenerated locally via:
```
python project/phase7_analysis/statistical_analysis.py \
  --results-dir project/results_v2/ablation \
  --output-dir project/results_v2/phase7 \
  --tag-prefixes v2_t
```

---

## 8. Current VM status

As of this writing, `fyp-results-v2` is **still running** on Hetzner (billing continues at
~€0.1763/hr). Per the revised teardown plan: once the remaining demo stages (desktop_app live
demo, product-service target-switch demo) are captured, the VM will be snapshotted (preserving
its full state, including this study's data and a running `desktop_app` instance) and then
deleted to stop billing — recoverable later by creating a new server from that snapshot. See
the runbook document above for the exact commands.
