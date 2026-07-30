# Autoscaling Control Center (web app)

The project's primary UI. A local web application that runs the whole
framework — it installs the prerequisite tools, builds the local Kubernetes
cluster, points the three modules at whichever application you choose, and
shows what they do to it while traffic flows.

This replaces the command chain in
[`../live_cluster/README.md`](../live_cluster/README.md). That runbook is still
correct and still worth reading to understand *what* is happening, but you
should not have to type any of it.

> **The folder is still called `desktop_app`.** This started as a pywebview
> desktop application and was converted to a web app on 2026-07-30. The
> directory name was left alone so that every existing reference — in
> `CLAUDE.md`, the planning docs, and the progress trace — keeps resolving.
> Nothing inside it is desktop-specific.

## Run it

```bash
python main.py
```

It serves on <http://127.0.0.1:8877> and opens your default browser there. If
8877 is taken it probes upward and prints the port it actually used.

First run only, to create the virtual environment:

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python main.py
```

Options:

| Flag | Effect |
|---|---|
| `--port 9000` | Bind a different port. |
| `--no-browser` | Don't open a tab (headless, or you already have one open). |
| `--host` + `--allow-remote` | Expose it beyond localhost. **Read the warning below first.** |

Stop it with **Ctrl+C**, which also shuts down the `kubectl port-forward`
processes and the load generator. Closing the browser tab deliberately does
*not* — the server keeps running, and reopening the page picks up exactly where
it left off, including live monitoring if it was already on.

There is no build step, no Node, and no internet access needed at runtime —
`plotly.min.js` and `mermaid.min.js` are vendored in `frontend/vendor/`.

### A word on exposing it

This app has **no authentication**, and its endpoints install software, create
and rebuild Kubernetes clusters, and apply arbitrary manifests. Anyone who can
reach the port can do all of that. So:

- It binds `127.0.0.1` only, and **refuses** a non-loopback bind unless you
  also pass `--allow-remote`.
- Requests whose `Host` header isn't this server's own loopback address are
  rejected (this is what stops a public web page from resolving its hostname
  to 127.0.0.1 and driving your cluster through your own browser).
- Cross-origin requests are rejected, because endpoints like
  `/api/setup/bootstrap` take no request body and a plain cross-site form POST
  would otherwise be enough to rebuild your cluster.

None of that is a substitute for a real login. If you genuinely need this
reachable from another machine, put it behind something that authenticates.

### Desktop mode

The original native-window launcher still works:

```bash
pip install pywebview pythonnet
python main_desktop.py
```

It uses Windows' built-in WebView2, so there is no bundled Chromium. That was
the original reason for choosing it: this project has a documented ~15.9 GB
usable-RAM ceiling and a history of OOM incidents while running the cluster
(see `docs/Full_Plan_MultiSignal_Autoscaling.md` §11). A browser tab costs more
than WebView2 but less than an Electron app would have.

## The five pages

| Page | What it does |
|---|---|
| **Home** | Whether the app is usable right now — tools, cluster, API, and each component's replica count — and what to click next if not. |
| **Setup** | Detects Docker Desktop / kind / kubectl / Helm and installs what's missing, one permission-gated click each, then bootstraps the entire cluster in one job with a live log. |
| **Target App** | Chooses which application the framework monitors and scales: a built-in preset, any Deployment already in the cluster, or your own manifest. |
| **Live Monitoring** | All four components' own endpoints polled every 3 s, plus a load generator so there is something to react to. |
| **Results** | Every Phase 2–7 result: each module's training/validation, the Phase 4 integration check, and the live 25-trial ablation study with its statistics. |
| **How It Works** | Eight diagrams — architecture, each module's pipeline, the live control loop, the plug-in flow, setup automation, and the ablation arm configuration. |

## Plugging in your own application

Nothing in the framework is hard-wired to TeaStore. Module 1 and the actuator
read their target's identity from environment variables, and Module 2 scores
*nodes*, so it is app-agnostic already. Switching target therefore reconfigures
the running controllers — it does not rebuild anything.

Three ways in, all ending in the same reconfigure step:

1. **Built-in preset** — restores exactly the configuration this project's
   Phase 5–7 results were produced under.
2. **A Deployment already in the cluster** — listed together with the Services
   that genuinely route to it (matched by label selector, the way Kubernetes
   matches them, not by similar names). You supply an HTTP path that returns
   2xx; the app verifies it before finishing, because a path that 404s would
   leave Module 1 scoring the latency of an error page.
3. **Your own manifest** — `kubectl apply -f` on a file or folder, then pick it
   on tab 2. [`examples/demo-app.yaml`](examples/demo-app.yaml) is a ~7 MB test
   server for trying this without supplying an app of your own.

Building an application **from source code is out of scope** — supply a
manifest, or an image reference inside one.

## Layout

```
main.py                     web entrypoint: uvicorn + open a browser tab
main_desktop.py             legacy native-window entrypoint (pywebview)
backend/
  app.py                    FastAPI instance, routers, static mounts, middleware, lifespan
  config.py                 paths, cluster name, the fixed local port-forward ports
  routers/                  thin HTTP adapters only
  orchestrator/             all subprocess and state logic lives here
  presets/                  the built-in target-app presets
frontend/
  index.html, css/, js/     plain HTML/CSS/vanilla JS, no framework
  diagrams/*.mmd            the eight Mermaid sources
  vendor/                   plotly.min.js, mermaid.min.js (committed, no CDN)
examples/demo-app.yaml      a minimal third-party app for trying the plug-in flow
```

`orchestrator/` is deliberately independent of FastAPI — it is the most
stateful, highest-risk part of the app (subprocesses, port-forwards, cluster
mutations), and it should be testable without a server running.

## Notes for anyone changing this

- **Read `docs/Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 9 section
  first.** It records the scope decisions, every bug found by actually running
  the app against the live cluster, and one unexplained cluster state that a
  confirmation guard now prevents.
- **Verify through the path a user takes.** Several correct fixes looked broken
  during development because they were checked differently from how the app is
  actually run. Hence: the app's own HTML/JS/CSS are served `no-cache` (browsers
  cache aggressively, and a stale `setup.js` once made a real fix look like it
  never happened), and a target switch requires a confirmation click.
- **The page and the server have separate lifetimes now.** Anything the UI
  assumes about its own state has to be re-derived on load — a reload or a
  second tab gets a fresh frontend attached to a backend that may already be
  polling. `/api/monitoring/running` and `/api/loadgen/status` exist for that;
  add an equivalent for any new long-running feature.
- **Subprocess calls must pass `encoding="utf-8", errors="replace"`.**
  `text=True` alone uses cp1252 on Windows, which crashes on Docker BuildKit
  output.
- **Never blanket-kill `python` processes** while debugging — that kills the
  backend behind the user's own open window. Find the specific PID by its port.
