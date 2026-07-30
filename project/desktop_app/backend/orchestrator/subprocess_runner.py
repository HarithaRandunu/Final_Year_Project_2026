"""Subprocess helpers shared by cluster_setup.py, target_app_manager.py, and
winget_installer.py. run_streaming() is the concrete change from
ablation/run_trial.py's run()/run_ignore_errors() pattern needed for a
desktop app's job log: Popen + line-by-line capture instead of
subprocess.run(capture_output=True) blocking silently until exit.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from backend.orchestrator.jobs import Job


def find_winget_exe(winget_id: str, exe_name: str) -> Path | None:
    """Searches directly under %LOCALAPPDATA%\\Microsoft\\WinGet\\Packages for
    a tool's actual executable. Used as a fallback when the bare command
    isn't on PATH - confirmed live for Helm: winget's own PATH-integration
    for it never took effect for an already-running process (PATH changes
    only apply to processes started after the change), which kept showing
    Helm as "not installed" even though it genuinely was, and repeatedly
    confused restart-the-app troubleshooting. Searching the known install
    location directly sidesteps the whole timing problem instead of relying
    on the user restarting things at the right moment."""
    packages_root = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    if not packages_root.exists():
        return None
    for pkg_dir in packages_root.glob(f"{winget_id}_*"):
        for exe in pkg_dir.rglob(f"{exe_name}.exe"):
            return exe
    return None


def resolve_tool_command(name: str, winget_id: str | None = None) -> str:
    """Returns a runnable command for `name`: the bare name if the current
    process's PATH already resolves it, otherwise the absolute path found via
    find_winget_exe() if a winget_id is given, otherwise the bare name
    unchanged (so the normal FileNotFoundError/"not installed" path still
    applies for tools that genuinely aren't there)."""
    if shutil.which(name):
        return name
    if winget_id:
        found = find_winget_exe(winget_id, name)
        if found:
            return str(found)
    return name


def run_streaming(cmd: list[str], job: Job, step_name: str, timeout: int | None = None, cwd: Path | None = None) -> int:
    step = job.add_step(step_name)
    job.start_step(step)
    job.append_log(step, f"$ {' '.join(cmd)}")
    try:
        # encoding/errors explicit, not left to Python's platform default:
        # confirmed live, `text=True` alone decodes with Windows' ANSI
        # codepage (cp1252) here, and Docker BuildKit's real progress output
        # contains UTF-8 bytes invalid in cp1252 - crashed the whole job
        # with UnicodeDecodeError mid-build. errors="replace" means a stray
        # bad byte degrades one character in the log, not the entire step.
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
            encoding="utf-8", errors="replace", cwd=str(cwd) if cwd else None,
        )
    except FileNotFoundError as exc:
        job.append_log(step, f"ERROR: {exc}")
        job.finish_step(step, False)
        job.error = f"{step_name} failed: {exc}"
        return -1

    try:
        for line in proc.stdout:
            job.append_log(step, line.rstrip("\n"))
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        job.append_log(step, f"ERROR: timed out after {timeout}s")
        job.finish_step(step, False)
        job.error = f"{step_name} timed out"
        return -1

    job.finish_step(step, code == 0)
    if code != 0:
        job.error = f"{step_name} failed (exit code {code})"
    return code


def detect_tool(name: str, version_args: list[str]) -> dict:
    """Read-only: runs `<name> <version_args>` and reports whether it
    succeeded. Never mutates anything - safe to call anytime."""
    try:
        result = subprocess.run([name, *version_args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10)
        installed = result.returncode == 0
        output = (result.stdout or result.stderr).strip()
        version_line = output.splitlines()[0] if output else None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        installed = False
        version_line = None
    return {"tool": name, "installed": installed, "version_line": version_line}
