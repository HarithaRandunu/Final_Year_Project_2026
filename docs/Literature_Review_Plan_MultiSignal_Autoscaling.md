# Literature Review Plan
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Companion document to your Research Framework file. Use this to structure Chapter 2 (Literature Review) — every table below can be expanded directly into review sections or a gap-synthesis matrix.*

---

## 1. Main Themes You Should Cover

| # | Theme | Why It's Central to Your Review |
|---|---|---|
| T1 | Kubernetes autoscaling mechanisms and their limitations | Establishes the baseline (HPA, VPA, Cluster Autoscaler, KEDA) your framework improves on |
| T2 | Application-level & multi-signal observability for scaling | Directly grounds Module 1 (Signal Fusion) |
| T3 | Scheduling and pod placement in container orchestration | Directly grounds Module 2 (Co-Scheduling) |
| T4 | Coupling / co-optimization of scaling and scheduling | The connective theme between T1–T3 that motivates your integration |
| T5 | Adaptive and self-tuning control mechanisms | Directly grounds Module 3 (Adaptive Parameter Control) |
| T6 | Predictive / proactive workload forecasting | Extends your framework from reactive to forward-looking fusion |
| T7 | SLA/SLO/QoS-driven and cost-aware resource management | Frames the *why* — the business objective all three modules serve |
| T8 | Evaluation methodologies, benchmarks, and metrics | Needed to justify your experimental design later (Chapter 5) |
| T9 | Explainability, robustness, and security of automated scaling | Cross-cutting critical lens — strengthens your discussion/limitations chapter |

---

## 2. Sub-Themes Under Each Main Theme

| Main Theme | Sub-Themes to Search and Organize |
|---|---|
| **T1. Autoscaling mechanisms & limitations** | HPA behavior and known lag; VPA and vertical scaling; Cluster/Node Autoscaler; KEDA event-driven scaling; comparative surveys and taxonomies of autoscaling techniques |
| **T2. Multi-signal observability** | CPU/memory vs. backlog/queue-depth signals; latency-percentile (p95/p99) driven scaling; custom/business metrics; signal-fusion methods (weighted score, rule cascade, learned model) |
| **T3. Scheduling & placement** | Default `kube-scheduler` node scoring; affinity/anti-affinity and topology spread; bin-packing and node consolidation; scheduler plugins/extenders; descheduling/rebalancing |
| **T4. Scaling–scheduling coupling** | Formal joint-optimization framings (NP-hard combinatorial models); heuristic decoupled coordination (e.g., non-binding rescheduler + binding autoscaler); placement-aware scaling signals; cold-start and cache-locality-aware placement |
| **T5. Adaptive control** | MAPE-K self-adaptive loops; control theory (PID/PI feedback, stability, hysteresis, cooldown windows); reinforcement learning for parameter tuning; hybrid control-theory + ML approaches |
| **T6. Predictive forecasting** | Statistical models (ARIMA, exponential smoothing); deep learning models (LSTM/GRU, Transformer/Informer); hybrid reactive-proactive designs; forecast-uncertainty handling (e.g., conformal prediction) |
| **T7. SLA/SLO/cost framing** | SLI→SLO→SLA definition chain; cost-aware/FinOps-aligned scaling; multi-tenant QoS guarantees; violation *duration* vs. violation *count* as the better outcome measure |
| **T8. Evaluation & benchmarks** | Benchmark microservice apps (TeaStore, Online Boutique, Sock Shop); public workload traces (Google/Alibaba cluster trace, Azure Functions, Wiki-Pageviews); elasticity metrics (under/over-provisioning time, instability, deviation); reusable evaluation harnesses (e.g., ScalerEval) |
| **T9. Explainability, robustness & security** | RL-in-production brittleness and retraining cost; auditability of automated scaling decisions; autoscaler sensitivity to corrupted/faulty metrics; security exploitation of elasticity (e.g., economic denial-of-sustainability attacks) |

---

## 3. Key Theories or Models to Include

| Theory / Model | Core Idea | How to Use It in the Review |
|---|---|---|
| **MAPE-K / Autonomic Computing loop** | Self-managing systems Monitor–Analyze–Plan–Execute using shared Knowledge | Frame the overall structure your three modules operate inside |
| **Control theory** (feedback control, PID/PI, stability, hysteresis) | Treats scaling as a dynamical system with an error signal and damping to avoid oscillation | Position papers on Module 3 (adaptive control) and stabilization mechanisms |
| **Queueing theory** (M/M/c, Little's Law) | Models arrival rate, service rate, and backlog to estimate required capacity | Theoretical justification for backlog/queue-depth as a scaling signal (Module 1) |
| **Reinforcement learning / Markov Decision Processes** | Agent learns a state→action policy via reward feedback | Frame papers proposing RL-tuned thresholds or scaling policies |
| **Time-series forecasting theory** (ARIMA, LSTM/GRU, Transformer) | Predicts near-future demand from historical patterns | Frame the predictive/proactive extension of signal fusion |
| **Bin-packing & combinatorial optimization (NP-hardness)** | Efficiently fitting variable items into finite bins is provably hard at scale | Explains *why* full joint scaling+scheduling optimization is rare and heuristics dominate |
| **Multi-objective optimization / Pareto efficiency** | Competing goals (cost, performance, stability) cannot all be maximized at once | Frame comparative results and trade-off discussions across studies |
| **Lorido-Botran et al. taxonomy** | Classic 5-family classification: threshold rules, queueing theory, control theory, reinforcement learning, time-series analysis | Use as the organizing spine for your whole literature review |
| **Design Science Research (DSR)** | A methodological lens (not a domain theory) for build-and-evaluate research | Use to justify *why* your review is organized around gaps that motivate an artifact, not just a survey of findings |

---

## 4. What Kind of Studies You Should Search For

| Study Type | What It Gives You | Where to Use It in the Review |
|---|---|---|
| **Systematic reviews / taxonomies** | A map of the field and shared terminology — read these first | Opening of Chapter 2, to structure everything else |
| **Empirical system papers** (design + build + evaluate) | Concrete techniques and quantitative results to compare against | Main body of each thematic section (T1–T7) |
| **Comparative / benchmarking studies** | Baseline numbers to contextualize your own framework's expected gains | T8 section, and reused directly in your Chapter 5 methodology |
| **Production / industry case studies & postmortems** | Real-world constraints and failure modes rarely visible in lab experiments | T9 section and your discussion/limitations chapter |
| **Theoretical / algorithmic papers** (control theory, optimization) | Formal grounding for how and why your design should work | Chapter 3 (methodology), cited to justify design choices |
| **Recent preprints** (arXiv, 2025–2026) | Most current state of the art in a fast-moving field | Throughout — flag clearly as not-yet-peer-reviewed |
| **Vendor / CNCF official documentation** | Ground truth on current default behavior of HPA/VPA/KEDA | Background/motivation only — not treated as research evidence |

---

## 5. What Comparisons You Should Make

| Comparison Axis | What to Compare | Anchor Studies to Draw On |
|---|---|---|
| Single-signal vs. multi-signal scaling | SLA violation rate, response time, replica oscillation | Application-level/backlog-driven SLA framework (reports up to ~86% SLA-violation reduction vs. CPU-only HPA) |
| Reactive vs. proactive/predictive scaling | Responsiveness vs. forecast-error risk and added complexity | Prophet+LSTM proactive Kubernetes autoscaling study; hybrid reactive-proactive algorithm papers |
| Rule-based/threshold vs. RL/ML-based control | Explainability and production readiness vs. adaptability | "Safe and explainable" SLO-first multi-signal framework vs. PPO/DDPG-based RL autoscaler vs. AWARE/FIRM findings on RL retraining cost in production |
| Decoupled vs. jointly-optimized scheduling+scaling | Resource waste/cost savings vs. computational overhead | Heuristic non-binding-rescheduler-plus-binding-autoscaler approach vs. formal NP-hard joint-optimization framings |
| Static vs. adaptive control parameters | Stability/oscillation vs. manual tuning burden | PI-controller-plus-conformal-prediction budget-aware calibration approach vs. default fixed-threshold HPA |
| Simulation/trace-driven vs. real-cluster evaluation | Internal validity vs. external validity and generalizability | Reusable evaluation testbeds (e.g., ScalerEval) vs. real GKE/EKS cluster experiments |
| Cost-optimized vs. performance-optimized objective framing | Which trade-off point different designs implicitly choose | RL autoscaler emphasizing ~20% cost savings vs. SLO-first framework emphasizing violation-duration reduction |

---

## 6. Possible Contradictions in the Literature

| Contradiction | Position A | Position B | Note for Your Review |
|---|---|---|---|
| Value of reinforcement learning for autoscaling | RL-based autoscalers report significant gains in utilization, tail latency, and cost over HPA/VPA/KEDA | Production-focused studies (e.g., AWARE, and FIRM's characterization) find RL policies are workload- and infrastructure-specific, degrade under drift, and need costly retraining | Likely explained by differences in evaluation environment (benchmark vs. production-representative) and training regime — flag this explicitly rather than picking a side |
| Does more signal always mean better decisions? | Application-level/multi-signal fusion sharply reduces SLA violations compared to CPU-only signals | Studies on autoscaler fault sensitivity show that corrupted or noisy metrics can cause systematic over/under-provisioning regardless of how many signals are used | Suggests multi-signal fusion must be paired with metric-integrity/robustness handling, not just more inputs |
| Is joint scaling–scheduling optimization necessary? | Formal treatments frame it as the theoretically "correct" approach (an NP-hard combinatorial problem) | Practical systems show a heuristic, decoupled coordination (rescheduler + autoscaler working together, not a single global optimizer) captures most of the benefit at much lower cost | Supports a pragmatic design choice: your Module 2 can be a lightweight heuristic rather than a full joint solver |
| Are static thresholds always the problem? | Broad consensus criticizes fixed thresholds for causing over/under-scaling under variable workloads | Some production systems (e.g., LLM-inference serving) deliberately choose one simple, well-understood metric over more complex fused signals, prioritizing operational predictability | "Adaptive" does not have to mean maximally complex — simplicity is still valued when reliability matters more than optimality |
| Does forecasting solve the oscillation problem? | Proactive/predictive scaling is repeatedly shown to reduce cold-starts and pre-empt SLA violations | Other studies note oscillation persists "even when using a cooling-down strategy," and depends heavily on forecast accuracy | Forecasting is not a substitute for adaptive control — supports keeping Module 3 even in a predictive design |

---

## 7. Possible Research Gaps

| # | Gap | Description | Link to Your Framework |
|---|---|---|---|
| G1 | No unified multi-signal fusion model | Backlog, CPU, and latency-percentile signals are rarely fused into one validated SLA-aware decision score | Module 1 |
| G2 | Scaling–scheduling disconnect | Correct scaling decisions are undermined by placement that ignores why a pod was created | Module 2 |
| G3 | Static control parameters | Fixed thresholds, step sizes, and monitoring intervals cannot adapt to changing workload behavior | Module 3 |
| G4 | No integrated end-to-end framework | No existing system combines signal fusion, co-scheduling, and adaptive control into one evaluated architecture | Modules 1+2+3 |
| G5 | Limited evidence on production-safety of adaptive/RL-tuned control | Most adaptive-control gains are shown in lab/benchmark settings; little evidence on stability guarantees once deployed against drifting, production-representative workloads | Justifies an explicit stability/safety evaluation in your methodology |
| G6 | No standard benchmark for *integrated* frameworks | Standard benchmarks exist for autoscalers alone, but not for systems that jointly evaluate scaling, placement, and adaptive control together | Justifies why your evaluation design (Chapter 5) needs to be built carefully and documented, not just borrowed |
| G7 | Robustness to signal corruption is under-studied | Almost no work evaluates how multi-signal fusion behaves when one or more input metrics are noisy, delayed, or faulty | A candidate "future work" or stretch objective if you want to strengthen novelty |

---

## 8. Suggested Literature Review Outline

*Can be used directly as Chapter 2 of a thesis, or as the structure of a standalone review paper.*

| Section | Content |
|---|---|
| 2.1 | Scope and review methodology — databases searched, keyword strategy (from your keyword list), inclusion/exclusion criteria, and time window (recommend 2018–2026, with most weight on 2023–2026) |
| 2.2 | Kubernetes autoscaling fundamentals and their limitations (T1) |
| 2.3 | Application-level and multi-signal observability for scaling decisions (T2) |
| 2.4 | Scheduling and pod placement in Kubernetes (T3) |
| 2.5 | Coupling autoscaling and scheduling — co-optimization approaches (T4) |
| 2.6 | Adaptive and self-tuning control mechanisms (T5) |
| 2.7 | Predictive and proactive workload forecasting for autoscaling (T6) |
| 2.8 | SLA/SLO/QoS-driven and cost-aware resource management (T7) |
| 2.9 | Evaluation methodologies, benchmarks, and metrics (T8) |
| 2.10 | Cross-cutting concerns: explainability, robustness, and security of automated scaling (T9) |
| 2.11 | Synthesis — a gap-mapping table: each anchor paper → which of your three modules it partially addresses → what it still leaves open |
| 2.12 | Chapter summary and positioning of your proposed framework relative to the reviewed literature |

---

*Suggested next step: turn Section 6 (Contradictions) into a short paragraph in your review's synthesis (2.11) — explicitly naming unresolved tensions is one of the fastest ways to demonstrate genuine critical engagement rather than a descriptive summary.*
