"""
Module 1 training entry point (Full_Plan.md Section 4): train a LightGBM binary
classifier on the Phase 1 feature table and export the held-out residual
stream Module 3 needs (predicted_risk, actual_outcome, timestamp).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import joblib
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (
    DEFAULT_PROCESSED_DIR,
    Module1Config,
    feature_columns,
    load_feature_table,
    predict_risk,
    split_xy,
    train_lgbm,
)

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def train_and_export(tag: str, cfg: Module1Config, processed_dir: Path = DEFAULT_PROCESSED_DIR) -> dict:
    train_df = load_feature_table(tag, "train", processed_dir)
    test_df = load_feature_table(tag, "test", processed_dir)

    cols = feature_columns(train_df)
    X_train, y_train = split_xy(train_df, cols)
    X_test, y_test = split_xy(test_df, cols)

    model = train_lgbm(X_train, y_train, cfg)

    test_risk = model.predict_proba(X_test)[:, 1]
    train_risk = model.predict_proba(X_train)[:, 1]

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = ARTIFACTS_DIR / f"model_{tag}.joblib"
    joblib.dump({"model": model, "feature_order": cols}, model_path)

    residual_stream = pd.DataFrame({
        "time_bucket": test_df["time_bucket"].values,
        "predicted_risk": test_risk,
        "actual_outcome": y_test.values,
    })
    residual_path = processed_dir / f"module1_residual_stream_{tag}.parquet"
    residual_stream.to_parquet(residual_path, index=False)

    # sanity-check predict_risk() reproduces the same probabilities as predict_proba
    sample_row = X_test.iloc[0].to_dict()
    assert abs(predict_risk(model, sample_row, cols) - test_risk[0]) < 1e-9

    return {
        "tag": tag,
        "model_path": str(model_path),
        "residual_stream_path": str(residual_path),
        "feature_order": cols,
        "n_train": len(train_df),
        "n_test": len(test_df),
        "train_risk_mean": float(train_risk.mean()),
        "test_risk_mean": float(test_risk.mean()),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = Module1Config.load(args.config) if args.config else Module1Config.load()
    info = train_and_export(args.tag, cfg)
    print(f"Trained model for tag={info['tag']}: {info['n_train']} train / {info['n_test']} test rows")
    print(f"Model saved to {info['model_path']}")
    print(f"Residual stream exported to {info['residual_stream_path']}")
    print(f"Mean predicted risk: train={info['train_risk_mean']:.4f}, test={info['test_risk_mean']:.4f}")


if __name__ == "__main__":
    main()
