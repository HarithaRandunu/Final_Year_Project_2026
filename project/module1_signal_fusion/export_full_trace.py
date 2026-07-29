"""
Phase 4 support: export Module 1's predicted risk + SHAP attribution for
every bucket in the full trace (not just the held-out test set), so the
Phase 4 integration script has one continuous decision log to wire into
Modules 2 and 3. Doesn't touch Module 1's own finalized validation
files/results - same pattern as export_walkforward_oos.py.

Note: predictions for the training-set portion of the trace (buckets 0-269)
are in-sample, made with the model that was fit on exactly those rows - this
file exists to demonstrate coherent end-to-end wiring for Phase 4, not to
make a new accuracy claim. Phases 2's already-reported walk-forward/holdout
numbers remain the actual validation evidence.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_PROCESSED_DIR, load_feature_table
from shap_attribution import compute_attribution_vectors

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    args = parser.parse_args(argv)

    bundle = joblib.load(ARTIFACTS_DIR / f"model_{args.tag}.joblib")
    model, feature_order = bundle["model"], bundle["feature_order"]

    full_df = load_feature_table(args.tag, None)
    X = full_df[feature_order]

    predicted_risk = model.predict_proba(X)[:, 1]
    vectors, _ = compute_attribution_vectors(model, X, full_df["time_bucket"])

    decision_log = full_df[["time_bucket", "violation_now", "label_next_violation"]].copy()
    decision_log["predicted_risk"] = predicted_risk
    decision_log["actual_outcome"] = full_df["label_next_violation"]
    decision_log["dominant_signal"] = vectors["dominant_signal"].values
    decision_log["dominant_weight"] = vectors["dominant_weight"].values

    out_path = DEFAULT_PROCESSED_DIR / f"module1_full_trace_{args.tag}.parquet"
    decision_log.to_parquet(out_path, index=False)
    print(f"Saved {len(decision_log)} rows to {out_path}")
    print(f"Predicted risk range: [{predicted_risk.min():.4f}, {predicted_risk.max():.4f}]")


if __name__ == "__main__":
    main()
