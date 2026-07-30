import subprocess
import threading
import time

from fastapi import APIRouter, HTTPException

from backend.config import COMPONENT_DEPLOYMENTS
from backend.orchestrator import cluster_setup
from backend.orchestrator.jobs import job_store
from backend.orchestrator.subprocess_runner import detect_tool, resolve_tool_command
from backend.orchestrator.winget_installer import TOOL_INFO
from backend.orchestrator.winget_installer import install as winget_install

router = APIRouter(prefix="/api/setup", tags=["setup"])

_readiness_lock = threading.Lock()
_readiness_cache: tuple[float, dict] | None = None
_READINESS_TTL_S = 15


@router.get("/detect")
def detect_all() -> list[dict]:
    results = []
    for tool, info in TOOL_INFO.items():
        # resolve_tool_command falls back to searching winget's known install
        # location directly if the bare command isn't on PATH yet - confirmed
        # live, an already-running process (or one started before a PATH
        # change from a winget install propagates) would otherwise keep
        # reporting a genuinely-installed tool as missing until restarted.
        resolved = resolve_tool_command(tool, info["winget_id"])
        status = detect_tool(resolved, info["version_args"])
        status["tool"] = tool  # report the short key, not the resolved path, for the frontend/route lookups
        status["needs_manual_finish_after_install"] = info["needs_manual_finish_after_install"]
        results.append(status)
    return results


@router.post("/install/{tool}")
def install_tool(tool: str) -> dict:
    if tool not in TOOL_INFO:
        raise HTTPException(status_code=404, detail="Unknown tool")
    job_id = job_store.start("install_tool", lambda job: winget_install(tool, job))
    return {"job_id": job_id}


@router.post("/bootstrap")
def bootstrap() -> dict:
    job_id = job_store.start("cluster_bootstrap", cluster_setup.bootstrap_all)
    return {"job_id": job_id}


def _component_status() -> list[dict]:
    """Ready/desired replicas for the four framework Deployments, in one call."""
    try:
        result = subprocess.run(
            ["kubectl", "get", "deployment", *COMPONENT_DEPLOYMENTS,
             "-o", "jsonpath={range .items[*]}{.metadata.name},{.spec.replicas},{.status.readyReplicas};{end}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20,
        )
    except (subprocess.SubprocessError, OSError):
        return []
    found: dict[str, dict] = {}
    for entry in result.stdout.strip().split(";"):
        if not entry:
            continue
        parts = entry.split(",")
        if len(parts) != 3:
            continue
        name, spec, ready = parts
        found[name] = {
            "name": name,
            "desired": int(spec) if spec else 0,
            # readyReplicas is omitted rather than zeroed when nothing is ready.
            "ready": int(ready) if ready else 0,
            "deployed": True,
        }
    return [found.get(name, {"name": name, "desired": None, "ready": None, "deployed": False})
            for name in COMPONENT_DEPLOYMENTS]


@router.get("/readiness")
def readiness() -> dict:
    """One answer to "can I actually use this app right now?", for the Home page.

    Cached for 15s and computed under a lock: it runs four `--version` calls
    plus three kubectl round-trips, and the Home page is the first thing shown
    on launch, so two quick visits should not queue up two full sweeps.
    """
    global _readiness_cache
    with _readiness_lock:
        now = time.monotonic()
        if _readiness_cache and now - _readiness_cache[0] < _READINESS_TTL_S:
            return _readiness_cache[1]

        tools = detect_all()
        tools_ready = all(t["installed"] for t in tools)

        cluster_present = False
        api_up = False
        if tools_ready:
            # Guarded: without kind/kubectl on PATH these raise rather than
            # returning False, and a first-run user has neither.
            try:
                cluster_present = cluster_setup.cluster_exists()
            except (subprocess.SubprocessError, OSError):
                cluster_present = False
            if cluster_present:
                try:
                    api_up = cluster_setup.api_reachable()
                except (subprocess.SubprocessError, OSError):
                    api_up = False

        components = _component_status() if api_up else []
        # The actuator is excluded from "deployed": it legitimately rests at 0
        # replicas outside an ablation arm (see COMPONENT_DEPLOYMENTS).
        core = [c for c in components if c["name"] != "actuator"]
        components_ready = bool(core) and all(c["deployed"] and (c["ready"] or 0) > 0 for c in core)

        if not tools_ready:
            stage, next_step = "tools_missing", "Install the missing tools on the Setup page."
        elif not cluster_present:
            stage, next_step = "no_cluster", "Run the one-click cluster bootstrap on the Setup page."
        elif not api_up:
            stage, next_step = "api_unreachable", (
                "The cluster exists but its API is not answering. Docker Desktop may still be starting; "
                "if you recently ran `wsl --shutdown`, re-running the bootstrap repairs the connection."
            )
        elif not components_ready:
            stage, next_step = "components_missing", "Re-run the cluster bootstrap to deploy the framework's components."
        else:
            stage, next_step = "ready", "Everything is up. Open Live Monitoring, or plug in your own app on Target App."

        payload = {
            "stage": stage,
            "next_step": next_step,
            "tools": tools,
            "tools_ready": tools_ready,
            "cluster_present": cluster_present,
            "api_up": api_up,
            "components": components,
            "components_ready": components_ready,
        }
        _readiness_cache = (now, payload)
        return payload
