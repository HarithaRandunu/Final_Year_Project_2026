# Research Framework
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Prepared as an academic research strategy document, built directly on the three gaps identified in your "Promex Gaps" note (Signal Fusion, Co-Scheduling, Adaptive Parameter Control).*

---

## 1. Simple Explanation of the Topic

Kubernetes needs to constantly answer two questions: **"how many copies of my app should be running right now?"** and **"where should each copy go?"** Today these two questions are answered by two systems that barely talk to each other:

- The **autoscaler** (e.g., Horizontal Pod Autoscaler) decides *how many* pods to run, usually by watching one signal — either an infrastructure metric like CPU, or an application metric like queue length — but rarely both together with tail-latency.
- The **scheduler** decides *where* those pods go, using its own scoring rules, without knowing why the autoscaler just asked for more pods.
- Both usually run on **fixed, human-set rules**: fixed CPU thresholds, fixed step sizes (+1/-1 pod), fixed check intervals — regardless of whether the workload is calm, bursty, or trending.

Your proposed framework fixes this by adding three cooperating modules on top of Kubernetes:

1. **Module 1 — Signal Fusion:** merges backlog (queue depth), CPU utilization, and latency percentiles into one decision score, so scaling reflects real user-facing SLA risk, not just one proxy metric.
2. **Module 2 — Co-Scheduling:** a placement-aware scoring function that decides *where* new pods land based on live node resource availability, so scaling and placement are no longer disconnected.
3. **Module 3 — Adaptive Parameter Control:** a feedback mechanism that watches how well past scaling decisions worked and automatically re-tunes thresholds, step sizes, and monitoring intervals — no manual operator tuning.

A useful analogy: Module 1 is the **senses** (what is happening), Module 2 is the **hands** (what to do about it and where), and Module 3 is the **reflexes that learn** (getting better at reacting over time). Together they form a closed feedback loop — this is essentially a modernized, learning version of the classic "Monitor–Analyze–Plan–Execute" control loop used in self-adaptive systems research.

---

## 2. Key Concepts You Must Understand

**A. Kubernetes & orchestration fundamentals**
- Pods, nodes, control plane, `kube-scheduler`, ReplicaSets/Deployments
- Horizontal Pod Autoscaler (HPA), Vertical Pod Autoscaler (VPA), Cluster Autoscaler, Node Autoscaling
- KEDA (Kubernetes Event-Driven Autoscaling) and its custom-metric scaling model
- Custom schedulers, scheduler plugins/extenders, and the `CustomPodAutoscaler` pattern

**B. Signals and metrics**
- Infrastructure-level signals (CPU, memory) vs. application-level signals (queue/backlog depth, requests-in-flight, latency percentiles such as p95/p99)
- Service Level Indicator (SLI) → Service Level Objective (SLO) → Service Level Agreement (SLA) — the chain that ties a technical metric to a business promise
- Tail-latency vs. average-latency reasoning (why p95/p99 matters more than the mean for SLA compliance)

**C. Scaling mechanics**
- Horizontal vs. vertical scaling; scale step size; scale-out vs. scale-in asymmetry
- Cooldown periods / stabilization windows; hysteresis (why systems avoid reacting to every small fluctuation)
- Oscillation / "thrashing" — rapid scale up-down cycles caused by overly sensitive thresholds

**D. Scheduling and placement**
- Node scoring functions, bin-packing, resource fragmentation
- Affinity/anti-affinity, taints/tolerations, topology spread
- Cold starts, cache locality, and why "correct scaling count" can still yield poor performance if placement is bad

**E. Control and adaptation theory**
- MAPE-K loop (Monitor–Analyze–Plan–Execute–Knowledge) for self-adaptive systems
- Feedback control basics: error signal, proportional/integral response, damping, stability
- Reinforcement learning basics: state, action, reward, policy — as a mechanism for self-tuning parameters
- Time-series forecasting basics: ARIMA, exponential smoothing, LSTM/GRU, Transformer-based forecasters, and forecast-error propagation risk

**F. Evaluation concepts**
- SLA/SLO violation rate and violation *duration* (not just count)
- Elasticity metrics: under-provisioning time, over-provisioning time, instability, and deviation from an "ideal" autoscaler
- Cost–performance–stability trade-off framing
- Explainability/auditability of automated scaling decisions (increasingly discussed as "AIOps" governance)

---

## 3. Main Theories Related to the Topic

| Theory / Model | Core Idea | Where It Fits Your Framework |
|---|---|---|
| **Autonomic Computing / MAPE-K loop** | Systems should self-monitor, self-analyze, self-plan, and self-execute using a shared knowledge base | The umbrella loop your three modules operate inside |
| **Control theory** (feedback control, PID-style controllers, stability & hysteresis) | Scaling is treated as a dynamical system with an error signal, damping, and stability conditions to prevent oscillation | Foundation for Module 3 (Adaptive Parameter Control) and any PID/PI-style score-to-action mapping in Module 1 |
| **Queueing theory** (e.g., M/M/c models, Little's Law) | Models arrival rate, service rate, and backlog to estimate wait time and required capacity | Theoretical basis for using "backlog/queue depth" as a first-class scaling signal |
| **Reinforcement learning / Markov Decision Processes** | An agent learns a state→action policy through trial-and-error reward feedback | A candidate mechanism for Module 3's self-tuning of thresholds, step size, and interval |
| **Time-series forecasting theory** (ARIMA, LSTM/GRU, Transformer models) | Predicts near-future demand from historical patterns to enable proactive (not just reactive) action | Extends Module 1 from reactive fusion toward predictive fusion |
| **Bin-packing / combinatorial optimization** | Efficiently fitting variable-sized items (pods) into finite bins (nodes) is NP-hard in general | Basis for Module 2's node-scoring/placement function |
| **Multi-objective optimization / Pareto efficiency** | Competing goals (cost, latency, stability) usually cannot all be maximized simultaneously — you optimize trade-offs, not a single number | Frames how you evaluate the framework across all three modules together |
| **Lorido-Botran et al. taxonomy of autoscaling techniques** | Classic classification of autoscaling approaches into five families: threshold-rules, queueing theory, control theory, reinforcement learning, and time-series analysis | A ready-made lens for structuring your literature review and positioning your framework against prior work |

---

## 4. Important Debates in This Area

1. **Reactive vs. proactive (predictive) scaling.** Reactive controllers are simple and stable but always lag behind demand; predictive controllers using ML/statistical forecasting act ahead of time but inherit forecast error and add complexity. Many recent papers converge on **hybrid reactive-proactive** designs rather than picking a side.

2. **Single-metric vs. multi-signal decision-making.** CPU-only autoscaling is the production default (via HPA) but is well documented to lag under backlog-driven or bursty workloads. The open question your framework addresses is *how* to fuse signals (weighted sum? learned model? rule cascade?) without making the system harder to reason about.

3. **Rule-based vs. learning-based control.** Threshold rules are transparent and predictable but brittle; RL/ML-based controllers adapt but raise concerns about safety, training time, and explainability in production SLA-critical systems. Several recent papers explicitly frame this as a "safe and explainable" requirement rather than treating adaptability as free.

4. **Joint (co-optimized) scheduling and scaling vs. decoupled control planes.** Full joint optimization of "how many pods + where they go" is theoretically appealing but computationally expensive; several practical systems show that **loosely coupled heuristics** (e.g., a rescheduler working alongside an autoscaler) can capture much of the benefit without a global optimizer — this is a genuine open trade-off, not a solved problem.

5. **Static vs. self-tuning control parameters.** Fixed thresholds/step sizes/intervals are easy to audit but require manual re-tuning as workloads drift; adaptive/self-tuning parameters remove manual effort but raise the question of how to guarantee stability and avoid the controller "learning" a bad policy in production.

6. **Cost vs. performance vs. stability.** Aggressive scaling reduces SLA violations but increases cost and oscillation risk; conservative scaling saves cost but risks violations. There is no universally "correct" operating point — it depends on the SLA's cost of violation.

7. **Simulation/trace-driven evaluation vs. real cluster experiments.** Much of the literature notes there is **no standard benchmark suite** for cloud-native autoscaling research; results from demo apps (TeaStore, Online Boutique, Sock Shop) and public traces (Google/Alibaba cluster traces, Azure Functions traces) may not generalize to production traffic patterns — a recurring validity concern you should address explicitly.

8. **Does autoscaling elasticity itself create new risk?** A growing security-adjacent line of work shows that autoscaling policies can be *exploited* (e.g., economic denial-of-sustainability attacks that manipulate the autoscaler into over-provisioning). This is a useful "future work" or "limitations" angle for your framework.

---

## 5. Possible Research Problems

| # | Gap (from your document) | Reformulated Research Problem | Framework Module |
|---|---|---|---|
| P1 | GAP-1: No unified multi-signal model | Existing Kubernetes autoscalers make scaling decisions from a single infrastructure- or application-level signal, lacking a validated method to fuse backlog, CPU, and latency-percentile signals into one SLA-aware decision score. | Module 1 |
| P2 | GAP-2: Autoscaling/scheduling disconnect | Even when scaling decisions are correct, the default Kubernetes scheduler places new replicas without awareness of *why* they were created, causing resource waste, cold-start latency, cache misses, and load imbalance. | Module 2 |
| P3 | GAP-3: Static thresholds, step sizes, intervals | Fixed-parameter autoscaling controllers cannot adapt to changing workload behavior, leading to persistent over/under-scaling and control instability (oscillation). | Module 3 |
| P4 | Synthesis gap (implicit in your document) | No existing framework integrates signal fusion, placement-aware co-scheduling, and adaptive parameter control into a single, coherent, production-viable, and explainable control loop for SLA-driven Kubernetes workloads. | Modules 1+2+3 |

---

## 6. Possible Research Questions

**Diagnostic / descriptive**
- RQ1: To what extent do single-signal autoscalers (CPU-only or backlog-only) fail to predict SLA-relevant performance degradation compared to a fused multi-signal score?
- RQ2: How much resource waste, cold-start latency, or load imbalance is attributable specifically to the disconnect between scaling and scheduling decisions?

**Design / development**
- RQ3: How can backlog, CPU utilization, and latency percentiles be combined into a single, interpretable scaling-decision function (e.g., weighted score, learned model, or rule cascade), and how sensitive is performance to the fusion method chosen?
- RQ4: What node-scoring function allows a scheduler to place newly scaled pods in a way that is aware of the scaling event's cause (e.g., backlog surge vs. CPU pressure)?
- RQ5: What adaptive control mechanism (feedback-control-based or reinforcement-learning-based) can safely retune thresholds, step size, and monitoring interval without manual operator intervention while maintaining bounded stability?

**Evaluative / comparative**
- RQ6: How does the integrated framework (Modules 1+2+3) perform against baseline autoscalers (HPA, KEDA, VPA) and published predictive/RL autoscalers, in terms of SLA violation rate/duration, cost, and control stability?
- RQ7: What is the individual contribution of each module — via an ablation study — to overall SLA compliance and cost efficiency?
- RQ8: What is the trade-off between adaptivity/learning-based control and explainability/auditability of scaling decisions in a production-realistic setting?

---

## 7. Possible Research Objectives

1. To design and formalize a **multi-signal fusion model** that combines backlog, CPU utilization, and latency-percentile metrics into a single SLA-aware scaling-decision score (addresses RQ1, RQ3).
2. To design a **placement-aware (co-scheduling) scoring function** that couples pod placement to the cause and context of a scaling decision (addresses RQ2, RQ4).
3. To design an **adaptive parameter-control mechanism** that autonomously retunes thresholds, scaling step size, and monitoring interval based on observed control performance (addresses RQ5).
4. To **implement** the three modules as a Kubernetes-native controller/operator (e.g., extending `CustomPodAutoscaler` or a scheduler plugin) integrated with a standard metrics pipeline (e.g., Prometheus).
5. To **evaluate** the integrated framework against established baselines (HPA, KEDA, VPA, and at least one published predictive or RL-based autoscaler) using standard microservice benchmarks and realistic workload traces.
6. To conduct an **ablation study** isolating the contribution of each module to SLA compliance, cost, and control stability.
7. To analyze the **trade-offs** among SLA compliance, cost, latency, and explainability, and to state the boundary conditions (workload types, cluster scales) under which the framework's benefits hold.

---

## 8. Suggested Keywords to Search in Google Scholar

Search in clusters, not one giant query — combine 2–3 terms at a time and scan by recency (2023–2026 for state of the art, plus classic taxonomy papers pre-2020 for theoretical grounding).

**Core / framework-defining**
- `"SLA-driven autoscaling" Kubernetes`
- `"SLO-aware autoscaling" microservices`
- `"multi-signal autoscaling" Kubernetes`
- `"application-level observability" autoscaling`

**Signal fusion**
- `"backlog-aware" Kubernetes autoscaling`
- `queue depth autoscaling Kubernetes`
- `"tail latency" OR "latency percentile" autoscaling SLO`
- `multivariate autoscaling Kubernetes`

**Co-scheduling / placement**
- `"pod placement" autoscaling Kubernetes`
- `"co-scheduling" cloud autoscaling`
- `joint scheduling scaling optimization cloud`
- `placement-aware Kubernetes scheduler microservices`

**Adaptive control**
- `"adaptive threshold" autoscaling Kubernetes`
- `self-adaptive autoscaling MAPE-K`
- `reinforcement learning autoscaling Kubernetes`
- `PID controller cloud autoscaling`
- `"parameter tuning" reinforcement learning control`

**Predictive / forecasting**
- `predictive autoscaling Kubernetes LSTM`
- `proactive autoscaling Transformer forecasting`
- `"hybrid reactive proactive" autoscaling`
- `workload forecasting cloud autoscaling ARIMA`

**Evaluation / theory / surveys (good starting points)**
- `autoscaling survey taxonomy cloud computing`
- `Kubernetes Horizontal Pod Autoscaler limitations`
- `queueing theory cloud elasticity`
- `control theory autoscaling cloud`
- `autoscaling oscillation instability Kubernetes`
- `cost-aware autoscaling Kubernetes`
- `explainable AIOps autoscaling`

Tip: once you find one strong recent paper (2025–2026), use Google Scholar's **"Cited by"** and **"Related articles"** links — this is usually faster than keyword iteration for a fast-moving topic like this.

---

## 9. Types of Sources You Should Look For

| Source Type | Why It's Useful | Examples / Where to Look |
|---|---|---|
| **Survey / taxonomy papers** | Best starting point — map the whole field and its terminology quickly | Lorido-Botran et al. taxonomy; recent 2025–2026 ML-based autoscaling taxonomies (MDPI, ACM CSUR) |
| **Peer-reviewed conference papers** | Rigorous, reproducible system designs and evaluations | OSDI, NSDI, SoCC, ICDCS, ICSE/SEAMS, CLOSER, UCC, IEEE CLOUD |
| **Journal articles** | Deeper, extended-version studies with more evaluation detail | IEEE Transactions on Cloud Computing, IEEE Transactions on Services Computing, ACM Computing Surveys, *Cluster Computing* (Springer), *Future Generation Computer Systems* |
| **ArXiv preprints** | This field moves fast — many 2025–2026 results are preprints before formal publication | arxiv.org (cs.DC, cs.SE categories) |
| **Official project documentation** | Ground-truth on how HPA/VPA/KEDA/Cluster Autoscaler actually behave today | kubernetes.io/docs, keda.sh, CNCF project pages |
| **Benchmark / dataset sources** | Needed to justify and reproduce your experimental setup | Google cluster trace, Alibaba cluster trace, Azure Functions traces, Wiki-Pageviews workload trace; demo apps: TeaStore, Online Boutique, Sock Shop |
| **Master's/PhD theses** | Often contain the most detailed methodology and implementation walkthroughs — useful as a template for your own | University repositories (e.g., via Google Scholar or ProQuest) |
| **Industry technical blogs/whitepapers** | Useful for practical context and current production pain points, but cite cautiously and cross-check against peer-reviewed sources | Vendor engineering blogs — treat as motivation, not evidence |

---

## 10. A Clear Research Structure You Can Follow

This topic — *design, build, and evaluate a new system* — fits naturally into a **Design Science Research (DSR)** structure, common in software/systems engineering theses. Suggested chapter outline:

**Chapter 1 — Introduction**
Background and motivation → the three gaps (restated as the problem) → research problem statement → research questions and objectives → significance/contribution → scope and limitations → thesis structure.

**Chapter 2 — Literature Review**
Organize around your three gaps, not chronologically:
1. Signal-based autoscaling (infrastructure vs. application-level, and multi-signal fusion attempts)
2. Scheduling/placement and its interaction (or lack of it) with autoscaling
3. Adaptive/self-tuning control mechanisms (rule-based, control-theoretic, RL-based)
End with a **gap-synthesis table**: paper → what it does → what it doesn't address → how your framework closes that specific gap. (This directly extends your existing Promex Gaps document.)

**Chapter 3 — System Design / Methodology**
- Formal problem definition (objective function: e.g., minimize SLA-violation cost subject to resource/cost constraints)
- Architecture diagram of the three modules and how they interact within a MAPE-K-style loop
- Module 1 design: signal fusion method and justification
- Module 2 design: placement-aware scoring function
- Module 3 design: adaptive control mechanism and stability considerations

**Chapter 4 — Implementation**
Kubernetes-native implementation approach (custom controller/operator or `CustomPodAutoscaler`), metrics pipeline (e.g., Prometheus), scheduler integration point (plugin/extender), testbed description.

**Chapter 5 — Experimental Setup**
Baselines (HPA, KEDA, VPA, at least one published predictive/RL autoscaler), benchmark applications, workload traces, evaluation metrics (SLA violation rate/duration, response time, cost, oscillation/instability, resource utilization), ablation study design.

**Chapter 6 — Results and Discussion**
Comparative results against baselines, ablation results per module, trade-off analysis (cost vs. performance vs. stability), threats to validity (simulation vs. real cluster, benchmark generalizability).

**Chapter 7 — Conclusion and Future Work**
Summary of contributions, limitations, and future directions (e.g., multi-cluster/federated extensions, edge computing, security implications of elastic scaling, formal safety guarantees for the adaptive controller).

---

## Appendix — Grounded Anchor Reading List

*A starting bibliography assembled from current literature (2022–2026), organized by theme. Use these as seed papers and follow their citation graphs.*

**Directly relevant to your three gaps**
- Vu, D.-D., Tran, M.-N., & Kim, Y. (2022). *Predictive Hybrid Autoscaling for Containerized Applications.* IEEE Access, 10, 109768–109778. — your Gap-2 reference paper.
- *Business-Aware SLA-Driven Autoscaling for Kubernetes Microservices Using Application-Level Observability* (2026) — your Gap-1 reference paper; reports large SLA-violation reductions using queue-depth-driven deterministic replica mapping.
- *An SLO Driven and Cost-Aware Autoscaling Framework for Kubernetes* (2025, IJCST) — a close conceptual neighbor to your full framework: multi-signal, "safe and explainable," AIOps-driven SLO-first control.

**Multi-signal / SLA-aware autoscaling**
- *SLO and Cost-Driven Container Autoscaling on Kubernetes Clusters* (CLOSER 2025) — introduces a `CustomPodAutoscaler` resource combining cost and SLO fields directly.
- Pozdniakova, O., Cholomskis, A., & Mažeika, D. (2024). *Self-adaptive autoscaling algorithm for SLA-sensitive applications running on Kubernetes clusters.* Cluster Computing, 27, 2399–2426.
- *Addressing QoS in Kubernetes Pods Autoscaling* (QualITA 2025).

**Co-scheduling / placement-aware scaling**
- *OOSP: Opportunistic Optimization Scheme for Pod Deployment Enhanced with Multilayered Sensing* (2024) — placement optimization aware of inter-pod dependencies.
- *On Optimized Scheduling Scheme for Rapid Pod Autoscaling in Kubernetes* (2026) — addresses scheduler latency during rapid scale-out bursts.
- *Kubernetes Scheduling: Strategies & Autoscaling* — heuristic coupling of rescheduling and autoscaling (non-binding rescheduler + binding autoscaler).

**Adaptive control / reinforcement learning**
- Pandey, V. (2026). *Reinforcement Learning-Based Autoscaling for Cost and Performance Optimization in Kubernetes Clusters.* Springer LNDECT vol. 277.
- *Daedalus: Self-Adaptive Horizontal Autoscaling for Resource Efficiency of Distributed Stream Processing Systems* (2024) — clean MAPE-K + forecasting implementation to study.
- *BACC: Budget-Aware Calibration and Control for Horizontal Autoscaling* (2026) — combines a PI controller with conformal-prediction-calibrated forecasts; a strong example of hybrid control-theory + ML design.
- *Applying Machine Learning in Self-adaptive Systems: A Systematic Literature Review* (ACM TAAS) — surfaces the Lorido-Botran five-category taxonomy.

**Predictive / forecasting-based**
- *Time series forecasting-based Kubernetes autoscaling using Facebook Prophet and LSTM* (2025, Frontiers in Computer Science).
- *Predictive Autoscaling in Cloud-Native and Federated Cloud-Edge Computing Environments: A Taxonomy and Future Directions* (2026) — very current, broad taxonomy including Transformer-based forecasters.
- *Mitigating Temporal Blindness in Kubernetes Autoscaling: An Attention-Double-LSTM Framework* (2026).
- *A Hybrid Reactive-Proactive Auto-scaling Algorithm* (2026).

**Surveys / taxonomies (read first)**
- *ML-Based Autoscaling for Elastic Cloud Applications: Taxonomy, Frameworks, and Evaluation* (2026, MDPI) — reviews 60 studies (2015–2025) with a five-dimension taxonomy.
- *Auto-scaling Web Applications in Clouds: A Taxonomy and Survey* — classic control-theory framing of self-adaptive autoscalers.

**Benchmarks / evaluation methodology**
- *ScalerEval: Automated and Consistent Evaluation Testbed for Auto-scalers in Microservices* (2025) — reusable evaluation harness using Online Boutique and Sock Shop.
- *An Experimental Evaluation of the Kubernetes Cluster Autoscaler in the Cloud* — defines under/over-provisioning time and instability/deviation metrics, useful directly for your Chapter 5.
- *BASE: Burst-Adaptive Autoscaling via Stacked Ensembles for SLO Assurance and Cost Efficiency* (2024).

**Adjacent / critical perspective**
- *Exploiting Kubernetes Autoscaling for Economic Denial of Sustainability* (SIGMETRICS 2025) — a useful "limitations/future work" citation on the risks of elastic scaling itself.

---

*Next step suggestion: start Chapter 2 by building the gap-synthesis table (Section 5 above, expanded) — for each anchor paper, note in one sentence exactly which of your three modules it partially addresses and what it still leaves open. That table becomes the backbone of your literature review and the strongest justification for your framework's novelty.*
