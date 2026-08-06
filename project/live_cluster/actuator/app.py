"""
Phase 6's actuator: the component Phase 5 deliberately did not build. None
of Module 1/2/3's live controllers take a scaling action - they only
compute/expose a signal. This service closes that gap for the ablation's
non-baseline arms by reading the relevant signal + threshold for its `ARM`
and PATCHing `teastore-webui`'s replica count directly, bypassing HPA/KEDA
(which must be removed for these arms - see docs/Phase6_Ablation_Design.md
Section 3 for why, and the arm-switching procedure).

Arms this actuator drives (see the design doc's table for the full
rationale of why each arm is defined this way):
  - m1_only: signal = Module 1's predicted_risk, threshold = fixed 0.5.
  - m3_only: signal = raw cpu_utilization (0-1 fraction), threshold =
    Module 3's /state threshold while running in its M3_MODE=cpu_direct
    ablated mode.
  - full:    signal = Module 1's predicted_risk, threshold = Module 3's
    /state threshold while running in its normal (unablated) mode.
  - baseline / m2_only: this service is scaled to 0 replicas - HPA/KEDA
    does the scaling, nothing for this actuator to do.

Band rule (symmetric, same for every arm so only the signal/threshold
source differs, per the design doc): signal > threshold -> +1 replica;
signal < threshold * 0.5 -> -1 replica; else hold. Bounded to
[MIN_REPLICAS, MAX_REPLICAS] - [1, 3] restored 2026-08-06 on the dedicated
Hetzner VM (see docs/Progress_Trace_MultiSignal_Autoscaling.md's
results_v2-on-cloud-VM section). Was temporarily [1, 2] on 2026-07-30 only
because the local host couldn't sustain even one trial's setup phase at
ceiling=3 - not a retraction of the results_v2 study's actual design, which
has always been [1, 3]; restored now that this runs on a host with real
dedicated headroom instead of memory shared with Windows/WSL2/Docker
Desktop/VS Code. MUST always match the HPA/KEDA baselines' own ceiling
(teastore/hpa-baseline.yaml, teastore/keda-baseline.yaml) or the arms
wouldn't be comparable - change all three together, never one alone.
Rate limited by COOLDOWN_SECONDS (mirrors HPA's default stabilization
window) so no arm gets a reaction-speed advantage purely from actuator
naivety.
"""
from __future__ import annotations

import json
import os
import ssl
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ARM = os.environ.get("ARM", "m1_only")
MODULE1_URL = os.environ.get("MODULE1_URL", "http://module1-controller:8000/risk")
MODULE3_URL = os.environ.get("MODULE3_URL", "http://module3-controller:8091/state")

NAMESPACE = os.environ.get("NAMESPACE", "default")
TARGET_DEPLOYMENT = os.environ.get("TARGET_DEPLOYMENT", "teastore-webui")

ACT_INTERVAL_SECONDS = float(os.environ.get("ACT_INTERVAL_SECONDS", "30"))
COOLDOWN_SECONDS = float(os.environ.get("COOLDOWN_SECONDS", "90"))
MIN_REPLICAS = int(os.environ.get("MIN_REPLICAS", "1"))
MAX_REPLICAS = int(os.environ.get("MAX_REPLICAS", "3"))
# 0.08, not 0.5: the first-pass ablation run found Module 1's predicted_risk
# on TeaStore actually operates in roughly a 0.003-0.3 range (see
# Progress_Trace.md's Phase 6 section) - a naive "prior sense of scale"
# threshold of 0.5 sat above nearly every observed value, so m1_only never
# scaled at all in that run. 0.08 sits inside the range risk actually
# occupies, recalibrated from real data rather than guessed.
FIXED_THRESHOLD = float(os.environ.get("FIXED_THRESHOLD", "0.08"))

SA_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")
K8S_API = f"https://{os.environ.get('KUBERNETES_SERVICE_HOST', 'kubernetes.default.svc')}:{os.environ.get('KUBERNETES_SERVICE_PORT', '443')}"


def _k8s_request(path: str, method: str = "GET", body: dict | None = None, content_type: str = "application/json") -> dict:
    token = (SA_DIR / "token").read_text().strip()
    ctx = ssl.create_default_context(cafile=str(SA_DIR / "ca.crt"))
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{K8S_API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
    )
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return json.loads(resp.read())


def _http_get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def get_replicas() -> int:
    dep = _k8s_request(f"/apis/apps/v1/namespaces/{NAMESPACE}/deployments/{TARGET_DEPLOYMENT}")
    return int(dep.get("spec", {}).get("replicas", MIN_REPLICAS))


def set_replicas(n: int) -> None:
    _k8s_request(
        f"/apis/apps/v1/namespaces/{NAMESPACE}/deployments/{TARGET_DEPLOYMENT}",
        method="PATCH",
        body={"spec": {"replicas": n}},
        content_type="application/merge-patch+json",
    )


def read_signal_and_threshold() -> tuple[float | None, float | None]:
    """Returns (signal, threshold) for the configured ARM, or (None, None)
    if the upstream module(s) aren't ready yet."""
    try:
        m1 = _http_get_json(MODULE1_URL)
    except (urllib.error.URLError, OSError, TimeoutError):
        return None, None

    risk = m1.get("predicted_risk")
    bucket = m1.get("last_bucket") or {}
    cpu_fraction = bucket.get("cpu_utilization")
    cpu_fraction = cpu_fraction / 100.0 if cpu_fraction is not None else None

    if ARM == "m1_only":
        return risk, FIXED_THRESHOLD

    if ARM in ("m3_only", "full"):
        try:
            m3 = _http_get_json(MODULE3_URL)
        except (urllib.error.URLError, OSError, TimeoutError):
            return None, None
        threshold = m3.get("threshold")
        signal = cpu_fraction if ARM == "m3_only" else risk
        return signal, threshold

    return None, None


class ActuatorLoop:
    def __init__(self):
        self.lock = threading.Lock()
        self.last_action_time = 0.0
        self.state: dict = {"arm": ARM, "cycles": 0}
        self.error: str | None = None

    def run_forever(self) -> None:
        while True:
            try:
                self._run_one_cycle()
                self.error = None
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.error = f"{type(exc).__name__}: {exc}"
            time.sleep(ACT_INTERVAL_SECONDS)

    def _run_one_cycle(self) -> None:
        signal, threshold = read_signal_and_threshold()
        replicas = get_replicas()
        now = time.monotonic()
        decision = "hold"
        cooling_down = (now - self.last_action_time) < COOLDOWN_SECONDS

        if signal is not None and threshold is not None:
            if signal > threshold and replicas < MAX_REPLICAS and not cooling_down:
                set_replicas(replicas + 1)
                decision = "scale_up"
                replicas += 1
                self.last_action_time = now
            elif signal < threshold * 0.5 and replicas > MIN_REPLICAS and not cooling_down:
                set_replicas(replicas - 1)
                decision = "scale_down"
                replicas -= 1
                self.last_action_time = now

        with self.lock:
            self.state = {
                "arm": ARM,
                "signal": signal,
                "threshold": threshold,
                "replicas": replicas,
                "decision": decision,
                "cooling_down": cooling_down,
                "cycles": self.state.get("cycles", 0) + 1,
                "last_updated": time.time(),
            }


loop = ActuatorLoop()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
        elif self.path == "/state":
            with loop.lock:
                state = dict(loop.state)
                state["error"] = loop.error
            body = json.dumps(state).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()


def main() -> None:
    threading.Thread(target=loop.run_forever, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", 8092), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
