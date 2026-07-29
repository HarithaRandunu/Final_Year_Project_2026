# Research Questions and Objectives
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Fourth companion document. Built directly from your Research Framework, Literature Review Plan, and Research Gap Analysis files — specifically the three original gaps (signal fusion, co-scheduling, adaptive control) and the "High/Medium feasibility" gaps flagged in the Gap Analysis (Methodological, Theoretical, Variable/Concept, Population).*

**Executed status (added 2026-07-29):** Sub-RQ 1–4 and Specific Objectives 1–4 were carried through to execution as planned (see `Progress_Trace_MultiSignal_Autoscaling.md`, Phases 2–7). **Sub-RQ 5 and Specific Objective 5 were not answered** — the live ablation (Phase 6) was descoped from the three workload types planned here to one (an Alibaba microservice-trace replay), after real host-memory constraints were discovered mid-study, and the cross-workload consistency check this doc's Step 5 anticipated "if your timeline is tight" ended up going further than a two-workload reduction — it was dropped entirely, not reduced. This is recorded as an explicit, dated scope correction, not a silent gap; see `Full_Project_Report_MultiSignal_Autoscaling.docx` Chapter 4 (Finding 5) and Chapter 6 (Section 6.2) for the full reasoning and consequences.

---

## 1. Main Research Question

**To what extent does an integrated autoscaling framework — combining multi-signal fusion, placement-aware co-scheduling, and adaptive parameter control — improve SLA compliance and cost efficiency for Kubernetes-hosted workloads, compared to existing autoscalers such as the Horizontal Pod Autoscaler (HPA) and KEDA?**

---

## 2. Sub-Research Questions

1. How can backlog, CPU utilization, and latency-percentile metrics be combined into a single SLA-aware scaling-decision score, and how does this fused score compare to single-metric CPU-based scaling in detecting SLA risk early?
2. How does coupling pod placement to the cause of a scaling decision (co-scheduling) affect resource utilization, cold-start delay, and load balance, compared to the default Kubernetes scheduler acting independently of the autoscaler?
3. How does an adaptive control mechanism that automatically adjusts scaling thresholds, step size, and monitoring interval affect control stability and SLA compliance, compared to fixed-parameter autoscaling?
4. What is the separate and combined contribution of signal fusion, co-scheduling, and adaptive control to overall SLA compliance, as measured through an ablation study that tests each module alone and all three together?
5. How consistent are the framework's SLA compliance and cost performance across different workload patterns, such as steady-state traffic, bursty traffic, and at least one stateful or inference-style workload? **[Not answered as executed — see status note above.]**

---

## 3. Main Research Objective

**To design, implement, and evaluate an integrated Kubernetes autoscaling framework that combines multi-signal fusion, placement-aware co-scheduling, and adaptive parameter control, and to measure its effect on SLA compliance and cost efficiency compared to existing autoscalers.**

---

## 4. Specific Objectives

1. To design and implement a signal-fusion model that combines backlog, CPU utilization, and latency-percentile metrics into a single SLA-aware scaling-decision score.
2. To design and implement a co-scheduling mechanism that places newly scaled pods based on the specific signal that triggered the scaling decision.
3. To design and implement an adaptive control mechanism that automatically adjusts scaling thresholds, step size, and monitoring interval based on observed scaling performance.
4. To conduct an ablation study that measures the separate and combined contribution of the three modules to SLA compliance, using consistent benchmarks and baseline comparisons against HPA and KEDA.
5. To test the framework under at least three workload patterns (steady-state, bursty, and one stateful or inference-style workload) and compare SLA compliance and cost performance across them. **[Not executed — descoped to one workload type, see status note above.]**

---

## 5. Justification

| Item | Justification |
|---|---|
| **Main RQ** | Targets the synthesis gap from your Gap Analysis: no existing framework integrates signal fusion, co-scheduling, and adaptive control into one evaluated system. It names measurable outcomes (SLA compliance, cost) and concrete baselines (HPA, KEDA), so it can be tested, not just discussed. |
| **Sub-RQ 1** | Addresses the "no unified multi-signal model" gap (your original Gap 1). CPU-only autoscaling is documented to react late, because CPU utilization often rises only after service degradation has already begun. |
| **Sub-RQ 2** | Addresses the "autoscaling-scheduling disconnect" gap (your original Gap 2). Correct scaling counts can still waste resources or trigger cold starts if pod placement ignores why the pod was created. |
| **Sub-RQ 3** | Addresses the "static thresholds" gap (your original Gap 3) and the Theoretical gap around control stability. Fixed thresholds, step sizes, and monitoring intervals are documented to cause over/under-scaling and oscillation under variable workloads. |
| **Sub-RQ 4** | Addresses the Methodological gap from your Gap Analysis. Without an ablation design, it is not possible to know which module actually drives an observed improvement in SLA compliance. |
| **Sub-RQ 5** | Addresses the Population gap from your Gap Analysis. Most published frameworks are validated only on stateless microservices; testing across workload types checks whether the framework's benefits generalize. |
| **Main Objective** | Mirrors the main RQ. This is the design-build-evaluate objective a systems thesis needs — it turns the question into concrete deliverables: a working system and comparative results. |
| **Specific Objective 1** | Produces the system needed to answer Sub-RQ 1: a functioning signal-fusion model to test against CPU-only scaling. |
| **Specific Objective 2** | Produces the system needed to answer Sub-RQ 2: a functioning co-scheduling mechanism to test against the default scheduler. |
| **Specific Objective 3** | Produces the system needed to answer Sub-RQ 3: a functioning adaptive control mechanism to test against fixed parameters. |
| **Specific Objective 4** | Produces the data needed to answer Sub-RQ 4: ablation results isolating each module's individual and combined effect. |
| **Specific Objective 5** | Produces the data needed to answer Sub-RQ 5: comparative results across workload types to check consistency of the findings. |

---

## 6. Alignment Check

**Step 1 — One-to-one match between sub-questions and specific objectives**

| # | Sub-Research Question (short label) | Specific Objective (short label) | Match Confirmed |
|---|---|---|---|
| 1 | Does signal fusion detect SLA risk better than CPU alone? | Build and test the signal-fusion model | Yes — Objective 1 generates exactly the comparison Sub-RQ 1 asks for |
| 2 | Does co-scheduling reduce waste and cold starts? | Build and test the co-scheduling mechanism | Yes — Objective 2 generates exactly the comparison Sub-RQ 2 asks for |
| 3 | Does adaptive control improve stability and SLA compliance? | Build and test the adaptive control mechanism | Yes — Objective 3 generates exactly the comparison Sub-RQ 3 asks for |
| 4 | What does each module contribute, alone and combined? | Run the ablation study | Yes — Objective 4 is the ablation study itself |
| 5 | Does performance hold across workload types? | Test across three workload patterns | Yes — Objective 5 is the cross-workload test itself |

**Step 2 — Main question and main objective**

The main objective uses three verbs — *design, implement, evaluate* — and the main question asks for a comparison against HPA and KEDA on two named outcomes (SLA compliance, cost efficiency). The objective covers exactly what the question asks: build the framework, then measure the same two outcomes against the same baselines. Matched.

**Step 3 — Do the sub-questions, together, answer the main question?**

- Sub-RQs 1–3 establish that each module works individually.
- Sub-RQ 4 establishes how the three modules work *together* (this is what makes the answer to the main question more than "three separate improvements").
- Sub-RQ 5 establishes how far the result can be trusted to generalize beyond one workload type.

Together, these five sub-questions supply everything the main question needs: individual mechanism performance, combined performance, and generalizability. Nothing is missing, and nothing is duplicated.

**Step 4 — Terminology consistency**

The terms *SLA compliance*, *cost efficiency*, and *control stability* are used with the same meaning everywhere they appear above — none is swapped for a near-synonym (e.g., "SLA adherence," "cost savings," "control robustness") that would make the questions and objectives harder to line up later in your results chapter.

**Step 5 — Scope flag**

Sub-RQ 5 / Objective 5 corresponds to the gap your Gap Analysis rated "Medium feasibility" (Population gap). If your timeline is tight, this can be reduced to two workload patterns instead of three without breaking the alignment above — just update both the sub-question and the objective together so they still match.

**What actually happened (added 2026-07-29):** it went further than this paragraph anticipated — not a reduction to two workload types, but a full descope to one, with Sub-RQ 5 and Objective 5 dropped rather than rescoped. Per this section's own advice, both were removed as a pair (see `Full_Project_Report_MultiSignal_Autoscaling.docx` Chapter 4/6, and `Phase_Plan_MultiSignal_Autoscaling.md`'s Phase 7 task list, which shows the cross-workload consistency check formally struck through and dropped rather than left dangling).

---

*Everything here is designed to be copied directly into a thesis proposal's "Research Questions and Objectives" section. If your supervisor asks you to cut scope, remove a sub-question and its matching objective as a pair — never one without the other, or the alignment check above stops holding.*
