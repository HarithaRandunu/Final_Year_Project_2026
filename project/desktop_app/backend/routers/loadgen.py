from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.orchestrator import target_app
from backend.orchestrator.loadgen import MAX_RPS_CAP, MIN_RPS_FLOOR, load_generator

router = APIRouter(prefix="/api/loadgen", tags=["loadgen"])


class StartRequest(BaseModel):
    min_rps: float = Field(default=8.0, ge=MIN_RPS_FLOOR, le=MAX_RPS_CAP)
    max_rps: float = Field(default=24.0, ge=MIN_RPS_FLOOR, le=MAX_RPS_CAP)


@router.post("/start")
def start(req: StartRequest) -> dict:
    return load_generator.start(req.min_rps, req.max_rps)


@router.post("/stop")
def stop() -> dict:
    return load_generator.stop()


@router.get("/status")
def status() -> dict:
    return {**load_generator.status(), "target": target_app.get_target()}
