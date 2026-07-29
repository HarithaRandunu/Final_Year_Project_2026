"""
Elasticity metrics for the live ablation (docs/Phase6_Ablation_Design.md
Section 6) - the *exact* same definitions already implemented and
validated in module3_adaptive_control/validate.py::compute_elasticity_metrics
(sign reversals / std of a trajectory / alert-vs-actual-outcome
timeshares), just generalized to operate on any numeric trajectory and
boolean alert/outcome arrays rather than specifically a threshold
trajectory - so the same four numbers are comparable across all five
arms, including baseline and m2_only which have no adaptive threshold of
their own (their trajectory is the replica count instead).
"""
from __future__ import annotations

import numpy as np


def compute_elasticity_metrics(trajectory: list[float], alert: list[bool], actual_outcome: list[bool]) -> dict:
    traj = np.asarray(trajectory, dtype=float)
    alert_arr = np.asarray(alert, dtype=bool)
    outcome_arr = np.asarray(actual_outcome, dtype=bool)

    deltas = np.diff(traj)
    signs = np.sign(deltas)
    nonzero = signs[signs != 0]
    instability = int(np.sum(nonzero[1:] != nonzero[:-1])) if len(nonzero) > 1 else 0

    deviation = float(np.std(traj)) if len(traj) else 0.0

    over_provisioning = float((alert_arr & ~outcome_arr).mean()) if len(alert_arr) else 0.0
    under_provisioning = float((~alert_arr & outcome_arr).mean()) if len(alert_arr) else 0.0

    return {
        "instability_reversals": instability,
        "deviation_std": deviation,
        "over_provisioning_timeshare": over_provisioning,
        "under_provisioning_timeshare": under_provisioning,
    }


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, round(pct / 100.0 * (len(s) - 1))))
    return s[idx]
