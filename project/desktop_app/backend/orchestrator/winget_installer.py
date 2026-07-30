"""Permission-gated tool installs (Milestone 3). Only ever invoked from a
route the user reached by clicking an explicit "Install" button per tool -
never run automatically. Docker Desktop needs a manual first-run step after
install (EULA/whale-icon) that can't be scripted past reliably - see
needs_manual_finish_after_install below.

Package IDs verified live via `winget search --id <id>` on 2026-07-29:
Kubernetes.kind 0.32.0, Kubernetes.kubectl 1.36.3, Helm.Helm 4.2.3,
Docker.DockerDesktop 4.84.0 all resolved.

TOOL_INFO is the single source of truth for both detection (routers/setup.py's
/detect endpoint) and installation, so the two can never drift out of sync
the way an earlier version of this code did (see install()'s docstring below
for the bug that caused).
"""
from __future__ import annotations

from backend.orchestrator.jobs import Job
from backend.orchestrator.subprocess_runner import detect_tool, find_winget_exe, resolve_tool_command, run_streaming

TOOL_INFO = {
    "docker": {"version_args": ["--version"], "winget_id": "Docker.DockerDesktop", "needs_manual_finish_after_install": True},
    "kind": {"version_args": ["--version"], "winget_id": "Kubernetes.kind", "needs_manual_finish_after_install": False},
    "kubectl": {"version_args": ["version", "--client"], "winget_id": "Kubernetes.kubectl", "needs_manual_finish_after_install": False},
    "helm": {"version_args": ["version"], "winget_id": "Helm.Helm", "needs_manual_finish_after_install": False},
}


def install(tool: str, job: Job) -> int:
    """Checks actual state before AND after running winget, rather than
    trusting winget's own exit code either way - two real behaviors this
    guards against:
      1. The tool can already be installed when the user clicks Install (the
         detection that gated showing the button was stale, or they clicked
         before noticing it updated) - caught here before ever invoking
         winget, with a clean "already installed" step instead of a
         confusing winget run.
      2. `winget install` on an already-installed package with no available
         upgrade exits with a NON-ZERO code (confirmed live: exit 43, "No
         newer package versions are available from the configured sources")
         even though the end state is completely fine. Trusting that exit
         code alone would wrongly mark the job "failed". The real signal is
         whether the tool is actually detected afterward, not what winget's
         own return code says.
    """
    info = TOOL_INFO[tool]
    resolved_cmd = resolve_tool_command(tool, info["winget_id"])

    pre_check = detect_tool(resolved_cmd, info["version_args"])
    if pre_check["installed"]:
        step = job.add_step(f"Check {tool}")
        job.start_step(step)
        job.append_log(step, f"{tool} is already installed ({pre_check['version_line']}) - skipping winget install.")
        job.finish_step(step, True)
        return 0

    run_streaming(
        ["winget", "install", "-e", "--id", info["winget_id"], "--accept-package-agreements", "--accept-source-agreements"],
        job, f"winget install {tool}", timeout=600,
    )

    post_check = detect_tool(resolve_tool_command(tool, info["winget_id"]), info["version_args"])
    verify_step = job.add_step("Verify installation")
    job.start_step(verify_step)
    if post_check["installed"]:
        job.append_log(verify_step, f"Confirmed: {tool} now detected ({post_check['version_line']}).")
        job.finish_step(verify_step, True)
        job.error = None  # clear any error the raw winget exit code set - the tool is actually present now
        return 0

    found = find_winget_exe(info["winget_id"], tool)
    if found:
        job.append_log(verify_step, f"winget installed {tool}, but its folder isn't on PATH yet. Found it at: {found}")
        job.append_log(verify_step, "Open a new terminal (PATH changes need a fresh session) and click Install again to re-check - or add that folder to PATH yourself.")
        # Overwrite (not just fall back to) run_streaming's raw exit-code
        # message - this is a much more actionable explanation of the same
        # failure, not a different one.
        job.error = f"{tool} was installed but isn't on PATH yet - see the log for its exact location"
    else:
        job.append_log(verify_step, f"{tool} still not detected after the install attempt.")
        job.error = f"{tool} installation could not be verified"
    job.finish_step(verify_step, False)
    return 1
