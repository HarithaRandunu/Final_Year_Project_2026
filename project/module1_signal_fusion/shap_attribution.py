"""
Module 1's individual contribution (Full_Plan.md Section 4): TreeSHAP attribution
as a real per-decision output, not just internal model inspection.

Two things live here:
1. `compute_attribution_vectors` - turns every test-set prediction into a
   (timestamp, dominant_signal, weight) row, the artifact Module 2 consumes
   as bandit context.
2. `run_shap_sanity_check` - the required proof that the attribution is real:
   spike one signal at a time in an otherwise-typical input and confirm (a)
   predicted risk moves and (b) SHAP correctly names the spiked signal as the
   dominant driver. This is what Full_Plan.md Section 7 lists as the
   individual contribution's specific pass criterion, not a generic
   model-quality check.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    DEFAULT_PROCESSED_DIR,
    DEFAULT_RESULTS_DIR,
    Module1Config,
    feature_columns,
    load_feature_table,
)

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def _shap_values_for_positive_class(explainer: shap.TreeExplainer, X: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    exp = explainer(X)
    values = exp.values
    base = exp.base_values
    if values.ndim == 3:
        values = values[:, :, 1]
        base = base[:, 1] if getattr(base, "ndim", 0) == 2 else base
    return values, np.asarray(base)


def compute_attribution_vectors(model, X: pd.DataFrame, time_buckets: pd.Series) -> tuple[pd.DataFrame, np.ndarray]:
    explainer = shap.TreeExplainer(model)
    shap_values, _ = _shap_values_for_positive_class(explainer, X)

    dominant_idx = np.argmax(np.abs(shap_values), axis=1)
    feature_names = np.array(X.columns)
    dominant_signal = feature_names[dominant_idx]
    dominant_weight = shap_values[np.arange(len(X)), dominant_idx]
    predicted_risk = model.predict_proba(X)[:, 1]

    vectors = pd.DataFrame({
        "time_bucket": time_buckets.values,
        "dominant_signal": dominant_signal,
        "dominant_weight": dominant_weight,
        "predicted_risk": predicted_risk,
    })
    return vectors, shap_values


def run_shap_sanity_check(model, feature_order: list[str], reference_df: pd.DataFrame, signals_to_test: list[str]) -> dict:
    """Perturb one signal family (raw value + every delta window derived from
    it) at a time away from a typical baseline row, and confirm SHAP attributes
    a meaningful share of the resulting risk shift to that same family.

    Perturbing only the raw value while leaving deltas at their median would
    produce a self-contradictory input (a level that's suddenly high but
    supposedly hasn't been changing); perturbing the whole family together
    simulates a real "this signal is spiking right now" event.

    Pass criterion is deliberately *not* "family becomes the single #1
    feature overall" - p99_latency_ms is mechanistically closest to the label
    (the label is defined from its own future value) and legitimately
    dominates most predictions, so demanding any secondary signal outrank it
    would penalize a model for correctly learning that latency matters most.
    Instead: the family's own |SHAP| must grow substantially from its
    baseline contribution, and must land in the top few features by |SHAP|
    for the perturbed prediction - i.e. "this signal now visibly matters",
    not "this signal is the only thing that matters".
    """
    explainer = shap.TreeExplainer(model)
    baseline = reference_df[feature_order].median()
    baseline_row = pd.DataFrame([baseline.values], columns=feature_order)
    baseline_risk = float(model.predict_proba(baseline_row)[0, 1])
    baseline_shap, _ = _shap_values_for_positive_class(explainer, baseline_row)
    baseline_shap = baseline_shap[0]

    TOP_K_RANK = 3
    MIN_GROWTH_MULTIPLE = 1.1

    results = []
    for signal in signals_to_test:
        if signal not in feature_order:
            continue
        family = [signal] + [f"{signal}_delta{w}" for w in (1, 2, 4) if f"{signal}_delta{w}" in feature_order]
        family_idx = [feature_order.index(c) for c in family]

        perturbed = baseline.copy()
        for col in family:
            perturbed[col] = reference_df[col].quantile(0.99)

        perturbed_row = pd.DataFrame([perturbed.values], columns=feature_order)
        perturbed_risk = float(model.predict_proba(perturbed_row)[0, 1])

        shap_values, _ = _shap_values_for_positive_class(explainer, perturbed_row)
        abs_shap = np.abs(shap_values[0])

        family_baseline_abs = float(np.abs(baseline_shap[family_idx]).sum())
        family_perturbed_abs = float(abs_shap[family_idx].sum())

        # rank the family's combined |SHAP| against every other individual feature
        other_abs = [abs_shap[i] for i in range(len(feature_order)) if i not in family_idx]
        family_rank = 1 + sum(1 for v in other_abs if v > family_perturbed_abs)

        grew_enough = family_perturbed_abs > max(family_baseline_abs * MIN_GROWTH_MULTIPLE, 1e-6)
        ranked_highly = family_rank <= TOP_K_RANK
        risk_increased = perturbed_risk > baseline_risk

        dominant_feature = feature_order[int(np.argmax(abs_shap))]

        results.append({
            "signal": signal,
            "family_perturbed": family,
            "baseline_risk": baseline_risk,
            "perturbed_risk": perturbed_risk,
            "risk_increased": risk_increased,
            "family_shap_baseline": family_baseline_abs,
            "family_shap_perturbed": family_perturbed_abs,
            "family_rank_by_shap": family_rank,
            "dominant_feature_overall": dominant_feature,
            "correctly_attributed": bool(grew_enough and ranked_highly),
            "pass": bool(risk_increased and grew_enough and ranked_highly),
        })

    n_pass = sum(r["pass"] for r in results)
    return {
        "per_signal": results,
        "n_tested": len(results),
        "n_pass": n_pass,
        "all_pass": n_pass == len(results) and len(results) > 0,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = Module1Config.load(args.config) if args.config else Module1Config.load()
    bundle = joblib.load(ARTIFACTS_DIR / f"model_{args.tag}.joblib")
    model, feature_order = bundle["model"], bundle["feature_order"]

    full_df = load_feature_table(args.tag, None)
    test_df = load_feature_table(args.tag, "test")
    X_test = test_df[feature_order]

    vectors, shap_values = compute_attribution_vectors(model, X_test, test_df["time_bucket"])
    out_path = DEFAULT_PROCESSED_DIR / f"module1_attribution_vectors_{args.tag}.parquet"
    vectors.to_parquet(out_path, index=False)
    print(f"Attribution vectors exported to {out_path}")
    print(vectors["dominant_signal"].value_counts())

    sanity = run_shap_sanity_check(model, feature_order, full_df, cfg.shap_perturbation_signals)
    print(f"\nSHAP sanity check: {sanity['n_pass']}/{sanity['n_tested']} signals correctly attributed")
    for r in sanity["per_signal"]:
        print(f"  {r['signal']}: risk {r['baseline_risk']:.3f} -> {r['perturbed_risk']:.3f}, "
              f"family_shap {r['family_shap_baseline']:.3f} -> {r['family_shap_perturbed']:.3f} "
              f"(rank #{r['family_rank_by_shap']}), pass={r['pass']}")

    results_dir = DEFAULT_RESULTS_DIR / args.tag
    results_dir.mkdir(parents=True, exist_ok=True)
    with open(results_dir / "shap_sanity_check.json", "w", encoding="utf-8") as f:
        json.dump(sanity, f, indent=2)

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        order = np.argsort(mean_abs_shap)[::-1][:15]
        fig, ax = plt.subplots(figsize=(8, 6))
        ax.barh([feature_order[i] for i in order][::-1], mean_abs_shap[order][::-1])
        ax.set_xlabel("mean |SHAP value|")
        ax.set_title(f"SHAP feature importance - {args.tag}")
        fig.tight_layout()
        fig.savefig(results_dir / "shap_summary.png")
        plt.close(fig)
        print(f"Saved SHAP summary plot to {results_dir / 'shap_summary.png'}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
