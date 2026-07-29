"""
Live "what-if" panel - Tier 1 of Full_Plan.md Section 13.1. Calls each
module's decide-now function directly (predict_risk / select_node /
adjust_params, Section 13.2) on demand - a single synchronous call each
time, not a running system. Fully offline: no dependency on the live
KinD cluster (decided 2026-07-29, see Progress_Trace.md's Phase 8 notes).
"""
import importlib.util
import json
import sys
from pathlib import Path

import joblib
import streamlit as st

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent


def load_module_common(module_dir_name: str, unique_name: str):
    """Loads a module's common.py under a unique sys.modules name. All three
    modules have a file literally named common.py; a plain sys.path + bare
    `import common` would collide (whichever loads first "wins" the name
    `common` in sys.modules, silently shadowing the other two) - the exact
    issue module3_adaptive_control/common.py's own docstring already flags
    for a different cross-directory import case. importlib with an explicit
    unique alias avoids it entirely, without touching sys.path.
    """
    module_dir = PROJECT_DIR / module_dir_name
    sys.path.insert(0, str(module_dir))  # each module's common.py has its own sibling imports (bandit, conformal, ...)
    spec = importlib.util.spec_from_file_location(unique_name, module_dir / "common.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[unique_name] = mod
    spec.loader.exec_module(mod)
    return mod


m1_common = load_module_common("module1_signal_fusion", "m1_common")
m2_common = load_module_common("module2_co_scheduling", "m2_common")
m3_common = load_module_common("module3_adaptive_control", "m3_common")

st.set_page_config(page_title="Live What-If", page_icon="\U0001F4CA", layout="wide")
st.title("Live What-If Panel (Tier 1)")
st.caption(
    "Each tab calls that module's own \"decide right now\" function directly on the already-trained/"
    "calibrated model — the same function a future live controller would call, not a re-implementation."
)

tab1, tab2, tab3 = st.tabs(["Module 1 — Signal Fusion", "Module 2 — Co-Scheduling", "Module 3 — Adaptive Control"])

# --- Module 1: predict_risk ---
with tab1:
    predict_risk = m1_common.predict_risk

    st.markdown(
        "Set the **current** signal levels below; every rolling-delta feature "
        "(`*_delta1/2/4`) is held at zero — a steady-state simplification for this "
        "demo, not a claim that risk is delta-independent (the trained model does use them)."
    )
    model_path = PROJECT_DIR / "module1_signal_fusion" / "artifacts" / "model_primary.joblib"
    if not model_path.exists():
        st.warning(f"No trained model found at {model_path}")
    else:
        artifact = joblib.load(model_path)
        model, feature_order = artifact["model"], artifact["feature_order"]

        c1, c2, c3 = st.columns(3)
        p95 = c1.slider("p95 latency (ms)", 400.0, 550.0, 459.0)
        p99 = c1.slider("p99 latency (ms)", 450.0, 650.0, 528.0)
        call_count = c1.slider("Call count / bucket", 25000, 55000, 38800)
        http_mcr = c2.slider("HTTP MCR", 100.0, 200.0, 149.0)
        http_rt = c2.slider("HTTP RT", 100.0, 200.0, 149.0)
        provider_mcr = c2.slider("providerRPC MCR", 10.0, 35.0, 21.5)
        provider_rt = c2.slider("providerRPC RT", 150.0, 230.0, 192.0)
        cpu = c3.slider("CPU utilization", 0.0, 1.0, 0.34)
        mem = c3.slider("Memory utilization", 0.0, 1.0, 0.74)
        active_instances = c3.slider("Active instances", 1, 320, 306)
        violation_now = c3.selectbox("Violation now?", [0, 1], index=0)

        signals = {
            "p95_latency_ms": p95, "p99_latency_ms": p99, "call_count": call_count,
            "HTTP_MCR": http_mcr, "HTTP_RT": http_rt,
            "providerRPC_MCR": provider_mcr, "providerRPC_RT": provider_rt,
            "cpu_utilization": cpu, "memory_utilization": mem,
            "active_instances": active_instances, "violation_now": violation_now,
        }
        for base in ["p95_latency_ms", "p99_latency_ms", "HTTP_MCR", "HTTP_RT",
                     "providerRPC_MCR", "providerRPC_RT", "cpu_utilization", "memory_utilization"]:
            for lag in ("delta1", "delta2", "delta4"):
                signals[f"{base}_{lag}"] = 0.0

        if st.button("Run Module 1", type="primary"):
            risk = predict_risk(model, signals, feature_order)
            st.metric("Predicted risk", f"{risk:.4f}")
            st.caption(
                "Note: TeaStore's live predicted_risk was found (Phase 6) to occupy roughly a 0.003-0.3 "
                "range in practice — this offline model's output range differs since it's trained on the "
                "Alibaba trace's own p99_latency-driven violation label, not TeaStore's."
            )

# --- Module 2: select_node ---
with tab2:
    DEFAULT_BANDIT_STATE_PATH = m2_common.DEFAULT_BANDIT_STATE_PATH
    m2_select_node = m2_common.select_node

    if not DEFAULT_BANDIT_STATE_PATH.exists():
        st.warning(
            f"No trained bandit state found at {DEFAULT_BANDIT_STATE_PATH}. Run "
            "`python project/module2_co_scheduling/export_final_bandit_state.py` first."
        )
    else:
        with open(DEFAULT_BANDIT_STATE_PATH, "r", encoding="utf-8") as f:
            state = json.load(f)
        st.write(f"Trained bandit state: **{state['n_nodes']} nodes** "
                 f"({state['n_static_batch_init_events']} batch-init events + "
                 f"{state['n_churn_events_applied']} churn events), gamma={state['gamma']}")

        known_nodes = list(state["nodes"].keys())
        top_nodes = known_nodes[:20]
        chosen_known = st.multiselect(
            "Candidate nodes (trained — pick 2-6)", top_nodes, default=top_nodes[:3],
            format_func=lambda n: f"{n[:12]}… (pulls={state['nodes'][n]['pulls']}, "
                                   f"posterior mean={state['nodes'][n]['posterior_mean']:.2f})",
        )
        add_new = st.checkbox("Also include one brand-new node (never seen in training)")
        candidates = list(chosen_known)
        if add_new:
            candidates.append("new-node-demo")

        if st.button("Run Module 2", type="primary"):
            if len(candidates) < 2:
                st.error("Pick at least 2 candidates.")
            else:
                result = m2_select_node(candidates)
                st.success(f"Chosen node: **{result['chosen_node'][:16]}…**"
                           + (" (the brand-new node)" if result["chosen_node"] == "new-node-demo" else ""))
                st.dataframe(
                    [{"node": n[:16] + "…", **info} for n, info in result["candidates"].items()],
                    use_container_width=True, hide_index=True,
                )
                st.caption(
                    "Thompson Sampling is stochastic by design — re-running with the same candidates can pick "
                    "a different node, weighted toward higher posterior means over repeated calls."
                )

# --- Module 3: adjust_params ---
with tab3:
    adjust_params = m3_common.adjust_params

    c1, c2 = st.columns(2)
    predicted_risk = c1.slider("Predicted risk (this cycle)", 0.0, 1.0, 0.35)
    actual_outcome = c2.selectbox("Actual outcome (this cycle)", [0.0, 1.0], index=1,
                                   format_func=lambda v: "Violation" if v == 1.0 else "No violation")
    mode = st.radio("Mode", ["full", "pi_conformal"], horizontal=True,
                     format_func=lambda m: "Full design (PI + ACI + widening)" if m == "full" else "PI + ACI only (no widening)")

    st.caption(
        "Replays the validated walk-forward out-of-sample series (210 rows) once to rebuild realistic "
        "accumulated controller state, then applies exactly one more step for the values above."
    )

    if st.button("Run Module 3", type="primary"):
        result = adjust_params(predicted_risk, actual_outcome, mode=mode)
        c1, c2, c3 = st.columns(3)
        c1.metric("Previous threshold", f"{result['previous_threshold']:.4f}")
        c2.metric("New threshold", f"{result['new_threshold']:.4f}",
                   f"{result['new_threshold'] - result['previous_threshold']:+.4f}")
        c3.metric("Alert?", "🔴 Yes" if result["alert"] else "🟢 No")
        st.dataframe([{
            "conformal width": round(result["conformal_width"], 4),
            "widening multiplier": round(result["widening_multiplier"], 3),
            "reversal count": result["reversal_count"],
            "covered by previous interval": result["covered_by_previous_interval"],
        }], use_container_width=True, hide_index=True)
