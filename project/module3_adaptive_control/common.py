"""
Shared config and data loading for Module 3 (Adaptive Control).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DEFAULT_CONFIG_PATH = PROJECT_DIR / "configs" / "module3_default.json"
DEFAULT_PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
DEFAULT_RESULTS_DIR = PROJECT_DIR / "results" / "module3"


@dataclass
class Module3Config:
    seed: int = 42
    setpoint: float = 0.10
    kp: float = 0.6
    ki: float = 0.15
    initial_threshold: float = 0.10
    threshold_bounds: Optional[list] = None
    base_max_step: float = 0.05
    width_sensitivity: float = 3.0
    alpha_target: float = 0.10
    alpha_bounds: Optional[list] = None
    aci_gamma: float = 0.05
    score_window: int = 20
    oscillation_window: int = 8
    oscillation_k: float = 0.3
    step_response_high: float = 0.6
    step_response_pre_steps: int = 15
    step_response_post_steps: int = 40

    @classmethod
    def load(cls, path: Path = DEFAULT_CONFIG_PATH) -> "Module3Config":
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        return cls(**d)


def load_holdout_residual_stream(tag: str = "primary") -> pd.DataFrame:
    """The literal 'held-out residual stream' Full_Plan.md Section 6 refers
    to - Module 1's true test-set predictions. Kept separate from the
    walk-forward series below because it's the most defensible artifact for
    the main walkthrough (genuinely never seen by the model in any capacity),
    even though (see validate.py) it turns out too thin for the bursty
    stress test specifically.
    """
    return pd.read_parquet(DEFAULT_PROCESSED_DIR / f"module1_residual_stream_{tag}.parquet")


def load_walkforward_oos_series(tag: str = "primary") -> pd.DataFrame:
    """A richer, still-genuinely-out-of-sample series spanning the trace's
    actual bursty plateau (Module 1's held-out test window happens to fall in
    a comparatively calm late stretch - see this module's validate.py for the
    finding). Produced by module1_signal_fusion/export_walkforward_oos.py - a
    small standalone script run once via subprocess, reusing Module 1's own
    walk-forward CV machinery without modifying Module 1's already-finalized
    files, and without the sys.modules collisions that direct cross-directory
    importing of two same-named "common.py"/"validate.py" files would cause.
    """
    path = DEFAULT_PROCESSED_DIR / f"module1_walkforward_oos_{tag}.parquet"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} not found - run `python ../module1_signal_fusion/export_walkforward_oos.py "
            f"--tag {tag}` first."
        )
    return pd.read_parquet(path)
