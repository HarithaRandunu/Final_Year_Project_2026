"""
Shared config, data loading, and model helpers for Module 1 (Signal Fusion).

Kept separate from train.py/shap_attribution.py/validate.py so every entry
point (including a future dashboard, per Full_Plan.md Section 13.2) can import
`predict_risk` without pulling in training or CLI code.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import lightgbm as lgb
import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DEFAULT_CONFIG_PATH = PROJECT_DIR / "configs" / "module1_default.json"
DEFAULT_PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
DEFAULT_RESULTS_DIR = PROJECT_DIR / "results" / "module1"

LABEL_COL = "label_next_violation"
ID_COLS = ("time_bucket",)
EXCLUDE_FROM_FEATURES = {"time_bucket", "label_next_violation"}


@dataclass
class Module1Config:
    seed: int = 42
    lgbm_params: dict = None
    decision_threshold: float = 0.5
    walk_forward_n_splits: int = 5
    walk_forward_min_train_size: int = 150
    lead_time_max_lookback: int = 6
    lead_time_target_alert_rate: float = 0.15
    cpu_only_cols: list = None
    shap_perturbation_signals: list = None

    @classmethod
    def load(cls, path: Path = DEFAULT_CONFIG_PATH) -> "Module1Config":
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        return cls(**d)


def load_feature_table(tag: str, split: str | None = None, processed_dir: Path = DEFAULT_PROCESSED_DIR) -> pd.DataFrame:
    """split: None (full table), 'train', or 'test'."""
    suffix = f"_{split}" if split else ""
    path = processed_dir / f"features_{tag}{suffix}.parquet"
    return pd.read_parquet(path)


def feature_columns(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns if c not in EXCLUDE_FROM_FEATURES]


def split_xy(df: pd.DataFrame, columns: list[str] | None = None) -> tuple[pd.DataFrame, pd.Series]:
    cols = columns if columns is not None else feature_columns(df)
    return df[cols], df[LABEL_COL]


def train_lgbm(X: pd.DataFrame, y: pd.Series, cfg: Module1Config) -> lgb.LGBMClassifier:
    model = lgb.LGBMClassifier(random_state=cfg.seed, verbosity=-1, **cfg.lgbm_params)
    model.fit(X, y)
    return model


def predict_risk(model: lgb.LGBMClassifier, signals: dict, feature_order: list[str]) -> float:
    """The 'decide right now' function (Full_Plan.md Section 13.2): a single typed
    call from raw signal values to a risk score, with no training/validation
    machinery involved. `signals` must contain every column in `feature_order`.
    """
    row = pd.DataFrame([[signals[col] for col in feature_order]], columns=feature_order)
    return float(model.predict_proba(row)[0, 1])
