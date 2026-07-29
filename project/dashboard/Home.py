"""
Phase 8 dashboard landing page (Full_Plan.md Section 13, optional /
deferred - not part of the core deliverable). Run with:

    streamlit run project/dashboard/Home.py

Fully offline: reads existing result artifacts and already-trained model
files under project/results/ and project/data/processed/. Never depends
on the live KinD cluster being up (Progress_Trace.md's Phase 8 status
note, decided 2026-07-29) - avoids re-introducing the host-memory risk
Phase 5 fought hard to eliminate.
"""
import streamlit as st

st.set_page_config(page_title="Multi-Signal Autoscaling — Dashboard", page_icon="\U0001F4CA", layout="wide")

st.title("Multi-Signal, Co-Scheduling Autoscaling Framework")
st.caption("A Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control for SLA-Driven Kubernetes Workloads")

st.markdown(
    """
This dashboard is an **optional, deferred feature** (Full_Plan.md Section 13 /
Phase_Plan.md Phase 8) — not part of the core FYP deliverable, and not
required for the final report. It exists to make the project's own results
and already-trained models explorable without reading raw JSON files.

**Everything here runs fully offline.** It reads result artifacts already
committed under `project/results/` and `project/data/processed/`, and calls
each module's own validated code directly (`predict_risk`, `select_node`,
`adjust_params`) — it never depends on the live 2-node KinD cluster being up.

### Pages

- **Training Results** — Module 1/2/3's offline validation (Phases 2-4):
  classification metrics, SHAP attribution, regret curves, conformal
  coverage, and each module's individual-contribution proof (including
  the synthetic addenda that resolved the two real-data non-passes).
- **Ablation Results** — the live 25-trial, 5-arm ablation study (Phase 6)
  and its Phase 7 statistical analysis (Kruskal-Wallis omnibus tests,
  Benjamini-Hochberg-corrected pairwise comparisons, ablation decomposition).
- **Live What-If** — Tier 1 of Full_Plan.md Section 13.1: pick or enter a
  signal state for any module and see its live decision, computed on demand
  from the already-trained/calibrated models. A single function call each
  time, not a running system.

See `docs/Progress_Trace_MultiSignal_Autoscaling.md` for the full, honest
account of every result shown here — including what didn't pass on real
data alone and why.
"""
)
