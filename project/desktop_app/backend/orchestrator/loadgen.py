"""Random-interval load generator (Milestone 5).

Deliberately simpler than project/live_cluster/loadgen/ablation_trial.js: that
one is k6 replaying an Alibaba-derived arrival-rate profile inside the cluster
and is what the formal Phase 6 trials use - it stays the instrument of record
and is untouched. This is a host-side "make the live signals move so I can
watch the framework react" tool, driven from the desktop app.

Rate bounds default to 8-24 req/s because that is the range Phase 6's capacity
probe actually validated on this host (see Progress_Trace.md's Phase 6
section: 8/16/24 req/s, CPU peaked 89% on webui, memory held 3.7-4.1GB). The
hard cap exists for the same reason - this project has documented OOM
incidents from overloading a 2-node kind cluster, and a slider that can ask
for 500 req/s is a foot-gun, not a feature.

Traffic goes through the "target" port-forward, so it hits the same Service
Module 1 probes - not a bypass path that would make the modules' view and the
generated load disagree.
"""
from __future__ import annotations

import math
import random
import threading
import time
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor

from backend.orchestrator import target_app
from backend.orchestrator.port_forwards import port_forwards

MIN_RPS_FLOOR = 0.5
MAX_RPS_CAP = 30.0
WORKERS = 16
LATENCY_WINDOW = 200


def _expected_mean_rps(min_rps: float, max_rps: float) -> float:
    """Long-run rate when the instantaneous rate is drawn uniformly from
    [min, max] and the wait is its reciprocal: the harmonic mean
    (max-min)/ln(max/min), which sits below the arithmetic midpoint."""
    if max_rps <= min_rps:
        return round(min_rps, 2)
    return round((max_rps - min_rps) / math.log(max_rps / min_rps), 2)


class LoadGenerator:
    def __init__(self):
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._pool: ThreadPoolExecutor | None = None
        self.min_rps = 8.0
        self.max_rps = 24.0
        self.started_at: float | None = None
        self.sent = 0
        self.ok = 0
        self.failed = 0
        self.last_error: str | None = None
        self.latencies: deque[float] = deque(maxlen=LATENCY_WINDOW)
        self.url: str | None = None

    # --- control -----------------------------------------------------------

    def start(self, min_rps: float, max_rps: float) -> dict:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return self.status()

            min_rps = max(MIN_RPS_FLOOR, float(min_rps))
            max_rps = min(MAX_RPS_CAP, float(max_rps))
            if max_rps < min_rps:
                max_rps = min_rps
            self.min_rps, self.max_rps = min_rps, max_rps

            # Ensure the tunnel to the target exists; the manager is
            # idempotent, so this is safe whether or not monitoring is on.
            port_forwards.start_all()
            self.url = target_app.probe_url_local(port_forwards.target_local_port())

            self.sent = self.ok = self.failed = 0
            self.last_error = None
            self.latencies.clear()
            self.started_at = time.monotonic()
            self._stop.clear()
            self._pool = ThreadPoolExecutor(max_workers=WORKERS, thread_name_prefix="loadgen")
            self._thread = threading.Thread(target=self._pace_loop, daemon=True)
            self._thread.start()
            return self.status()

    def stop(self) -> dict:
        with self._lock:
            self._stop.set()
            thread, pool = self._thread, self._pool
            self._thread = self._pool = None
        if thread is not None:
            thread.join(timeout=5)
        if pool is not None:
            pool.shutdown(wait=False, cancel_futures=True)
        with self._lock:
            self.started_at = None
            return self.status()

    # --- worker ------------------------------------------------------------

    def _pace_loop(self) -> None:
        """Submits one request per jittered interval. Pacing lives here and
        the requests themselves run on the pool, so a slow response can't
        drag the arrival rate down - which would otherwise silently turn a
        '24 req/s' setting into whatever the app could keep up with.

        Scheduling is against an ABSOLUTE deadline, not a relative sleep after
        each submit. Measured live: relative sleeps produced 9.1 req/s for an
        8-24 band, because every iteration's own cost (submit, GIL contention
        with 16 in-flight worker threads, Windows' ~15ms timer granularity)
        was added on top of the requested interval and accumulated. Advancing
        a deadline absorbs that overhead instead of compounding it.
        """
        next_at = time.monotonic()
        while not self._stop.is_set():
            rps = random.uniform(self.min_rps, self.max_rps)
            next_at += 1.0 / rps if rps > 0 else 1.0
            delay = next_at - time.monotonic()
            if delay > 0:
                self._stop.wait(delay)
            else:
                # Fell behind (host contention). Resync rather than trying to
                # "catch up" with a burst, which would overshoot the band.
                next_at = time.monotonic()
            if self._stop.is_set():
                return
            pool = self._pool
            if pool is None:
                return
            try:
                pool.submit(self._one_request)
            except RuntimeError:
                return  # pool shut down mid-flight

    def _one_request(self) -> None:
        url = self.url
        if not url:
            return
        start = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                resp.read(2048)
            elapsed_ms = (time.monotonic() - start) * 1000.0
            with self._lock:
                self.sent += 1
                self.ok += 1
                self.latencies.append(elapsed_ms)
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            with self._lock:
                self.sent += 1
                self.failed += 1
                self.last_error = f"{type(exc).__name__}: {exc}"

    # --- reads -------------------------------------------------------------

    def status(self) -> dict:
        running = self._thread is not None and self._thread.is_alive()
        elapsed = (time.monotonic() - self.started_at) if self.started_at else 0.0
        lat = sorted(self.latencies)

        def pct(p: float) -> float | None:
            if not lat:
                return None
            idx = min(len(lat) - 1, max(0, round(p / 100.0 * (len(lat) - 1))))
            return round(lat[idx], 1)

        return {
            "running": running,
            "url": self.url,
            "min_rps": self.min_rps,
            "max_rps": self.max_rps,
            "max_rps_cap": MAX_RPS_CAP,
            # The rate is redrawn uniformly per request and the interval is
            # its reciprocal, so the long-run rate converges on the band's
            # HARMONIC mean (~14.6 for 8-24), not its arithmetic midpoint of
            # 16. Exposed so the UI can state the expected value honestly
            # rather than looking like it under-delivers.
            "expected_mean_rps": _expected_mean_rps(self.min_rps, self.max_rps),
            "elapsed_s": round(elapsed, 1),
            "sent": self.sent,
            "ok": self.ok,
            "failed": self.failed,
            "achieved_rps": round(self.sent / elapsed, 2) if elapsed > 0.5 else None,
            "latency_p50_ms": pct(50),
            "latency_p95_ms": pct(95),
            "last_error": self.last_error,
        }


load_generator = LoadGenerator()
