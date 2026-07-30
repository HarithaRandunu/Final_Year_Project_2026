"""Web application entrypoint. Serves the FastAPI app (backend/app.py) over
HTTP and opens it in the system's default browser.

    python main.py                  # http://127.0.0.1:8877, opens a browser tab
    python main.py --port 9000      # a different port
    python main.py --no-browser     # don't open a tab (e.g. running headless)
    python main.py --host 0.0.0.0 --allow-remote     # expose on the network

Converted from a pywebview desktop window on 2026-07-30 at the user's request.
The previous native-window launcher is kept as main_desktop.py; nothing in
backend/ or frontend/ is desktop-specific, which is why the conversion touches
only the process lifecycle.

Three things the native window used to handle implicitly, which this has to do
for itself:

1. **A predictable address.** The desktop launcher deliberately bound port 0,
   because each window had to own its own backend (two windows sharing a fixed
   port silently wired one of them to the other's server). A browser needs a
   URL a person can type and bookmark, so this binds a fixed port instead -
   and, since that reintroduces collisions, it probes upward for a free one
   and prints where it actually landed rather than dying or, worse, appearing
   to work while attached to a stale process.

2. **Teardown.** The window's `closing` event stopped the load generator and
   the kubectl port-forwards. Closing a browser tab must NOT do that (the
   server keeps running and other tabs keep working), so teardown moved into
   the app's own shutdown path in backend/app.py's lifespan, which fires on
   Ctrl+C, SIGTERM, or any other exit.

3. **Being local by construction.** A native window could only ever be driven
   by the person at the keyboard. A web server cannot assume that - see
   backend/app.py's local_only_guard, and --allow-remote below.
"""
from __future__ import annotations

import argparse
import errno
import ipaddress
import socket
import sys
import threading
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn

from backend.config import APP_SERVER_HOST, APP_SERVER_PORT

PORT_PROBE_ATTEMPTS = 20


def find_free_port(host: str, first: int, attempts: int = PORT_PROBE_ATTEMPTS) -> int:
    """First free port at or above `first`.

    Probed with a real bind on a throwaway socket rather than assumed: on
    Windows a port can be held by a process this one cannot see, and the
    failure mode that matters is not "crashed on startup" but "started, and
    the browser opened someone else's server".
    """
    for port in range(first, first + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            # No SO_REUSEADDR: the question is whether uvicorn can have this
            # port exclusively, and reuse would answer a different question.
            try:
                probe.bind((host, port))
            except OSError as exc:
                if exc.errno in (errno.EADDRINUSE, errno.EACCES) or getattr(exc, "winerror", None) == 10013:
                    continue
                raise
            return port
    raise RuntimeError(
        f"No free port in {first}-{first + attempts - 1} on {host}. "
        f"Pass --port to choose another range."
    )


def is_loopback(host: str) -> bool:
    if host in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Autoscaling Control Center (web app)")
    parser.add_argument("--host", default=APP_SERVER_HOST, help="interface to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=APP_SERVER_PORT, help="port to bind (default: 8877)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser tab")
    parser.add_argument(
        "--allow-remote",
        action="store_true",
        help="required to bind a non-loopback interface. This app can install software, "
             "build and delete Kubernetes clusters, and apply arbitrary manifests, and it has "
             "no login - anyone who can reach the port can do all of that.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if not is_loopback(args.host) and not args.allow_remote:
        # Refused rather than warned. There is no authentication anywhere in
        # this app, and its endpoints run kubectl/docker/winget - so binding a
        # public interface hands cluster control to the whole network. Making
        # that take an explicit flag means it cannot happen by way of a
        # copy-pasted command.
        print(
            f"Refusing to bind {args.host}: this app has no login, and its endpoints can install\n"
            f"software, rebuild the Kubernetes cluster, and apply arbitrary manifests. Anyone who\n"
            f"can reach the port could do all of that.\n\n"
            f"  - To use it yourself:      python main.py          (binds 127.0.0.1 only)\n"
            f"  - If you really mean it:   python main.py --host {args.host} --allow-remote\n"
            f"                             ...and put it behind something that authenticates.",
            file=sys.stderr,
        )
        return 2

    from backend.app import app, set_expected_host

    port = find_free_port("127.0.0.1" if args.host == "localhost" else args.host, args.port)
    if port != args.port:
        print(f"Port {args.port} is in use; using {port} instead.", flush=True)

    set_expected_host(port, allow_remote=args.allow_remote)

    display_host = "127.0.0.1" if args.host in ("0.0.0.0", "") else args.host
    url = f"http://{display_host}:{port}"

    print(f"\n  Autoscaling Control Center  ->  {url}", flush=True)
    if not is_loopback(args.host):
        print("  WARNING: bound to a non-loopback interface with no authentication.", flush=True)
    print("  Press Ctrl+C to stop.\n", flush=True)

    if not args.no_browser:
        # Threaded: webbrowser.open can block for seconds while a cold browser
        # starts, and the server should already be accepting by the time the
        # tab loads. A daemon thread also means a browser that never returns
        # cannot keep the process alive at shutdown.
        threading.Thread(target=lambda: webbrowser.open(url), daemon=True).start()

    # Runs on the main thread, so uvicorn installs its own SIGINT/SIGTERM
    # handlers and Ctrl+C triggers the lifespan shutdown that tears down the
    # port-forwards. The desktop launcher had to run it in a background thread
    # instead, because webview.start() owned the main thread.
    uvicorn.run(app, host=args.host, port=port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
