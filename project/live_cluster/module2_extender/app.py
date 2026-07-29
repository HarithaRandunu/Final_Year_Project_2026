"""
Module 2's live Kubernetes port (Phase 5): a real scheduler-extender HTTP
webhook (/filter, /prioritize) wired into kube-scheduler's actual
placement decisions via a KubeSchedulerConfiguration - see
scheduler-extender-config.yaml and Progress_Trace.md's Phase 5 section for
how that wiring is done and verified.

`ThompsonSamplingBandit` below is an exact copy of
module2_co_scheduling/bandit.py's class (not a cross-package import - same
reasoning as Modules 1 and 3's controllers: keeps each container
self-contained), with one addition: `sample()`, which draws a single
posterior sample for one arm - `select()` in the offline version picks the
best of several candidates at once, but a scheduler extender's /prioritize
call needs a per-node score, not a single winner, so each candidate node
is scored independently by its own posterior draw.

/filter never rejects a node - Module 2's job here is placement *scoring*,
not admission control (Full_Plan.md Section 5). /prioritize returns one
Thompson-sampled score per node. A background thread polls live pods to
notice newly-bound (pod, node) pairs and feeds the bandit a reward = mean
(CPU headroom, memory headroom) from the real Kubernetes metrics API - the
online analog of Phase 3A's simulated post-placement reward.
"""
from __future__ import annotations

import json
import os
import ssl
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

DISCOUNT_GAMMA = float(os.environ.get("DISCOUNT_GAMMA", "0.9"))
SEED = int(os.environ.get("SEED", "42"))
REWARD_POLL_SECONDS = float(os.environ.get("REWARD_POLL_SECONDS", "15"))

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
    if q.endswith("n"):
        return float(q[:-1]) / 1_000_000
    if q.endswith("u"):
        return float(q[:-1]) / 1_000
    if q.endswith("m"):
        return float(q[:-1])
    return float(q) * 1000


def _parse_mem(q: str) -> float:
    units = {"Ki": 1024, "Mi": 1024**2, "Gi": 1024**3, "K": 1000, "M": 1000**2, "G": 1000**3}
    for suffix, mult in units.items():
        if q.endswith(suffix):
            return float(q[: -len(suffix)]) * mult
    return float(q)


class ThompsonSamplingBandit:
    """Exact copy of module2_co_scheduling/bandit.py's class, plus sample()."""

    def __init__(self, gamma: float, seed: int):
        self.gamma = gamma
        self.rng = np.random.default_rng(seed)
        self.alpha: dict = {}
        self.beta: dict = {}
        self.pulls: dict = {}

    def _ensure_arm(self, nodeid) -> None:
        if nodeid not in self.alpha:
            self.alpha[nodeid] = 1.0
            self.beta[nodeid] = 1.0
            self.pulls[nodeid] = 0

    def sample(self, nodeid) -> float:
        self._ensure_arm(nodeid)
        return float(self.rng.beta(self.alpha[nodeid], self.beta[nodeid]))

    def update(self, nodeid, reward: float) -> None:
        self._ensure_arm(nodeid)
        reward = float(np.clip(reward, 0.0, 1.0))
        self.alpha[nodeid] = 1.0 + self.gamma * (self.alpha[nodeid] - 1.0) + reward
        self.beta[nodeid] = 1.0 + self.gamma * (self.beta[nodeid] - 1.0) + (1.0 - reward)
        self.pulls[nodeid] += 1

    def posterior_mean(self, nodeid) -> float:
        self._ensure_arm(nodeid)
        return self.alpha[nodeid] / (self.alpha[nodeid] + self.beta[nodeid])


bandit = ThompsonSamplingBandit(DISCOUNT_GAMMA, SEED)


def node_headroom(node_name: str) -> float | None:
    try:
        node = _k8s_get(f"/api/v1/nodes/{node_name}")
        usage = _k8s_get(f"/apis/metrics.k8s.io/v1beta1/nodes/{node_name}")
    except Exception:  # noqa: BLE001 - metrics may not be ready yet
        return None

    allocatable = node.get("status", {}).get("allocatable", {})
    cpu_alloc = _parse_cpu(allocatable.get("cpu", "1"))
    mem_alloc = _parse_mem(allocatable.get("memory", "1Gi"))
    cpu_used = _parse_cpu(usage.get("usage", {}).get("cpu", "0"))
    mem_used = _parse_mem(usage.get("usage", {}).get("memory", "0"))

    cpu_headroom = max(0.0, 1.0 - cpu_used / cpu_alloc) if cpu_alloc else 0.0
    mem_headroom = max(0.0, 1.0 - mem_used / mem_alloc) if mem_alloc else 0.0
    return (cpu_headroom + mem_headroom) / 2.0


class RewardTracker:
    """Background thread: notices newly-bound (pod, node) pairs and feeds
    the bandit a live reward, the online analog of Phase 3A's simulated
    post-placement reward."""

    def __init__(self, bandit: ThompsonSamplingBandit):
        self.bandit = bandit
        self.seen: set[str] = set()
        self.reward_updates_applied = 0
        self.error: str | None = None

    def run_forever(self) -> None:
        while True:
            try:
                self._poll_once()
                self.error = None
            except Exception as exc:  # noqa: BLE001 - keep the loop alive
                self.error = f"{type(exc).__name__}: {exc}"
            time.sleep(REWARD_POLL_SECONDS)

    def _poll_once(self) -> None:
        pods = _k8s_get("/api/v1/pods")["items"]
        for pod in pods:
            node_name = pod.get("spec", {}).get("nodeName")
            phase = pod.get("status", {}).get("phase")
            uid = pod.get("metadata", {}).get("uid")
            if not node_name or not uid or phase not in ("Running", "Succeeded"):
                continue
            key = f"{uid}@{node_name}"
            if key in self.seen:
                continue
            self.seen.add(key)
            reward = node_headroom(node_name)
            if reward is not None:
                self.bandit.update(node_name, reward)
                self.reward_updates_applied += 1


tracker = RewardTracker(bandit)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def _write_json(self, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.end_headers()
        elif self.path == "/state":
            self._write_json({
                "gamma": bandit.gamma,
                "alpha": dict(bandit.alpha),
                "beta": dict(bandit.beta),
                "pulls": dict(bandit.pulls),
                "posterior_mean": {n: bandit.posterior_mean(n) for n in bandit.alpha},
                "reward_updates_applied": tracker.reward_updates_applied,
                "reward_tracker_error": tracker.error,
            })
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/filter":
            args = self._read_json()
            nodes = args.get("Nodes", {}).get("items", [])
            # Placement scoring, not admission control - never reject a node.
            self._write_json({
                "Nodes": {"items": nodes},
                "NodeNames": None,
                "FailedNodes": {},
                "Error": "",
            })
        elif self.path == "/prioritize":
            args = self._read_json()
            nodes = args.get("Nodes", {}).get("items", [])
            names = [n["metadata"]["name"] for n in nodes]
            scores = [
                {"Host": name, "Score": round(bandit.sample(name) * 10)}
                for name in names
            ]
            self._write_json(scores)
        else:
            self.send_response(404)
            self.end_headers()


def main() -> None:
    threading.Thread(target=tracker.run_forever, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", 8090), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
