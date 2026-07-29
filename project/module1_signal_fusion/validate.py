"""
Module 1 full validation suite (Full_Plan.md Sections 4 and 7):
- Held-out AUC-ROC/AUC-PR and calibration for the fused model
- CPU-only baseline (logistic regression) comparison
- Walk-forward cross-validation across expanding time folds
- Lead-time comparison (fused vs. CPU-only) on the walk-forward out-of-sample series
- Generalization check on the secondary msname
- SHAP sanity check (imported from shap_attribution.py)

Writes results/module1/<tag>/metrics.json plus calibration and lead-time plots,
per Full_Plan.md Section 13.2 (structured artifacts, not console-only).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_RESULTS_DIR, Module1Config, feature_columns, load_feature_table, split_xy, train_lgbm
from shap_attribution import run_shap_sanity_check

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def train_cpu_baseline(train_df: pd.DataFrame, cpu_cols: list[str], seed: int):
    # Delta columns are NaN for the first few rows of any table (not enough
    # history yet) - LightGBM handles that natively but LogisticRegression
    # doesn't, so treat "no history yet" as "no known change" (0).
    scaler = StandardScaler()
    X_train = scaler.fit_transform(train_df[cpu_cols].fillna(0))
    y_train = train_df["label_next_violation"]
    clf = LogisticRegression(class_weight="balanced", random_state=seed, max_iter=1000)
    clf.fit(X_train, y_train)
    return clf, scaler


def predict_cpu_baseline(clf, scaler, df: pd.DataFrame, cpu_cols: list[str]) -> np.ndarray:
    return clf.predict_proba(scaler.transform(df[cpu_cols].fillna(0)))[:, 1]


def safe_auc(y_true, y_score, fn) -> float | None:
    if len(set(y_true)) < 2:
        return None
    return float(fn(y_true, y_score))


def walk_forward_folds(n_rows: int, min_train_size: int, n_splits: int) -> list[tuple[range, range]]:
    test_size = (n_rows - min_train_size) // n_splits
    if test_size < 1:
        raise ValueError("Not enough rows for the requested walk-forward configuration")
    folds = []
    train_end = min_train_size
    for _ in range(n_splits):
        test_start = train_end
        test_end = min(test_start + test_size, n_rows)
        if test_start >= n_rows:
            break
        folds.append((range(0, train_end), range(test_start, test_end)))
        train_end = test_end
    return folds


def run_walk_forward(full_df: pd.DataFrame, cfg: Module1Config) -> dict:
    cols = feature_columns(full_df)
    folds = walk_forward_folds(len(full_df), cfg.walk_forward_min_train_size, cfg.walk_forward_n_splits)

    fold_metrics = []
    oos_rows = []
    for i, (train_idx, test_idx) in enumerate(folds):
        train_fold = full_df.iloc[list(train_idx)]
        test_fold = full_df.iloc[list(test_idx)]

        X_train, y_train = split_xy(train_fold, cols)
        X_test, y_test = split_xy(test_fold, cols)
        fused_model = train_lgbm(X_train, y_train, cfg)
        fused_pred = fused_model.predict_proba(X_test)[:, 1]

        baseline_clf, scaler = train_cpu_baseline(train_fold, cfg.cpu_only_cols, cfg.seed)
        baseline_pred = predict_cpu_baseline(baseline_clf, scaler, test_fold, cfg.cpu_only_cols)

        fold_metrics.append({
            "fold": i,
            "train_size": len(train_fold),
            "test_size": len(test_fold),
            "fused_auc_roc": safe_auc(y_test, fused_pred, roc_auc_score),
            "fused_auc_pr": safe_auc(y_test, fused_pred, average_precision_score),
            "baseline_auc_roc": safe_auc(y_test, baseline_pred, roc_auc_score),
            "baseline_auc_pr": safe_auc(y_test, baseline_pred, average_precision_score),
        })

        oos_rows.append(pd.DataFrame({
            "time_bucket": test_fold["time_bucket"].values,
            "violation_now": test_fold["violation_now"].values,
            "actual": y_test.values,
            "fused_pred": fused_pred,
            "baseline_pred": baseline_pred,
        }))

    oos = pd.concat(oos_rows, ignore_index=True).sort_values("time_bucket").reset_index(drop=True)

    def mean_of(key):
        vals = [f[key] for f in fold_metrics if f[key] is not None]
        return float(np.mean(vals)) if vals else None

    return {
        "folds": fold_metrics,
        "mean_fused_auc_roc": mean_of("fused_auc_roc"),
        "mean_fused_auc_pr": mean_of("fused_auc_pr"),
        "mean_baseline_auc_roc": mean_of("baseline_auc_roc"),
        "mean_baseline_auc_pr": mean_of("baseline_auc_pr"),
        "oos_series": oos,
    }


def alert_threshold_for_rate(oos: pd.DataFrame, pred_col: str, target_alert_rate: float) -> float:
    """The quantile cutoff that makes this model flag target_alert_rate of the
    OOS series as positive. Comparing two models at a fixed raw threshold
    (e.g. 0.5) is unfair when their score distributions differ wildly - a
    model that's simply more "trigger-happy" would appear to have better lead
    time purely by flagging more of the timeline, not by anticipating any
    specific onset better. Matching alert rates first isolates genuine
    early-warning quality from raw triggering frequency.
    """
    return float(oos[pred_col].quantile(1 - target_alert_rate))


def lead_time_for_episodes(oos: pd.DataFrame, pred_col: str, threshold: float, max_lookback: int) -> list[int]:
    time_buckets = oos["time_bucket"].tolist()
    idx_map = {tb: i for i, tb in enumerate(time_buckets)}
    predicted_class = (oos[pred_col] >= threshold).astype(int).tolist()
    violation_now = oos["violation_now"].tolist()

    onsets = []
    prev = 0
    for tb, v in zip(time_buckets, violation_now):
        if v == 1 and prev == 0:
            onsets.append(tb)
        prev = v

    lead_times = []
    for onset_tb in onsets:
        lead = 0
        for lookback in range(1, max_lookback + 1):
            prior_tb = onset_tb - lookback
            if prior_tb not in idx_map:
                break
            if predicted_class[idx_map[prior_tb]] == 1:
                lead += 1
            else:
                break
        lead_times.append(lead)
    return lead_times


def run_lead_time_comparison(oos: pd.DataFrame, cfg: Module1Config) -> dict:
    fused_threshold = alert_threshold_for_rate(oos, "fused_pred", cfg.lead_time_target_alert_rate)
    baseline_threshold = alert_threshold_for_rate(oos, "baseline_pred", cfg.lead_time_target_alert_rate)

    fused_leads = lead_time_for_episodes(oos, "fused_pred", fused_threshold, cfg.lead_time_max_lookback)
    baseline_leads = lead_time_for_episodes(oos, "baseline_pred", baseline_threshold, cfg.lead_time_max_lookback)

    mean_fused = float(np.mean(fused_leads)) if fused_leads else 0.0
    mean_baseline = float(np.mean(baseline_leads)) if baseline_leads else 0.0

    return {
        "target_alert_rate": cfg.lead_time_target_alert_rate,
        "fused_threshold": fused_threshold,
        "baseline_threshold": baseline_threshold,
        "n_episodes": len(fused_leads),
        "fused_lead_times": fused_leads,
        "baseline_lead_times": baseline_leads,
        "mean_fused_lead_time": mean_fused,
        "mean_baseline_lead_time": mean_baseline,
        "fused_beats_baseline": bool(mean_fused > mean_baseline and mean_fused > 0),
    }


def run_generalization_check(tag: str, cfg: Module1Config) -> dict:
    train_df = load_feature_table(tag, "train")
    test_df = load_feature_table(tag, "test")
    cols = feature_columns(train_df)
    X_train, y_train = split_xy(train_df, cols)
    X_test, y_test = split_xy(test_df, cols)

    model = train_lgbm(X_train, y_train, cfg)
    pred = model.predict_proba(X_test)[:, 1]

    return {
        "tag": tag,
        "n_train": len(train_df),
        "n_test": len(test_df),
        "auc_roc": safe_auc(y_test, pred, roc_auc_score),
        "auc_pr": safe_auc(y_test, pred, average_precision_score),
        "brier_score": float(brier_score_loss(y_test, pred)),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    parser.add_argument("--generalization-tag", default="secondary")
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = Module1Config.load(args.config) if args.config else Module1Config.load()

    bundle = joblib.load(ARTIFACTS_DIR / f"model_{args.tag}.joblib")
    model, feature_order = bundle["model"], bundle["feature_order"]

    train_df = load_feature_table(args.tag, "train")
    test_df = load_feature_table(args.tag, "test")
    full_df = load_feature_table(args.tag, None)

    X_test, y_test = split_xy(test_df, feature_order)
    fused_test_pred = model.predict_proba(X_test)[:, 1]

    baseline_clf, scaler = train_cpu_baseline(train_df, cfg.cpu_only_cols, cfg.seed)
    baseline_test_pred = predict_cpu_baseline(baseline_clf, scaler, test_df, cfg.cpu_only_cols)

    holdout = {
        "fused_auc_roc": safe_auc(y_test, fused_test_pred, roc_auc_score),
        "fused_auc_pr": safe_auc(y_test, fused_test_pred, average_precision_score),
        "fused_brier": float(brier_score_loss(y_test, fused_test_pred)),
        "baseline_auc_roc": safe_auc(y_test, baseline_test_pred, roc_auc_score),
        "baseline_auc_pr": safe_auc(y_test, baseline_test_pred, average_precision_score),
        "baseline_brier": float(brier_score_loss(y_test, baseline_test_pred)),
        "note": "Single-holdout AUC-PR is high-variance here given how few positives the test split has; treat the walk-forward mean below as the more reliable estimate.",
    }

    print("=== Held-out test set ===")
    print(json.dumps(holdout, indent=2))

    print("\n=== Walk-forward cross-validation ===")
    wf = run_walk_forward(full_df, cfg)
    oos = wf.pop("oos_series")
    print(json.dumps(wf, indent=2))

    print("\n=== Lead-time comparison (on walk-forward OOS series) ===")
    lead_time = run_lead_time_comparison(oos, cfg)
    print(json.dumps({k: v for k, v in lead_time.items() if k not in ("fused_lead_times", "baseline_lead_times")}, indent=2))

    print(f"\n=== Generalization check: {args.generalization_tag} ===")
    generalization = run_generalization_check(args.generalization_tag, cfg)
    print(json.dumps(generalization, indent=2))

    print("\n=== SHAP sanity check ===")
    sanity = run_shap_sanity_check(model, feature_order, full_df, cfg.shap_perturbation_signals)
    print(f"{sanity['n_pass']}/{sanity['n_tested']} signals correctly attributed, all_pass={sanity['all_pass']}")

    results_dir = DEFAULT_RESULTS_DIR / args.tag
    results_dir.mkdir(parents=True, exist_ok=True)

    metrics = {
        "tag": args.tag,
        "holdout": holdout,
        "walk_forward": wf,
        "lead_time_comparison": lead_time,
        "generalization_check": generalization,
        "shap_sanity_check": sanity,
        "pass_criteria": {
            "fused_beats_cpu_baseline_auc_pr_holdout": (
                holdout["fused_auc_pr"] is not None and holdout["baseline_auc_pr"] is not None
                and holdout["fused_auc_pr"] > holdout["baseline_auc_pr"]
            ),
            "fused_beats_cpu_baseline_auc_pr_walkforward": (
                wf["mean_fused_auc_pr"] is not None and wf["mean_baseline_auc_pr"] is not None
                and wf["mean_fused_auc_pr"] > wf["mean_baseline_auc_pr"]
            ),
            "lead_time_positive_and_beats_baseline": lead_time["fused_beats_baseline"],
            "shap_sanity_check_all_pass": sanity["all_pass"],
            "shap_sanity_check_majority_pass": sanity["n_pass"] / sanity["n_tested"] > 0.5 if sanity["n_tested"] else False,
        },
    }
    with open(results_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nSaved consolidated metrics to {results_dir / 'metrics.json'}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        # Calibration / reliability diagram
        n_bins = 5 if y_test.sum() >= 5 else 3
        frac_pos, mean_pred = calibration_curve(y_test, fused_test_pred, n_bins=n_bins, strategy="quantile")
        fig, ax = plt.subplots(figsize=(5, 5))
        ax.plot([0, 1], [0, 1], "k--", label="perfectly calibrated")
        ax.plot(mean_pred, frac_pos, "o-", label="fused model")
        ax.set_xlabel("mean predicted risk")
        ax.set_ylabel("observed violation frequency")
        ax.set_title(f"Calibration - {args.tag}")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "calibration.png")
        plt.close(fig)

        # Walk-forward fold AUC-PR comparison
        folds = wf["folds"]
        fig, ax = plt.subplots(figsize=(7, 4))
        xs = [f["fold"] for f in folds]
        ax.plot(xs, [f["fused_auc_pr"] for f in folds], "o-", label="fused")
        ax.plot(xs, [f["baseline_auc_pr"] for f in folds], "o-", label="CPU-only baseline")
        ax.set_xlabel("walk-forward fold")
        ax.set_ylabel("AUC-PR")
        ax.set_title(f"Walk-forward AUC-PR by fold - {args.tag}")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "walk_forward_auc_pr.png")
        plt.close(fig)

        print(f"Saved plots to {results_dir}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
