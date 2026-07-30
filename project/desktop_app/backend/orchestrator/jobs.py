"""In-memory job registry (Milestone 3). A Job tracks a multi-step background
operation (cluster setup, target-app reconfigure) as a list of steps, each
with its own status and a growing log - the frontend polls GET /api/jobs/{id}
until status != "running" rather than holding an SSE/websocket connection
open (see the plan's rationale: simpler and more resilient for a local
single-user app).
"""
from __future__ import annotations

import threading
import uuid
from typing import Callable


class Job:
    def __init__(self, kind: str):
        self.id = str(uuid.uuid4())
        self.kind = kind
        self.status = "pending"
        self.current_step: str | None = None
        self.error: str | None = None
        self.steps: list[dict] = []
        self.lock = threading.Lock()

    def add_step(self, name: str) -> dict:
        with self.lock:
            step = {"name": name, "status": "pending", "log": []}
            self.steps.append(step)
            return step

    def start_step(self, step: dict) -> None:
        with self.lock:
            step["status"] = "running"
            self.current_step = step["name"]

    def finish_step(self, step: dict, ok: bool) -> None:
        with self.lock:
            step["status"] = "success" if ok else "failed"

    def append_log(self, step: dict, line: str) -> None:
        with self.lock:
            step["log"].append(line)

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "id": self.id,
                "kind": self.kind,
                "status": self.status,
                "current_step": self.current_step,
                "error": self.error,
                "steps": [dict(s) for s in self.steps],
            }


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def start(self, kind: str, fn: Callable[[Job], None]) -> str:
        job = Job(kind)
        job.status = "running"
        with self._lock:
            self._jobs[job.id] = job

        def runner() -> None:
            try:
                fn(job)
                job.status = "failed" if job.error else "success"
            except Exception as exc:  # noqa: BLE001 - must not crash the thread silently; surfaced via job.error
                job.error = f"{type(exc).__name__}: {exc}"
                job.status = "failed"

        threading.Thread(target=runner, daemon=True).start()
        return job.id


job_store = JobStore()
