"""Native-window launcher - the app's original desktop mode.

Superseded by main.py (web app) on 2026-07-30 at the user's request. Kept
working rather than deleted: nothing in backend/ or frontend/ is specific to
either mode, so this costs one file and gives the option back for free.

Opens a pywebview window using Windows' built-in WebView2 (no bundled browser)
pointed at the same FastAPI app. webview.start() must run on the main thread
(a Windows COM/WebView2 requirement), so the server is started first, in a
background thread.

The server binds an EPHEMERAL port (port 0), not a fixed one. With a fixed
port, a second launch while another instance is alive doesn't fail - its own
uvicorn silently loses the bind race, the readiness probe then gets a 200 from
the OTHER instance's server, and the new window opens wired to a backend owned
by a different process. When that other process later exits, this window is
left permanently dead ("Running..." forever, no errors) - observed live during
Milestone 3/4 debugging, where test instances and the user's real window
repeatedly clobbered each other exactly this way. An ephemeral port makes every
window own its backend, unconditionally.

Run it with:  python main_desktop.py
Requires the optional desktop dependencies:  pip install pywebview pythonnet
"""
from __future__ import annotations

import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn

try:
    import webview
except ImportError:  # pragma: no cover - guidance beats a bare traceback
    raise SystemExit(
        "Desktop mode needs pywebview, which is no longer a default dependency.\n"
        "  pip install pywebview pythonnet\n"
        "Or just run the web app instead:  python main.py"
    )

from backend.config import APP_SERVER_HOST


def _wait_for_server(url: str, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(url, timeout=0.5).close()
            return
        except (urllib.error.URLError, OSError):
            time.sleep(0.1)
    raise RuntimeError(f"Server did not become ready at {url} within {timeout}s")


def main() -> None:
    from backend.app import app, set_expected_host

    config = uvicorn.Config(app, host=APP_SERVER_HOST, port=0, log_level="warning")
    server = uvicorn.Server(config)
    server_thread = threading.Thread(target=server.run, daemon=True)
    server_thread.start()

    deadline = time.monotonic() + 10.0
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    if not server.started or not server.servers:
        raise RuntimeError("Server failed to start (see console output above)")
    port = server.servers[0].sockets[0].getsockname()[1]

    set_expected_host(port, allow_remote=False)

    base_url = f"http://{APP_SERVER_HOST}:{port}"
    _wait_for_server(f"{base_url}/api/health")
    print(f"Serving on {base_url}", flush=True)  # lets scripts/tests find this instance's own port

    window = webview.create_window("Autoscaling Control Center", base_url, width=1280, height=860, min_size=(1000, 700))

    def on_closing() -> None:
        # Fires while the window is still open, so the kubectl port-forward
        # child processes get terminated before teardown - otherwise they'd
        # outlive the app and keep holding their local ports. (The web app
        # gets the same teardown from backend/app.py's lifespan instead.)
        from backend.orchestrator.loadgen import load_generator
        from backend.orchestrator.port_forwards import port_forwards

        load_generator.stop()  # before the forwards it depends on
        port_forwards.stop_all()
        server.should_exit = True

    window.events.closing += on_closing

    webview.start()
    server_thread.join(timeout=5)


if __name__ == "__main__":
    main()
