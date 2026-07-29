# Research Methodology
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Fifth companion document. Built on the Research Questions and Objectives file, and written for a 3-person team where each member owns one module (Signal Fusion / Co-Scheduling / Adaptive Control).*

**Executed status (added 2026-07-29):** Sections 1, 2, 4, and most of 5–8 below were carried through to execution largely as written. **One deviation:** the three-workload-type sample (Section 3) and the cross-workload consistency check (Section 5, item 5; Section 6, Sub-RQ 5 row) were not executed — the live ablation (Phase 6) was descoped to one workload type after real host-memory constraints were discovered mid-study. See `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 6 section and `Full_Project_Report_MultiSignal_Autoscaling.docx` Chapter 4 (Finding 5) / Chapter 6 (Section 6.2) for the full reasoning and results.

---

## 1. Suitable Research Approach

**Recommended approach: Quantitative research.**

Every one of your five sub-research questions asks for a measurable comparison — an SLA-violation rate, a latency percentile, a cost figure, or a stability measurement, evaluated under one system configuration versus another. None of them asks about opinions, lived experience, or meaning, which is what a qualitative approach (interviews, thematic analysis) is built to answer. So a quantitative approach is the correct fit, not a stylistic preference.

In software/systems engineering specifically, this kind of quantitative work is usually framed using **Design Science Research (DSR)**: you are not only measuring something that already exists, you are *building a new artifact* (the three-module framework) and then measuring it. DSR is the standard umbrella term for "build it, then evaluate it" research in computing.

A mixed-methods approach would only become relevant if you later added a practitioner-adoption study — for example, interviewing DevOps engineers about whether they would trust and adopt the framework. That maps to the Practical gap you already agreed to defer to future work, so it is not needed for your current five sub-questions.

---

## 2. Suitable Research Design

**Recommended design: Design Science Research (DSR), with a controlled, repeated-measures ablation experiment as the evaluation method inside it.**

This has two layers:

**(a) Overarching methodology — Design Science Research.** DSR structures the work as *Build → Demonstrate → Evaluate*: you build the framework (or each module), demonstrate it running on a real Kubernetes cluster, then evaluate it against baselines using measured outcomes. This matches your Main Objective exactly (design, implement, evaluate).

**(b) Core empirical design — controlled ablation experiment.** Within the "Evaluate" step, the design that directly answers your sub-questions is a controlled experiment with the following conditions ("arms"), each run multiple times for statistical comparison:

| Arm | What it isolates | Answers |
|---|---|---|
| Baseline (HPA / KEDA) | Existing default behavior | Reference point for all comparisons |
| Signal fusion only | Module 1's effect alone | Sub-RQ 1 |
| Co-scheduling only | Module 2's effect alone | Sub-RQ 2 |
| Adaptive control only | Module 3's effect alone | Sub-RQ 3 |
| Full framework (1+2+3) | Combined effect | Sub-RQ 4, and the Main RQ |

Each arm is then repeated across the workload patterns in Sub-RQ 5 (steady-state, bursty, stateful/inference), giving a small factorial design rather than one flat comparison.

**Fit with your team structure:** each teammate can build and run their own module's sub-experiment (baseline vs. their module) independently, since these are self-contained comparisons. The team then comes together for the full-framework and ablation runs, since those require all three modules deployed at once. This maps cleanly onto "3 members, 3 modules" without forcing anyone to wait on the others for their individual results.

---

## 3. Suggested Population and Sample

In systems research, "population" and "sample" do not refer to people — they refer to the space of workloads, traffic conditions, and environments your framework could face, and the specific subset you will actually test.

| Population (the full space) | Sample (what you will actually use) |
|---|---|
| All Kubernetes-hosted workload types | 3 workload types: a steady-state e-commerce microservice benchmark (e.g., Online Boutique or TeaStore), a bursty-traffic microservice benchmark (e.g., Sock Shop replaying a public traffic trace), and one stateful or inference-style workload |
| All possible traffic/load conditions | 3 controlled patterns generated with a load-testing tool: steady load, sudden burst/spike, gradual ramp |
| All Kubernetes cluster configurations and cloud environments | One dedicated, controlled multi-node cluster (state a fixed size, e.g., 4–8 worker nodes) on a single provider and region |
| All existing autoscalers usable as comparison baselines | HPA and KEDA as the two primary baselines (VPA optional as a secondary comparison) |

**Sampling technique:** purposive (benchmark-based) sampling, not random/probabilistic sampling. This is standard and defensible in systems research — you deliberately choose widely used, previously validated benchmark applications rather than drawing a random sample from an undefined population of "all Kubernetes apps." Randomized sampling of software systems is not a meaningful concept the way random sampling of people is.

**As executed:** one workload type (an Alibaba microservice-trace replay against TeaStore), not three — see the status note at the top of this document.

---

## 4. Data Collection Method

Data is collected automatically through instrumentation, not through surveys or interviews.

| Tool / Method | What it collects |
|---|---|
| Prometheus + Prometheus Adapter | CPU, memory, custom application metrics (queue depth, latency histograms) |
| Kubernetes API / event logs | Timestamped scaling actions and pod-placement decisions |
| A load-generation tool (e.g., k6, Locust, or Vegeta) | Reproducible traffic patterns for each workload sample |
| A time-series store (Prometheus TSDB or exported to InfluxDB) | Stores all metrics for later analysis |

**Protocol:** run each experimental arm as a set of repeated trials (recommend a minimum of 5 per arm, more if your compute budget allows) using the same workload replay, so results can be compared statistically rather than read off a single run.

**Metrics to log on every run:** SLA-violation count and duration, p95/p99 latency, replica count over time, node-level CPU/memory, a cost proxy (e.g., node-hours consumed), and elasticity metrics (under-provisioning time, over-provisioning time, instability, and deviation from ideal supply).

---

## 5. Data Analysis Method

1. **Descriptive statistics first** — mean, median, percentiles, and standard deviation of each metric, per arm.
2. **Comparative/inferential statistics** — since you are comparing more than two arms, use an omnibus test (ANOVA if metrics are approximately normal, or the Kruskal-Wallis test if not), followed by pairwise comparisons (paired t-test or Wilcoxon signed-rank test) with a multiple-comparison correction (e.g., Bonferroni) between specific arms of interest.
3. **Report effect sizes and confidence intervals**, not just p-values — this shows the improvement is practically meaningful, not only statistically detectable. This directly answers the Methodological gap you identified earlier, which specifically criticized the literature for lacking this kind of rigor.
4. **Ablation decomposition** — compute each module's marginal contribution by comparing the full-framework result against each "module removed" result. This is the calculation that directly answers Sub-RQ 4.
5. **Cross-workload consistency check** — compare the direction and size of the improvement across all three workload samples. Consistency means the framework helps in a similar way across all three, not only in one. This directly answers Sub-RQ 5. **[Not executed — dropped along with Sub-RQ 5 when Phase 6 was descoped to one workload type; see status note at the top of this document.]**
6. **Visual analysis** — time-series plots of replica count against incoming load and latency, to visually inspect oscillation and responsiveness alongside the numeric stability metrics.

---

## 6. Why This Methodology Fits Your Research Questions

| Research Question | Methodology Feature That Answers It |
|---|---|
| Main RQ — framework vs. HPA/KEDA on SLA compliance and cost | Controlled experiment with HPA/KEDA as baseline arms, measured on the same two outcome metrics |
| Sub-RQ 1 — signal fusion vs. CPU-only | Two arms differing only in the scaling-signal input, all else held constant |
| Sub-RQ 2 — co-scheduling vs. default scheduler | Two arms differing only in the scheduler configuration |
| Sub-RQ 3 — adaptive control vs. fixed parameters | Two arms differing only in the parameter-tuning mechanism |
| Sub-RQ 4 — individual vs. combined module contribution | The ablation arm structure itself, with decomposition analysis |
| Sub-RQ 5 — consistency across workload types | The same arm structure repeated across three workload samples **(not executed — descoped to one, see status note at top)** |

None of your research questions asks *why* someone believes something or *what it feels like* to operate the system — they ask *whether* a measurable outcome changes under a controlled condition. A quantitative, controlled-experiment design is therefore not just suitable but sufficient: it produces exactly the evidence each question requires, with nothing left over that a qualitative method would be needed to explain.

---

## 7. Possible Limitations

| Limitation | Explanation | Related Gap (already acknowledged) |
|---|---|---|
| Internal validity — testbed vs. production | A controlled lab cluster cannot fully replicate production drift, multi-tenant noise, or unpredictable real-user traffic | Practical gap, Time gap |
| External validity — benchmark generalizability | Results from Online Boutique / TeaStore / Sock Shop may not transfer to every real architecture | Population gap |
| Single-cluster, single-region scope | Findings may not hold under multi-region or edge/bandwidth-constrained conditions | Geographical gap |
| Limited experiment duration | A project timeline supports days-to-weeks of testing, not the months needed to observe long-term concept drift | Time gap |
| Compute/budget constraints | The number of repeated trials may be limited by available cloud credits or time, which can reduce statistical power | Methodological gap |
| Infrastructure noise | Shared or public cloud environments can introduce "noisy neighbor" variance unless a dedicated test cluster is used | New — flag explicitly in your write-up |

These are the same gaps your Gap Analysis already flagged as acknowledged limitations/future work (Time, Geographical) — this table simply shows where they resurface as limitations of your specific experimental design, which is exactly what a methodology chapter's limitations section should do.

---

## 8. Ethical Considerations

| Consideration | What To Do About It |
|---|---|
| No direct human-subject data | Your finalized research questions involve system metrics only — no personal data, no participants — so formal informed-consent procedures are not typically required for the core experiments. Still confirm this against your own institution's ethics guidelines, since requirements vary. |
| Responsible resource use | Cloud experiments consume real compute and, at scale, real energy and money. Run only as many repetitions as needed for statistical validity, and shut down idle test clusters promptly. |
| Infrastructure / provider terms of service | High-volume load-testing traffic can resemble attack patterns — autoscaler elasticity itself has been shown to be exploitable by adversarial traffic. Run experiments only on infrastructure explicitly provisioned for testing, and check your cloud provider's load-testing policy before generating high-volume traffic. |
| Transparent, honest reporting | Decide your comparison metrics and statistical tests before running the ablation experiments, and report results from all tested configurations, not only the favorable ones, to avoid selective reporting. |
| Licensing and attribution | Online Boutique, TeaStore, and Sock Shop are open-source under their own licenses. Cite and attribute them correctly in your methodology chapter and in any code you publish. |
| Fair contribution attribution | Since each of the 3 team members owns one module, document each person's individual contribution (design, implementation, experiments) clearly and separately from the joint integration and ablation work — this matters for fair academic credit in a group project. |

---

*Suggested next step: draft your Chapter 3 (Methodology) directly from Sections 1–5 above, and place Sections 7–8 (Limitations, Ethical Considerations) as their own short subsections at the end of that chapter — this is the conventional structure examiners expect.*
