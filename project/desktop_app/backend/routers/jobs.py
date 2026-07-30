from fastapi import APIRouter, HTTPException

from backend.orchestrator.jobs import job_store

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{job_id}")
def get_job(job_id: str) -> dict:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job")
    return job.to_dict()
