"""Target-app plug-in routes (Milestone 6). Thin HTTP adapters only - all the
kubectl/state logic lives in orchestrator/target_app_manager.py.
"""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.orchestrator import target_app, target_app_manager
from backend.orchestrator.jobs import job_store
from backend.presets.teastore import PRESETS

router = APIRouter(prefix="/api/target", tags=["target"])


class SwitchRequest(BaseModel):
    namespace: str = "default"
    deployment: str
    label_selector: str
    service: str
    service_port: int
    probe_path: str = "/"
    # Travel with the target rather than the framework: they describe the app
    # being scaled. Defaults match actuator/app.py's own defaults.
    min_replicas: int = Field(default=1, ge=1, le=10)
    max_replicas: int = Field(default=2, ge=1, le=10)


class PresetRequest(BaseModel):
    preset: str = "teastore"
    min_replicas: int = Field(default=1, ge=1, le=10)
    max_replicas: int = Field(default=2, ge=1, le=10)


class ManifestRequest(BaseModel):
    path: str


@router.get("/current")
def current() -> dict:
    """Re-syncs from the cluster before answering. Opening this page is a
    natural, cheap point to do it (once per page visit, not per poll), and it
    means the page can never show a target the cluster has since moved off -
    e.g. because a previous app session switched it."""
    target_app_manager.sync_from_cluster()
    return target_app.get_target()


@router.get("/presets")
def presets() -> list[dict]:
    return list(PRESETS.values())


@router.get("/deployments")
def deployments() -> dict:
    return target_app_manager.list_deployments()


@router.post("/apply-manifest")
def apply_manifest(req: ManifestRequest) -> dict:
    job_id = job_store.start("apply_manifest", lambda job: target_app_manager.apply_manifest(req.path, job))
    return {"job_id": job_id}


@router.post("/switch")
def switch(req: SwitchRequest) -> dict:
    cfg = target_app_manager.build_target_config(
        namespace=req.namespace,
        deployment=req.deployment,
        label_selector=req.label_selector,
        service=req.service,
        service_port=req.service_port,
        probe_path=req.probe_path,
    )
    job_id = job_store.start(
        "switch_target",
        lambda job: target_app_manager.reconfigure(cfg, job, req.min_replicas, req.max_replicas),
    )
    return {"job_id": job_id}


@router.post("/switch-preset")
def switch_preset(req: PresetRequest) -> dict:
    job_id = job_store.start(
        "switch_target",
        lambda job: target_app_manager.reconfigure_preset(req.preset, job, req.min_replicas, req.max_replicas),
    )
    return {"job_id": job_id}
