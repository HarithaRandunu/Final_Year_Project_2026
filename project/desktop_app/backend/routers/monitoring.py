"""Live monitoring (Milestone 4): one aggregated poll of all four live
components' own HTTP endpoints, through the persistent port-forwards.

Every field here comes from a component's real endpoint - the same
`/risk` and `/state` payloads project/live_cluster/ablation/run_trial.py
samples during a formal trial. Nothing is recomputed or simulated here.
"""
from __future__ import annotations

import subprocess
import time
from datetime import datetime, timezone

from fastapi import APIRouter

from backend.orchestrator import target_app
from backend.orchestrator.port_forwards import port_forwards

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])

_replica_cache: dict[str, tuple[float, dict[str, int | None]]] = {}
_REPLICA_TTL_S = 10


def _replicas(deployment: str) -> dict[str, int | None]:
    """Cached replica counts for a Deployment, straight from the Kubernetes API.

    Two callers, two reasons:
      - the actuator, to tell "scaled to 0 on purpose" apart from "crashed":
        it legitimately sits at 0 outside the ablation arms that use it, and a
        raw connection-refused error for that reads as a fault when it isn't.
      - the target app, because Module 1's `active_instances` is a *feature of
        its 120-second bucket* and therefore lags reality by up to two minutes.
        Observed live: the cluster had 2 ready webui pods while Module 1's
        latest bucket still said 1, so a chart fed from Module 1 showed a
        replica count that contradicted `kubectl get deployment`.

    Cached because /state is polled every 3s and this is a subprocess call. The
    TTL is short (10s) so a scaling event shows up promptly.
    """
    cached = _replica_cache.get(deployment)
    now = time.monotonic()
    if cached and now - cached[0] < _REPLICA_TTL_S:
        return cached[1]
    value: dict[str, int | None] = {"spec": None, "ready": None}
    try:
        result = subprocess.run(
            ["kubectl", "get", "deployment", deployment, "-o",
             "jsonpath={.spec.replicas},{.status.readyReplicas}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            spec_s, _, ready_s = result.stdout.strip().partition(",")
            # readyReplicas is absent (not 0) when a Deployment has no ready
            # pods, so an empty field means zero, not unknown.
            value = {
                "spec": int(spec_s) if spec_s else None,
                "ready": int(ready_s) if ready_s else 0,
            }
    except (ValueError, subprocess.SubprocessError, OSError):
        pass
    _replica_cache[deployment] = (now, value)
    return value


@router.post("/start")
def start() -> dict:
    port_forwards.start_all()
    return {"started": True, "port_forwards": port_forwards.status()}


@router.post("/stop")
def stop() -> dict:
    port_forwards.stop_all()
    return {"started": False}


@router.get("/running")
def running() -> dict:
    """Whether monitoring is already on, without doing any of the work.

    Needed because the UI is a browser page: a reload, or a second tab, starts
    with a fresh frontend but the same backend, so the Start/Stop button has to
    be told what the server is already doing. /state would answer this too but
    costs four HTTP fetches through the port-forwards, which is the wrong price
    for a page-load check.
    """
    return {"running": port_forwards.is_running()}


@router.get("/state")
def state() -> dict:
    m1, m1_err = port_forwards.fetch_json("module1", "/risk")
    m2, m2_err = port_forwards.fetch_json("module2", "/state")
    m3, m3_err = port_forwards.fetch_json("module3", "/state")
    act, act_err = port_forwards.fetch_json("actuator", "/state")

    bucket = (m1 or {}).get("last_bucket") or {}

    module2_nodes = []
    if m2:
        posterior = m2.get("posterior_mean") or {}
        pulls = m2.get("pulls") or {}
        module2_nodes = sorted(
            ({"node": n, "posterior_mean": v, "pulls": pulls.get(n, 0)} for n, v in posterior.items()),
            key=lambda r: r["node"],
        )

    target = target_app.get_target()
    target_replicas = _replicas(target["deployment"])

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "port_forwards": port_forwards.status(),
        # The target app's live replica count, read from the Kubernetes API
        # rather than from Module 1's bucket - see _replicas()'s docstring for
        # why those two disagree.
        "target": {
            "name": target["name"],
            "deployment": target["deployment"],
            "replicas_desired": target_replicas["spec"],
            "replicas_ready": target_replicas["ready"],
        },
        "module1": {
            "available": m1 is not None,
            "error": m1_err or (m1 or {}).get("error"),
            "predicted_risk": (m1 or {}).get("predicted_risk"),
            "p95_latency_ms": bucket.get("p95_latency_ms"),
            "p99_latency_ms": bucket.get("p99_latency_ms"),
            "cpu_utilization": bucket.get("cpu_utilization"),
            "memory_utilization": bucket.get("memory_utilization"),
            "active_instances": bucket.get("active_instances"),
            "violation_now": bucket.get("violation_now"),
            "call_count": bucket.get("call_count"),
        },
        "module2": {
            "available": m2 is not None,
            "error": m2_err or (m2 or {}).get("reward_tracker_error"),
            "gamma": (m2 or {}).get("gamma"),
            "reward_updates_applied": (m2 or {}).get("reward_updates_applied"),
            "nodes": module2_nodes,
        },
        "module3": {
            "available": m3 is not None,
            "error": m3_err or (m3 or {}).get("error"),
            "mode": (m3 or {}).get("mode"),
            "threshold": (m3 or {}).get("threshold"),
            "alert": (m3 or {}).get("alert"),
            "control_signal": (m3 or {}).get("control_signal"),
            "conformal_width": (m3 or {}).get("conformal_width"),
            "widening_multiplier": (m3 or {}).get("widening_multiplier"),
            "reversal_count": (m3 or {}).get("reversal_count"),
            "aci_alpha": (m3 or {}).get("aci_alpha"),
            "cycles": (m3 or {}).get("cycles"),
        },
        "actuator": {
            # The actuator legitimately sits at 0 replicas outside an ablation
            # run (baseline/m2_only arms leave scaling to HPA/KEDA), so
            # "unavailable" here is a normal state, not necessarily a fault -
            # see live_cluster/actuator/app.py's module docstring.
            "available": act is not None,
            "scaled_to_zero": act is None and _replicas("actuator")["spec"] == 0,
            "error": act_err or (act or {}).get("error"),
            "arm": (act or {}).get("arm"),
            "signal": (act or {}).get("signal"),
            "threshold": (act or {}).get("threshold"),
            "replicas": (act or {}).get("replicas"),
            "decision": (act or {}).get("decision"),
            "cooling_down": (act or {}).get("cooling_down"),
            "cycles": (act or {}).get("cycles"),
        },
    }
