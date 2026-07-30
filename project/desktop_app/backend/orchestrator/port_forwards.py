"""Persistent kubectl port-forwards for the live monitoring view (Milestone 4).

Contrast with project/live_cluster/ablation/run_trial.py's start_port_forwards():
that one is deliberately short-lived - spawn two processes, sleep 5s, use for
one trial's few minutes, unconditionally terminate in a finally block. A
desktop session lasts hours and the user can restart pods underneath it, so
this manager adds what that pattern doesn't need:

  - fixed local ports (backend/config.py's PORT_FORWARDS), so the frontend
    never has to discover them;
  - a watchdog thread that notices a forward's process exiting - a real
    failure mode, since `kubectl port-forward service/x` dies when the pod
    behind it restarts - and respawns just that one, with backoff so a
    genuinely-absent Service (e.g. the actuator sits at 0 replicas outside
    an ablation run) doesn't spin hot;
  - idempotent start_all(), safe to call repeatedly from several UI paths;
  - explicit stop_all(), called from main.py's window-closing handler and
    before any target-app switch.
"""
from __future__ import annotations

import json
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

from backend.config import HEALTHZ_FORWARDS, PORT_FORWARDS

# Windows: keep kubectl's console window from flashing on every (re)spawn.
_CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0

WATCHDOG_INTERVAL_S = 5
BACKOFF_START_S = 5
BACKOFF_MAX_S = 60


class PortForwardManager:
    def __init__(self):
        # Own mutable copy: the "target" entry is repointed at runtime when a
        # different application is plugged in (Milestone 6), so this must not
        # alias the module-level constant.
        self._config: dict[str, dict] = {k: dict(v) for k, v in PORT_FORWARDS.items()}
        self._procs: dict[str, subprocess.Popen] = {}
        self._backoff: dict[str, float] = {}
        self._next_attempt: dict[str, float] = {}
        self._last_error: dict[str, str] = {}
        self._lock = threading.RLock()
        self._watchdog: threading.Thread | None = None
        self._running = False

    def target_local_port(self) -> int:
        return self._config["target"]["local_port"]

    def repoint_target(self, service: str, remote_port: int) -> None:
        """Repoints the target forward at a different Service and restarts it."""
        with self._lock:
            self._config["target"]["service"] = service if service.startswith("service/") else f"service/{service}"
            self._config["target"]["remote_port"] = remote_port
            proc = self._procs.pop("target", None)
            if proc is not None:
                self._terminate("target", proc)
            self._backoff.pop("target", None)
            self._next_attempt.pop("target", None)
            if self._running:
                self._ensure_one("target")

    # --- lifecycle ---------------------------------------------------------

    def start_all(self) -> None:
        """Idempotent: only spawns forwards that aren't already alive."""
        with self._lock:
            if not self._running:
                self._reap_orphans()
            self._running = True
            for name in self._config:
                self._ensure_one(name)
            if self._watchdog is None or not self._watchdog.is_alive():
                self._watchdog = threading.Thread(target=self._watchdog_loop, daemon=True)
                self._watchdog.start()

    def is_running(self) -> bool:
        """Whether start_all() is in effect. Read by the frontend on page load:
        the UI is a browser page, so a reload or a second tab needs to know what
        this (shared, longer-lived) backend is already doing."""
        with self._lock:
            return self._running

    def stop_all(self) -> None:
        with self._lock:
            self._running = False
            for name, proc in list(self._procs.items()):
                self._terminate(name, proc)
            self._procs.clear()
            self._backoff.clear()
            self._next_attempt.clear()

    # --- internals ---------------------------------------------------------

    def _reap_orphans(self) -> None:
        """Kills leftover `kubectl port-forward` processes bound to OUR fixed
        local ports before spawning fresh ones. Needed because these are
        spawned as child processes: a clean window close terminates them (see
        main.py's closing handler), but a crash or force-kill leaves them
        running, and since the local ports are fixed the next launch's
        forwards would fail to bind. Matching is narrowed to the exact
        `<local>:<remote>` argument strings this app uses, so an unrelated
        port-forward the user started themselves is never touched."""
        if sys.platform != "win32":
            return
        wanted = {f"{c['local_port']}:{c['remote_port']}" for c in self._config.values()}
        wanted |= {f"{c['local_port']}:{c['remote_port']}" for c in PORT_FORWARDS.values()}
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 "Get-CimInstance Win32_Process -Filter \"Name = 'kubectl.exe'\" | "
                 "ForEach-Object { \"$($_.ProcessId)|$($_.CommandLine)\" }"],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=20,
                creationflags=_CREATE_NO_WINDOW,
            )
        except (subprocess.SubprocessError, OSError):
            return
        for line in result.stdout.splitlines():
            pid, _, cmdline = line.partition("|")
            if "port-forward" not in cmdline:
                continue
            if not any(mapping in cmdline for mapping in wanted):
                continue
            try:
                subprocess.run(["taskkill", "/F", "/PID", pid.strip()], capture_output=True, timeout=10,
                               creationflags=_CREATE_NO_WINDOW)
            except (subprocess.SubprocessError, OSError):
                pass

    def _terminate(self, name: str, proc: subprocess.Popen) -> None:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except (subprocess.TimeoutExpired, OSError):
            try:
                proc.kill()
            except OSError:
                pass

    def _ensure_one(self, name: str) -> None:
        """Spawn `name`'s forward if it isn't currently alive and its backoff
        window has elapsed. Caller must hold the lock."""
        proc = self._procs.get(name)
        if proc is not None and proc.poll() is None:
            return  # still alive
        if proc is not None:
            self._procs.pop(name, None)

        now = time.monotonic()
        if now < self._next_attempt.get(name, 0.0):
            return

        cfg = self._config[name]
        try:
            new_proc = subprocess.Popen(
                ["kubectl", "port-forward", cfg["service"], f"{cfg['local_port']}:{cfg['remote_port']}"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=_CREATE_NO_WINDOW,
            )
        except (FileNotFoundError, OSError) as exc:
            self._last_error[name] = str(exc)
            self._bump_backoff(name)
            return

        self._procs[name] = new_proc
        # Don't reset backoff here - a forward that dies immediately (no pods
        # behind the Service) would otherwise respawn every watchdog tick.
        # _watchdog_loop resets it once the forward has actually survived.

    def _bump_backoff(self, name: str) -> None:
        current = self._backoff.get(name, 0.0)
        nxt = BACKOFF_START_S if current == 0.0 else min(current * 2, BACKOFF_MAX_S)
        self._backoff[name] = nxt
        self._next_attempt[name] = time.monotonic() + nxt

    def _watchdog_loop(self) -> None:
        while True:
            time.sleep(WATCHDOG_INTERVAL_S)
            with self._lock:
                if not self._running:
                    return
                for name in self._config:
                    proc = self._procs.get(name)
                    if proc is not None and proc.poll() is None:
                        if self.is_healthy(name):
                            self._backoff.pop(name, None)
                            self._next_attempt.pop(name, None)
                            self._last_error.pop(name, None)
                        continue
                    if proc is not None:
                        self._last_error[name] = f"port-forward exited (code {proc.returncode})"
                        self._bump_backoff(name)
                    self._ensure_one(name)

    # --- reads -------------------------------------------------------------

    def is_healthy(self, name: str) -> bool:
        cfg = self._config[name]
        if name not in HEALTHZ_FORWARDS:
            # The target application is arbitrary third-party software with no
            # /healthz contract, so "is the tunnel actually carrying traffic?"
            # is answered with a plain TCP connect instead of an HTTP probe.
            try:
                with socket.create_connection(("127.0.0.1", cfg["local_port"]), timeout=2):
                    return True
            except OSError:
                return False
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{cfg['local_port']}/healthz", timeout=2) as resp:
                return resp.status == 200
        except (urllib.error.URLError, OSError, TimeoutError):
            return False

    def fetch_json(self, name: str, path: str, timeout: float = 3.0) -> tuple[dict | None, str | None]:
        """Returns (payload, error). Never raises - the monitoring endpoint
        must be able to report a partially-available system."""
        cfg = self._config[name]
        url = f"http://127.0.0.1:{cfg['local_port']}{path}"
        try:
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                return json.loads(resp.read()), None
        except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError) as exc:
            return None, f"{type(exc).__name__}: {exc}"

    def status(self) -> dict:
        with self._lock:
            out = {}
            for name in self._config:
                proc = self._procs.get(name)
                out[name] = {
                    "local_port": self._config[name]["local_port"],
                    "process_alive": proc is not None and proc.poll() is None,
                    "retry_in_s": max(0.0, round(self._next_attempt.get(name, 0.0) - time.monotonic(), 1)),
                    "last_error": self._last_error.get(name),
                }
            return out


port_forwards = PortForwardManager()
