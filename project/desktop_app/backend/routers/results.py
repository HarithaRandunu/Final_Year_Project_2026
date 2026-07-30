"""Read-only results views (Milestone 1) - ports project/dashboard/pages/
1_Training_Results.py and 2_Ablation_Results.py's data-loading logic. No new
computation happens here; every number/plot comes from files already
committed under project/results/, exactly as the Streamlit pages read them.
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.colors import ARM_COLORS, ARM_LABELS, ARM_ORDER, ARM_SHORT, TEXT_PRIMARY
from backend.config import RESULTS_DIR

router = APIRouter(prefix="/api/results", tags=["results"])

# module key -> (directory, allowed image filenames) - an explicit allowlist,
# not a raw filesystem join, so /api/results/image/{module}/{filename} can
# never be used for path traversal outside project/results/.
IMAGE_ALLOWLIST: dict[str, tuple[Path, set[str]]] = {
    "module1": (RESULTS_DIR / "module1" / "primary", {"calibration.png", "shap_summary.png", "walk_forward_auc_pr.png"}),
    "module2": (RESULTS_DIR / "module2", {"convergence.png", "discounted_vs_vanilla.png", "regret_comparison.png", "synthetic_rank_inversion.png"}),
    "module3": (RESULTS_DIR / "module3", {"isolated_pi_test.png", "sensitivity_check.png", "step_response.png", "synthetic_multi_burst.png", "three_way_comparison.png"}),
    "integration": (RESULTS_DIR / "integration", {"closed_loop_overview.png"}),
    "phase7": (RESULTS_DIR / "phase7", {"metric_distributions_by_arm.png"}),
}


def load_json(path: Path) -> dict | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/image/{module}/{filename}")
def get_image(module: str, filename: str) -> FileResponse:
    entry = IMAGE_ALLOWLIST.get(module)
    if entry is None or filename not in entry[1]:
        raise HTTPException(status_code=404, detail="Unknown module/image")
    path = entry[0] / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image not generated yet")
    return FileResponse(path)


@router.get("/training")
def training_results() -> dict:
    """Mirrors 1_Training_Results.py's four tabs (Integration, Module 1/2/3)."""
    out: dict = {}

    int_dir = RESULTS_DIR / "integration"
    integ = load_json(int_dir / "metrics.json")
    out["integration"] = None if integ is None else {
        "coherence_checks": integ["coherence_checks"],
        "summary_stats": integ["summary_stats"],
        "has_overview_image": (int_dir / "closed_loop_overview.png").exists(),
        "raw": integ,
    }

    m1_dir = RESULTS_DIR / "module1" / "primary"
    m1 = load_json(m1_dir / "metrics.json")
    out["module1"] = None if m1 is None else {
        "walk_forward": m1["walk_forward"],
        "lead_time_comparison": m1["lead_time_comparison"],
        "pass_criteria": m1["pass_criteria"],
        "shap_sanity_check": load_json(m1_dir / "shap_sanity_check.json"),
        "images": [f for f in ("calibration.png", "shap_summary.png", "walk_forward_auc_pr.png") if (m1_dir / f).exists()],
        "raw": m1,
    }

    m2_dir = RESULTS_DIR / "module2"
    m2 = load_json(m2_dir / "metrics.json")
    out["module2"] = None if m2 is None else {
        "regret_validation": m2["regret_validation"],
        "discounted_vs_vanilla_ablation": m2["discounted_vs_vanilla_ablation"],
        "pass_criteria": m2["pass_criteria"],
        "synthetic_rank_inversion": load_json(m2_dir / "synthetic_rank_inversion.json"),
        "images": [f for f in ("regret_comparison.png", "discounted_vs_vanilla.png", "convergence.png", "synthetic_rank_inversion.png") if (m2_dir / f).exists()],
        "raw": m2,
    }

    m3_dir = RESULTS_DIR / "module3"
    m3 = load_json(m3_dir / "metrics.json")
    out["module3"] = None if m3 is None else {
        "coverage_check": m3["coverage_check"],
        "three_way_comparison": m3["three_way_comparison"],
        "pass_criteria": m3["pass_criteria"],
        "synthetic_multi_burst": load_json(m3_dir / "synthetic_multi_burst.json"),
        "images": [f for f in ("step_response.png", "three_way_comparison.png", "sensitivity_check.png", "synthetic_multi_burst.png") if (m3_dir / f).exists()],
        "raw": m3,
    }

    return out


METRIC_LABELS = {
    "sla_violation_count": ("SLA violation count", "count"),
    "p99_latency_ms": ("p99 latency", "ms"),
    "cost_proxy_pod_seconds": ("Cost proxy", "pod-seconds"),
    "instability_reversals": ("Instability (reversals)", "count"),
    "deviation_std": ("Deviation std", ""),
    "over_provisioning_timeshare": ("Over-provisioning", "fraction of time"),
    "under_provisioning_timeshare": ("Under-provisioning", "fraction of time"),
}


@router.get("/ablation")
def ablation_results() -> dict:
    """Mirrors 2_Ablation_Results.py's tables (omnibus tests, significant
    pairwise comparisons, ablation decomposition)."""
    phase7_dir = RESULTS_DIR / "phase7"
    stats = load_json(phase7_dir / "statistical_analysis.json")
    csv_path = phase7_dir / "trial_level_data.csv"
    if stats is None or not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"No Phase 7 results found at {phase7_dir}")

    df = pd.read_csv(csv_path)

    sig_rows = []
    for metric, pairs in stats["pairwise_comparisons"].items():
        for p in pairs:
            if p["significant_bh_0.05"]:
                sig_rows.append({
                    "metric": METRIC_LABELS[metric][0],
                    "arm_a": ARM_LABELS[p["arm_a"]],
                    "arm_b": ARM_LABELS[p["arm_b"]],
                    "mean_a": round(p["mean_a"], 3),
                    "mean_b": round(p["mean_b"], 3),
                    "pvalue_adjusted": round(p["pvalue_bh_adjusted"], 4),
                    "effect_size": round(p["effect_size_rank_biserial"], 2),
                })

    return {
        "metadata": stats["metadata"],
        "metric_labels": METRIC_LABELS,
        "arm_order": ARM_ORDER,
        "arm_labels": ARM_LABELS,
        "arm_colors": ARM_COLORS,
        "omnibus_tests": stats["omnibus_tests"],
        "significant_pairwise": sig_rows,
        "ablation_decomposition": stats["ablation_decomposition"],
        "trial_level_data": df.to_dict(orient="records"),
    }


@router.get("/ablation/chart/{metric}")
def ablation_chart(metric: str) -> dict:
    """Returns a Plotly figure (data+layout) for one metric's per-arm mean
    bar chart - same construction as 2_Ablation_Results.py's bar_chart(),
    serialized for the frontend's vendored plotly.min.js to render directly."""
    if metric not in METRIC_LABELS:
        raise HTTPException(status_code=404, detail="Unknown metric")

    csv_path = RESULTS_DIR / "phase7" / "trial_level_data.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="No trial-level data found")
    df = pd.read_csv(csv_path)

    means = df.groupby("arm")[metric].mean().reindex(ARM_ORDER)
    label, unit = METRIC_LABELS[metric]
    fig = go.Figure(
        go.Bar(
            # Short tick labels, full arm name on hover. Confirmed by
            # screenshotting the real window: the full labels
            # ("M3 only (Adaptive Control)") are long enough that Plotly
            # rotates them ~45 degrees and they then run past the bottom of the
            # chart cell. Widening the bottom margin instead would have cost
            # the plot area a third of its height in every chart.
            x=[ARM_SHORT[a] for a in ARM_ORDER],
            customdata=[ARM_LABELS[a] for a in ARM_ORDER],
            y=means.values,
            marker_color=[ARM_COLORS[a] for a in ARM_ORDER],
            text=[f"{v:.3g}" for v in means.values],
            textposition="outside",
            # Value labels sit outside the bar, so they must not be clipped by
            # the plot area on the tallest bar.
            cliponaxis=False,
            textfont=dict(color=TEXT_PRIMARY),
            marker_line_width=0,
            hovertemplate="%{customdata}<br>" + label + ": %{y:.3g} " + unit + "<extra></extra>",
        )
    )
    fig.update_layout(
        title=f"{label} by arm (mean, n=5/arm)",
        yaxis_title=unit or label,
        # Bars must be measured from zero. Left to Plotly's autorange, a metric
        # whose arm means are all clustered (deviation_std spans 0.0-0.39) gets
        # a truncated axis, which visually exaggerates the differences between
        # arms - the last thing an honest ablation chart should do.
        yaxis_rangemode="tozero",
        # automargin lets Plotly widen the left margin to whatever the rotated
        # axis title plus tick labels actually need. Confirmed necessary by
        # screenshotting the real window: at a fixed l=70 the longer titles
        # were clipped to "eviation std" and "ction of time", and any fixed
        # value only moves which metric gets cut.
        yaxis_automargin=True,
        xaxis_automargin=True,
        showlegend=False,
        margin=dict(t=46, b=44, l=56, r=18),
        # Taller than the Streamlit original (320): these render two-per-row in
        # a desktop window rather than three-across in a browser column, and at
        # 320 the arm names below the axis crowded the bars.
        height=380,
        # The frontend re-themes text/grid colors for the active color scheme
        # (see frontend/js/ui.js themeFigure) - it owns that, not this module,
        # because only the client knows whether it is in light or dark mode.
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return json.loads(fig.to_json())
