"""Ports project/live_cluster/README.md's Part B, step by step, as Job steps.
Each function is one runnable unit; bootstrap_all() chains them in the same
order the README documents by hand. Nothing here runs unless a route
explicitly starts a job for it (see routers/setup.py) - importing this module
has no side effects.
"""
from __future__ import annotations

import ctypes
import re
import subprocess
import time

from backend.config import CLUSTER_NAME, CONTROL_PLANE_CONTAINER, LIVE_CLUSTER_DIR
from backend.orchestrator.jobs import Job
from backend.orchestrator.subprocess_runner import resolve_tool_command, run_streaming

METRICS_SERVER_URL = "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"

# Same floor and same native Win32 check as ablation/run_trial.py's free_gb()
# / --min-free-gb - this project has real, documented OOM incidents from
# exactly this kind of cluster-creation work (see Full_Plan.md Section 11
# and Progress_Trace.md's Phase 5/6 host-capacity notes), so bootstrap_all()
# gets the same discipline run_trial.py already uses for live trials.
MIN_FREE_GB = 2.5


def free_gb() -> float:
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("sullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    stat = MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
    return stat.ullAvailPhys / (1024**3)


def check_memory_or_abort(job: Job, step_label: str) -> bool:
    """Returns True if there's enough free memory to proceed. Sets job.error
    and returns False otherwise - callers should check this before every
    heavy step (cluster create, image builds, target-app deploy), not just
    once at the start, since each prior step can itself push memory down."""
    mem = free_gb()
    if mem < MIN_FREE_GB:
        step = job.add_step(f"Memory check before {step_label}")
        job.start_step(step)
        job.append_log(step, f"ABORTING: only {mem:.1f}GB free (< {MIN_FREE_GB}GB floor) - see docs/Full_Plan_MultiSignal_Autoscaling.md Section 11 for why this floor exists.")
        job.append_log(step, "To reclaim memory: close other applications, then (the fix this project has repeatedly validated) run `wsl --shutdown` in a terminal - Docker Desktop's WSL2 backend holds onto memory it no longer needs and this releases it; Docker restarts itself in ~30s and the cluster survives. Then click the bootstrap button again - completed steps are skipped automatically.")
        job.finish_step(step, False)
        job.error = f"Aborted before {step_label}: only {mem:.1f}GB free memory (floor is {MIN_FREE_GB}GB) - the step log explains how to reclaim memory"
        return False
    return True


def cluster_exists() -> bool:
    result = subprocess.run(["kind", "get", "clusters"], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15)
    return CLUSTER_NAME in result.stdout.split()


def api_reachable() -> bool:
    result = subprocess.run(
        ["kubectl", "get", "--raw", "/livez", "--request-timeout=5s"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=45,
    )
    return result.returncode == 0


def repair_stale_api_connection(job: Job) -> None:
    """After `wsl --shutdown` (the exact remediation check_memory_or_abort's
    own message tells the user to run), the kind node containers come back up
    but the host-side docker-proxy for the API server's published port can
    stay dead - confirmed live: `docker port` still showed the mapping and
    every container inside the node was Running, yet kubectl got EOF for 13+
    minutes until the node containers were restarted. Since our own advice
    causes this state, the bootstrap has to repair it rather than fail on it."""
    if api_reachable():
        return
    step = job.add_step("Repair cluster API connection")
    job.start_step(step)
    job.append_log(step, "Cluster containers exist but the Kubernetes API is unreachable - the usual cause is a stale Docker port proxy after a WSL2/Docker restart. Restarting the cluster's node containers to rebuild it (cluster state survives this).")
    job.finish_step(step, True)  # mark the diagnosis step done; the restart itself gets its own streamed steps
    run_streaming(["docker", "restart", CONTROL_PLANE_CONTAINER, f"{CLUSTER_NAME}-worker"], job, "Restart cluster node containers", timeout=180)
    if job.error:
        return
    wait_step = job.add_step("Wait for Kubernetes API")
    job.start_step(wait_step)
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        if api_reachable():
            job.append_log(wait_step, "API is reachable again.")
            job.finish_step(wait_step, True)
            return
        time.sleep(10)
    job.append_log(wait_step, "API still unreachable after 5 minutes.")
    job.finish_step(wait_step, False)
    job.error = "Cluster API did not recover after restarting node containers - try `kind delete cluster --name fyp-autoscaling` and a fresh bootstrap"


def create_cluster(job: Job) -> None:
    """Idempotent: `kind create cluster` fails hard (non-zero exit) if a
    cluster with this name already exists - confirmed live, this is exactly
    what broke a bootstrap run against a machine that already had the
    cluster set up from earlier work. Checking first, rather than letting
    kind fail, is the fix - not a workaround."""
    if cluster_exists():
        step = job.add_step("Check for existing cluster")
        job.start_step(step)
        job.append_log(step, f"Cluster '{CLUSTER_NAME}' already exists - reusing it instead of creating a new one.")
        job.finish_step(step, True)
        repair_stale_api_connection(job)
        if job.error:
            return
    else:
        run_streaming(["kind", "create", "cluster", "--config", "kind-cluster.yaml"], job, "Create kind cluster", timeout=300, cwd=LIVE_CLUSTER_DIR)
        if job.error:
            return

    # Also idempotent: removing a taint that's already gone (e.g. this ran
    # once before) makes `kubectl taint ... <taint>-` itself exit non-zero
    # ("taint not found") even though the end state is exactly what we want -
    # so this step's own failure is treated as informational, not fatal.
    code = run_streaming(
        ["kubectl", "taint", "nodes", f"{CLUSTER_NAME}-control-plane", "node-role.kubernetes.io/control-plane-", "--overwrite"],
        job, "Untaint control-plane node", timeout=30,
    )
    if code != 0:
        # "taint not found" = it was already removed by an earlier run - the
        # end state is exactly what this step exists to guarantee, so re-mark
        # the step as SUCCESS, not just non-fatal: a red X on a step that
        # actually achieved its goal reads as "still broken" in the UI.
        last = job.steps[-1]
        job.append_log(last, "(Taint was already removed by an earlier run - end state achieved, marking this step successful.)")
        job.finish_step(last, True)
        job.error = None


def install_metrics_server(job: Job) -> None:
    run_streaming(["kubectl", "apply", "-f", METRICS_SERVER_URL], job, "Apply metrics-server", timeout=60)
    if job.error:
        return

    # Idempotent: the patch file *adds* an args entry (JSON patch "add" at
    # .../args/-), so re-applying it against an already-patched deployment
    # would append a second, duplicate --kubelet-insecure-tls flag - harmless
    # to metrics-server but untidy. Skip if it's already there.
    check = subprocess.run(
        ["kubectl", "get", "deployment", "metrics-server", "-n", "kube-system", "-o", "jsonpath={.spec.template.spec.containers[0].args}"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
    )
    already_patched = "--kubelet-insecure-tls" in check.stdout
    if already_patched:
        step = job.add_step("Patch metrics-server (insecure TLS)")
        job.start_step(step)
        job.append_log(step, "Already patched - skipping.")
        job.finish_step(step, True)
    else:
        run_streaming(
            ["kubectl", "patch", "deployment", "metrics-server", "-n", "kube-system", "--type=json", "--patch-file=metrics-server-patch.json"],
            job, "Patch metrics-server (insecure TLS)", timeout=30, cwd=LIVE_CLUSTER_DIR,
        )
        if job.error:
            return
    run_streaming(
        ["kubectl", "rollout", "status", "deployment/metrics-server", "-n", "kube-system", "--timeout=90s"],
        job, "Wait for metrics-server", timeout=100,
    )


def keda_operator_ready() -> bool:
    result = subprocess.run(
        ["kubectl", "get", "deployment", "keda-operator", "-n", "keda", "-o", "jsonpath={.status.availableReplicas}"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
    )
    return result.returncode == 0 and result.stdout.strip() not in ("", "0")


def install_keda(job: Job) -> None:
    if keda_operator_ready():
        step = job.add_step("Check KEDA")
        job.start_step(step)
        job.append_log(step, "keda-operator is already deployed and available - skipping install.")
        job.finish_step(step, True)
        return

    # resolve_tool_command: same PATH-timing fix as detection - falls back to
    # helm's known winget install location if the bare command isn't
    # resolvable from this process yet.
    helm = resolve_tool_command("helm", "Helm.Helm")

    run_streaming([helm, "repo", "add", "kedacore", "https://kedacore.github.io/charts"], job, "Add KEDA helm repo", timeout=30)
    if job.error:
        return
    run_streaming([helm, "repo", "update"], job, "Update helm repos", timeout=60)
    if job.error:
        return
    # upgrade --install (helm's "install if absent, upgrade if present" idiom)
    # still isn't enough on its own: confirmed live, it fails with "cannot be
    # imported into the current release" when the keda-operator ServiceAccount
    # already exists but wasn't created by a Helm release Helm recognizes as
    # owning it (e.g. KEDA was set up some other way originally, or the
    # release record was lost while the resources stayed). The
    # keda_operator_ready() check above is the real fix - it looks at whether
    # KEDA is actually working, not at Helm's own release bookkeeping.
    run_streaming(
        [helm, "upgrade", "--install", "keda", "kedacore/keda", "--namespace", "keda", "--create-namespace"],
        job, "Install/upgrade KEDA", timeout=120,
    )
    if job.error:
        return
    run_streaming(
        ["kubectl", "wait", "--for=condition=available", "deployment/keda-operator", "-n", "keda", "--timeout=120s"],
        job, "Wait for KEDA operator", timeout=130,
    )


def deploy_target_app(job: Job, manifest: str = "teastore/teastore.yaml", baseline: str = "teastore/keda-baseline.yaml") -> None:
    run_streaming(["kubectl", "apply", "-f", manifest], job, f"Deploy target app ({manifest})", timeout=60, cwd=LIVE_CLUSTER_DIR)
    if job.error:
        return
    run_streaming(["kubectl", "wait", "--for=condition=available", "deployment", "--all", "--timeout=180s"], job, "Wait for target app pods", timeout=190)
    if job.error:
        return
    run_streaming(["kubectl", "apply", "-f", baseline], job, f"Apply autoscaling baseline ({baseline})", timeout=30, cwd=LIVE_CLUSTER_DIR)


def build_and_load_images(job: Job) -> None:
    components = ["actuator", "module1_controller", "module2_extender", "module3_controller"]
    images = ["actuator", "module1-controller", "module2-extender", "module3-controller"]
    for component, image in zip(components, images):
        run_streaming(["docker", "build", "-t", f"{image}:latest", component], job, f"Build {image} image", timeout=300, cwd=LIVE_CLUSTER_DIR)
        if job.error:
            return
    for image in images:
        run_streaming(["kind", "load", "docker-image", f"{image}:latest", "--name", CLUSTER_NAME], job, f"Load {image} into kind", timeout=120)
        if job.error:
            return


def deploy_components(job: Job) -> None:
    for component in ["module1_controller", "module2_extender", "module3_controller", "actuator"]:
        run_streaming(["kubectl", "apply", "-f", f"{component}/deployment.yaml"], job, f"Deploy {component}", timeout=30, cwd=LIVE_CLUSTER_DIR)
        if job.error:
            return
    for deployment in ["module1-controller", "module2-extender", "module3-controller"]:
        run_streaming(["kubectl", "rollout", "status", f"deployment/{deployment}", "--timeout=90s"], job, f"Wait for {deployment}", timeout=100)
        if job.error:
            return


def wire_scheduler_extender(job: Job) -> None:
    """Same dance as ablation/run_trial.py's set_scheduler_mode("extender"):
    patch the extender config's ClusterIP (different every fresh cluster),
    then docker cp both files onto the control-plane's static-pod path."""
    step = job.add_step("Resolve module2-extender ClusterIP")
    job.start_step(step)
    result = subprocess.run(["kubectl", "get", "svc", "module2-extender", "-o", "jsonpath={.spec.clusterIP}"], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15)
    cluster_ip = result.stdout.strip()
    if result.returncode != 0 or not cluster_ip:
        job.append_log(step, f"ERROR: could not resolve ClusterIP: {result.stderr.strip()}")
        job.finish_step(step, False)
        job.error = "Could not resolve module2-extender's ClusterIP"
        return
    job.append_log(step, f"module2-extender ClusterIP: {cluster_ip}")
    job.finish_step(step, True)

    config_path = LIVE_CLUSTER_DIR / "module2_extender" / "scheduler-extender-config.yaml"
    text = config_path.read_text(encoding="utf-8")
    new_text = re.sub(r'urlPrefix:.*', f'urlPrefix: "http://{cluster_ip}:8090"', text)
    config_path.write_text(new_text, encoding="utf-8")

    run_streaming(
        ["docker", "cp", str(config_path), f"{CONTROL_PLANE_CONTAINER}:/etc/kubernetes/scheduler-extender-config.yaml"],
        job, "Copy scheduler-extender-config.yaml onto control-plane", timeout=30,
    )
    if job.error:
        return
    run_streaming(
        ["docker", "cp", str(LIVE_CLUSTER_DIR / "module2_extender" / "kube-scheduler-with-extender.yaml"),
         f"{CONTROL_PLANE_CONTAINER}:/etc/kubernetes/manifests/kube-scheduler.yaml"],
        job, "Swap kube-scheduler static pod manifest", timeout=30,
    )
    if job.error:
        return
    run_streaming(
        ["kubectl", "wait", "--for=condition=ready", "pod", "-l", "component=kube-scheduler", "-n", "kube-system", "--timeout=60s"],
        job, "Wait for kube-scheduler to restart", timeout=70,
    )


def bootstrap_all(job: Job) -> None:
    steps = [create_cluster, install_metrics_server, install_keda, deploy_target_app, build_and_load_images, deploy_components, wire_scheduler_extender]
    for step_fn in steps:
        if not check_memory_or_abort(job, step_fn.__name__.replace("_", " ")):
            return
        step_fn(job)
        if job.error:
            return
