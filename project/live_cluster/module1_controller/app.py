"""
Module 1's live Kubernetes port (Phase 5): a custom controller / metrics
adapter that runs *inside* the cluster, computes a live feature vector for
teastore-webui, calls the same `predict_risk()` used in Phase 2's offline
validation, and exposes the result as a Prometheus-style gauge plus a JSON
endpoint Module 3's live control loop can poll.

Honest scope note (read before trusting the numbers this produces):
Module 1's model was trained on Alibaba cluster-trace-microservices-v2021
features (Phase 1). TeaStore is a different application on a different
cluster with a different traffic pattern, and several of the trained
feature columns have no faithful live equivalent here:
  - p95/p99_latency_ms, call_count: REAL - measured by actively probing
    teastore-webui's own HTTP endpoint on a timer.
  - cpu_utilization/memory_utilization: REAL - read from the Kubernetes
    metrics API, expressed as % of the pod's configured limit (the closest
    live analog to Alibaba's per-instance usage figures).
  - active_instances: REAL - live replica count from the Deployment.
  - HTTP_MCR/HTTP_RT vs providerRPC_MCR/providerRPC_RT: Alibaba's schema
    distinguishes inbound HTTP calls from outbound provider-RPC calls;
    TeaStore's webui has no equivalent second channel visible from here,
    so providerRPC_* is set equal to HTTP_* rather than fabricated -
    documented, not hidden.
  - violation_now: the offline pipeline used a *global* 90th-percentile
    threshold over the whole historical trace. There's no equivalent
    global trace to reference live, so this uses a rolling 90th
    percentile over this controller's own recent history instead - the
    live-online analog of the same "is this unusually high?" idea.

This means: the plumbing (real signals -> trained model -> real-time risk
score -> exposed metric) is genuinely real and load-bearing. The absolute
risk values on TeaStore are a structural integration demo, not a
re-validation of Module 1's Alibaba-trained accuracy claims on a new
application - Phase 2's validation numbers do not carry over here.
"""
from __future__ import annotations

import json
import os
import ssl
import statistics
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import joblib
import pandas as pd

MODEL_PATH = Path(os.environ.get("MODEL_PATH", "/app/model_primary.joblib"))
BUCKET_SECONDS = int(os.environ.get("BUCKET_SECONDS", "120"))
PROBES_PER_BUCKET = int(os.environ.get("PROBES_PER_BUCKET", "8"))
HISTORY_LEN = int(os.environ.get("HISTORY_LEN", "40"))
VIOLATION_WINDOW = int(os.environ.get("VIOLATION_WINDOW", "30"))
VIOLATION_PERCENTILE = float(os.environ.get("VIOLATION_PERCENTILE", "0.9"))

NAMESPACE = os.environ.get("NAMESPACE", "default")
TARGET_DEPLOYMENT = os.environ.get("TARGET_DEPLOYMENT", "teastore-webui")
TARGET_LABEL_SELECTOR = os.environ.get("TARGET_LABEL_SELECTOR", "run=teastore-webui")
PROBE_URL = os.environ.get(
    "PROBE_URL", "http://teastore-webui:8080/tools.descartes.teastore.webui/"
)

SA_DIR = Path("/var/run/secrets/kubernetes.io/serviceaccount")
K8S_API = f"https://{os.environ.get('KUBERNETES_SERVICE_HOST', 'kubernetes.default.svc')}:{os.environ.get('KUBERNETES_SERVICE_PORT', '443')}"


def _k8s_get(path: str) -> dict:
    token = (SA_DIR / "token").read_text().strip()
    ctx = ssl.create_default_context(cafile=str(SA_DIR / "ca.crt"))
    req = urllib.request.Request(
        f"{K8S_API}{path}", headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return json.loads(resp.read())


def _parse_cpu(q: str) -> float:
    """Kubernetes CPU quantity -> millicores."""
    if q.endswith("n"):
        return float(q[:-1]) / 1_000_000
    if q.endswith("u"):
        return float(q[:-1]) / 1_000
    if q.endswith("m"):
        return float(q[:-1])
    return float(q) * 1000


def _parse_mem(q: str) -> float:
    """Kubernetes memory quantity -> bytes."""
    units = {"Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "K": 1000, "M": 1000**2, "G": 1000**3}
    for suffix, mult in units.items():
        if q.endswith(suffix):
            return float(q[: -len(suffix)]) * mult
    return float(q)


def get_live_resource_signals() -> dict:
    """Real CPU/memory utilization (% of configured limit) and replica count."""
    pods = _k8s_get(
        f"/api/v1/namespaces/{NAMESPACE}/pods?labelSelector={TARGET_LABEL_SELECTOR}"
    )["items"]
    metrics = _k8s_get(
        f"/apis/metrics.k8s.io/v1beta1/namespaces/{NAMESPACE}/pods?labelSelector={TARGET_LABEL_SELECTOR}"
    )["items"]

    limits_by_pod = {}
    for pod in pods:
        containers = pod["spec"]["containers"]
        if not containers:
            continue
        res = containers[0].get("resources", {}).get("limits", {})
        limits_by_pod[pod["metadata"]["name"]] = (
            _parse_cpu(res.get("cpu", "1000m")),
            _parse_mem(res.get("memory", "1Gi")),
        )

    cpu_pcts, mem_pcts = [], []
    for m in metrics:
        name = m["metadata"]["name"]
        if name not in limits_by_pod or not m.get("containers"):
            continue
        cpu_limit, mem_limit = limits_by_pod[name]
        usage = m["containers"][0]["usage"]
        cpu_pcts.append(100.0 * _parse_cpu(usage["cpu"]) / cpu_limit)
        mem_pcts.append(100.0 * _parse_mem(usage["memory"]) / mem_limit)

    deployment = _k8s_get(
        f"/apis/apps/v1/namespaces/{NAMESPACE}/deployments/{TARGET_DEPLOYMENT}"
    )
    replicas = deployment.get("status", {}).get("replicas", 0)

    return {
        "cpu_utilization": statistics.fmean(cpu_pcts) if cpu_pcts else 0.0,
        "memory_utilization": statistics.fmean(mem_pcts) if mem_pcts else 0.0,
        "active_instances": float(replicas),
    }


def probe_latency_ms() -> float | None:
    start = time.monotonic()
    try:
        with urllib.request.urlopen(PROBE_URL, timeout=10) as resp:
            resp.read(256)
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    return (time.monotonic() - start) * 1000.0


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, round(pct / 100.0 * (len(s) - 1))))
    return s[idx]


class RiskController:
    def __init__(self, model, feature_order: list[str]):
        self.model = model
        self.feature_order = feature_order
        self.history: deque[dict] = deque(maxlen=HISTORY_LEN)
        self.p99_history: deque[float] = deque(maxlen=VIOLATION_WINDOW)
        self.lock = threading.Lock()
        self.latest_risk: float | None = None
        self.latest_bucket: dict | None = None
        self.error: str | None = None

    def run_forever(self) -> None:
        # _run_one_bucket() itself spends ~BUCKET_SECONDS sleeping between
        # probes (PROBES_PER_BUCKET-1 gaps), so only a small top-up sleep is
        # needed here to complete the window before starting the next one.
        probe_gap = BUCKET_SECONDS / PROBES_PER_BUCKET
        while True:
            try:
                self._run_one_bucket()
                self.error = None
            except Exception as exc:  # noqa: BLE001 - keep the loop alive, surface via /risk
                self.error = f"{type(exc).__name__}: {exc}"
            time.sleep(probe_gap)

    def _run_one_bucket(self) -> None:
        probe_gap = BUCKET_SECONDS / PROBES_PER_BUCKET
        latencies: list[float] = []
        for i in range(PROBES_PER_BUCKET):
            t = probe_latency_ms()
            if t is not None:
                latencies.append(t)
            if i < PROBES_PER_BUCKET - 1:
                time.sleep(probe_gap)

        resource = get_live_resource_signals()

        p95 = percentile(latencies, 95)
        p99 = percentile(latencies, 99)
        http_mcr = len(latencies) / BUCKET_SECONDS
        http_rt = statistics.fmean(latencies) if latencies else 0.0

        raw = {
            "p95_latency_ms": p95,
            "p99_latency_ms": p99,
            "call_count": float(len(latencies)),
            "HTTP_MCR": http_mcr,
            "HTTP_RT": http_rt,
            # No separate provider-RPC channel visible from TeaStore's webui -
            # documented approximation, see module docstring.
            "providerRPC_MCR": http_mcr,
            "providerRPC_RT": http_rt,
            **resource,
        }

        self.p99_history.append(p99)
        threshold = (
            percentile(list(self.p99_history), VIOLATION_PERCENTILE * 100)
            if len(self.p99_history) >= 5
            else float("inf")
        )
        raw["violation_now"] = 1 if p99 > threshold else 0

        for k in (1, 2, 4):
            ref = self.history[-k] if len(self.history) >= k else None
            for col in (
                "p95_latency_ms", "p99_latency_ms", "HTTP_MCR", "HTTP_RT",
                "providerRPC_MCR", "providerRPC_RT", "cpu_utilization", "memory_utilization",
            ):
                raw[f"{col}_delta{k}"] = (raw[col] - ref[col]) if ref else 0.0

        self.history.append(raw)

        # Mirrors module1_signal_fusion/common.py's predict_risk() exactly
        # (one-row DataFrame, not a bare list) so behavior matches Phase 2's
        # offline validation as closely as this live setting allows.
        signals = {col: raw[col] for col in self.feature_order}
        row_df = pd.DataFrame([[signals[c] for c in self.feature_order]], columns=self.feature_order)
        risk = float(self.model.predict_proba(row_df)[0, 1])

        with self.lock:
            self.latest_risk = risk
            self.latest_bucket = raw


class Handler(BaseHTTPRequestHandler):
    controller: RiskController = None  # set at startup

    def log_message(self, fmt, *args):  # quiet default access logging
        pass

    def do_GET(self):
        with self.controller.lock:
            risk = self.controller.latest_risk
            bucket = self.controller.latest_bucket
            error = self.controller.error

        if self.path == "/metrics":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.end_headers()
            lines = [
                "# HELP module1_predicted_risk Module 1's live-computed SLA-violation risk for teastore-webui (0-1).",
                "# TYPE module1_predicted_risk gauge",
                f"module1_predicted_risk {risk if risk is not None else 0.0}",
            ]
            self.wfile.write(("\n".join(lines) + "\n").encode())
        elif self.path == "/risk":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "predicted_risk": risk,
                "last_bucket": bucket,
                "error": error,
            }).encode())
        elif self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()


def main() -> None:
    bundle = joblib.load(MODEL_PATH)
    model, feature_order = bundle["model"], bundle["feature_order"]

    controller = RiskController(model, feature_order)
    Handler.controller = controller

    threading.Thread(target=controller.run_forever, daemon=True).start()

    server = ThreadingHTTPServer(("0.0.0.0", 8000), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
