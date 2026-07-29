# Literature Matrix
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Seventh companion document. Pre-filled with the seven sources verified in the Source Evaluations document. Paste new paper summaries in the chat one at a time and each will be added as a new numbered entry in the same format. Fields I could not verify are marked [UNVERIFIED — check manually] rather than guessed.*

---

## Entry 1

| Field | Content |
|---|---|
| **1. Author and year** | Vu, D.-D., Tran, M.-N., & Kim, Y. (2022) |
| **2. Study context** | Containerized applications on a small bare-metal Kubernetes v1.23 cluster (1 master + 2 workers); Soongsil University, South Korea; published in IEEE Access (peer-reviewed) |
| **3. Research aim** | To combine horizontal and vertical scaling with ML-based demand prediction and burst identification so QoS (response time) is maintained while container utilization stays high |
| **4. Methodology** | Design-and-evaluate system study: Bi-LSTM forecasting + burst detection module; compared 6 forecasting and 6 regression models (80/20 split); baselines = reactive HPA, re-implemented proactive HPA, re-implemented burst-aware HPA |
| **5. Sample** | One CPU-bound benchmark web app (house-price regression model); two public workload traces (Wikipedia access log, FIFA World Cup 98) replayed via Locust |
| **6. Key findings** | SLO violations cut from ~20–22% (reactive HPA, burst periods) to ~2.96–3.89%; lower normalized cost than both proactive baselines; higher pod utilization (~70–74%) in non-burst periods |
| **7. Theory or model used** | Time-series forecasting (Bi-LSTM); hybrid horizontal+vertical scaling model; threshold-based burst detection |
| **8. Limitations** | Single app type; excludes bandwidth-intensive workloads; explicitly excludes pod placement (default scheduler); fixed burst thresholds and fixed 60s monitoring interval; small testbed; no repeated-trial statistics |
| **9. Relevance to my study** | Gap-2 anchor: its own future-work section states pod-placement coordination was out of scope — direct evidence for Module 2's motivation; its fixed thresholds also evidence Gap-3 |
| **10. Possible research gap** | No co-optimization of scaling and placement; static burst-detection parameters and monitoring interval; no multi-signal fusion with backlog/latency percentiles |

---

## Entry 2

| Field | Content |
|---|---|
| **1. Author and year** | Patharlagadda, P. P. (2026) — resolved 2026-07-29 via Crossref/Semantic Scholar bibliographic APIs (IEEE Xplore's page still returns no content to automated retrieval, ResearchGate still blocks scraping) |
| **2. Study context** | Kubernetes microservices with queue-driven workloads; accepted for publication in IEEE Access (peer-reviewed); metrics collected via Prometheus custom exporters |
| **3. Research aim** | To drive autoscaling from application-level observability (queue depth) with a deterministic replica-mapping strategy tied to SLA targets, instead of infrastructure metrics |
| **4. Methodology** | Design-and-evaluate system study; deterministic queue-backlog-threshold-to-replica mapping; compared against CPU-based autoscaling; builds on the authors' own prior HPA work; SLA compliance defined via workload-backlog limits |
| **5. Sample** | [UNVERIFIED — full experimental setup (benchmark app, cluster size, trials) not accessible; check full text] |
| **6. Key findings** | Up to 86% reduction in SLA-violation rate vs. CPU-based autoscaling; faster scaling response; reduced replica oscillation (per abstract — verify conditions in full text before citing the figure) |
| **7. Theory or model used** | Queueing/backlog reasoning (queue depth as leading SLA-risk indicator); deterministic rule-based control (explicitly not learned/adaptive) |
| **8. Limitations** | Single signal (queue depth only) — no fusion with CPU or latency percentiles; deterministic fixed thresholds (non-adaptive); full limitations section unverified |
| **9. Relevance to my study** | Gap-1 anchor: proves one application-level signal beats CPU-only — sets up (without closing) the multi-signal fusion argument of Module 1; also a genuine counter-position favoring simplicity over ML complexity |
| **10. Possible research gap** | No fusion of multiple signals; no adaptive thresholds; no placement awareness — all three of your modules remain open |

---

## Entry 3

| Field | Content |
|---|---|
| **1. Author and year** | Punniyamoorthy, V., Kumar, B., Saha, S., Butra, L., Palanigounder, M., Agarwal, A. K., & Kannan, K. (2025) |
| **2. Study context** | Industry-practitioner research (authors at East West Bank, NTT Data, Albertsons, USA); arXiv preprint arXiv:2512.23415 — **not confirmed peer-reviewed**; a possibly related IJCST listing needs manual verification |
| **3. Research aim** | To enhance Kubernetes autoscaling with AI-Ops principles so SLO and cost constraints are jointly satisfied with safe, explainable, multi-signal control plus lightweight demand forecasting |
| **4. Methodology** | Design-and-evaluate: external control layer over a real Kubernetes cluster; baselines = default HPA, tuned HPA, HPA+VPA (recommendation mode); four metric categories (SLO adherence, responsiveness, cost, stability) |
| **5. Sample** | Three workload patterns (bursty, queue-driven, mixed latency-sensitive + batch); no named benchmark application; cluster size/specs not stated |
| **6. Key findings** | Up to 31% lower cumulative SLO-violation duration; ~24% faster scaling response; 18% lower cost vs. default HPA (10% vs. tuned HPA); stability comparable to or better than tuned HPA |
| **7. Theory or model used** | Multi-signal rule-based control with SLO-first prioritization; lightweight forecasting; explainability/auditability as a design constraint (AI-Ops framing) |
| **8. Limitations** | Author-declared: controlled workloads only, no long-running or large-scale deployment; assumes clean, timely metrics; multi-cluster, adversarial-telemetry robustness, and energy modeling left as future work. Also: single point estimates, no statistics; unnamed benchmark limits replicability |
| **9. Relevance to my study** | Closest existing competitor — fuses signals (overlaps Module 1) and emits a binary node-capacity hint (a much lighter Module 2); its stabilization windows and rate limits are fixed, so Module 3 is untouched. Your novelty statement should be written against this paper |
| **10. Possible research gap** | No true placement-scoring co-scheduling; no adaptive/self-tuning control parameters; no ablation isolating each mechanism's contribution |

---

## Entry 4

| Field | Content |
|---|---|
| **1. Author and year** | Tamiru, M. A., Tordsson, J., Elmroth, E., & Pierre, G. (2020) |
| **2. Study context** | Google Kubernetes Engine (Kubernetes 1.14.7-gke.14, europe-west4-a); IEEE CloudCom 2020, pp. 17–24 (peer-reviewed, verified in official proceedings); University of Rennes/Inria/IRISA + Elastisys AB |
| **3. Research aim** | To experimentally evaluate and compare Kubernetes Cluster Autoscaler configurations (single node pool CA vs. multi-pool CA-NAP) on cost and standard autoscaling performance metrics |
| **4. Methodology** | Controlled cloud experiments, 3 repetitions per configuration, across 2 autoscaler configurations × 3 node sizes; SPEC Cloud Group-endorsed elasticity metrics |
| **5. Sample** | TeaStore benchmark (6 services, HPA enabled on all) with representative workloads on GKE |
| **6. Key findings** | CA-NAP generally outperforms CA; autoscaling performance depends mainly on workload composition |
| **7. Theory or model used** | Elasticity measurement framework: under-/over-provisioning accuracy and timeshare, instability of elasticity, deviation from theoretical optimal autoscaler |
| **8. Limitations** | Node-level scaling only (no pod-level or placement analysis); single provider/region; 3 repetitions is low; 2020-era Kubernetes version dates the numeric results |
| **9. Relevance to my study** | Source of the evaluation metric definitions for your Chapter 5 (used as executed — see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 7 statistical analysis); its workload-dependence finding originally justified Sub-RQ 5 (cross-workload consistency), which was later descoped and not executed (2026-07-29) — see `Research_Questions_Objectives_MultiSignal_Autoscaling.md`'s status note |
| **10. Possible research gap** | No integrated pod-level + placement + adaptive-control evaluation; metrics defined but no standard benchmark protocol for integrated frameworks |

---

## Entry 5

| Field | Content |
|---|---|
| **1. Author and year** | Xie, S., Wang, J., Luo, Y., Yong, Y., Tan, Y., & Li, B. (2025) |
| **2. Study context** | Wuhan University (School of Computer Science) + Zhongguancun Laboratory, China; arXiv:2504.08308 (cs.SE), 4-page tool paper — **preprint, peer-review acceptance unconfirmed**; open-source code on GitHub (WHU-AISE/ScalerEval) |
| **3. Research aim** | To provide an automated, consistent, end-to-end evaluation testbed (ScalerEval) that removes manual, error-prone steps from auto-scaler comparison |
| **4. Methodology** | Tool/testbed paper: one-click workflow covering benchmark initialization, scaler registration, workload injection, metric collection, performance assessment; demonstrated by reproducing 3 auto-scalers (PBScaler, Showar, HPA at 20/50/80% CPU thresholds) |
| **5. Sample** | Online Boutique and Sock Shop benchmarks; 20 minutes of dynamic workload derived from a real Wiki-Pageviews trace; local cluster (1 master + 1 worker, 32 cores/96GB) |
| **6. Key findings** | Main contribution is the testbed itself: automated, consistent, resettable evaluation with reusable interfaces — not a headline performance number |
| **7. Theory or model used** | Evaluation-methodology/benchmarking framework (no scaling theory of its own) |
| **8. Limitations** | Single worker node — placement/co-scheduling effects cannot be studied on it; 20-minute windows are short; preprint status |
| **9. Relevance to my study** | Direct evidence the community recognizes your Methodological gap; candidate harness to adapt for your baseline arms — but must be extended to a multi-node cluster for Module 2 experiments |
| **10. Possible research gap** | No multi-node/placement-aware evaluation support; no standard protocol for evaluating integrated scaling+scheduling+adaptive-control systems |

---

## Entry 6

| Field | Content |
|---|---|
| **1. Author and year** | Pandey, V. (2026) |
| **2. Study context** | Springer LNDECT vol. 277 (3PGCIC 2025 proceedings) — peer-reviewed venue (proceedings-level review); DOI 10.1007/978-3-032-10344-4_3; author affiliation resolved 2026-07-29: Vaibhav Pandey, Department of Information and Communication Engineering, Fukuoka Institute of Technology, Japan (found via SpringerLink's own indexed page metadata) |
| **3. Research aim** | To demonstrate that reinforcement learning (PPO/DDPG) autoscaling improves utilization, tail latency, and cost over HPA/VPA/KEDA at industry scale, with safe exploration |
| **4. Methodology** | Design-and-evaluate: Kubernetes-native architecture (Prometheus + Multidimensional Pod Autoscaler + RL agent) on 9-node Amazon EKS; statistical analysis across 20 runs; safe exploration via HPA bootstrapping during early learning |
| **5. Sample** | Spark TPC-DS benchmark (1TB, 104 queries) and latency-sensitive microservices |
| **6. Key findings** | Up to 30% higher CPU utilization, 15–20% lower p90 latency, ~20% cost savings vs. HPA/VPA/KEDA; improvements reported statistically significant across 20 runs |
| **7. Theory or model used** | Reinforcement learning / MDP framing (PPO, DDPG); reward shaping balancing performance and cost |
| **8. Limitations** | Single-author proceedings chapter; long-horizon drift untested (as far as verifiable); inherits documented RL-in-production brittleness concerns (workload-specific policies, retraining cost — cf. AWARE/FIRM) |
| **9. Relevance to my study** | The pro-RL pole of the adaptive-control debate; best statistical practice among your evaluated sources (a bar your protocol should match); candidate published comparison baseline for Objective 4 |
| **10. Possible research gap** | No placement/co-scheduling integration; no multi-signal SLA-fusion input; adaptive behavior via RL policy, not via transparent parameter self-tuning — explainability trade-off unaddressed |

---

## Entry 7

| Field | Content |
|---|---|
| **1. Author and year** | Wanigasooriya, C., & Ekanayake, I. (2026) |
| **2. Study context** | Informatics Institute of Technology (IIT), Sri Lanka; arXiv:2604.11017v1 [cs.DC], 13 April 2026 — **preprint, not peer-reviewed**; identified as your Gap-3 reference PDF (visually confirm against your copy) |
| **3. Research aim** | To provide proactive Kubernetes autoscaling via a DQN agent augmented with LSTM workload forecasting and a LangGraph-orchestrated LLM validation layer (NimbusGuard) |
| **4. Methodology** | Design-and-evaluate: DQN (dueling architecture) + 2-layer LSTM memory forecaster (8.7% MAPE) + optional LLM decision validation over MCP; sequential comparison vs. HPA and KEDA under an identical seeded, phased load pattern |
| **5. Sample** | One synthetic deterministic FastAPI consumer app on a single-machine KinD cluster (MacBook Pro M4 Pro, 8 vCPU/16GB via Docker Desktop); tiny load (4/8/15/3 concurrent users; 40–90 requests per phase) |
| **6. Key findings** | By its own results: highest average replica count (5.44 vs. HPA 3.05, KEDA 2.93), largest resource integral (2,775 pod-seconds), most scaling events (8 vs. 4) — i.e., most responsive but least stable and most resource-hungry. **Abstract claims "cost efficiency"; results do not support that claim — cite results, not abstract** |
| **7. Theory or model used** | Deep reinforcement learning (Dueling DQN); LSTM time-series forecasting; multi-objective reward function (performance + efficiency + stability penalty); LLM-based cognitive validation (novel) |
| **8. Limitations** | Author-acknowledged: sequential evaluation; fixed ±1 action space (future work: ±2). Additional: single-laptop testbed; one synthetic app; no SLA/latency outcome metrics; no repeated trials or statistics; fixed 30s decision interval; abstract-results mismatch |
| **9. Relevance to my study** | Gap-3 anchor: exhibits static control parameters (fixed interval, fixed ±1 steps, fixed reward weights) in a 2026 proactive framework — its own future work admits the action-space limit; also a concrete case study for your Methodological gap (evaluation weaknesses) |
| **10. Possible research gap** | Adaptive tuning of the controller's own parameters (interval, step size, thresholds); multi-signal fusion (no backlog or latency percentiles in its state vector); placement awareness; rigorous multi-node statistical evaluation |

---

## How to Extend This Matrix

Paste one paper summary (title + abstract, or a link, or your own notes) per message. Each will be added as the next numbered entry, with any field I cannot confirm from the summary or verification marked [UNVERIFIED] and listed as a manual check — never guessed.

**Suggested next candidates from your Literature Review Plan (not yet in the matrix):** the Lorido-Botran et al. taxonomy (theory spine), Daedalus (MAPE-K exemplar), BACC (PI-control + conformal prediction), AWARE or FIRM (RL-in-production brittleness — the counterweight to Entry 6), one co-scheduling paper for Module 2 (e.g., OOSP or the NBR-BAS heuristic-coupling work), and the 2026 ML-autoscaling taxonomy (survey anchor for Section 2.1).
