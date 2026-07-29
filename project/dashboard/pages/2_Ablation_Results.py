"""
Test/ablation-results view (Full_Plan.md Section 13.1) - the live 25-trial,
5-arm ablation study (Phase 6) and its Phase 7 statistical analysis. Reads
results/phase7/ artifacts directly; no new computation happens on this page
(project/phase7_analysis/statistical_analysis.py is the actual analysis).
"""
import json
import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

PROJECT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT_DIR / "dashboard"))
from colors import ARM_COLORS, ARM_LABELS, ARM_ORDER, TEXT_PRIMARY  # noqa: E402

st.set_page_config(page_title="Ablation Results", page_icon="\U0001F4CA", layout="wide")
st.title("Ablation Results — Live 5-Arm Study (Phase 6/7)")

RESULTS_DIR = PROJECT_DIR / "results" / "phase7"
stats_path = RESULTS_DIR / "statistical_analysis.json"
csv_path = RESULTS_DIR / "trial_level_data.csv"

if not stats_path.exists() or not csv_path.exists():
    st.warning(
        f"No Phase 7 results found at {RESULTS_DIR}. Run "
        "`python project/phase7_analysis/statistical_analysis.py` first."
    )
    st.stop()

with open(stats_path, "r", encoding="utf-8") as f:
    stats = json.load(f)
df = pd.read_csv(csv_path)

st.info(
    f"**{stats['metadata']['n_trials_total']} trials** "
    f"({', '.join(f'{k}={v}' for k, v in stats['metadata']['n_trials_per_arm'].items())}), "
    f"one workload type ({stats['metadata']['workload_type']}). "
    f"{stats['metadata']['power_caveat']}"
)

METRIC_LABELS = {
    "sla_violation_count": ("SLA violation count", "count", "lower is better"),
    "p99_latency_ms": ("p99 latency", "ms", "lower is better"),
    "cost_proxy_pod_seconds": ("Cost proxy", "pod-seconds", "lower is better"),
    "instability_reversals": ("Instability (reversals)", "count", "lower is better"),
    "deviation_std": ("Deviation std", "", "lower is better"),
    "over_provisioning_timeshare": ("Over-provisioning", "fraction of time", "lower is better"),
    "under_provisioning_timeshare": ("Under-provisioning", "fraction of time", "lower is better"),
}


def bar_chart(metric: str) -> go.Figure:
    means = df.groupby("arm")[metric].mean().reindex(ARM_ORDER)
    label, unit, _ = METRIC_LABELS[metric]
    fig = go.Figure(
        go.Bar(
            x=[ARM_LABELS[a] for a in ARM_ORDER],
            y=means.values,
            marker_color=[ARM_COLORS[a] for a in ARM_ORDER],
            text=[f"{v:.3g}" for v in means.values],
            textposition="outside",
            textfont=dict(color=TEXT_PRIMARY),
            hovertemplate="%{x}<br>" + label + ": %{y:.3g} " + unit + "<extra></extra>",
        )
    )
    fig.update_layout(
        title=f"{label} by arm (mean, n=5/arm)",
        yaxis_title=unit or label,
        showlegend=False,
        margin=dict(t=50, b=10, l=10, r=10),
        height=320,
    )
    return fig


st.subheader("Omnibus tests (Kruskal-Wallis across 5 arms)")
omnibus_rows = []
for metric, res in stats["omnibus_tests"].items():
    omnibus_rows.append({
        "Metric": METRIC_LABELS[metric][0],
        "H-statistic": round(res["statistic"], 3),
        "p-value": f"{res['pvalue']:.4f}",
        "Significant (p<0.05)": "✅" if res["significant_at_0.05"] else "—",
    })
st.dataframe(pd.DataFrame(omnibus_rows), use_container_width=True, hide_index=True)

st.subheader("Metric distributions by arm")
metric_keys = list(METRIC_LABELS.keys())
for row_start in range(0, len(metric_keys), 3):
    cols = st.columns(3)
    for col, metric in zip(cols, metric_keys[row_start:row_start + 3]):
        col.plotly_chart(bar_chart(metric), use_container_width=True)

st.subheader("Significant pairwise comparisons (Benjamini-Hochberg-corrected, p<0.05)")
sig_rows = []
for metric, pairs in stats["pairwise_comparisons"].items():
    for p in pairs:
        if p["significant_bh_0.05"]:
            sig_rows.append({
                "Metric": METRIC_LABELS[metric][0],
                "Arm A": ARM_LABELS[p["arm_a"]],
                "Arm B": ARM_LABELS[p["arm_b"]],
                "Mean A": round(p["mean_a"], 3),
                "Mean B": round(p["mean_b"], 3),
                "p (adjusted)": f"{p['pvalue_bh_adjusted']:.4f}",
                "Effect size": round(p["effect_size_rank_biserial"], 2),
            })
if sig_rows:
    st.dataframe(pd.DataFrame(sig_rows), use_container_width=True, hide_index=True)
else:
    st.write("None survive correction — expected given the n=5/arm power constraint above.")

st.subheader("Ablation decomposition (delta from baseline)")
decomp_metric = st.selectbox("Metric", list(METRIC_LABELS.keys()), format_func=lambda m: METRIC_LABELS[m][0])
decomp = stats["ablation_decomposition"][decomp_metric]
delta_df = pd.DataFrame([
    {"Arm": ARM_LABELS[a], "Mean": round(decomp["delta_from_baseline"][a] + decomp["baseline_mean"], 3),
     "Delta from baseline": round(decomp["delta_from_baseline"][a], 3)}
    for a in ARM_ORDER
])
st.dataframe(delta_df, use_container_width=True, hide_index=True)
st.caption(
    f"full beats every single-module arm on this metric: "
    f"{'✅ yes' if decomp['full_beats_all_single_modules'] else '❌ no — see report Chapter 4, Finding 4 for the honest nuance'}"
)

with st.expander("Raw trial-level data (all 25 trials)"):
    st.dataframe(df, use_container_width=True)

with st.expander("Raw statistical_analysis.json"):
    st.json(stats)
