# Research Gap Analysis
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Third companion document — pairs with your Research Framework and Literature Review Plan files. Each gap below is grounded in current (2022–2026) literature reviewed in this conversation.*

---

## 1. Population Gap

*In systems research, "population" = the class of workloads, applications, and deployment scales the research applies to.*

| Aspect | Explanation |
|---|---|
| **What it means** | The literature is dominated by one workload "population": stateless, HTTP-facing microservices, almost always benchmarked on the same handful of demo apps (TeaStore, Online Boutique, Sock Shop). Stateful and AI/GPU-inference workloads are comparatively rare in this specific line of research. |
| **Why it matters** | These workload types behave very differently under scaling. A new inference pod cannot serve traffic the instant it starts — model loading alone can take several minutes for a mid-sized model — which breaks the core assumption behind CPU- or backlog-based HPA scaling that a new replica absorbs load almost immediately. Findings tuned for stateless microservices may simply not transfer. |
| **How it becomes a research problem** | A multi-signal, co-scheduling, adaptively-controlled framework validated only on stateless demo microservices leaves it unknown whether the same signal-fusion weights, placement logic, and adaptive-control behavior generalize to stateful or GPU/inference workloads, where the relevant signals (GPU memory, KV-cache occupancy, model-load time) differ in kind, not just degree. |
| **Possible research question** | *How does the effectiveness of a multi-signal, co-scheduling, adaptively-controlled autoscaling framework differ between stateless microservice workloads and stateful/GPU-based AI-inference workloads on Kubernetes?* |

**Executed status (added 2026-07-29):** this gap is still real and unaddressed in the literature (nothing about the analysis above has changed) — but this project's own attempt to address it (Sub-RQ 5 / Specific Objective 5, in `Research_Questions_Objectives_MultiSignal_Autoscaling.md`) was descoped to a single workload type during Phase 6 execution, after real host-memory constraints were discovered. The Population gap therefore remains open for future work, not closed by this project — see `Full_Project_Report_MultiSignal_Autoscaling.docx` Chapter 6, Section 6.5 (Future Work).

---

## 2. Context Gap

| Aspect | Explanation |
|---|---|
| **What it means** | The surrounding deployment setting in which autoscaling operates — most current studies evaluate in a single-tenant, single-cluster, single-cloud lab testbed. Multi-tenant clusters, service-mesh-enabled traffic (e.g., Istio), and hybrid cloud-edge topologies are far less studied for this specific combination of mechanisms. |
| **Why it matters** | Context changes both feasibility and behavior. A co-scheduling module that reads "live node resource availability" behaves differently when a noisy-neighbor tenant is also scaling, and a service mesh adds its own latency and observability layer that can distort the very latency-percentile signal your framework depends on. An adaptive controller tuned in a quiet lab may misbehave under real multi-tenant contention. |
| **How it becomes a research problem** | Nearly all existing multi-signal and co-scheduling proposals are evaluated in dedicated, single-tenant settings; it remains unknown whether the same framework holds up under multi-tenancy, service-mesh overhead, or hybrid cloud-edge deployment. |
| **Possible research question** | *How does the performance of a multi-signal, co-scheduling autoscaling framework change when deployed in a multi-tenant Kubernetes cluster with competing workloads, compared to a dedicated single-tenant testbed?* |

---

## 3. Methodological Gap

| Aspect | Explanation |
|---|---|
| **What it means** | Gaps in *how* the field studies autoscaling: no standardized benchmark suite, few ablation studies that isolate one mechanism's contribution from another, and a heavy tilt toward small lab clusters or simulation over production-representative evaluation. |
| **Why it matters** | Without comparable evaluation protocols, it is hard to know whether a reported gain (e.g., an SLA-violation reduction or a cost saving figure) comes from the proposed mechanism itself or from differences in benchmark choice, cluster size, workload trace, or how well the baseline was tuned. This weakens cumulative progress across the field. |
| **How it becomes a research problem** | An integrated three-module framework specifically needs an evaluation design that can isolate each module's individual contribution (ablation) and report results across more than one independently sourced benchmark/trace with statistical confidence — a combination that is rare in the current literature. |
| **Possible research question** | *What evaluation methodology (benchmarks, baselines, ablation design, statistical protocol) can reliably isolate and compare the individual and combined contributions of signal fusion, co-scheduling, and adaptive control to overall SLA compliance?* |

---

## 4. Theoretical Gap

| Aspect | Explanation |
|---|---|
| **What it means** | No unified theoretical model formally connects the theories each module rests on: queueing/backlog theory (Module 1's backlog signal), control theory (Module 3's adaptation), and combinatorial placement theory (Module 2's scheduling) into one coherent framework with provable properties. The classic five-family taxonomy of autoscaling techniques (threshold rules, queueing theory, control theory, reinforcement learning, time-series analysis) keeps these families conceptually separate. |
| **Why it matters** | Without a formal model, it is difficult to reason about *why* a given signal-fusion weighting or adaptive-control rule should be stable, near-optimal, or safe. Most current systems justify their design choices empirically (it worked in this experiment) rather than theoretically — which limits how confidently results generalize beyond the tested scenario. |
| **How it becomes a research problem** | There is no established framework proving stability (bounded oscillation) or near-optimality when three independently motivated theories — queueing-based signal weighting, control-theoretic adaptation, and combinatorial placement — are combined into a single closed control loop. This needs to be constructed and analyzed, not only observed empirically. |
| **Possible research question** | *Can a formal control-theoretic model be developed to guarantee bounded-oscillation stability of an integrated multi-signal, co-scheduling, adaptively-controlled autoscaler under a defined class of workload variation?* |

---

## 5. Time Gap

| Aspect | Explanation |
|---|---|
| **What it means** | Two senses: (a) most experiments in this literature evaluate over short windows — minutes to a few days of benchmark or trace-replay traffic — rather than months of real production traffic, where workload composition, deployment versions, and baseline resource behavior gradually drift; (b) much of the foundational autoscaling and adaptive-control literature predates the 2024–2026 rise of AI-inference workloads as a dominant Kubernetes use case, so it does not natively address model-loading delays or GPU-based signals. |
| **Why it matters** | Practitioner reporting consistently describes tuned autoscaling parameters "drifting" out of validity within weeks, as new deployments shift baseline CPU/latency behavior — a phenomenon almost absent from the academic multi-signal/adaptive-control literature, which mostly reports short-horizon results. |
| **How it becomes a research problem** | It is unknown whether an adaptive-control module (Module 3) that converges and stabilizes within a short lab experiment remains stable and accurate across months of production drift — new deployments, seasonal traffic shifts, and changing workload mixes — without periodic re-validation or retraining. |
| **Possible research question** | *How does the SLA-compliance and stability performance of an adaptively-controlled multi-signal autoscaler evolve over a multi-month production-representative deployment compared to its short-horizon (hours-to-days) benchmark performance?* |

---

## 6. Practical Gap

| Aspect | Explanation |
|---|---|
| **What it means** | The distance between what research papers propose/validate and what operations teams can realistically adopt — including compatibility with the existing HPA/VPA/KEDA/Cluster-Autoscaler ecosystem, operator trust and observability tooling, and the operational burden of running a self-tuning system. |
| **Why it matters** | Even well-performing academic autoscalers rarely become production defaults. Practitioner sources describe manual, reactive threshold retuning as still the operational norm, and flag unresolved autoscaler-interaction issues (e.g., HPA/VPA conflicts, silent drift) as a live pain point — meaning a framework's real-world value depends on more than benchmark numbers. |
| **How it becomes a research problem** | There is limited research on how to package a multi-signal, co-scheduling, adaptive-control framework as an incrementally adoptable, observable, and safely reversible addition to existing Kubernetes autoscaling tooling, rather than a wholesale replacement that operators would be reluctant to trust. |
| **Possible research question** | *What integration strategy allows a multi-signal, co-scheduling, adaptive-control autoscaling framework to be incrementally adopted alongside existing HPA/VPA/KEDA deployments without requiring a full operational replacement?* |

---

## 7. Geographical Gap

*Read here as infrastructure geography — where and under what network conditions autoscaling has actually been tested — since this is the defensible, evidence-backed reading for a systems-engineering topic.*

| Aspect | Explanation |
|---|---|
| **What it means** | Experimental testbeds are concentrated in specific, well-connected hyperscaler regions (e.g., a single GKE region, a single AWS EKS deployment). Studies under edge computing, multi-region, or bandwidth/latency-constrained network conditions are comparatively scarce for this specific combination of mechanisms. |
| **Why it matters** | Edge and multi-region deployments introduce resource imbalance across nodes and higher, more variable network latency and bandwidth constraints — conditions already known to require specialized "traffic-aware" placement logic, because default schedulers allocate pods evenly without accounting for this imbalance. A fusion score or placement rule tuned on one low-latency cloud region may not transfer. |
| **How it becomes a research problem** | It is unclear whether a multi-signal fusion score and placement-aware co-scheduling logic designed and tuned for a single, low-latency cloud region remain valid when nodes are geographically distributed across a cloud-edge continuum with heterogeneous, variable-latency links. |
| **Possible research question** | *How does the accuracy and stability of a multi-signal, co-scheduling autoscaling framework change when deployed across geographically distributed, bandwidth-constrained edge-cloud clusters compared to a single-region cloud cluster?* |

---

## 8. Variable / Concept Gap

| Aspect | Explanation |
|---|---|
| **What it means** | Gaps in how key variables and concepts are defined, measured, or related to one another — inconsistent measurement of "SLA violation" (count vs. duration vs. severity), no agreed way to quantify "signal-fusion quality," and an underexplored causal (not merely correlational) link between placement quality and downstream SLA outcomes. |
| **Why it matters** | Without consistent operational definitions, results are hard to compare across studies — a large reported SLA-violation reduction measured as violation *count* may mean something quite different from the same percentage measured as violation *duration*. And without established causal linkage between placement and SLA outcomes, it is unclear how much of a framework's benefit comes from better placement versus better scaling decisions. |
| **How it becomes a research problem** | Your framework combines three previously separate mechanisms; the relationship between the fused signal score, the placement decision, and the eventual SLA outcome has not been formally specified or empirically isolated in the literature — a mediation- or ablation-style study is needed to establish which variable actually drives the outcome. |
| **Possible research question** | *What is the causal contribution of placement quality (Module 2) versus signal-fusion accuracy (Module 1) to overall SLA-violation outcomes, when the adaptive control mechanism (Module 3) is held constant?* |

---

## Quick Reference: Prioritizing These Gaps for a Single Thesis

| Gap | Feasibility for a Typical Thesis | Notes |
|---|---|---|
| Methodological | High | You control this fully — design a rigorous ablation + multi-benchmark protocol as part of your own contribution |
| Theoretical | High | Can be done analytically/on paper alongside your system design; no extra infrastructure needed |
| Variable/Concept | High | Achievable through careful experiment design (mediation/ablation) on your own testbed |
| Population (stateful/AI workloads) | Medium | Feasible if you add one stateful or inference benchmark alongside a stateless one; you don't need to cover every workload type |
| Context (multi-tenancy) | Medium | Feasible on a modest multi-tenant lab cluster; harder to get realistic "noisy neighbor" traffic |
| Practical (incremental adoption) | Medium | Achievable as a design/discussion contribution; a full production trial is likely out of scope |
| Geographical (edge/multi-region) | Low–Medium | Requires geographically distributed infrastructure or network emulation (e.g., artificial latency injection) — doable but adds setup cost |
| Time (multi-month production study) | Low | Requires sustained production access over months — usually beyond a single thesis timeline; best framed as future work |

---

*Suggested framing for your proposal: position the Methodological, Theoretical, and Variable/Concept gaps as the core of your contribution (fully addressable within a thesis), and the Population and Context gaps as your evaluation's scope-extension (partially addressable with one added benchmark or testbed variation). Frame the Time and Geographical gaps explicitly as acknowledged limitations/future work — reviewers respond well to seeing you know the full gap landscape even where you don't tackle all of it.*
