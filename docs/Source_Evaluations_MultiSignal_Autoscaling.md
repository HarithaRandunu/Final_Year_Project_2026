# Source Evaluations
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Sixth companion document. You didn't paste a specific source, so — per your note — I pulled the sources most tied to your own gap document and to our research so far, and verified each one directly (fetched full text where I could access it) rather than relying only on earlier search snippets. Where I could not verify something, it's flagged explicitly rather than guessed.*

---

## Quick Summary

| Source | Full text verified? | Relationship to your framework |
|---|---|---|
| Vu, Tran & Kim (2022) — *Predictive Hybrid Autoscaling for Containerized Applications* | Yes, full text fetched | Your Gap-2 anchor. Confirms the gap; does not close it. |
| *Business-Aware SLA-Driven Autoscaling for Kubernetes Microservices...* (2026) | No — blocked (HTTP 429), abstract/conclusion only. **Author name resolved 2026-07-29 via Crossref/Semantic Scholar (see Source 2 and Final Verification Status below), though full-text access itself is still blocked.** | Your Gap-1 anchor. Confirms the gap; author now confirmed, remaining methodology detail still needs manual checking. |
| Punniyamoorthy et al. (2025) — *An SLO Driven and Cost-Aware Autoscaling Framework for Kubernetes* | Yes, full text fetched | Not one of your original three sources — but this is the closest existing "competitor" to your whole framework. Read this one closely. |
| "kubernatees framework proactive 2026 IIT.pdf" (your Gap-3 anchor) | **RESOLVED — identified as NimbusGuard (arXiv:2604.11017), full text fetched and verified.** See Source 7. | Your Gap-3 anchor. Strongly confirms the gap — see the note in Source 7 about a critical abstract-vs-results discrepancy. |

---

## Source 1: Predictive Hybrid Autoscaling for Containerized Applications

**Vu, D.-D., Tran, M.-N., & Kim, Y. (2022). IEEE Access, 10, 109768–109778. DOI: 10.1109/ACCESS.2022.3214985.**
*This is the paper your original document cites for Gap-2.*

**1. Relevance to your topic:** High, but narrow. It's relevant as the origin of your Gap-2 argument (autoscaling–scheduling disconnect), not as a technical building block for Module 1's specific signal set — it forecasts CPU/response-time-linked demand, not backlog specifically.

**2. Academic credibility:** IEEE Access is a large, peer-reviewed, broad-scope, gold open-access IEEE journal. Authors are affiliated with Soongsil University, South Korea (two graduate researchers, one full professor), with funding from South Korean government IITP grants. DOI resolves. I could not retrieve an independent citation count in this session — check Google Scholar or Scopus directly for how many times it has been cited since 2022, which will tell you how established it has become.

**3. Methodology quality:** Real (if small) Kubernetes v1.23 cluster: 1 master + 2 worker nodes on 3 bare-metal servers (128-core CPU, 64GB RAM each). One benchmark application only (a CPU-bound web app serving a house-price regression model). Two public workload traces (Wikipedia access log, FIFA World Cup 98), replayed via Locust. Baselines: default reactive HPA, a re-implemented proactive HPA, and a re-implemented burst-aware HPA from prior published work. Six forecasting models and six regression models compared with documented 80/20 train/test splits — solid ML practice. **Weakness:** results are reported as single summary percentages per trace, with no repeated trials, confidence intervals, or significance testing. **Weakness:** the paper explicitly states it does not address pod placement — it uses the default Kubernetes scheduler.

**4. Key findings:** SLO (response-time) violations cut from ~20–22% (reactive HPA, burst periods) to ~2.96%/3.89% (Wikipedia/FIFA) with their hybrid method. Lower normalized resource cost than both a proactive-HPA and a burst-aware-HPA baseline. Higher average pod utilization in non-burst periods (69.65%/74.17%) than either baseline.

**5. Limitations (author-declared, confirmed from full text):**
- Single benchmark application type; explicitly excludes bandwidth-intensive apps.
- Explicitly excludes pod placement/scheduling — stated as their own future work.
- Burst-detection uses fixed threshold and influence values (threshold = 5, influence = 0.5) and a fixed 60-second monitoring interval; "defining the mechanism for choosing the suitable length of monitoring interval" is listed as future work.
- Depends on an in-place pod resource resize Kubernetes feature that had not shipped at the time of writing.
- Small-scale testbed; no statistical-significance reporting.

**6. How to use in your literature review:** Cite as your Gap-2 anchor. The authors' own "future work" section is direct textual evidence that pod-placement coordination was out of scope — exactly your Module 2 argument. It also works as a Module 3 citation: their burst-detector's fixed threshold/influence parameters are themselves an example of the static-parameter limitation your Gap-3/Module 3 addresses, even in a paper explicitly about "adaptive" hybrid scaling.

**7. Supports or challenges your argument:** Supports. It is gap-confirming, not gap-closing.

**8. Literature matrix note (copy-paste ready):**
> Vu, Tran & Kim (2022), IEEE Access. Hybrid horizontal+vertical Kubernetes autoscaler using Bi-LSTM forecasting + burst detection; cuts SLO violations from ~21% to ~3–4% vs. reactive HPA on Wikipedia/FIFA traces. Explicitly excludes pod placement (default scheduler used) and uses fixed burst-detection thresholds/monitoring interval — directly supports both the co-scheduling gap and the adaptive-control gap. Single small testbed, single benchmark app, no repeated-trial statistics.

---

## Source 2: Business-Aware SLA-Driven Autoscaling for Kubernetes Microservices Using Application-Level Observability

**(2026). IEEE Access, "accepted for publication." DOI: 10.1109/ACCESS.2026.3689039.**
*This is the paper your original document cites for Gap-1.*

**1. Relevance to your topic:** Very high — your own Gap-1 anchor, directly supporting Module 1's motivation.

**2. Academic credibility:** Stated venue is IEEE Access, listed as "accepted for publication" as of the search results available to me. **Author resolved 2026-07-29: Pallavi Priya Patharlagadda** (single author) — IEEE Xplore's own page still returns no content to automated retrieval and ResearchGate still blocks scraping, but Crossref's and Semantic Scholar's bibliographic APIs both independently confirm this name against the DOI (see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 7 section for the verification method). **Still needs manual checking:** affiliation (neither API carries this field), whether it has since moved from "accepted" to a final published issue/volume, and its current citation count.

**3. Methodology quality:** From the abstract/conclusion text available to me, it uses **queue depth as a single application-level signal** with a "deterministic replica-mapping strategy" — i.e., fixed thresholds tied to SLA targets, not a learned or adaptive model. **I do not have access to the full experimental setup** (cluster size, benchmark application, workload trace, number of trial runs, statistical treatment), and I'm not going to guess at these — you'll need to read the full paper for this section.

**4. Key findings (from the abstract):** Up to 86% reduction in SLA-violation rate compared with CPU-based autoscaling, plus faster scaling response and reduced replica oscillation. **I cannot independently verify the conditions under which "86%" was measured** — check the full text before citing that figure directly.

**5. Limitations:** The one I can confirm from the abstract itself: it uses a single signal (queue depth), not a fused multi-signal score, so it does not test whether combining backlog with other signals would perform even better — that is precisely the space your framework occupies. **The full limitations section is not available to me** — check manually.

**6. How to use in your literature review:** Strong opening citation for Module 1 — it's direct evidence that even one well-chosen application-level signal beats CPU-only scaling, which sets up (rather than closes) the argument that fusing several signals should do better still. Also useful for your Debates section: this paper explicitly favors simplicity and transparency over predictive/ML complexity, a real counter-position worth acknowledging.

**7. Supports or challenges your argument:** Mostly supports, but mildly challenges on complexity — it argues one simple, explainable signal is enough, so your thesis needs to justify why the added complexity of three integrated modules is worth it.

**8. Literature matrix note (copy-paste ready):**
> **[NEEDS VERIFICATION — full text not accessed]** Business-Aware SLA-Driven Autoscaling for Kubernetes Microservices... (IEEE Access, DOI 10.1109/ACCESS.2026.3689039, "accepted for publication"). Uses queue depth (single signal) with a deterministic, non-adaptive replica-mapping rule; reports up to 86% SLA-violation reduction vs. CPU-based HPA per the abstract. Author names, full methodology, and full limitations not yet verified — read via IEEE Xplore before citing figures directly.

---

## Source 3: An SLO Driven and Cost-Aware Autoscaling Framework for Kubernetes

**Punniyamoorthy, V., Kumar, B., Saha, S., Butra, L., Palanigounder, M., Agarwal, A. K., & Kannan, K. (2025). arXiv:2512.23415 [cs.SE, cs.DC].**
*Not one of your original three sources, but this is the closest existing work to your entire framework — worth adding to your matrix.*

**1. Relevance to your topic:** Very high, and different in kind from the other two — this paper already attempts multi-signal fusion **and** some pod/node coordination in one system. It's the paper your thesis most needs to explicitly differentiate itself from.

**2. Academic credibility:** Status: arXiv preprint, submitted 29 Dec 2025, CC BY 4.0 license. **arXiv preprints are not peer-reviewed by arXiv itself.** Authors' listed affiliations are industry employers (East West Bank, NTT Data, Albertsons, USA), not universities; two authors list "IEEE Senior Member" status. This is industry-practitioner research, not university-lab research — a relevant, neutral fact for judging independence and likely review rigor. An earlier search in this conversation also surfaced what appears to be a related listing under *International Journal of Computer Science Trends and Technology (IJCST), Volume 13, Issue 6* — **you should verify manually whether this is the same paper**, and independently check IJCST's peer-review process and indexing status (e.g., Scopus, Web of Science) before treating it as a peer-reviewed source, since I have no independent basis to vouch for that journal.

**3. Methodology quality:** Real Kubernetes cluster with native autoscaling enabled, framework deployed as an external control layer — but cluster size, node count, and resource specs are not stated. Three workload patterns tested: bursty, queue-driven, and mixed (latency-sensitive + batch) — no specific benchmark application is named. Baselines: default HPA, manually tuned HPA, and combined HPA+VPA (VPA in recommendation-only mode) — a fair, relevant set. Four metric categories: SLO adherence, responsiveness, cost, stability — well-chosen, closely matching what your own Methodology document proposed. **Weakness:** results are single point estimates in two summary tables, with no repeated-trial statistics, confidence intervals, or significance testing — the same methodological gap as Source 1. **Weakness:** no benchmark application named and no cluster specification given, which limits replicability.

**4. Key findings:** Vs. default/tuned HPA baselines — up to 31% reduction in cumulative SLO-violation duration, ~24% faster scaling response time, 18% lower resource cost (vs. default HPA; 10% for tuned HPA), with stability "comparable to or better than" tuned HPA.

**5. Limitations (author-declared, Section VIII, confirmed from full text):** Evaluated only under controlled workload patterns and cluster configurations — no larger-scale or longer-running deployment tested. Assumes timely, accurate observability signals — does not test noisy, delayed, or partially unavailable metrics. Explicitly lists multi-cluster/multi-region operation, robustness to degraded or adversarial telemetry, and richer cost/energy modeling as future work.

**6. How to use in your literature review:** Use as your primary "closest related work" citation, structured as an explicit comparison: it fuses signals (like your Module 1) and does light pod/node coordination (a much lighter version of your Module 2 — it only emits a binary "capacity hint" for node scaling, not a placement-scoring function), but its stabilization windows, rate limits, and cooldown periods are fixed, not self-tuning — meaning your Module 3 (adaptive control) is the part of your framework this paper doesn't touch at all. This is the most precise way to state your novelty.

**7. Supports or challenges your argument:** Both — say so explicitly rather than picking one side. It partially **challenges** the novelty of Module 1 (multi-signal fusion has already been done, very recently, in a similar way). It **supports** the novelty of Modules 2 and 3 — its own architecture and its own stated limitations confirm that true placement-aware co-scheduling and adaptive self-tuning control remain open, even in this closest neighbor.

**8. Literature matrix note (copy-paste ready):**
> Punniyamoorthy et al. (2025), arXiv:2512.23415 (industry-authored preprint, not confirmed peer-reviewed). Closest existing related work: fuses latency, backlog, CPU, and scheduling-pressure signals with SLO-first, cost-aware, explainable control; reports 31% less SLO-violation duration, 24% faster scaling, 18% lower cost vs. default HPA. Uses fixed stabilization windows/rate limits (not adaptive) and only a binary node-capacity hint (not placement scoring) — leaves your Module 2 (true co-scheduling) and Module 3 (adaptive control) open. No named benchmark app, no repeated-trial statistics — verify replicability details before relying on the numbers.

---

## Missing Source: Your Gap-3 Reference — SUPERSEDED, see Source 7

~~Your original document cites **"kubernatees framework proactive 2026 IIT.pdf"** for Gap-3 (static thresholds/adaptive control). I was not able to locate or verify this specific paper through search in this conversation — I have only the filename, with no confirmed author, venue, abstract, or findings, and I'm not willing to guess at those to fill in the evaluation format above.~~

**Resolved 2026-07-29 (fully closed, not just identified):** this reference is NimbusGuard (Wanigasooriya & Ekanayake, 2026, arXiv:2604.11017) — see **Source 7** below for the full eight-point evaluation. The user has since confirmed this by placing a copy of the paper at `docs/2604.11017v1.pdf`; its extracted text and metadata (`/Title`, `/Author`, `/arXivID`) are byte-for-byte identical to the live arXiv version verified the same day (`Progress_Trace_MultiSignal_Autoscaling.md`, Phase 7). No longer an open item.

---

*This format is reusable — paste any future source's title, abstract, link, or summary, and I'll run the same eight-point check against your framework.*

---

# Extension: Three More Evaluated Sources
*Added after further verification searches. These three matter because your Methodology document depends on them (evaluation metrics, testbed design, and the RL-based comparison baseline).*

---

## Source 4: An Experimental Evaluation of the Kubernetes Cluster Autoscaler in the Cloud

**Tamiru, M. A., Tordsson, J., Elmroth, E., & Pierre, G. (2020). CloudCom 2020 — 12th IEEE International Conference on Cloud Computing Technology and Science, Bangkok, Thailand, pp. 17–24. DOI: 10.1109/CloudCom49646.2020.00002.**

**1. Relevance to your topic:** Medium as subject matter (it evaluates the *Cluster* Autoscaler — node-level scaling — not pod-level HPA logic), but **high as methodology**. This is the paper your Chapter 5 metrics come from.

**2. Academic credibility:** Verified peer-reviewed IEEE conference paper — confirmed in the official CloudCom 2020 proceedings table of contents with page numbers and a resolving DOI. Authors verified: affiliations span University of Rennes/Inria/IRISA (France) and Elastisys AB/Umeå-linked researchers (Sweden); Tordsson and Elmroth are established names in cloud autoscaling research. The paper is repeatedly cited in later Springer/ACM venue papers I found in this session, which is independent evidence it became a reference point. Exact citation count: check Google Scholar manually.

**3. Methodology quality:** Real Google Kubernetes Engine deployment (Kubernetes 1.14.7-gke.14, europe-west4-a), TeaStore benchmark with HPA enabled on all six services, experiments repeated 3 times per configuration across two autoscaler configurations (CA vs. CA-NAP) and three node sizes. Uses the SPEC Cloud Group-endorsed elasticity metric set: under-/over-provisioning accuracy and timeshare, instability of elasticity, and deviation from a theoretical optimal autoscaler. Repetition count (3) is low by statistical standards but explicit and honest.

**4. Key findings:** CA-NAP (multiple node pools) generally outperforms single-pool CA, and autoscaling performance depends mainly on workload composition — a directly useful finding for your Sub-RQ 5 (cross-workload consistency).

**5. Limitations:** Node-level scaling only (no pod-level or placement analysis); single cloud provider and region; 2020-era Kubernetes version, so specific numeric results are dated even though the metric definitions are not.

**6. How to use in your literature review:** Cite it twice: once in your evaluation-methodology section (2.9 in your Literature Review Plan) as the source of your elasticity metrics, and once in your methodology chapter (Chapter 5 design) when you define under-/over-provisioning time, instability, and deviation. Its "performance depends on workload composition" finding also justifies why Sub-RQ 5 exists.

**7. Supports or challenges your argument:** Supports, indirectly — it doesn't address your gaps, but it supplies the measurement vocabulary that makes your claims testable, and its workload-dependence finding motivates your cross-workload evaluation.

**8. Literature matrix note (copy-paste ready):**
> Tamiru et al. (2020), IEEE CloudCom, pp. 17–24. Evaluates Kubernetes Cluster Autoscaler (CA vs. CA-NAP) on GKE with TeaStore; source of the SPEC-endorsed elasticity metrics (under/over-provisioning timeshare, instability, deviation from optimal). Finds performance depends mainly on workload composition. Node-level scope only; 3 repetitions per configuration; dated Kubernetes version. Use for evaluation-metric definitions and to justify cross-workload testing.

---

## Source 5: ScalerEval — Automated and Consistent Evaluation Testbed for Auto-scalers in Microservices

**arXiv:2504.08308 (2025).**

**1. Relevance to your topic:** High for your methodology chapter — it is a purpose-built, reusable testbed for exactly the kind of autoscaler comparison your ablation design requires.

**2. Academic credibility (UPDATED — now verified):** Authors confirmed: Shuaiyu Xie, Jian Wang, Yang Luo, Yunqing Yong, Yuzhen Tan, and Bing Li — School of Computer Science, Wuhan University, China, with two authors also affiliated with Zhongguancun Laboratory; Jian Wang and Bing Li are the corresponding authors. Submitted to arXiv 11 April 2025 (cs.SE), 4 pages, with source code publicly released on GitHub (WHU-AISE/ScalerEval) including a video demonstration — the open-source release and short format suggest a tool/demo paper. It remains an arXiv preprint: **no formal peer-reviewed venue acceptance was confirmed in my searches**, so the only item left to check manually is whether it has since been accepted at a conference (check the arXiv page for an updated journal reference) and its citation count.

**3. Methodology quality (from the text available to me):** Local Kubernetes cluster (1 master + 1 worker, 32 cores/96GB total) pre-equipped with Istio, Node Exporter, and Kube-State-Metrics. Reproduces and compares three horizontal autoscalers (PBScaler, Showar, and Kubernetes HPA at three CPU thresholds: 20%/50%/80%) on two benchmarks (Online Boutique, Sock Shop) with 20 minutes of dynamic workload derived from a real Wiki-Pageviews trace. The multi-threshold HPA baseline design is a good practice worth copying — it prevents the "weak baseline" criticism.

**4. Key findings:** The primary contribution is the testbed itself (automation and consistency of evaluation), rather than a single headline performance number.

**5. Limitations:** Very small cluster (one worker node) — placement/co-scheduling effects, which need multiple nodes, cannot be meaningfully studied on it; 20-minute workload windows are short; preprint status.

**6. How to use in your literature review:** Cite in your evaluation-methodology section as evidence that the community recognizes the inconsistent-evaluation problem (your Methodological gap) and is building tooling for it. Practically: consider reusing or adapting ScalerEval's harness for your baseline arms, but note you'll need a larger multi-node cluster than theirs because your Module 2 (co-scheduling) is meaningless on a single worker node — that observation itself is worth a sentence in your methodology justification.

**7. Supports or challenges your argument:** Supports your Methodological gap directly — its existence is evidence the evaluation-standardization problem is real and unsolved.

**8. Literature matrix note (copy-paste ready):**
> ScalerEval (2025), arXiv:2504.08308 (preprint — verify peer-review status). Automated testbed for consistent autoscaler evaluation; compares PBScaler, Showar, and 3-threshold HPA on Online Boutique + Sock Shop with Wiki-Pageviews-derived load. Evidence for the methodological gap; candidate harness to adapt. Single-worker cluster makes it unusable as-is for co-scheduling experiments — needs multi-node extension.

---

## Source 6: Reinforcement Learning-Based Autoscaling for Cost and Performance Optimization in Kubernetes Clusters

**Pandey, V. (2026). In: Advances on P2P, Parallel, Grid, Cloud and Internet Computing (3PGCIC 2025), Lecture Notes on Data Engineering and Communications Technologies, vol. 277. Springer. DOI: 10.1007/978-3-032-10344-4_3.**

**1. Relevance to your topic:** High for Module 3 — it is a current, concrete example of the RL end of the adaptive-control design space, and a candidate "published RL autoscaler" comparison baseline named in your Specific Objective 4's spirit.

**2. Academic credibility:** Springer conference proceedings chapter (3PGCIC 2025) with a resolving DOI — peer-reviewed venue, though proceedings-chapter review is typically lighter than a top-tier journal or OSDI/NSDI-class conference. Single author. **Check manually:** author affiliation and whether an extended journal version exists.

**3. Methodology quality (from the abstract/snippets available to me):** Kubernetes-native architecture integrating Prometheus, a Multidimensional Pod Autoscaler, and an RL agent (PPO and DDPG) on a 9-node Amazon EKS cluster; evaluated on Spark TPC-DS (1TB, 104 queries) and latency-sensitive microservices; statistical analysis across 20 runs — notably better statistical practice than Sources 1–3. Discusses safe exploration via bootstrapping with HPA during early learning. **I have not read the full chapter** — the reward-function design and hyperparameter details need manual checking.

**4. Key findings:** Up to 30% higher CPU utilization, 15–20% lower p90 latency, and ~20% cost savings vs. HPA, VPA, and KEDA, with improvements reported as statistically significant across 20 runs.

**5. Limitations:** Single-author proceedings chapter; RL approach inherits the production-brittleness concerns documented elsewhere (AWARE/FIRM: workload-specific policies, retraining cost) — this paper discusses safe exploration but, as far as I can verify, does not test long-horizon drift.

**6. How to use in your literature review:** Cite in your adaptive-control section (2.6) as the strong-results end of the RL position, then immediately pair it with the AWARE/FIRM production-brittleness findings — that pairing *is* the "rule-based vs. learning-based" contradiction from your Literature Review Plan, presented with evidence on both sides. Also useful as a comparison point justifying your (likely lighter-weight) Module 3 design choice: you can argue for feedback-control-style adaptation precisely because this paper's RL gains come with training-cost and generalization caveats.

**7. Supports or challenges your argument:** Both. Supports the claim that adaptive control beats static parameters (your Gap 3). Mildly challenges your framework's necessity from the other direction: if RL alone gets ~20% cost savings, you must show your integrated three-module approach adds value beyond a single strong adaptive mechanism — your ablation study (Sub-RQ 4) is exactly the instrument that answers this.

**8. Literature matrix note (copy-paste ready):**
> Pandey (2026), Springer LNDECT 277 (3PGCIC 2025). PPO/DDPG RL autoscaler on 9-node EKS; +30% CPU utilization, −15–20% p90 latency, ~20% cost vs. HPA/VPA/KEDA, significant across 20 runs. Best statistical practice among evaluated sources. Discusses HPA-bootstrapped safe exploration; long-horizon drift untested. Use as the pro-RL pole of the adaptive-control debate and as a candidate comparison baseline; pair with AWARE/FIRM brittleness findings.

---

---

## Source 7 (RESOLVED): NimbusGuard — A Novel Framework for Proactive Kubernetes Autoscaling Using Deep Q-Networks

**Wanigasooriya, C., & Ekanayake, I. (2026). arXiv:2604.11017v1 [cs.DC], submitted 13 April 2026, CC BY 4.0. Department of Computer Science, Informatics Institute of Technology, Sri Lanka.**

*Identification: your original document's Gap-3 reference was the filename "kubernatees framework proactive 2026 IIT.pdf". This paper matches every token — a proactive Kubernetes autoscaling framework, dated 2026, authored at IIT (Informatics Institute of Technology). I fetched and read the full text. **Confirmed 2026-07-29 — no longer just a token match**: the user placed a copy at `docs/2604.11017v1.pdf`; its extracted metadata and full text are byte-for-byte identical to the live arXiv version (see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 7 section).*

**1. Relevance to your topic:** High for Gap-3/Module 3. It is a live, very recent example of exactly the static-parameter pattern your Gap-3 describes: a fixed 30-second decision interval, a fixed action space of exactly three actions (scale down −1, keep, scale up +1), and fixed reward weights/bonuses (+0.2 scale-up, +0.15 scale-down, −0.3 unnecessary scaling, −0.5 thrashing). Its own future-work section proposes "expanding the action space (e.g., +2/−2 replicas)" — direct textual confirmation, from the paper itself, of the limited-action-space gap you cite it for.

**2. Academic credibility:** arXiv preprint — **not peer-reviewed**. Two authors from IIT Sri Lanka (a student email and a faculty co-author, based on the address format). Verified: full author names, affiliation, submission date, license, and complete reference list. Given the authors are at IIT and your team appears to be as well, note that citing very-local prior work is fine, but your examiners will know the context — evaluate it on its content, exactly as below.

**3. Methodology quality:** This is where you need to be careful. Testbed: a single MacBook Pro (Apple M4 Pro, 24GB RAM) running a KinD (Kubernetes-in-Docker) cluster via Docker Desktop with 8 vCPU/16GB allocated — not a real multi-node cluster. Target application: one synthetic, deterministic FastAPI consumer app (each request triggers fixed CPU/memory usage) — not a recognized benchmark. Load: very small (phases of 4/8/15/3 concurrent users; 40–90 requests per phase), generated with a seeded custom asyncio script. Evaluation: sequential (each autoscaler tested one after another, acknowledged by the authors as a limitation), primary metric is replica count over time, no repeated trials, no statistical testing, no latency/SLO-violation measurements reported. Architecture is genuinely novel (DQN + LSTM forecaster + LangGraph-orchestrated LLM validation layer over MCP), but the evaluation is a small single-machine demonstration, not a rigorous comparison.

**4. Key findings — read carefully, there is a discrepancy:** The abstract claims "superior performance and cost efficiency compared to existing reactive methods." The results section shows something more nuanced and partly opposite: NimbusGuard ran the **highest** average replica count (5.44 vs. HPA 3.05 and KEDA 2.93), consumed the **largest** resource integral (2,775 pod-seconds), and was described by the authors themselves as "the most agile and least stable system" (8 scaling events vs. 4 for each baseline). In other words, by the paper's own numbers it prioritizes responsiveness *at higher cost and lower stability* — the authors frame this honestly in the results as a trade-off, but the abstract's "cost efficiency" claim is not supported by the reported data. **Do not cite the abstract's claim; cite the results.**

**5. Limitations (confirmed from full text):** Single-laptop KinD testbed; one synthetic deterministic app; tiny request volumes; sequential (non-parallel) evaluation, author-acknowledged; no SLA/latency outcome metrics; no repeated trials or statistics; fixed ±1 action space and fixed 30s interval (author-acknowledged as future work); LSTM forecasts only memory (2 features); preprint status.

**6. How to use in your literature review:** Three distinct uses. (a) **Gap-3 evidence:** cite its fixed interval, fixed ±1 action space, and its own future-work admission as current proof that even new proactive/RL frameworks retain static control parameters — your Module 3's exact target. (b) **Critical-appraisal example** in your methodology-gap discussion (2.9/2.11): its single-laptop, single-app, no-statistics evaluation is a concrete instance of the evaluation weaknesses your Methodological gap describes — and your own ablation protocol is the corrective. (c) **Cautionary contrast for claims-writing:** the abstract-vs-results mismatch is a lesson in why your thesis should report violation duration, cost, and stability together rather than a single headline claim.

**7. Supports or challenges your argument:** Strongly supports Gap-3 — more strongly than a well-designed paper would, because it *exhibits* the limitation rather than merely discussing it. It does not challenge any of your modules: it has no multi-signal fusion (state vector is CPU + memory + predicted memory + replica count — no backlog, no latency percentiles), no placement/scheduling component, and no self-tuning of its own control parameters.

**8. Literature matrix note (copy-paste ready):**
> Wanigasooriya & Ekanayake (2026), arXiv:2604.11017 (preprint, IIT Sri Lanka). DQN+LSTM+LLM-validation proactive autoscaler vs. HPA/KEDA. Fixed 30s interval and ±1 action space (own future work admits this) — direct current evidence for Gap-3. Evaluation is a single-laptop KinD cluster, one synthetic app, tiny load, sequential runs, no statistics; results show highest replica count/resource use and least stability, contradicting the abstract's "cost efficiency" claim — cite results, not abstract. No signal fusion, no placement logic, no parameter self-tuning.

---

## Final Verification Status

| Item | Status |
|---|---|
| Gap-3 reference ("...2026 IIT.pdf") | ✅ **Fully resolved (2026-07-29)** — identified as NimbusGuard, full text read and evaluated (Source 7); user-provided `docs/2604.11017v1.pdf` confirmed byte-for-byte identical to the verified arXiv text. No action remaining. |
| Business-Aware SLA paper (Gap-1 anchor) | 🟡 **Mostly resolved** — IEEE Access acceptance and DOI (10.1109/ACCESS.2026.3689039) double-confirmed; additional methodology detail verified (SLA compliance defined via workload-backlog limits; authors state it builds on their own prior HPA work). **Author resolved 2026-07-29: Pallavi Priya Patharlagadda** (single author), via Crossref/Semantic Scholar cross-check. Remaining optional check: confirm the exact conditions behind the "86%" figure and whether it's moved to a final published issue/volume — full text is still inaccessible (IEEE Xplore returns no content to automated retrieval, ResearchGate blocks scraping). |
| ScalerEval | ✅ **Resolved** — authors and affiliations verified (Xie et al., Wuhan University + Zhongguancun Laboratory), open-source code confirmed. Remaining optional check: whether a peer-reviewed venue has since accepted it. |
| Pandey (2026) RL paper | ✅ **Fully resolved (2026-07-29)** — venue, DOI, and 20-run statistical design already verified; **affiliation resolved: Vaibhav Pandey, Department of Information and Communication Engineering, Fukuoka Institute of Technology, Japan** (found via SpringerLink's own page metadata, publicly indexed by search engines even though the chapter text is paywalled — see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 7 section). |
