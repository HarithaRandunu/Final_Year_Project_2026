"""Which application the framework is currently pointed at.

Single source of truth for both the load generator (Milestone 5, which needs
the target's probe URL) and the plug-in flow (Milestone 6, which rewrites the
live controllers' env vars to point at a different app). Starts on the
TeaStore preset because that is what the cluster is actually bootstrapped
with - it is not a guess about cluster state, it matches
cluster_setup.deploy_target_app()'s default manifest.
"""
from __future__ import annotations

import threading

from backend.presets.teastore import TEASTORE

_lock = threading.RLock()
_current: dict = dict(TEASTORE)


def get_target() -> dict:
    with _lock:
        return dict(_current)


def set_target(cfg: dict) -> dict:
    with _lock:
        _current.clear()
        _current.update(cfg)
        return dict(_current)


def probe_url_local(local_port: int) -> str:
    """The target's probe URL as reachable from the host, i.e. through the
    port-forward - not the in-cluster Service DNS name the controllers use."""
    target = get_target()
    path = target.get("probe_path") or "/"
    if not path.startswith("/"):
        path = f"/{path}"
    return f"http://127.0.0.1:{local_port}{path}"
