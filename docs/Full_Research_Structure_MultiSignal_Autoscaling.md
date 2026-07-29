# Full Research Structure
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Eighth and final companion document. This synthesizes everything from the previous seven files — Research Framework, Literature Review Plan, Gap Analysis, Questions & Objectives, Methodology, Source Evaluations, and Literature Matrix — into one chapter-by-chapter structure suitable for a thesis, final-year project report, or research proposal. Written for your 3-person team (one member per module).*

---

## 1. Title Suggestions

**Primary (recommended):**
> **A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads**

Your existing title is already strong: it names the three modules, the mechanism class, and the target outcome. Keep it.

**Alternatives, if your institution wants a different emphasis:**
- *Design and Evaluation of an Integrated Multi-Signal, Placement-Aware, Adaptively-Controlled Autoscaling Framework for SLA Compliance in Kubernetes* (methodology-forward)
- *Closing the Loop: Fusing Backlog, CPU, and Latency Signals with Co-Scheduling and Adaptive Control for SLA-Driven Kubernetes Autoscaling* (contribution-forward)
- *Beyond Static Thresholds: An SLA-Driven Kubernetes Autoscaling Framework Integrating Signal Fusion, Co-Scheduling, and Self-Tuning Control* (gap-forward)

Naming tip: if you give the framework a short name (as your "Promex" working title suggests), use it in the text but keep the descriptive title — e.g., *"Promex: A Multi-Signal, Co-Scheduling Autoscaling Framework..."*

---

## 2. Chapter 1 — Introduction Structure

| Section | Content | Length guide |
|---|---|---|
| 1.1 Background and Motivation | Cloud-native elasticity in one page: Kubernetes as the de facto orchestrator; why autoscaling matters (SLA compliance vs. cost); the three default mechanisms (HPA, VPA, Cluster Autoscaler) and KEDA in two paragraphs | 1.5–2 pages |
| 1.2 The Problem in Brief | The three failures in plain language: (a) single-signal scaling reacts late, (b) scaling and placement don't talk to each other, (c) fixed thresholds/steps/intervals can't follow changing workloads. One short motivating scenario (e.g., a queue-driven burst where CPU stays flat while backlog explodes) | 1 page |
| 1.3 Problem Statement | The formal statement (structure in Section 4 below) | 0.5 page |
| 1.4 Research Questions and Objectives | Main RQ, 5 sub-RQs, main objective, 5 specific objectives (content in Section 5 below) | 1 page |
| 1.5 Significance of the Study | Who benefits and how: researchers (integration + ablation evidence), practitioners (incrementally adoptable controller), the field (evaluation protocol addressing the methodological gap) | 0.5 page |
| 1.6 Scope and Delimitations | In scope: horizontal pod scaling, single multi-node cluster, HPA/KEDA baselines. **Updated 2026-07-29 to match what was actually executed:** originally planned as three workload types, descoped to one (an Alibaba microservice-trace replay) after real host-memory constraints were discovered mid-study — state this as an explicit, dated scope correction (not a silent reduction), with the same reasoning used in the report itself (Full_Project_Report §1.6, §3.2, §3.5, §3.7): "three workload types" was a drafting inconsistency (only two were ever named anywhere, no third specified), and the Azure LLM candidate had no faithful target on TeaStore. Out of scope (deliberately, citing your Gap Analysis): multi-month production drift, multi-region/edge geography, vertical scaling as a primary mechanism, carbon/energy objectives | 0.5 page |
| 1.7 Report Structure | One sentence per chapter | 0.5 page |

---

## 3. Chapter 2 (Part A) — Background Section Outline

*Some institutions want Background inside Chapter 1 or 2; others as its own chapter. Structure is the same either way. This is the "textbook knowledge" a reader needs before your literature review argues anything.*

| Section | Content |
|---|---|
| 2.1 Kubernetes Fundamentals | Pods, nodes, control plane, Deployments/ReplicaSets, `kube-scheduler` and its scoring phase |
| 2.2 Autoscaling Mechanisms | HPA (algorithm and reactive loop), VPA, Cluster Autoscaler, KEDA event-driven model; stabilization windows and cooldowns |
| 2.3 Observability Stack | Prometheus, custom metrics adapters, application-level metrics (queue depth, latency histograms) vs. infrastructure metrics |
| 2.4 SLI → SLO → SLA Chain | Definitions, violation count vs. violation duration, why tail percentiles (p95/p99) matter more than means |
| 2.5 Control Foundations | MAPE-K loop; feedback control basics (error, damping, hysteresis, oscillation); RL basics (state/action/reward) — only as much as Chapter 3's design needs |
| 2.6 Scheduling and Placement Foundations | Node scoring, bin-packing intuition and NP-hardness, affinity/topology constraints, cold starts and cache locality |

---

## 4. Problem Statement Structure

Use a four-move structure (each move = one short paragraph):

**Move 1 — The ideal.** SLA-driven Kubernetes workloads require scaling decisions that detect service pressure early, place new replicas where they can serve immediately, and adapt their own control behavior as workloads change.

**Move 2 — The reality (the three gaps).**
- *Gap 1 (Signal):* Existing autoscalers use either infrastructure metrics (CPU/memory) or a single application metric (queue depth); no unified model fuses backlog, CPU utilization, and latency percentiles into one SLA-aware decision score.
- *Gap 2 (Placement):* Even correct scaling decisions are undermined because the scheduler places new pods without knowing why they were created, causing resource waste, cold starts, cache misses, and imbalance.
- *Gap 3 (Adaptation):* Fixed thresholds, fixed ±1 scaling steps, and fixed monitoring intervals cause over/under-scaling and instability under variable workloads.

**Move 3 — The consequence + synthesis gap.** Individually, each failure degrades SLA compliance and wastes cost; together, they compound — and no existing framework integrates signal fusion, placement-aware co-scheduling, and adaptive parameter control into one evaluated system. Support this with your closest-competitor evidence (the multi-signal SLO-first framework leaves placement scoring and self-tuning open; the 2026 proactive DQN framework itself exhibits fixed intervals and ±1 action steps).

**Move 4 — The response.** One sentence: this research designs, implements, and evaluates such an integrated framework, and quantifies each component's contribution through a controlled ablation study.

---

## 5. Research Questions and Objectives Section

*Copy from your Research Questions & Objectives document — reproduced here for completeness.*

**Main Research Question:** To what extent does an integrated autoscaling framework — combining multi-signal fusion, placement-aware co-scheduling, and adaptive parameter control — improve SLA compliance and cost efficiency for Kubernetes-hosted workloads, compared to existing autoscalers such as HPA and KEDA?

**Sub-questions:**
1. How can backlog, CPU utilization, and latency-percentile metrics be combined into a single SLA-aware scaling-decision score, and how does this fused score compare to single-metric CPU-based scaling in detecting SLA risk early?
2. How does coupling pod placement to the cause of a scaling decision affect resource utilization, cold-start delay, and load balance, compared to the default scheduler acting independently?
3. How does an adaptive control mechanism that automatically adjusts thresholds, step size, and monitoring interval affect control stability and SLA compliance, compared to fixed-parameter autoscaling?
4. What is the separate and combined contribution of the three modules to overall SLA compliance, as measured through an ablation study?
5. How consistent are the framework's SLA compliance and cost performance across steady-state, bursty, and stateful/inference-style workloads?

**Main Objective:** To design, implement, and evaluate an integrated Kubernetes autoscaling framework that combines multi-signal fusion, placement-aware co-scheduling, and adaptive parameter control, and to measure its effect on SLA compliance and cost efficiency compared to existing autoscalers.

**Specific Objectives:** (1) design/implement the signal-fusion model; (2) design/implement the co-scheduling mechanism; (3) design/implement the adaptive control mechanism; (4) conduct the ablation study against HPA and KEDA; (5) test under three workload patterns and compare consistency.

*Presentation tip: end this section with the alignment table (sub-RQ ↔ objective, one-to-one) from your Questions & Objectives file — examiners reward visible alignment.*

---

## 6. Chapter 2 (Part B) — Literature Review Structure

*From your Literature Review Plan; each section maps to a theme (T1–T9).*

| Section | Theme | Key anchor sources (from your matrix) |
|---|---|---|
| 2.7 Review Method | Databases, keyword clusters, inclusion/exclusion, window 2018–2026 (weight on 2023–2026) | — |
| 2.8 Kubernetes Autoscaling Mechanisms and Limitations (T1) | HPA lag, KEDA, surveys/taxonomies | Lorido-Botran taxonomy; 2026 ML-autoscaling taxonomy |
| 2.9 Multi-Signal Observability for Scaling (T2) | Backlog vs. CPU; latency percentiles; fusion methods | Business-Aware SLA paper (Entry 2); closest competitor (Entry 3) |
| 2.10 Scheduling and Pod Placement (T3) | Default scheduler scoring, bin-packing, descheduling | OOSP; rapid scale-out scheduling work |
| 2.11 Coupling Scaling and Scheduling (T4) | Formal joint optimization vs. heuristic coordination | NBR-BAS heuristic coupling; Vu et al. (Entry 1 — placement excluded as future work) |
| 2.12 Adaptive and Self-Tuning Control (T5) | MAPE-K, PID/PI, RL tuning, hybrid | Daedalus; BACC; Pandey RL (Entry 6); AWARE/FIRM counterweight; NimbusGuard (Entry 7 — exhibits the static-parameter gap) |
| 2.13 Predictive/Proactive Forecasting (T6) | ARIMA/LSTM/Transformer; hybrid reactive-proactive; oscillation persistence | Prophet+LSTM study; hybrid algorithm papers |
| 2.14 SLA/SLO and Cost-Aware Management (T7) | Violation duration vs. count; cost trade-offs | SLO+cost CustomPodAutoscaler work; Pozdniakova et al. |
| 2.15 Evaluation Methodologies and Benchmarks (T8) | Benchmarks, traces, elasticity metrics, testbeds | Tamiru et al. (Entry 4 — metric definitions); ScalerEval (Entry 5) |
| 2.16 Cross-Cutting: Explainability, Robustness, Security (T9) | RL brittleness, metric corruption, elasticity exploitation | AWARE/FIRM; fault-sensitivity study; EDoS SIGMETRICS paper |
| 2.17 Synthesis and Gap Mapping | The gap-synthesis table: paper → module(s) partially addressed → what remains open; state the contradictions explicitly (RL gains vs. production brittleness; joint optimization vs. heuristics; more signals vs. metric integrity) | Whole matrix, column 10 |
| 2.18 Chapter Summary | Position your framework against 2.17; one paragraph per module + one for the integration | — |

---

## 7. Chapter 3 — Methodology Chapter Structure

*From your Methodology document.*

| Section | Content |
|---|---|
| 3.1 Research Approach | Quantitative, under a Design Science Research umbrella (Build → Demonstrate → Evaluate); one paragraph on why qualitative methods are not required by the RQs |
| 3.2 Overall Research Design | The five-arm controlled ablation experiment (Baseline HPA/KEDA; Module 1 only; Module 2 only; Module 3 only; full framework), crossed with three workload patterns — a small factorial design |
| 3.3 Framework Design | 3.3.1 Formal problem definition (objective function: minimize SLA-violation cost subject to resource constraints); 3.3.2 architecture diagram (MAPE-K-style loop); 3.3.3 Module 1 design (fusion function); 3.3.4 Module 2 design (placement scoring); 3.3.5 Module 3 design (adaptation rule + stability considerations) |
| 3.4 Implementation | Kubernetes-native controller/operator; scheduler plugin/extender integration point; Prometheus metrics pipeline; testbed specification (dedicated multi-node cluster, 4–8 workers, fixed version/provider/region) |
| 3.5 Population and Sample | Purposive benchmark sampling: 3 workload types (steady e-commerce microservice, bursty trace-replay, one stateful/inference-style app); 3 load patterns (steady, spike, ramp); justify purposive sampling as the systems-research norm |
| 3.6 Data Collection | Prometheus + K8s event logs + load generator (k6/Locust); ≥5 repeated trials per arm; metric list: SLA-violation count *and duration*, p95/p99 latency, replica timeline, node utilization, cost proxy (node-hours), elasticity metrics (under/over-provisioning timeshare, instability, deviation — per Tamiru et al.) |
| 3.7 Data Analysis | Descriptives → omnibus test (ANOVA or Kruskal-Wallis) → corrected pairwise comparisons → effect sizes + confidence intervals → ablation decomposition (marginal contribution per module) → cross-workload consistency check → time-series visual analysis of oscillation |
| 3.8 Team Contribution Plan | One member per module for design/implementation and the module-only arms; joint work on integration, full-framework arm, and ablation analysis; explicit authorship/contribution statement |
| 3.9 Limitations of the Design | Cross-reference Chapter (Section 9 below) |
| 3.10 Ethical Considerations | No human subjects (confirm with institutional guidelines); responsible compute use; load-testing only on provisioned infrastructure (provider ToS); pre-registered metrics and full reporting of all arms; open-source license attribution; fair team-credit documentation |

---

## 8. Chapter 4–5 — Expected Findings and Contribution

*For a proposal, write these as expectations; for the final report, Chapter 4 = Results, Chapter 5 = Discussion.*

**Expected empirical findings (hypotheses, stated cautiously):**
1. The fused signal score detects SLA risk earlier than CPU-only scaling, reducing violation *duration* (the literature shows queue-depth-only already beats CPU-only; fusion is expected to at least match it while covering workload types queue depth alone misses).
2. Cause-aware placement reduces cold-start delay and node imbalance relative to the default scheduler, at modest scheduling-latency cost.
3. Adaptive parameters reduce oscillation (fewer unnecessary scaling events) versus fixed parameters, especially under the bursty pattern.
4. The full framework outperforms any single module, but with diminishing returns — the ablation will show which module carries the most weight (this is a finding either way, including if one module contributes little).
5. Effect sizes will differ across workload types (per Tamiru et al.'s workload-dependence finding); the stateful/inference workload is the most likely place for the framework to underperform expectations — report this honestly if it happens.

**Contributions (four types — say them explicitly):**
1. **Artifact:** an open, Kubernetes-native integrated framework (three modules + integration).
2. **Empirical:** the first ablation-based quantification of the separate and combined contributions of signal fusion, co-scheduling, and adaptive control (addresses the Methodological and Variable/Concept gaps).
3. **Methodological:** a reusable multi-arm, multi-workload evaluation protocol with repeated trials and statistical reporting — directly answering the field's documented evaluation weaknesses.
4. **Positioning/theoretical (modest claim):** an explicit mapping of queueing-based signals, placement scoring, and feedback-control adaptation into a single MAPE-K-style loop, with a stability discussion (full formal proof framed as future work unless your timeline allows it).

---

## 9. Limitations Section

*Structure as "acknowledged by design" — each limitation traces to a gap you already named, which shows examiners deliberate scoping, not oversight.*

| Limitation | Trace to Gap Analysis | Honest one-liner for the report |
|---|---|---|
| Lab testbed, not production | Practical, Time | Controlled cluster cannot replicate production drift or multi-tenant noise; results establish mechanism validity, not deployment guarantees |
| Days-to-weeks evaluation window | Time | Long-horizon stability of the adaptive controller under seasonal drift is untested; framed as future work |
| Three benchmark workloads | Population | Purposive sample; generalization beyond tested workload classes is not claimed |
| Single cluster, single region | Geographical, Context | Edge/multi-region and multi-tenant behavior untested |
| Statistical power bounded by compute budget | Methodological | Trial counts reported transparently; effect sizes and CIs given so readers can judge |
| Stability argued, not formally proven | Theoretical | Bounded-oscillation behavior shown empirically; formal control-theoretic guarantees left as future work |
| Clean-metrics assumption | Variable/Concept | Robustness to corrupted/delayed signals not evaluated (noted as the fusion approach's enlarged attack/failure surface) |

---

## 10. Conclusion Structure

| Section | Content |
|---|---|
| C.1 Summary of the Work | One paragraph: the problem (three gaps), the artifact (three modules + integration), the evaluation (five-arm ablation, three workloads) |
| C.2 Answers to the Research Questions | One short paragraph per sub-RQ, then the main RQ — answer each *directly with numbers*, including any negative or mixed results |
| C.3 Contributions Restated | The four contribution types from Section 8, one sentence each |
| C.4 Implications | For practitioners (what to adopt and when); for researchers (what the ablation revealed about where the value is) |
| C.5 Limitations Recap | Three sentences max — point back to the limitations section |
| C.6 Future Work | Ordered by your Gap Analysis feasibility table: multi-month production study (Time gap), edge/multi-region deployment (Geographical), metric-corruption robustness (Variable/Concept), formal stability proofs (Theoretical), carbon/energy-aware extension |
| C.7 Closing Statement | One or two sentences returning to the opening motivation — SLA-driven elasticity as a control problem the ecosystem has solved only in pieces, and what integrating the pieces showed |

---

## Appendix: Document Map (everything produced across this project)

| # | File | Feeds into |
|---|---|---|
| 1 | Research_Framework | Chapters 1–2 background, keywords, source types |
| 2 | Literature_Review_Plan | Chapter 2 structure (Sections 2.7–2.18 here) |
| 3 | Research_Gap_Analysis | Problem statement Move 2–3; Limitations; Future Work |
| 4 | Research_Questions_Objectives | Section 1.4 / Section 5 here, with alignment table |
| 5 | Research_Methodology | Chapter 3 (Sections 3.1–3.10 here) |
| 6 | Source_Evaluations | Credibility notes + citation cautions (esp. Entries 2 and 7) |
| 7 | Literature_Matrix | Gap-synthesis table (2.17) and per-source rows |
| 8 | **This document** | The master outline binding all of the above |

*Final tip: write Chapter 3 first (you already have nearly all of it), then Chapter 2 (your matrix does most of the work), then Chapter 1 last — introductions are easiest to write when everything they introduce already exists.*

---

## Coherence Checklist (run before submission)

| Check | Where it must hold |
|---|---|
| Every gap claimed in the problem statement is evidenced in the literature review and either addressed or explicitly deferred | Problem statement ↔ 2.17 ↔ Limitations |
| Every sub-RQ has exactly one objective, one experimental arm, one expected finding, and one answer | 1.4 ↔ 3.2 ↔ Section 8 ↔ C.2 |
| Terminology identical everywhere: *SLA compliance*, *cost efficiency*, *control stability* — no drifting into "SLA adherence" or "cost savings" | All chapters, including results headings |
| Every number cited from literature traces to a verified source's results, never its abstract (the NimbusGuard abstract-vs-results mismatch is the standing reason) | Chapter 2 ↔ Source_Evaluations file |
| Each deferred gap appears in both Scope (1.6) and Future Work (C.6) — nothing deferred silently | 1.6 ↔ C.6 |
| Each team member's module maps to one design subsection, one experimental arm, and one results subsection | 3.3 ↔ 3.2 ↔ results chapter ↔ 3.8 |
| An examiner reading only 1.4 and C.2 sees a closed question-answer loop | 1.4 ↔ C.2 |
