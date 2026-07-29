"""
Module 3's PI controller (Full_Plan.md Section 6), isolated from the
conformal-bounding logic so it can be tested against hand-constructed
synthetic input first, per the task list, before wiring in real signals.

Controls a risk-alert `threshold`: if predicted_risk(t) > threshold(t), the
system is in an "alert" state. When recent predicted risk runs persistently
above the setpoint (the system is "running hot"), the controller lowers the
threshold to become more sensitive; when risk runs below setpoint, it raises
the threshold back to reduce alarm fatigue. Per-cycle movement is capped by
`max_step`, which the conformal-bounding layer (conformal.py) sets each
cycle - here it's just a plain parameter for isolated testing.
"""
from __future__ import annotations


class PIController:
    def __init__(self, kp: float, ki: float, setpoint: float, initial_value: float, bounds: tuple[float, float]):
        self.kp = kp
        self.ki = ki
        self.setpoint = setpoint
        self.value = initial_value
        self.bounds = bounds
        self.integral = 0.0
        # Complementary anti-windup: bound the integral term's own
        # contribution to at most a full-scale error-equivalent push
        # (ki * integral_limit == 1.0), regardless of how many consecutive
        # same-signed cycles occurred before the value ever technically hit
        # a bound. Without this, a long-enough saturated run before hitting
        # the bound can leave the integral so large that even the sign-based
        # unblocking above needs far more cycles to unwind than remain in
        # the trace - conditional blocking alone stops it from growing
        # *worse* once at a bound, but doesn't undo growth from before that.
        self._integral_limit = 1.0 / self.ki if self.ki else float("inf")

    def step(self, measured_value: float, max_step: float) -> float:
        error = measured_value - self.setpoint

        # Integrator-clamping anti-windup: block accumulation only when the
        # *value* is already at a bound AND the *current error's own sign*
        # would push further past it (error > 0 means "wants to decrease" -
        # i.e. push toward the lower bound; error < 0 means "wants to
        # increase" - toward the upper bound). A prior version instead
        # computed a tentative *output* (kp*error + ki*tentative_integral)
        # and checked its sign - but once the integral has grown huge from a
        # long saturated run, that output stays dominated by the stale
        # integral even after the real error has already reversed, so the
        # check kept reporting "still pushing into the bound" and blocked
        # recovery forever. Checking the error's own sign directly avoids
        # that trap entirely: a reversed error always gets to accumulate,
        # which is exactly the recovery path. Found via the Phase 4 full-trace
        # integration run, where the controller was stuck at the lower bound
        # for the last ~230 of 360 buckets and never recovered even once
        # predicted risk returned to calm for good.
        at_lower = self.value <= self.bounds[0] + 1e-9
        at_upper = self.value >= self.bounds[1] - 1e-9
        blocked = (at_lower and error > 0) or (at_upper and error < 0)

        if not blocked:
            self.integral = max(-self._integral_limit, min(self._integral_limit, self.integral + error))

        raw_output = self.kp * error + self.ki * self.integral
        step = max(-max_step, min(max_step, -raw_output))
        self.value = max(self.bounds[0], min(self.bounds[1], self.value + step))
        return self.value
