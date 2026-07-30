"""FastAPI instance for the Autoscaling Control Center.

Served over HTTP to a browser (see ../main.py). It was originally displayed in
a pywebview native window, which is still available via ../main_desktop.py -
nothing here is specific to either mode.

Two responsibilities exist here *because* it is browser-hosted:

  - teardown on shutdown, which the native window's `closing` event used to
    handle (a closed browser tab must not stop the server, so it cannot);
  - a same-origin / loopback guard, because a native window could only ever be
    driven by the person at the keyboard and a web server cannot assume that.
"""
import ipaddress
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.config import FRONTEND_DIR
from backend.routers import jobs, loadgen, monitoring, results, setup, target_app

# Set by the entrypoint once the real port is known. Until then the guard
# accepts any loopback Host, so importing this module (tests, scripts) works
# without a server.
_expected_port: int | None = None
_allow_remote = False


def set_expected_host(port: int, allow_remote: bool = False) -> None:
    """Tells the guard which port this process is actually serving on."""
    global _expected_port, _allow_remote
    _expected_port, _allow_remote = port, allow_remote


def _host_is_loopback(hostname: str) -> bool:
    if hostname in ("localhost", ""):
        return True
    try:
        return ipaddress.ip_address(hostname).is_loopback
    except ValueError:
        return False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup: reconcile which application the framework is pointed at, from
    the cluster itself, before the user can interact with anything. Runs in a
    background thread, not inline - the sync shells out to kubectl, and if the
    cluster is down or slow that must not delay the page being served, since a
    first-run user has no cluster at all yet.

    Shutdown: stop the load generator and the kubectl port-forwards. In desktop
    mode the window's `closing` event did this; in web mode there is no such
    event (closing a tab leaves the server running on purpose), so it belongs
    here - which also covers Ctrl+C, SIGTERM, and a reload, paths the window
    handler never covered.
    """
    from backend.orchestrator import target_app_manager

    def sync() -> None:
        try:
            target_app_manager.sync_from_cluster()
        except Exception:  # noqa: BLE001 - best-effort startup reconciliation; the Target App page re-syncs on open
            pass

    threading.Thread(target=sync, daemon=True).start()
    try:
        yield
    finally:
        from backend.orchestrator.loadgen import load_generator
        from backend.orchestrator.port_forwards import port_forwards

        # Order matters: the generator drives traffic through the "target"
        # forward, so it stops first.
        load_generator.stop()
        port_forwards.stop_all()


app = FastAPI(title="Autoscaling Control Center", lifespan=lifespan)
app.include_router(results.router)
app.include_router(setup.router)
app.include_router(jobs.router)
app.include_router(monitoring.router)
app.include_router(loadgen.router)
app.include_router(target_app.router)


@app.middleware("http")
async def local_only_guard(request: Request, call_next):
    """Rejects requests that did not come from this app's own page.

    Needed once the UI is a browser page rather than a native window. Two
    concrete attacks this closes, both of which a desktop window was immune to:

    - **DNS rebinding.** A page on the public internet can resolve its own
      hostname to 127.0.0.1 and then talk to this server from the browser of
      anyone who visits it. The requests arrive with a *foreign* Host header,
      so requiring Host to be loopback (and this process's port) blocks it.
    - **Cross-site POST.** Endpoints like /api/setup/bootstrap take no body, so
      any web page could fire a form POST at localhost and rebuild the user's
      cluster with no interaction. Cross-origin form posts are exempt from CORS
      preflight, so CORS configuration alone would not stop them - but they do
      carry an Origin header, so rejecting a foreign Origin does.

    Nothing here is authentication. It stops a *remote page* from driving this
    server; it cannot stop a local process, and it is not a substitute for
    putting the app behind a real login if --allow-remote is ever used.
    """
    host_header = (request.headers.get("host") or "").rsplit(":", 1)
    hostname = host_header[0].strip("[]")
    port = host_header[1] if len(host_header) > 1 else None

    if not _allow_remote:
        if not _host_is_loopback(hostname):
            return JSONResponse(
                status_code=421,  # Misdirected Request - this server isn't the one that host names
                content={"detail": f"This app only answers to localhost, not '{hostname}'."},
            )
        if _expected_port is not None and port is not None and port != str(_expected_port):
            return JSONResponse(
                status_code=421,
                content={"detail": f"Wrong port in Host header: {port} (serving {_expected_port})."},
            )

    origin = request.headers.get("origin")
    if origin:
        # Same-origin fetches from our own page send Origin on POST. A
        # cross-origin one means another site is driving us.
        expected = {f"http://{h}:{port}" for h in ("localhost", "127.0.0.1")} if port else set()
        if origin not in expected:
            return JSONResponse(
                status_code=403,
                content={"detail": "Cross-origin requests are not accepted."},
            )

    return await call_next(request)


@app.middleware("http")
async def no_cache_app_code(request: Request, call_next):
    """Browsers cache static assets aggressively - observed live in WebView2
    (same engine family as Edge/Chrome): a page opened before a JS fix kept
    executing the OLD setup.js long after the file on disk was corrected,
    making the fix look like it never happened. no-cache (revalidate every
    time - the ETag still makes unchanged files a cheap 304) on the app's own
    HTML/JS/CSS closes that. /vendor is exempt: the plotly/mermaid bundles are
    large and effectively immutable per checkout."""
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.startswith(("/js/", "/css/", "/diagrams/")):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/favicon.ico")
def favicon() -> FileResponse:
    """Browsers request this unprompted; without it every page load logs a 404.
    Not needed in desktop mode, where no such request was ever made."""
    return FileResponse(FRONTEND_DIR / "favicon.svg", media_type="image/svg+xml")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
app.mount("/vendor", StaticFiles(directory=FRONTEND_DIR / "vendor"), name="vendor")
app.mount("/diagrams", StaticFiles(directory=FRONTEND_DIR / "diagrams"), name="diagrams")
