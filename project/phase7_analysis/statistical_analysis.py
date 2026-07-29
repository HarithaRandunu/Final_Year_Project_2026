"""
Phase 7 - statistical analysis of the Phase 6 live ablation dataset
(docs/Phase_Plan_MultiSignal_Autoscaling.md's Phase 7 task list: omnibus +
corrected pairwise comparisons + effect sizes + ablation decomposition).

Input: the 25-trial dataset (5 arms x 5 trials each: baseline, m1_only,
m2_only, m3_only, full), tagged `scaleup1_t*`/`scaleup2_t*` in
project/results/ablation/<run_id>/metrics.json - see
docs/Progress_Trace_MultiSignal_Autoscaling.md's Phase 6 section for how this
dataset was produced. Deliberately excludes the earlier `firstpass` and
`recalibrated` runs (1 trial each, superseded by the scaled-up runs, not part
of the >=5-trials/arm exit-criteria dataset).

n=5/arm is small - see Phase_Plan.md's "Note on statistical power" under
Phase 7. Kruskal-Wallis/Mann-Whitney U are used instead of ANOVA/t-tests
because they don't assume normality, which matters at this sample size for
metrics like counts and bounded proportions; but with n=5 per group, even a
perfect rank separation between two arms caps around p~0.008 (2/C(10,5)) for
a single pairwise test, so results should be read as suggestive, not as-strong
as a well-powered study - flagged again in the output, not just here.
"""
from __future__ import annotations

import json
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

PROJECT_DIR = Path(__file__).resolve().parent.parent
ABLATION_RESULTS_DIR = PROJECT_DIR / "results" / "ablation"
RESULTS_DIR = PROJECT_DIR / "results" / "phase7"

ARMS = ["baseline", "m1_only", "m2_only", "m3_only", "full"]
INCLUDED_TAG_PREFIXES = ("scaleup1_t", "scaleup2_t")

METRICS = {
    "sla_violation_count": ("lower_is_better", "SLA violation count"),
    "p99_latency_ms": ("lower_is_better", "p99 latency (ms)"),
    "cost_proxy_pod_seconds": ("lower_is_better", "Cost proxy (pod-seconds)"),
    "instability_reversals": ("lower_is_better", "Instability (reversal count)"),
    "deviation_std": ("lower_is_better", "Deviation std"),
    "over_provisioning_timeshare": ("lower_is_better", "Over-provisioning timeshare"),
    "under_provisioning_timeshare": ("lower_is_better", "Under-provisioning timeshare"),
}


def load_dataset() -> pd.DataFrame:
    rows = []
    for run_dir in sorted(ABLATION_RESULTS_DIR.iterdir()):
        if not run_dir.is_dir():
            continue
        tag = run_dir.name.split("_", 2)
        run_tag = run_dir.name
        if not any(f"_{p}" in run_tag for p in INCLUDED_TAG_PREFIXES):
            continue
        metrics_path = run_dir / "metrics.json"
        if not metrics_path.exists():
            continue
        with open(metrics_path, "r", encoding="utf-8") as f:
            m = json.load(f)
        if m.get("aborted"):
            continue
        rows.append({
            "run_id": m["run_id"],
            "arm": m["arm"],
            "run_tag": m["run_tag"],
            "sla_violation_count": m["sla_violation_count"],
            "p99_latency_ms": m["p99_latency_ms"],
            "cost_proxy_pod_seconds": m["cost_proxy_pod_seconds"],
            "instability_reversals": m["elasticity"]["instability_reversals"],
            "deviation_std": m["elasticity"]["deviation_std"],
            "over_provisioning_timeshare": m["elasticity"]["over_provisioning_timeshare"],
            "under_provisioning_timeshare": m["elasticity"]["under_provisioning_timeshare"],
        })
    df = pd.DataFrame(rows)
    return df


def rank_biserial_effect_size(x: np.ndarray, y: np.ndarray, u_stat: float) -> float:
    """Cliff's delta / rank-biserial correlation from the Mann-Whitney U
    statistic: r in [-1, 1], positive means x tends to exceed y.
    """
    n1, n2 = len(x), len(y)
    return float((2 * u_stat) / (n1 * n2) - 1)


def benjamini_hochberg(pvalues: list[float]) -> list[float]:
    """Standard BH step-up FDR correction. Returns adjusted p-values in the
    original input order.
    """
    n = len(pvalues)
    order = np.argsort(pvalues)
    ranked = np.array(pvalues)[order]
    adjusted = np.empty(n)
    prev = 1.0
    for i in range(n - 1, -1, -1):
        rank = i + 1
        val = ranked[i] * n / rank
        prev = min(prev, val)
        adjusted[i] = prev
    out = np.empty(n)
    out[order] = np.clip(adjusted, 0, 1)
    return out.tolist()


def omnibus_test(df: pd.DataFrame, metric: str) -> dict:
    groups = [df.loc[df["arm"] == arm, metric].values for arm in ARMS]
    stat, pvalue = stats.kruskal(*groups)
    return {
        "metric": metric,
        "test": "kruskal-wallis",
        "statistic": float(stat),
        "pvalue": float(pvalue),
        "significant_at_0.05": bool(pvalue < 0.05),
        "arm_means": {arm: float(df.loc[df["arm"] == arm, metric].mean()) for arm in ARMS},
        "arm_medians": {arm: float(df.loc[df["arm"] == arm, metric].median()) for arm in ARMS},
    }


def pairwise_tests(df: pd.DataFrame, metric: str) -> list[dict]:
    pairs = list(combinations(ARMS, 2))
    raw_pvalues = []
    results = []
    for a, b in pairs:
        x = df.loc[df["arm"] == a, metric].values
        y = df.loc[df["arm"] == b, metric].values
        try:
            u_stat, pvalue = stats.mannwhitneyu(x, y, alternative="two-sided", method="auto")
        except ValueError:
            # all values identical in both groups - no meaningful test
            u_stat, pvalue = float(len(x) * len(y) / 2), 1.0
        effect = rank_biserial_effect_size(x, y, u_stat)
        raw_pvalues.append(pvalue)
        results.append({
            "arm_a": a, "arm_b": b,
            "mean_a": float(x.mean()), "mean_b": float(y.mean()),
            "u_statistic": float(u_stat),
            "pvalue_raw": float(pvalue),
            "effect_size_rank_biserial": effect,
        })
    adjusted = benjamini_hochberg(raw_pvalues)
    for r, p_adj in zip(results, adjusted):
        r["pvalue_bh_adjusted"] = float(p_adj)
        r["significant_bh_0.05"] = bool(p_adj < 0.05)
    return results


def ablation_decomposition(df: pd.DataFrame, metric: str) -> dict:
    """Each arm's mean delta from baseline, plus whether `full` improves on
    every single-module arm (m1_only/m2_only/m3_only) individually - the
    direct test of whether combining all three beats each one alone.
    """
    baseline_mean = float(df.loc[df["arm"] == "baseline", metric].mean())
    deltas = {}
    for arm in ARMS:
        arm_mean = float(df.loc[df["arm"] == arm, metric].mean())
        deltas[arm] = arm_mean - baseline_mean

    full_mean = float(df.loc[df["arm"] == "full", metric].mean())
    single_module_means = {a: float(df.loc[df["arm"] == a, metric].mean()) for a in ["m1_only", "m2_only", "m3_only"]}
    full_beats_all_single_modules = all(full_mean <= v for v in single_module_means.values())

    return {
        "metric": metric,
        "baseline_mean": baseline_mean,
        "delta_from_baseline": deltas,
        "full_mean": full_mean,
        "single_module_means": single_module_means,
        "full_beats_all_single_modules": bool(full_beats_all_single_modules),
    }


def main() -> None:
    df = load_dataset()
    n_per_arm = df["arm"].value_counts().to_dict()
    print(f"Loaded {len(df)} trials: {n_per_arm}")
    assert all(n_per_arm.get(arm, 0) == 5 for arm in ARMS), \
        f"Expected 5 trials/arm, got {n_per_arm} - check for stale/missing result folders."

    omnibus_results = {m: omnibus_test(df, m) for m in METRICS}
    pairwise_results = {m: pairwise_tests(df, m) for m in METRICS}
    decomposition_results = {m: ablation_decomposition(df, m) for m in METRICS}

    print("\n=== Omnibus tests (Kruskal-Wallis across 5 arms) ===")
    for m, res in omnibus_results.items():
        print(f"{m}: H={res['statistic']:.3f}, p={res['pvalue']:.4f}, significant={res['significant_at_0.05']}")

    print("\n=== Pairwise comparisons with significant BH-adjusted p-values (p<0.05) ===")
    any_significant = False
    for m, pairs in pairwise_results.items():
        for r in pairs:
            if r["significant_bh_0.05"]:
                any_significant = True
                print(f"{m}: {r['arm_a']} vs {r['arm_b']} - p_adj={r['pvalue_bh_adjusted']:.4f}, "
                      f"effect={r['effect_size_rank_biserial']:.2f}, means {r['mean_a']:.3g} vs {r['mean_b']:.3g}")
    if not any_significant:
        print("(none survive BH correction at n=5/arm — expected given the disclosed power limitation)")

    n_total_trials = len(df)
    metadata = {
        "n_trials_total": n_total_trials,
        "n_trials_per_arm": n_per_arm,
        "arms": ARMS,
        "workload_type": "alibaba_replay_primary",
        "power_caveat": (
            "n=5/arm. A single pairwise Mann-Whitney U test between two n=5 "
            "groups has a minimum achievable two-sided p-value of ~0.008 "
            "(2/C(10,5)) even under perfect rank separation; after "
            "Benjamini-Hochberg correction across 10 pairwise comparisons per "
            "metric, only very large, consistent effects will survive. "
            "Absence of significance here is not evidence of no effect - see "
            "the arm means/medians and effect sizes for the descriptive "
            "picture regardless of significance."
        ),
    }

    output = {
        "metadata": metadata,
        "omnibus_tests": omnibus_results,
        "pairwise_comparisons": pairwise_results,
        "ablation_decomposition": decomposition_results,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(RESULTS_DIR / "statistical_analysis.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved full results to {RESULTS_DIR / 'statistical_analysis.json'}")

    df.to_csv(RESULTS_DIR / "trial_level_data.csv", index=False)
    print(f"Saved trial-level data to {RESULTS_DIR / 'trial_level_data.csv'}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 4, figsize=(18, 8))
        axes = axes.flatten()
        for ax, (metric, (_, label)) in zip(axes, METRICS.items()):
            data = [df.loc[df["arm"] == arm, metric].values for arm in ARMS]
            ax.boxplot(data, tick_labels=ARMS, showmeans=True)
            ax.set_title(label, fontsize=10)
            ax.tick_params(axis="x", rotation=45, labelsize=8)
        for ax in axes[len(METRICS):]:
            ax.axis("off")
        fig.suptitle("Phase 7: metric distributions by arm (n=5/arm)")
        fig.tight_layout()
        fig.savefig(RESULTS_DIR / "metric_distributions_by_arm.png")
        plt.close(fig)
        print(f"Saved plot to {RESULTS_DIR / 'metric_distributions_by_arm.png'}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
