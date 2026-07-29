"""
Training-results view (Full_Plan.md Section 13.1) - Module 1/2/3's offline
validation (Phases 2-4). Reads existing results/module{1,2,3}/ artifacts
directly; no new computation happens on this page.
"""
import json
from pathlib import Path

import streamlit as st

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
RESULTS_DIR = PROJECT_DIR / "results"

st.set_page_config(page_title="Training Results", page_icon="\U0001F4CA", layout="wide")
st.title("Training Results — Offline Validation (Phases 2-4)")


def pass_badge(passed: bool) -> str:
    return "✅ Pass" if passed else "❌ Not confirmed"


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


tab0, tab1, tab2, tab3 = st.tabs([
    "\U0001F517 Integration (Full Framework)", "Module 1 — Signal Fusion",
    "Module 2 — Co-Scheduling", "Module 3 — Adaptive Control",
])

# --- Integration (Phase 4: simulated closed loop) ---
with tab0:
    st.markdown(
        "**Phase 4** wires all three already-validated modules together — Module 1's predicted_risk "
        "feeding both Module 2 (as placement context) and Module 3 (as the adaptive-control input) — "
        "and checks the result for mutual consistency. This is the project's own solution as one system, "
        "not three modules validated in isolation."
    )
    int_dir = RESULTS_DIR / "integration"
    integ = load_json(int_dir / "metrics.json")
    if integ is None:
        st.warning(f"No results found at {int_dir}/metrics.json")
    else:
        checks = integ["coherence_checks"]
        st.subheader("Coherence checks")
        st.write(f"Overall: {pass_badge(checks['all_checks_passed'])} — all 13 checks below")
        check_rows = [{"Check": k, "Passed": "✅" if v is True else ("—" if isinstance(v, int) else "❌")}
                      for k, v in checks.items() if isinstance(v, bool)]
        st.dataframe(check_rows, use_container_width=True, hide_index=True)

        st.subheader("Summary")
        stats = integ["summary_stats"]
        c1, c2, c3 = st.columns(3)
        c1.metric("Buckets covered", stats["n_buckets"])
        c1.metric("Placement rounds", stats["n_placement_rounds"])
        c2.metric("Alerts raised (M3)", stats["n_alerts"])
        c2.metric("Mean predicted_risk (M1)", f"{stats['mean_predicted_risk']:.4f}")
        c3.metric("Mean placement reward (M2)", f"{stats['mean_placement_reward']:.4f}")
        c3.metric("Final threshold (M3)", f"{stats['final_threshold']:.3f}")

        overview = int_dir / "closed_loop_overview.png"
        if overview.exists():
            st.image(str(overview), caption="Closed-loop overview: predicted_risk, placement, threshold trajectory", use_container_width=True)

        st.caption(
            "This is Phase 4's simulated integration, not the live 25-trial ablation (Phase 6) — see the "
            "Ablation Results page for the live study, where the **full** arm is this same combined system "
            "measured against baseline/HPA and each module in isolation."
        )

        with st.expander("Raw metrics.json"):
            st.json(integ)

# --- Module 1 ---
with tab1:
    m1_dir = RESULTS_DIR / "module1" / "primary"
    m1 = load_json(m1_dir / "metrics.json")
    if m1 is None:
        st.warning(f"No results found at {m1_dir}/metrics.json")
    else:
        st.subheader("General model quality")
        c1, c2, c3 = st.columns(3)
        c1.metric("Walk-forward mean AUC-PR (fused)", f"{m1['walk_forward']['mean_fused_auc_pr']:.3f}",
                   f"vs. baseline {m1['walk_forward']['mean_baseline_auc_pr']:.3f}")
        c2.metric("Walk-forward mean AUC-ROC (fused)", f"{m1['walk_forward']['mean_fused_auc_roc']:.3f}",
                   f"vs. baseline {m1['walk_forward']['mean_baseline_auc_roc']:.3f}")
        c3.metric("Lead time (fused vs. CPU-only)", f"{m1['lead_time_comparison']['mean_fused_lead_time']:.2f} buckets",
                   f"baseline {m1['lead_time_comparison']['mean_baseline_lead_time']:.2f} buckets", delta_color="inverse")
        st.caption(
            "The lead-time result is a genuine, disclosed negative finding, not a bug: the fused model's "
            "mean lead time is *shorter* than the CPU-only baseline's at matched alert rates. See "
            "docs/Progress_Trace_MultiSignal_Autoscaling.md's Phase 2 section for the investigated mechanism."
        )

        st.subheader("⭐ Individual contribution — TreeSHAP attribution")
        shap_check = load_json(m1_dir / "shap_sanity_check.json")
        st.write(f"Pass criteria: {pass_badge(m1['pass_criteria']['shap_sanity_check_majority_pass'])} "
                 f"(majority of tested signals correctly attributed) — "
                 f"{pass_badge(m1['pass_criteria']['shap_sanity_check_all_pass'])} (all signals, stricter bar)")
        if shap_check:
            st.dataframe(shap_check, use_container_width=True)

        st.subheader("Plots")
        cols = st.columns(3)
        for col, fname, caption in zip(
            cols,
            ["calibration.png", "shap_summary.png", "walk_forward_auc_pr.png"],
            ["Calibration", "SHAP summary", "Walk-forward AUC-PR"],
        ):
            p = m1_dir / fname
            if p.exists():
                col.image(str(p), caption=caption, use_container_width=True)

        with st.expander("Raw metrics.json"):
            st.json(m1)

# --- Module 2 ---
with tab2:
    m2_dir = RESULTS_DIR / "module2"
    m2 = load_json(m2_dir / "metrics.json")
    if m2 is None:
        st.warning(f"No results found at {m2_dir}/metrics.json")
    else:
        st.subheader("General bandit quality — cumulative regret")
        regret = m2["regret_validation"]["final_cumulative_regret"]
        c1, c2, c3 = st.columns(3)
        c1.metric("Combined system (final regret)", f"{regret['combined_system']:.2f}")
        c2.metric("Random policy", f"{regret['random']:.2f}")
        c3.metric("Heuristic-only", f"{regret['heuristic_only']:.2f}")
        st.write(f"Pass criteria: {pass_badge(m2['pass_criteria']['combined_beats_random_and_heuristic_regret'])} "
                 "— combined system beats both random and heuristic-only")
        st.caption(
            "Honest finding: the combined system does **not** currently beat the heuristic-only baseline "
            "— with only 87 real sequential placement events across 371 candidate nodes, a learning policy's "
            "exploration cost never gets amortized. See Progress_Trace.md's Phase 3A section."
        )

        st.subheader("⭐ Individual contribution — discounted vs. vanilla Thompson Sampling")
        dv = m2["discounted_vs_vanilla_ablation"]
        c1, c2 = st.columns(2)
        c1.metric("Discounted TS, real non-stationary window", f"{dv['discounted_mean_reward_in_window']:.3f}")
        c2.metric("Vanilla TS, same window", f"{dv['vanilla_mean_reward_in_window']:.3f}")
        st.write(f"Pass criteria (real data): {pass_badge(m2['pass_criteria']['discounted_beats_vanilla_on_shift_window'])}")
        st.caption(
            "Vanilla edges out discounted on the one real non-stationary window this trace offers — its drift "
            "turned out to be uniform across nodes, not the differential rank-reshuffling discounting targets."
        )

        synth = load_json(m2_dir / "synthetic_rank_inversion.json")
        if synth:
            st.markdown("**Addendum: synthetic rank-inversion stress test** (isolates the exact condition above)")
            c1, c2, c3 = st.columns(3)
            c1.metric("Win rate, recovery window", f"{synth['recovery_window']['win_rate_discounted']:.0%}")
            c2.metric("Wilcoxon p-value", f"{synth['recovery_window']['wilcoxon_pvalue_one_sided_greater']:.1e}")
            c3.metric("Pass criteria", pass_badge(synth["pass_criteria"]["discounted_beats_vanilla_recovery_window"]))

        st.subheader("Plots")
        cols = st.columns(4)
        for col, fname, caption in zip(
            cols,
            ["regret_comparison.png", "discounted_vs_vanilla.png", "convergence.png", "synthetic_rank_inversion.png"],
            ["Regret vs. oracle", "Discounted vs. vanilla", "Node-preference convergence", "Synthetic rank-inversion"],
        ):
            p = m2_dir / fname
            if p.exists():
                col.image(str(p), caption=caption, use_container_width=True)

        with st.expander("Raw metrics.json"):
            st.json(m2)

# --- Module 3 ---
with tab3:
    m3_dir = RESULTS_DIR / "module3"
    m3 = load_json(m3_dir / "metrics.json")
    if m3 is None:
        st.warning(f"No results found at {m3_dir}/metrics.json")
    else:
        st.subheader("General calibration quality — conformal coverage")
        cov = m3["coverage_check"]
        c1, c2 = st.columns(2)
        c1.metric("Empirical coverage", f"{cov['empirical_coverage']:.1%}", f"target {cov['target_coverage']:.0%}")
        c2.metric("Pass criteria", pass_badge(m3["pass_criteria"]["coverage_close_to_target"]))

        st.subheader("⭐ Individual contribution — oscillation-conditioned widening")
        tw = m3["three_way_comparison"]
        c1, c2, c3 = st.columns(3)
        c1.metric("Fixed — reversals", tw["fixed"]["instability_reversals"])
        c2.metric("PI+conformal — reversals", tw["pi_conformal"]["instability_reversals"])
        c3.metric("Full design — reversals", tw["full"]["instability_reversals"])
        st.write(f"Pass criteria (real data, literal reversal count): "
                 f"{pass_badge(m3['pass_criteria']['full_beats_pi_conformal_instability'])}")
        st.caption(
            "Real bursty segment ties full design and PI+conformal-only at the same reversal count — only "
            "3-4 genuine reversals exist in this 210-row segment, too few for a discrete count to separate them. "
            "Deviation std still drops monotonically with widening strength (full "
            f"{tw['full']['deviation_std']:.3f} vs. PI-only {tw['pi_conformal']['deviation_std']:.3f})."
        )

        synth = load_json(m3_dir / "synthetic_multi_burst.json")
        if synth:
            st.markdown("**Addendum: synthetic multi-burst stress test** (gives the reversal-count metric enough events to resolve)")
            c1, c2, c3 = st.columns(3)
            c1.metric("PI+conformal — mean reversals", f"{synth['reversal_count']['pi_conformal_mean']:.2f}")
            c2.metric("Full design — mean reversals", f"{synth['reversal_count']['full_mean']:.2f}")
            c3.metric("Pass criteria", pass_badge(synth["pass_criteria"]["full_beats_pi_conformal_instability_synthetic"]))
            st.caption(f"Wilcoxon p = {synth['reversal_count']['wilcoxon_pvalue_one_sided_greater']:.1e}, "
                       f"never worse in {synth['reversal_count']['full_never_worse_rate']:.0%} of repeats.")

        st.subheader("Plots")
        cols = st.columns(4)
        for col, fname, caption in zip(
            cols,
            ["step_response.png", "three_way_comparison.png", "sensitivity_check.png", "synthetic_multi_burst.png"],
            ["Step response", "Three-way comparison", "Sensitivity check", "Synthetic multi-burst"],
        ):
            p = m3_dir / fname
            if p.exists():
                col.image(str(p), caption=caption, use_container_width=True)

        with st.expander("Raw metrics.json"):
            st.json(m3)
