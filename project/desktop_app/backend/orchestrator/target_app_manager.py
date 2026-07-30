"""Plugging a different application into the framework (Milestone 6).

This is cheap to implement precisely because none of the live controllers are
TeaStore-specific in code - only in their *default* env values:

  module1_controller/app.py : NAMESPACE, TARGET_DEPLOYMENT, TARGET_LABEL_SELECTOR, PROBE_URL
  actuator/app.py           : NAMESPACE, TARGET_DEPLOYMENT, MIN_REPLICAS, MAX_REPLICAS
  module2_extender/app.py   : nothing - it scores NODES, so it is already app-agnostic
  module3_controller/app.py : nothing - it consumes Module 1's risk, not the app

So "plug in a different app" is `kubectl set env` + `rollout restart` on two
Deployments, not new controller logic. Both controllers hold ClusterRole (not
namespaced Role) permissions, so a target in another namespace works without
any RBAC change - the only difference is that its Service has to be addressed
by FQDN, which build_target_config() handles.

Three entry paths (see frontend/diagrams/06_plugin_app_flow.mmd) all converge
on reconfigure(): a built-in preset, a Deployment already running in the
cluster, or a user-supplied manifest applied first and then picked like path 2.
"""
from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from backend.config import DESKTOP_APP_DIR
from backend.orchestrator import target_app
from backend.orchestrator.jobs import Job
from backend.orchestrator.loadgen import load_generator
from backend.orchestrator.port_forwards import port_forwards
from backend.orchestrator.subprocess_runner import run_streaming
from backend.presets.teastore import PRESETS

# Our own framework components: offered separately (and flagged) rather than
# hidden, because pointing Module 1 at one of them is a legitimate thing to do
# for a demo, but doing it by accident - e.g. picking "module1-controller" as
# the target - creates a self-referential loop that is confusing to debug.
FRAMEWORK_DEPLOYMENTS = {"module1-controller", "module2-extender", "module3-controller", "actuator"}

# Infrastructure namespaces: never plausible monitoring targets, and listing
# them just buries the user's own apps.
SYSTEM_NAMESPACES = {"kube-system", "kube-public", "kube-node-lease", "local-path-storage", "keda"}

PROBE_VERIFY_TIMEOUT_S = 90


def _kubectl_json(args: list[str], timeout: int = 25) -> tuple[dict | None, str | None]:
    try:
        result = subprocess.run(
            ["kubectl", *args, "-o", "json"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
        )
    except (subprocess.SubprocessError, OSError, FileNotFoundError) as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if result.returncode != 0:
        return None, (result.stderr or result.stdout).strip()[:400]
    try:
        return json.loads(result.stdout), None
    except json.JSONDecodeError as exc:
        return None, f"Could not parse kubectl output: {exc}"


def _selector_string(match_labels: dict) -> str:
    """A Deployment's spec.selector.matchLabels rendered as the comma-separated
    label selector Module 1's TARGET_LABEL_SELECTOR expects (it passes the
    value straight into the Kubernetes API's ?labelSelector= query)."""
    return ",".join(f"{k}={v}" for k, v in sorted(match_labels.items()))


def _desired_replicas(deployment: str, namespace: str = "default") -> int | None:
    try:
        result = subprocess.run(
            ["kubectl", "get", "deployment", deployment, "-n", namespace, "-o", "jsonpath={.spec.replicas}"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
        )
        return int(result.stdout.strip()) if result.returncode == 0 and result.stdout.strip() else None
    except (ValueError, subprocess.SubprocessError, OSError):
        return None


def list_deployments() -> dict:
    """Every Deployment in the cluster that could plausibly be a target, each
    with the Services that route to it. Read-only.

    Services are matched by the rule Kubernetes itself uses - a Service selects
    a pod when every key/value in spec.selector is present on the pod's labels
    - so the returned service/port pairs are the ones traffic would genuinely
    reach the target through, not a guess from matching names.
    """
    deps, dep_err = _kubectl_json(["get", "deployments", "--all-namespaces"])
    if deps is None:
        return {"deployments": [], "error": dep_err}
    svcs, _ = _kubectl_json(["get", "services", "--all-namespaces"])
    services = (svcs or {}).get("items", [])

    out = []
    for dep in deps.get("items", []):
        meta = dep.get("metadata", {})
        namespace = meta.get("namespace", "default")
        if namespace in SYSTEM_NAMESPACES:
            continue
        name = meta.get("name", "")
        pod_labels = (dep.get("spec", {}).get("template", {}).get("metadata", {}) or {}).get("labels", {}) or {}
        match_labels = (dep.get("spec", {}).get("selector", {}) or {}).get("matchLabels", {}) or {}

        matching = []
        for svc in services:
            smeta = svc.get("metadata", {})
            if smeta.get("namespace") != namespace:
                continue
            selector = (svc.get("spec", {}) or {}).get("selector") or {}
            if not selector or any(pod_labels.get(k) != v for k, v in selector.items()):
                continue
            for port in (svc.get("spec", {}) or {}).get("ports", []) or []:
                matching.append({"service": smeta.get("name"), "port": port.get("port"), "name": port.get("name")})

        status = dep.get("status", {}) or {}
        out.append({
            "namespace": namespace,
            "name": name,
            "label_selector": _selector_string(match_labels or pod_labels),
            "replicas": dep.get("spec", {}).get("replicas"),
            "ready_replicas": status.get("readyReplicas") or 0,
            "image": ((dep.get("spec", {}).get("template", {}).get("spec", {}) or {}).get("containers") or [{}])[0].get("image"),
            "services": matching,
            "is_framework_component": name in FRAMEWORK_DEPLOYMENTS,
        })
    out.sort(key=lambda d: (d["is_framework_component"], d["namespace"], d["name"]))
    return {"deployments": out, "error": None}


def build_target_config(
    namespace: str,
    deployment: str,
    label_selector: str,
    service: str,
    service_port: int,
    probe_path: str,
    name: str | None = None,
) -> dict:
    """Assembles the target dict both the controllers' env vars and the load
    generator read from. Same shape as backend/presets/teastore.py's TEASTORE."""
    path = probe_path if probe_path.startswith("/") else f"/{probe_path}"
    # Short Service name only resolves inside its own namespace; the
    # controllers run in `default`, so anything else needs the FQDN.
    host = service if namespace == "default" else f"{service}.{namespace}.svc.cluster.local"
    return {
        "key": f"deployment:{namespace}/{deployment}",
        "name": name or f"{deployment} ({namespace})",
        "description": f"Deployment {deployment} in namespace {namespace}, probed via Service {service}:{service_port}.",
        "namespace": namespace,
        "deployment": deployment,
        "label_selector": label_selector,
        "service": service,
        "service_port": int(service_port),
        "probe_path": path,
        "probe_url_in_cluster": f"http://{host}:{int(service_port)}{path}",
    }


def sync_from_cluster() -> dict | None:
    """Reconciles the app's in-memory target with what the live cluster is
    actually configured for, by reading module1-controller's own env vars.

    Needed because the target survives in the *cluster* (it is a Deployment
    env var) but not in this app (a module-level dict). Confirmed live: after
    switching the target to teastore-image and restarting the app, the app
    reported TeaStore's webui while module1-controller was genuinely probing
    teastore-image - and the load generator would have driven traffic at one
    app while Module 1 scored a different one. Returns the reconciled config,
    or None if the cluster is unreachable or still on defaults.
    """
    dep, err = _kubectl_json(["get", "deployment", "module1-controller"])
    if dep is None:
        return None
    containers = ((dep.get("spec", {}).get("template", {}).get("spec", {}) or {}).get("containers") or [{}])
    env = {e.get("name"): e.get("value") for e in (containers[0].get("env") or []) if e.get("value") is not None}
    deployment = env.get("TARGET_DEPLOYMENT")
    probe_url = env.get("PROBE_URL")
    if not deployment or not probe_url:
        return None  # never reconfigured; the image's own defaults are in force

    parsed = urllib.parse.urlparse(probe_url)
    if not parsed.hostname:
        return None
    namespace = env.get("NAMESPACE", "default")
    cfg = build_target_config(
        namespace=namespace,
        deployment=deployment,
        label_selector=env.get("TARGET_LABEL_SELECTOR", ""),
        # A Service is addressed either bare (same namespace) or as an FQDN;
        # either way the first label is the Service name.
        service=parsed.hostname.split(".")[0],
        service_port=parsed.port or 80,
        probe_path=parsed.path or "/",
    )
    # Keep a preset's friendlier name/description when the cluster's live
    # values match it exactly, rather than degrading to "teastore-webui (default)".
    for preset in PRESETS.values():
        if (preset["deployment"], preset["namespace"], preset["probe_path"]) == (
            cfg["deployment"], cfg["namespace"], cfg["probe_path"]
        ):
            cfg = dict(preset)
            break
    target_app.set_target(cfg)
    port_forwards.repoint_target(cfg["service"], cfg["service_port"])
    return cfg


def apply_manifest(path_str: str, job: Job) -> None:
    """Path C: apply a user-supplied manifest, so an app that isn't in the
    cluster yet can become a target. Deliberately just `kubectl apply -f` -
    building an app from source is explicitly out of scope (see the plan)."""
    path = Path(path_str).expanduser()
    if not path.is_absolute():
        # Resolved against the app's own folder, not the process's working
        # directory: `python project/desktop_app/main.py` from the repo root
        # and `python main.py` from inside desktop_app/ are both normal ways
        # to launch, and a relative path must not mean different files in the
        # two cases - especially since the UI's "use the bundled example"
        # button fills in exactly such a path.
        path = (DESKTOP_APP_DIR / path).resolve()
    step = job.add_step("Validate manifest path")
    job.start_step(step)
    if not path.exists():
        job.append_log(step, f"ERROR: no such file or folder: {path}")
        job.finish_step(step, False)
        job.error = f"Manifest path does not exist: {path}"
        return
    job.append_log(step, f"{'Folder' if path.is_dir() else 'File'}: {path}")
    job.finish_step(step, True)

    run_streaming(["kubectl", "apply", "-f", str(path)], job, "kubectl apply", timeout=180)
    if job.error:
        return
    # Non-fatal: a manifest can legitimately contain no Deployment at all (a
    # ConfigMap-only bundle, say), and `wait` errors out when nothing matches.
    code = run_streaming(
        ["kubectl", "wait", "--for=condition=available", "deployment", "--all", "--timeout=180s"],
        job, "Wait for applied Deployments", timeout=190,
    )
    if code != 0:
        last = job.steps[-1]
        job.append_log(last, "(Not treated as a failure: some Deployments may still be starting, or the manifest may not define any. Check the target list next.)")
        job.finish_step(last, True)
        job.error = None


def _verify_probe(job: Job, cfg: dict) -> None:
    """Confirms the probe path actually answers over HTTP, through the same
    port-forward the load generator uses.

    Worth its own step because a wrong probe path is the single most likely
    mistake in this flow and it fails *silently* otherwise: Module 1 would
    happily measure the latency of a 404 page and emit a confident risk score
    computed from a signal that has nothing to do with the app's real health.
    """
    step = job.add_step("Verify probe URL responds")
    job.start_step(step)
    url = target_app.probe_url_local(port_forwards.target_local_port())
    job.append_log(step, f"GET {url}  (in-cluster equivalent: {cfg['probe_url_in_cluster']})")

    deadline = time.monotonic() + PROBE_VERIFY_TIMEOUT_S
    last_detail = "no attempt made"
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                job.append_log(step, f"HTTP {resp.status} - target is reachable.")
                job.finish_step(step, True)
                return
        except urllib.error.HTTPError as exc:
            # A status code means the tunnel and the app both work, so retrying
            # won't help - the path itself is wrong. Fail immediately.
            job.append_log(step, f"HTTP {exc.code} for {cfg['probe_path']} - the app answered but that path is not valid.")
            job.append_log(step, "Fix the probe path and run this again: Module 1 would otherwise be scoring the latency of an error page.")
            job.finish_step(step, False)
            job.error = f"Probe path {cfg['probe_path']} returned HTTP {exc.code} - pick a path that returns 2xx"
            return
        except (urllib.error.URLError, OSError, TimeoutError) as exc:
            last_detail = f"{type(exc).__name__}: {exc}"
            time.sleep(3)

    job.append_log(step, f"Not reachable within {PROBE_VERIFY_TIMEOUT_S}s. Last error: {last_detail}")
    job.append_log(step, f"Check that Service {cfg['service']}:{cfg['service_port']} exists in namespace {cfg['namespace']} and has ready pods behind it.")
    job.finish_step(step, False)
    job.error = f"Could not reach the target through its Service ({cfg['service']}:{cfg['service_port']})"


def reconfigure(cfg: dict, job: Job, min_replicas: int = 1, max_replicas: int = 2) -> None:
    """Repoints the live framework at `cfg`'s application.

    Order matters here:
      1. stop the load generator first - it is mid-flight against the OLD app
         through a forward that is about to be repointed, so leaving it running
         would silently mix two apps' requests into one set of statistics;
      2. set env + rollout restart, which also resets Module 1's rolling
         history - wanted, since a history blending two different apps'
         latencies would produce a meaningless risk score for several cycles;
      3. only then move the port-forwards, and only after the new pods are
         ready, so monitoring never renders a blank state that looks like a
         fault.
    """
    if not cfg.get("label_selector"):
        # Checked before anything is touched: without pod labels Module 1 has
        # no way to find the target's pods, so there is no point restarting
        # controllers into a configuration that cannot work.
        step = job.add_step("Validate target")
        job.start_step(step)
        job.append_log(step, f"ERROR: Deployment {cfg.get('deployment')} exposes no pod labels to select on.")
        job.append_log(step, "Module 1 identifies the target's pods by label selector, so a target without labels cannot be monitored.")
        job.finish_step(step, False)
        job.error = "Target has an empty label selector - Module 1 could not identify its pods"
        return

    step = job.add_step("Prepare switch")
    job.start_step(step)
    job.append_log(step, f"New target: {cfg['name']}")
    job.append_log(step, f"  TARGET_DEPLOYMENT      = {cfg['deployment']}")
    job.append_log(step, f"  TARGET_LABEL_SELECTOR  = {cfg['label_selector']}")
    job.append_log(step, f"  PROBE_URL              = {cfg['probe_url_in_cluster']}")
    job.append_log(step, f"  NAMESPACE              = {cfg['namespace']}")
    if load_generator.status()["running"]:
        load_generator.stop()
        job.append_log(step, "Stopped the load generator - it was generating traffic against the previous target.")
    forwards_were_running = any(pf["process_alive"] for pf in port_forwards.status().values())
    port_forwards.stop_all()
    job.append_log(step, "Port-forwards stopped; they are restarted once the new pods are ready.")
    job.finish_step(step, True)

    run_streaming(
        ["kubectl", "set", "env", "deployment/module1-controller",
         f"TARGET_DEPLOYMENT={cfg['deployment']}",
         f"TARGET_LABEL_SELECTOR={cfg['label_selector']}",
         f"PROBE_URL={cfg['probe_url_in_cluster']}",
         f"NAMESPACE={cfg['namespace']}"],
        job, "Point Module 1 at the new target", timeout=60,
    )
    if job.error:
        return

    # The actuator needs the deployment identity (it PATCHes /scale) but not
    # the probe URL - it never talks to the app, only to the API server.
    # MIN/MAX_REPLICAS travel with the target because they are a property of
    # the app being scaled, not of the framework.
    run_streaming(
        ["kubectl", "set", "env", "deployment/actuator",
         f"TARGET_DEPLOYMENT={cfg['deployment']}",
         f"NAMESPACE={cfg['namespace']}",
         f"MIN_REPLICAS={int(min_replicas)}",
         f"MAX_REPLICAS={int(max_replicas)}"],
        job, "Point the actuator at the new target", timeout=60,
    )
    if job.error:
        return

    run_streaming(["kubectl", "rollout", "restart", "deployment/module1-controller", "deployment/actuator"],
                  job, "Restart both controllers", timeout=60)
    if job.error:
        return

    run_streaming(["kubectl", "rollout", "status", "deployment/module1-controller", "--timeout=180s"],
                  job, "Wait for Module 1 to come back", timeout=190)
    if job.error:
        return

    # The actuator sits at 0 replicas outside the ablation arms that use it
    # (see live_cluster/actuator/deployment.yaml), and waiting on a rollout
    # that has no pods to create is just a confusing extra step.
    act_step = job.add_step("Wait for the actuator")
    job.start_step(act_step)
    if _desired_replicas("actuator") == 0:
        job.append_log(act_step, "Actuator is scaled to 0 (its normal state outside an ablation arm) - nothing to wait for. It will pick up the new target when scaled up.")
        job.finish_step(act_step, True)
    else:
        job.finish_step(act_step, True)
        run_streaming(["kubectl", "rollout", "status", "deployment/actuator", "--timeout=180s"],
                      job, "Wait for the actuator rollout", timeout=190)
        if job.error:
            return

    # Recorded even if verification then fails: the controllers' env vars have
    # genuinely changed by this point, so reverting this in-app state would
    # make the UI describe a cluster configuration that no longer exists. The
    # failed job step is what tells the user to fix the probe path and retry.
    target_app.set_target(cfg)
    port_forwards.repoint_target(cfg["service"], cfg["service_port"])
    port_forwards.start_all()

    try:
        _verify_probe(job, cfg)
    finally:
        if not forwards_were_running:
            # Restore the state we found - in a finally block because a FAILED
            # verification must clean up too. Confirmed live: returning early
            # on the error path left all five kubectl port-forward processes
            # running after a job the user saw fail, which also puts the
            # monitoring page's start/stop toggle out of step with reality.
            port_forwards.stop_all()
    if job.error:
        return

    final = job.add_step("Switch complete")
    job.start_step(final)
    job.append_log(final, f"The framework is now monitoring and scaling {cfg['name']}.")
    job.append_log(final, "Module 1 recomputes on a 120s bucket cycle and Module 3 on a 120s control cycle, so give the Live Monitoring page ~4 minutes before its numbers describe the new app.")
    job.finish_step(final, True)


def reconfigure_preset(preset_key: str, job: Job, min_replicas: int = 1, max_replicas: int = 2) -> None:
    """Path A. Presets carry their own validated probe path, so there is
    nothing for the user to fill in - selecting TeaStore restores exactly the
    configuration the Phase 5-7 results were produced under."""
    preset = PRESETS.get(preset_key)
    if preset is None:
        step = job.add_step("Resolve preset")
        job.start_step(step)
        job.append_log(step, f"ERROR: unknown preset '{preset_key}'")
        job.finish_step(step, False)
        job.error = f"Unknown preset: {preset_key}"
        return
    reconfigure(dict(preset), job, min_replicas, max_replicas)
