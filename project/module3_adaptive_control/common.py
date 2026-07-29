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


def adjust_params(predicted_risk: float, actual_outcome: float, cfg: "Module3Config" = None,
                   mode: str = "full", tag: str = "primary") -> dict:
    """Module 3's "decide right now" function (Full_Plan.md Section 13.2),
    for the Phase 8 dashboard's what-if panel. `PIController`/
    `AdaptiveConformalInference` are stateful - they need realistic
    accumulated history to give a meaningful answer, not a cold-start
    reading - so this replays the validated walk-forward out-of-sample
    series (a small, already-committed parquet; no dependency on the raw
    dataset) once to rebuild that state, then applies exactly one more
    step for the given (predicted_risk, actual_outcome) pair.

    mode: "full" (PI + ACI + oscillation widening, the individual
    contribution) or "pi_conformal" (widening disabled, for comparison -
    matches validate.py's own three-way comparison arms).
    """
    from conformal import AdaptiveConformalInference, oscillation_widening_factor, rolling_reversal_count
    from pi_controller import PIController

    cfg = cfg or Module3Config.load()
    bursty = load_walkforward_oos_series(tag)

    pi = PIController(cfg.kp, cfg.ki, cfg.setpoint, cfg.initial_threshold, tuple(cfg.threshold_bounds))
    aci = AdaptiveConformalInference(cfg.alpha_target, tuple(cfg.alpha_bounds), cfg.aci_gamma, cfg.score_window)
    trajectory = [cfg.initial_threshold]

    def step(risk: float, actual: float) -> tuple[float, float, int, bool]:
        score = abs(actual - risk)
        width, covered = aci.update(score)
        if mode == "full":
            rev_count = rolling_reversal_count(trajectory, cfg.oscillation_window)
            mult = oscillation_widening_factor(rev_count, cfg.oscillation_k)
        else:
            rev_count, mult = 0, 1.0
        widened_width = width * mult
        max_step = cfg.base_max_step / (1 + cfg.width_sensitivity * widened_width)
        threshold = pi.step(risk, max_step)
        trajectory.append(threshold)
        return width, mult, rev_count, covered

    for _, row in bursty.iterrows():
        step(float(row["predicted_risk"]), float(row["actual_outcome"]))

    previous_threshold = trajectory[-1]
    width, mult, rev_count, covered = step(predicted_risk, actual_outcome)
    new_threshold = trajectory[-1]

    return {
        "mode": mode,
        "previous_threshold": previous_threshold,
        "new_threshold": new_threshold,
        "alert": bool(predicted_risk > new_threshold),
        "conformal_width": width,
        "widening_multiplier": mult,
        "reversal_count": rev_count,
        "covered_by_previous_interval": covered,
        "n_historical_steps_replayed": len(bursty),
    }


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
