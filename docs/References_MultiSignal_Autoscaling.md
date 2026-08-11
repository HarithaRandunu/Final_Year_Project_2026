# References
## A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads

*Extracted verbatim from the References chapter of `Final_Report_Promex.docx` — pulled directly from the submitted document's paragraph text, not retyped from memory. Alphabetical by first author, numbered as cited in the report body. The "Cited for" column states what each reference actually supports in the text, so this file is usable on its own without the full report open.*

---

**[1]** Kephart, J. O. and Chess, D. M. (2003), *The vision of autonomic computing*, IEEE Computer, 36(1), pp 41-50.
**Cited for:** the monitor-analyse-plan-execute reference model that frames the whole system as a continuous adaptation loop rather than a one-time configuration (Chapter 2).

**[2]** Liu, X., Li, Y., Farkiani, B. and Crowley, P. (2026), *BACC: budget-aware calibration and control for horizontal autoscaling*, arXiv preprint arXiv:2606.20575.
**Cited for:** the published design the adaptive control component's proportional-integral-plus-conformal-calibration mechanism is built on; the report is explicit that this pairing is theirs, not this project's, and states precisely what was added beyond it (Chapters 2 and 3).

**[3]** Lorido-Botran, T., Miguel-Alonso, J. and Lozano, J. A. (2014), *A review of auto-scaling techniques for elastic applications in cloud environments*, Journal of Grid Computing, 12(4), pp 559-592.
**Cited for:** the five-family taxonomy of scaling techniques (threshold rules, control theory, reinforcement learning, queueing theory, time-series analysis) used to position this project's choices within the field (Chapter 2).

**[4]** Luo, S., Xu, H., Lu, C., Ye, K., Xu, G., Zhang, L., Ding, Y., He, J. and Xu, C. (2021), *Characterizing microservice dependency and performance: Alibaba trace analysis*, In proceedings of the ACM Symposium on Cloud Computing, pp 412-426, Seattle, United States.
**Cited for:** the production trace (`cluster-trace-microservices-v2021`) used for all offline training and calibration — the twelve-hour, twenty-thousand-service dataset the classifier, the placement simulator, and the controller's calibration all derive from (Chapters 2, 5 and 6).

**[5]** Pandey, V. (2026), *Reinforcement learning-based autoscaling for cost and performance optimization in Kubernetes clusters*, In Advances on P2P, Parallel, Grid, Cloud and Internet Computing, Lecture Notes on Data Engineering and Communications Technologies, vol 277, Springer.
**Cited for:** the strongest published case for learned adaptive control, used in Chapter 2's review and directly in Chapter 3's reasoning for why deep reinforcement learning was not adopted for the control component despite this evidence.

**[6]** Patharlagadda, P. P. (2026), *Business-aware SLA-driven autoscaling for Kubernetes microservices using application-level observability*, IEEE Access.
**Cited for:** the deterministic queue-backlog-to-replica mapping that established application-level signals beat CPU-only scaling — the starting evidence for the signal fusion component's justification (Chapter 2).

**[7]** Punniyamoorthy, V., Kumar, B., Saha, S., Butra, L., Palanigounder, M., Agarwal, A. K. and Kannan, K. (2025), *An SLO driven and cost-aware autoscaling framework for Kubernetes*, arXiv preprint arXiv:2512.23415.
**Cited for:** the closest reviewed system overall — multi-signal, explainability-first design; Chapter 2's comparison table and Chapter 7's discussion both state explicitly where this project's placement and control mechanisms go further than theirs.

**[8]** Qiu, H., Banerjee, S. S., Jha, S., Kalbarczyk, Z. T. and Iyer, R. K. (2020), *FIRM: an intelligent fine-grained resource management framework for SLO-oriented microservices*, In proceedings of the 14th USENIX Symposium on Operating Systems Design and Implementation, pp 805-825.
**Cited for:** the documented evidence that learned resource-management policies are workload-specific and require retraining as conditions drift — the counter-evidence used in Chapter 3's argument against reinforcement learning for the control component.

**[9]** Tamiru, M. A., Tordsson, J., Elmroth, E. and Pierre, G. (2020), *An experimental evaluation of the Kubernetes cluster autoscaler in the cloud*, In proceedings of the 12th IEEE International Conference on Cloud Computing Technology and Science, pp 17-24, Bangkok, Thailand.
**Cited for:** the elasticity measures adopted throughout the evaluation — over-provisioning and under-provisioning share, instability, and deviation from an ideal trajectory — and the finding that autoscaler behaviour depends chiefly on workload composition (Chapters 2, 5 and 7).

**[10]** Vu, D. D., Tran, M. N. and Kim, Y. (2022), *Predictive hybrid autoscaling for containerized applications*, IEEE Access, 10, pp 109768-109778.
**Cited for:** the hybrid forecasting autoscaler whose own published account explicitly excludes placement coordination — direct textual evidence for this project's second identified gap (Chapter 2).

**[11]** Wanigasooriya, C. and Ekanayake, I. (2026), *NimbusGuard: a novel framework for proactive Kubernetes autoscaling using deep Q-networks*, arXiv preprint arXiv:2604.11017.
**Cited for:** the most recent proactive design reviewed, whose own results table shows it was the least stable of the systems it compared against despite using deep reinforcement learning — key evidence in Chapter 2 that fixed control settings and instability persist even in current work, and in Chapter 3's case against learned control.

**[12]** Xie, S., Wang, J., Luo, Y., Yong, Y., Tan, Y. and Li, B. (2025), *ScalerEval: automated and consistent evaluation testbed for auto-scalers in microservices*, arXiv preprint arXiv:2504.08308.
**Cited for:** evidence that inconsistent, hard-to-reproduce autoscaler evaluation is a recognised problem in the field, motivating the statistical rigour applied in Chapter 7 (Chapter 2).

---

## Verification note

All twelve entries were checked against independent bibliographic sources during this project (Crossref, Semantic Scholar, or the publisher's own indexed page) before being cited, and every one is referenced at least once in the report body — none is a list-only, uncited entry. Two items are worth remembering if this list is reused elsewhere:

- **[6]** was originally logged with its author unconfirmed, blocked behind a rate-limited ResearchGate page. The author (Patharlagadda) was subsequently confirmed via Crossref and Semantic Scholar's independent bibliographic APIs.
- **[5]**'s affiliation (Vaibhav Pandey, Department of Information and Communication Engineering, Fukuoka Institute of Technology, Japan) was confirmed via a public web search surfacing SpringerLink's own indexed page metadata, not via institutional access — worth re-verifying directly if this citation is used in a context requiring stronger provenance.
