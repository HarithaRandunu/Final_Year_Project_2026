"""
Module 3's live Kubernetes port (Phase 5): the adaptive control loop that
wraps the other two modules - polls Module 1's live predicted_risk, runs
the exact same PI + Adaptive Conformal Inference + oscillation-conditioned
widening logic as module3_adaptive_control/validate.py's `run_arm(..., mode
="full")`, and exposes the resulting live-adaptive alert threshold. Also
polls Module 2's extender state each cycle so its own /state output gives
one place to see all three modules' live status together - "wrapping" in
the sense of reading and reporting on both, not (in this Phase 5 pass)
feeding its threshold decision back into Module 2's reward function, which
would need deeper wiring than this phase's time budget covers - disclosed,
not hidden.

`PIController`, `AdaptiveConformalInference`, `rolling_reversal_count`, and
`oscillation_widening_factor` below are exact copies of
module3_adaptive_control/{pi_controller,conformal}.py's classes/functions
(not cross-package imports - same reasoning as Modules 1 and 2's
controllers: keeps each container self-contained). Config values (kp, ki,
oscillation_k=4.0, etc.) are read from the same configs/module3_default.json
tuned during Phase 3B - not re-guessed for this live pass.

Nonconformity score, live analog of validate.py's `score = abs(actual -
risk)`: Module 1's `violation_now` at time t is the realized outcome that
Module 1's predicted_risk at time t-1 was implicitly forecasting (mirrors
how the offline label was built: label_next_violation = violation_now
shifted back one bucket). So each cycle scores the *previous* cycle's
predicted_risk against *this* cycle's violation_now, then folds in the
current predicted_risk as this cycle's own forecast for next time.
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

MODULE1_URL = os.environ.get("MODULE1_URL", "http://module1-controller:8000/risk")
MODULE2_URL = os.environ.get("MODULE2_URL", "http://module2-extender:8090/state")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "120"))

# Phase 6 addition (see docs/Phase6_Ablation_Design.md Section 3): M3_MODE
# "risk" is Phase 5's original, unablated loop (control_signal = Module 1's
# predicted_risk) - this is the "full" arm's threshold source. "cpu_direct"
# is the m3_only ablation: same PI+ACI+widening machinery, but fed raw
# cpu_utilization instead of M1's fused risk, so it can be compared against
# baseline's fixed-threshold HPA on the *same* underlying signal. Module 1
# is still polled in both modes as a passive sensor (violation_now ground
# truth, and cpu_utilization itself comes from M1's live_resource_signals).
M3_MODE = os.environ.get("M3_MODE", "risk")
CPU_SETPOINT = float(os.environ.get("CPU_SETPOINT", "0.5"))

SETPOINT = float(os.environ.get("SETPOINT", "0.10"))
KP = float(os.environ.get("KP", "0.6"))
KI = float(os.environ.get("KI", "0.15"))
INITIAL_THRESHOLD = float(os.environ.get("INITIAL_THRESHOLD", "0.10"))
THRESHOLD_BOUNDS = (0.01, 0.9)
BASE_MAX_STEP = float(os.environ.get("BASE_MAX_STEP", "0.05"))
WIDTH_SENSITIVITY = float(os.environ.get("WIDTH_SENSITIVITY", "3.0"))
ALPHA_TARGET = float(os.environ.get("ALPHA_TARGET", "0.10"))
ALPHA_BOUNDS = (0.02, 0.5)
ACI_GAMMA = float(os.environ.get("ACI_GAMMA", "0.05"))
SCORE_WINDOW = int(os.environ.get("SCORE_WINDOW", "20"))
OSCILLATION_WINDOW = int(os.environ.get("OSCILLATION_WINDOW", "8"))
OSCILLATION_K = float(os.environ.get("OSCILLATION_K", "4.0"))


class PIController:
    """Exact copy of module3_adaptive_control/pi_controller.py's class."""

    def __init__(self, kp: float, ki: float, setpoint: float, initial_value: float, bounds: tuple[float, float]):
        self.kp = kp
        self.ki = ki
        self.setpoint = setpoint
        self.value = initial_value
        self.bounds = bounds
        self.integral = 0.0
        self._integral_limit = 1.0 / self.ki if self.ki else float("inf")

    def step(self, measured_value: float, max_step: float) -> float:
        error = measured_value - self.setpoint
        at_lower = self.value <= self.bounds[0] + 1e-9
        at_upper = self.value >= self.bounds[1] - 1e-9
        blocked = (at_lower and error > 0) or (at_upper and error < 0)
        if not blocked:
            self.integral = max(-self._integral_limit, min(self._integral_limit, self.integral + error))
        raw_output = self.kp * error + self.ki * self.integral
        step = max(-max_step, min(max_step, -raw_output))
        self.value = max(self.bounds[0], min(self.bounds[1], self.value + step))
        return self.value


class AdaptiveConformalInference:
    """Exact copy of module3_adaptive_control/conformal.py's class."""

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


def _http_get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


class ControlLoop:
    def __init__(self):
        effective_setpoint = CPU_SETPOINT if M3_MODE == "cpu_direct" else SETPOINT
        self.pi = PIController(KP, KI, effective_setpoint, INITIAL_THRESHOLD, THRESHOLD_BOUNDS)
        self.aci = AdaptiveConformalInference(ALPHA_TARGET, ALPHA_BOUNDS, ACI_GAMMA, SCORE_WINDOW)
        self.trajectory: list[float] = [INITIAL_THRESHOLD]
        self.prev_control_signal: float | None = None
        self.lock = threading.Lock()
        self.latest_state: dict = {}
        self.error: str | None = None
        self.cycles = 0

    def run_forever(self) -> None:
        while True:
            try:
                self._run_one_cycle()
                self.error = None
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.error = f"{type(exc).__name__}: {exc}"
            time.sleep(POLL_SECONDS)

    def _run_one_cycle(self) -> None:
        m1 = _http_get_json(MODULE1_URL)
        risk = m1.get("predicted_risk")
        bucket = m1.get("last_bucket") or {}
        violation_now = bucket.get("violation_now")
        cpu_utilization = bucket.get("cpu_utilization")
        try:
            m2_state = _http_get_json(MODULE2_URL)
        except (urllib.error.URLError, OSError):
            m2_state = None

        if M3_MODE == "cpu_direct":
            control_signal = cpu_utilization / 100.0 if cpu_utilization is not None else None
        else:
            control_signal = risk

        if control_signal is None or violation_now is None:
            with self.lock:
                self.error = "module1 not ready yet (no control signal/violation_now)"
            return

        # Score the *previous* cycle's forecast against *this* cycle's
        # realized outcome (see module docstring) - skip on the very first
        # cycle, when there's no previous forecast yet.
        if self.prev_control_signal is not None:
            score = abs(float(violation_now) - self.prev_control_signal)
            width, covered = self.aci.update(score)
            rev_count = rolling_reversal_count(self.trajectory, OSCILLATION_WINDOW)
            mult = oscillation_widening_factor(rev_count, OSCILLATION_K)
            widened_width = width * mult
            max_step = BASE_MAX_STEP / (1 + WIDTH_SENSITIVITY * widened_width)
            threshold = self.pi.step(control_signal, max_step)
            self.trajectory.append(threshold)
        else:
            score, width, covered, rev_count, mult = None, None, None, 0, 1.0
            threshold = self.pi.value

        alert = control_signal > threshold
        self.cycles += 1

        with self.lock:
            self.latest_state = {
                "mode": M3_MODE,
                "control_signal": control_signal,
                "predicted_risk": risk,
                "violation_now": violation_now,
                "score_vs_previous_forecast": score,
                "conformal_width": width,
                "covered": covered,
                "reversal_count": rev_count,
                "widening_multiplier": mult,
                "aci_alpha": self.aci.alpha,
                "threshold": threshold,
                "alert": alert,
                "cycles": self.cycles,
                "module2_bandit_state": m2_state,
            }
        self.prev_control_signal = control_signal


loop = ControlLoop()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
        elif self.path == "/state":
            with loop.lock:
                state = dict(loop.latest_state)
                state["error"] = loop.error
            body = json.dumps(state).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/metrics":
            with loop.lock:
                threshold = loop.latest_state.get("threshold")
                alert = loop.latest_state.get("alert")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()
            lines = [
                "# HELP module3_alert_threshold Module 3's live-adaptive SLA-alert threshold.",
                "# TYPE module3_alert_threshold gauge",
                f"module3_alert_threshold {threshold if threshold is not None else 0.0}",
                "# HELP module3_alert_active Whether Module 3 is currently in an alert state (0/1).",
                "# TYPE module3_alert_active gauge",
                f"module3_alert_active {1 if alert else 0}",
            ]
            self.wfile.write(("\n".join(lines) + "\n").encode())
        else:
            self.send_response(404)
            self.end_headers()


def main() -> None:
    threading.Thread(target=loop.run_forever, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", 8091), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
