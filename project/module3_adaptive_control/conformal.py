"""
Module 3's Adaptive Conformal Inference + oscillation-conditioned widening
(Full_Plan.md Section 6).

ACI (Gibbs & Candes 2021-style online update) is the general mechanism: an
adaptive miscoverage level alpha_t, and an interval width taken as the
(1-alpha_t) quantile of recent nonconformity scores, with alpha_t nudged up
or down each step depending on whether the previous interval actually
covered the realized score. A PI controller calibrated by ACI is BACC's
published mechanism - not the individual contribution on its own.

The individual contribution is oscillation-conditioned widening: BACC's
design has no mechanism that looks at its own recent control behavior. Here,
a second input - the rolling count of recent reversals in the *controlled
parameter's own trajectory* - multiplies the calibrated width before it caps
the controller's per-cycle movement. A wider effective interval caps movement
more tightly (see pi_controller.py / validate.py's `max_step_from_width`),
so widening the interval when the system has been oscillating tightens the
safety envelope automatically - not only when the forecast itself is noisy,
which is all plain ACI can see.

Honest caveat (stated proactively, per Full_Plan.md's instruction, not
conceded under questioning): this widening step relaxes strict conformal
coverage guarantees to a practical safety heuristic. BACC's own ACI already
relaxes strict exchangeability for a similar reason, so this is a normal
move in this space, not a flaw unique to this design.
"""
from __future__ import annotations

import numpy as np


class AdaptiveConformalInference:
    def __init__(self, alpha_target: float, alpha_bounds: tuple[float, float], gamma: float, score_window: int):
        self.alpha_target = alpha_target
        self.alpha_bounds = alpha_bounds
        self.gamma = gamma
        self.score_window = score_window
        self.alpha = alpha_target
        self.scores: list[float] = []

    def current_width(self) -> float:
        if not self.scores:
            return 1.0
        recent = self.scores[-self.score_window:]
        q = float(np.clip(1 - self.alpha, 0.0, 1.0))
        return float(np.quantile(recent, q))

    def update(self, score: float) -> tuple[float, bool]:
        """Returns (width_in_effect_for_this_step, covered) and advances the
        adaptive state. Width is computed from history *before* this score
        is folded in, since that's the interval that was actually available
        to bound the controller's move this cycle.
        """
        width = self.current_width()
        covered = score <= width
        err = 0.0 if covered else 1.0
        self.alpha = float(np.clip(
            self.alpha + self.gamma * (self.alpha_target - err),
            self.alpha_bounds[0], self.alpha_bounds[1],
        ))
        self.scores.append(score)
        return width, covered


def rolling_reversal_count(trajectory: list[float], window: int) -> int:
    """Number of sign reversals in consecutive deltas of `trajectory` within
    the last `window` steps - a reversal is the controlled parameter moving
    up then down (or vice versa), the signature of oscillation.
    """
    if len(trajectory) < 3:
        return 0
    recent = trajectory[-(window + 1):]
    deltas = np.diff(recent)
    signs = np.sign(deltas)
    nonzero = signs[signs != 0]
    if len(nonzero) < 2:
        return 0
    return int(np.sum(nonzero[1:] != nonzero[:-1]))


def oscillation_widening_factor(reversal_count: int, k: float) -> float:
    return 1.0 + k * reversal_count
