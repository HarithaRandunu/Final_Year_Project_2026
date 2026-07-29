"""
Phase 6 ablation trial runner (docs/Phase6_Ablation_Design.md). One
invocation = one full trial: configure the cluster for the requested arm,
run the k6 replay load, poll live signals throughout, tear down, and write
results/ablation/<run_id>/metrics.json.

Designed to run as a single long-lived host-side process (not in-cluster)
because the scheduler swap step needs `docker cp` onto the KinD node's
filesystem, which isn't a Kubernetes API operation. All Kubernetes state
changes go through subprocess calls to `kubectl`/`docker` - the same
tools used interactively throughout this project's live-cluster work.

Arm configuration table - see the design doc's Section 2 for the full
rationale of why each arm is defined this way:
  - baseline: KEDA drives scaling off raw CPU; default scheduler.
  - m1_only:  actuator drives scaling off Module 1's predicted_risk vs a
              fixed 0.5 threshold; default scheduler.
  - m2_only:  KEDA drives scaling (same as baseline); Module 2's extender
              is wired into the scheduler instead of the default.
  - m3_only:  actuator drives scaling off raw CPU, gated through Module 3
              running its M3_MODE=cpu_direct ablated control loop; default
              scheduler.
  - full:     actuator drives scaling off Module 1's predicted_risk, gated
              through Module 3's normal (unablated) control loop; Module
              2's extender wired in.

Every trial force-resets Module 1 and Module 3's controllers (rollout
restart) so each arm starts from the same clean internal state (Module 3's
PI/ACI always starts at threshold=0.10) rather than carrying over drift
from whatever ran immediately before it in the sequence. Module 2's
bandit state is deliberately NOT reset - it's a continuously-learning
background process by design (Phase 5), not something that gets switched
per arm.

Safety: polls free host memory (via a native Win32 call, no extra
dependency) every cycle: if it drops below --min-free-gb, the trial is
aborted early (k6 job killed, whatever's collected so far is still
written with `"aborted": true`) rather than pushed through blind - the
same discipline used interactively throughout Phase 5/6.
"""
from __future__ import annotations

import argparse
import ctypes
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "loadgen"))
from metrics_common import compute_elasticity_metrics  # noqa: E402
from generate_replay_stages import build_stages  # noqa: E402

LIVE_CLUSTER_DIR = Path(__file__).resolve().parent.parent
TEASTORE_DIR = LIVE_CLUSTER_DIR / "teastore"
MODULE2_DIR = LIVE_CLUSTER_DIR / "module2_extender"
LOADGEN_DIR = LIVE_CLUSTER_DIR / "loadgen"
RESULTS_DIR = Path(__file__).resolve().parents[2] / "results" / "ablation"
FEATURES_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "features_primary.parquet"

CONTROL_PLANE_NODE = "fyp-autoscaling-control-plane"
DEFAULT_SCHEDULER_MANIFEST = "/etc/kubernetes/manifests/kube-scheduler.yaml"
BACKUP_ORIG = LIVE_CLUSTER_DIR / "backups" / "kube-scheduler.yaml.orig"
EXTENDER_MANIFEST = MODULE2_DIR / "kube-scheduler-with-extender.yaml"
EXTENDER_CONFIG = MODULE2_DIR / "scheduler-extender-config.yaml"

MODULE1_PF_PORT = 18000
MODULE3_PF_PORT = 18091

ARM_CONFIGS = {
    "baseline": {"keda": True, "actuator_arm": None, "scheduler": "default"},
    "m1_only": {"keda": False, "actuator_arm": "m1_only", "scheduler": "default"},
    "m2_only": {"keda": True, "actuator_arm": None, "scheduler": "extender"},
    "m3_only": {"keda": False, "actuator_arm": "m3_only", "scheduler": "default"},
    "full": {"keda": False, "actuator_arm": "full", "scheduler": "extender"},
}


def run(cmd: list[str], check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess:
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=check)


def run_ignore_errors(cmd: list[str], timeout: int = 60) -> None:
    try:
        run(cmd, check=False, timeout=timeout)
    except subprocess.TimeoutExpired:
        pass


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


def current_scheduler_mode() -> str:
    result = run(["docker", "exec", CONTROL_PLANE_NODE, "cat", DEFAULT_SCHEDULER_MANIFEST])
    return "extender" if "scheduler-extender-config" in result.stdout else "default"


def set_scheduler_mode(mode: str) -> bool:
    """Returns True if a swap actually happened (False if already in that mode)."""
    if current_scheduler_mode() == mode:
        print(f"scheduler already in '{mode}' mode, skipping swap")
        return False
    if mode == "extender":
        run(["docker", "cp", str(EXTENDER_CONFIG), f"{CONTROL_PLANE_NODE}:/etc/kubernetes/scheduler-extender-config.yaml"])
        run(["docker", "cp", str(EXTENDER_MANIFEST), f"{CONTROL_PLANE_NODE}:{DEFAULT_SCHEDULER_MANIFEST}"])
    else:
        run(["docker", "cp", str(BACKUP_ORIG), f"{CONTROL_PLANE_NODE}:{DEFAULT_SCHEDULER_MANIFEST}"])
    print("waiting for kube-scheduler to restart...")
    for _ in range(24):
        time.sleep(5)
        result = run(
            ["kubectl", "get", "pods", "-n", "kube-system", "-l", "component=kube-scheduler",
             "-o", "jsonpath={.items[0].status.phase}"],
            check=False,
        )
        if result.stdout.strip() == "Running":
            time.sleep(5)  # give it a moment past "Running" to finish leader election
            return True
    raise RuntimeError("kube-scheduler did not come back up in time")


def reset_teastore_replicas() -> None:
    run_ignore_errors(["kubectl", "delete", "-f", str(TEASTORE_DIR / "keda-baseline.yaml"), "--ignore-not-found"])
    run(["kubectl", "scale", "deployment", "teastore-webui", "teastore-image", "--replicas=1"])
    run(["kubectl", "rollout", "status", "deployment/teastore-webui", "--timeout=90s"])
    run(["kubectl", "rollout", "status", "deployment/teastore-image", "--timeout=90s"])


def configure_arm(arm: str) -> bool:
    """Returns whether this trial involved a scheduler swap (used to decide
    how many warmup samples to exclude from the metrics - see run_trial)."""
    cfg = ARM_CONFIGS[arm]

    swapped = set_scheduler_mode(cfg["scheduler"])
    reset_teastore_replicas()

    if cfg["keda"]:
        run(["kubectl", "apply", "-f", str(TEASTORE_DIR / "keda-baseline.yaml")])

    actuator_arm = cfg["actuator_arm"]
    if actuator_arm:
        run(["kubectl", "set", "env", "deployment/actuator", f"ARM={actuator_arm}", "--overwrite"])
        if actuator_arm == "m1_only":
            # Recalibrated after the first-pass run found predicted_risk on
            # TeaStore tops out around 0.1-0.3 - a 0.5 threshold never fired.
            run(["kubectl", "set", "env", "deployment/actuator", "FIXED_THRESHOLD=0.08", "--overwrite"])
        run(["kubectl", "scale", "deployment/actuator", "--replicas=1"])
        run(["kubectl", "rollout", "status", "deployment/actuator", "--timeout=90s"])
    else:
        run(["kubectl", "scale", "deployment/actuator", "--replicas=0"])

    m3_mode = "cpu_direct" if arm == "m3_only" else "risk"
    run(["kubectl", "set", "env", "deployment/module3-controller", f"M3_MODE={m3_mode}", "--overwrite"])
    run(["kubectl", "rollout", "restart", "deployment/module3-controller"])
    run(["kubectl", "rollout", "restart", "deployment/module1-controller"])
    run(["kubectl", "rollout", "status", "deployment/module3-controller", "--timeout=90s"])
    run(["kubectl", "rollout", "status", "deployment/module1-controller", "--timeout=90s"])

    if swapped:
        # A scheduler swap immediately followed by fresh pod placement was
        # found (first-pass ablation, m2_only/full) to cause a real cold-
        # start latency spike in the trial's first bucket - not steady-state
        # behavior. Extra settle time here reduces it; run_trial also
        # excludes the first WARMUP_EXCLUDE_SAMPLES from summary stats as a
        # second layer, since settle time alone isn't guaranteed to fully
        # absorb JVM warmup.
        print("scheduler was swapped - settling for 80s before starting load...")
        time.sleep(80)
    else:
        print("settling for 20s before starting load...")
        time.sleep(20)

    return swapped


def start_port_forwards() -> tuple[subprocess.Popen, subprocess.Popen]:
    pf1 = subprocess.Popen(
        ["kubectl", "port-forward", "service/module1-controller", f"{MODULE1_PF_PORT}:8000"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    pf3 = subprocess.Popen(
        ["kubectl", "port-forward", "service/module3-controller", f"{MODULE3_PF_PORT}:8091"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    time.sleep(5)
    return pf1, pf3


def http_get_json(url: str) -> dict | None:
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, OSError, TimeoutError, json.JSONDecodeError):
        return None


def start_k6_job(stages: list[dict]) -> None:
    run_ignore_errors(["kubectl", "delete", "job", "ablation-trial", "--ignore-not-found"])
    run_ignore_errors(["kubectl", "delete", "configmap", "ablation-trial-script", "--ignore-not-found"])
    run(["kubectl", "create", "configmap", "ablation-trial-script",
         f"--from-file=ablation_trial.js={LOADGEN_DIR / 'ablation_trial.js'}"])

    stages_json = json.dumps(stages)
    job_yaml = f"""
apiVersion: batch/v1
kind: Job
metadata:
  name: ablation-trial
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      containers:
        - name: k6
          image: grafana/k6:latest
          args: ["run", "/scripts/ablation_trial.js"]
          env:
            - name: TARGET_URL
              value: "http://teastore-webui:8080/tools.descartes.teastore.webui/"
            - name: STAGES_JSON
              value: '{stages_json}'
          resources:
            requests: {{cpu: 50m, memory: 64Mi}}
            limits: {{cpu: 300m, memory: 128Mi}}
          volumeMounts:
            - name: script
              mountPath: /scripts
      volumes:
        - name: script
          configMap:
            name: ablation-trial-script
"""
    subprocess.run(["kubectl", "apply", "-f", "-"], input=job_yaml, text=True, check=True)


def k6_job_status() -> str:
    """Returns 'running', 'succeeded', or 'failed'."""
    result = run(
        ["kubectl", "get", "job", "ablation-trial", "-o", "jsonpath={.status.succeeded}|{.status.failed}"],
        check=False,
    )
    succeeded, _, failed = result.stdout.strip().partition("|")
    if failed and failed != "0":
        return "failed"
    if succeeded and succeeded != "0":
        return "succeeded"
    return "running"


def get_replica_count(deployment: str) -> int:
    result = run(["kubectl", "get", "deployment", deployment, "-o", "jsonpath={.status.replicas}"], check=False)
    try:
        return int(result.stdout.strip() or 0)
    except ValueError:
        return 0


def run_trial(arm: str, run_tag: str, min_rps: float, max_rps: float, duration: int, min_free_gb: float, poll_seconds: int) -> dict:
    run_id = f"{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S')}_{arm}_{run_tag}"
    print(f"=== Trial {run_id} ===")

    scheduler_swapped = configure_arm(arm)
    stages = build_stages(min_rps, max_rps, duration, FEATURES_PATH, n_stages=30)
    pf1 = pf3 = None
    samples: list[dict] = []
    aborted = False
    abort_reason = None

    try:
        pf1, pf3 = start_port_forwards()
        start_k6_job(stages)

        start_time = datetime.now(timezone.utc)
        deadline = time.monotonic() + duration + 120  # margin past the load's own duration
        while time.monotonic() < deadline:
            mem = free_gb()
            if mem < min_free_gb:
                aborted = True
                abort_reason = f"free memory dropped to {mem:.1f}GB (< {min_free_gb}GB floor)"
                print(f"ABORTING TRIAL: {abort_reason}")
                break

            replicas = get_replica_count("teastore-webui")
            m1 = http_get_json(f"http://localhost:{MODULE1_PF_PORT}/risk") or {}
            m3 = http_get_json(f"http://localhost:{MODULE3_PF_PORT}/state") or {}
            bucket = m1.get("last_bucket") or {}
            samples.append({
                "t": datetime.now(timezone.utc).isoformat(),
                "replicas": replicas,
                "predicted_risk": m1.get("predicted_risk"),
                "violation_now": bucket.get("violation_now"),
                "p95_latency_ms": bucket.get("p95_latency_ms"),
                "p99_latency_ms": bucket.get("p99_latency_ms"),
                "threshold": m3.get("threshold"),
                "alert": m3.get("alert"),
                "free_gb": round(mem, 2),
            })

            status = k6_job_status()
            if status == "failed":
                aborted = True
                log = run(["kubectl", "logs", "-l", "job-name=ablation-trial", "--tail=20"], check=False)
                abort_reason = f"k6 job failed: {log.stdout.strip()[-500:]}"
                print(f"ABORTING TRIAL: {abort_reason}")
                break
            if status == "succeeded":
                print("k6 job finished")
                break
            time.sleep(poll_seconds)
        end_time = datetime.now(timezone.utc)
    finally:
        run_ignore_errors(["kubectl", "delete", "job", "ablation-trial", "--ignore-not-found"])
        if pf1:
            pf1.terminate()
        if pf3:
            pf3.terminate()

    return build_metrics(run_id, arm, run_tag, samples, start_time, end_time, aborted, abort_reason, stages, scheduler_swapped)


def build_metrics(run_id, arm, run_tag, samples, start_time, end_time, aborted, abort_reason, stages, scheduler_swapped=False) -> dict:
    # A scheduler swap's cold-start effect (first-pass finding: real latency
    # spikes in m2_only/full's opening bucket) gets an 80s extra settle in
    # configure_arm() already - this is a second, cheaper layer of defense:
    # exclude the first couple of poll samples from *summary* stats (not
    # from the raw trace, which keeps everything for transparency) in case
    # settle time alone didn't fully absorb it.
    warmup_exclude = 2 if scheduler_swapped else 0
    scored_samples = samples[warmup_exclude:]

    replica_traj = [s["replicas"] for s in scored_samples if s["replicas"] is not None]
    alert = [bool(s["alert"]) for s in scored_samples if s["alert"] is not None]
    outcome = [bool(s["violation_now"]) for s in scored_samples if s["violation_now"] is not None]
    # Align lengths defensively (a poll may have missed one endpoint)
    n = min(len(replica_traj), len(alert), len(outcome)) if alert and outcome else 0
    elasticity = (
        compute_elasticity_metrics(replica_traj[:n], alert[:n], outcome[:n])
        if n > 1
        else {"instability_reversals": 0, "deviation_std": 0.0, "over_provisioning_timeshare": 0.0, "under_provisioning_timeshare": 0.0}
    )

    violation_count = sum(1 for s in scored_samples if s.get("violation_now") == 1)
    p95_values = [s["p95_latency_ms"] for s in scored_samples if s.get("p95_latency_ms") is not None]
    p99_values = [s["p99_latency_ms"] for s in scored_samples if s.get("p99_latency_ms") is not None]
    poll_interval_s = 30

    metrics = {
        "run_id": run_id,
        "arm": arm,
        "workload_type": "alibaba_replay_primary",
        "run_tag": run_tag,
        "start_time": start_time.isoformat(),
        "end_time": end_time.isoformat(),
        "aborted": aborted,
        "abort_reason": abort_reason,
        "scheduler_swapped": scheduler_swapped,
        "warmup_samples_excluded": warmup_exclude,
        "sla_violation_count": violation_count,
        "sla_violation_duration_s": violation_count * poll_interval_s,
        "p95_latency_ms": max(p95_values) if p95_values else None,
        "p99_latency_ms": max(p99_values) if p99_values else None,
        "replica_trajectory": [{"t": s["t"], "replicas": s["replicas"]} for s in samples],
        "cost_proxy_pod_seconds": sum(s["replicas"] for s in samples if s["replicas"] is not None) * poll_interval_s,
        "elasticity": elasticity,
        "module1_predicted_risk_trace": [s["predicted_risk"] for s in samples],
        "module3_threshold_trace": [s["threshold"] for s in samples],
        "k6_stages": stages,
        "notes": (
            "p95/p99 latency figures come from Module 1's own active HTTP probing "
            "(not k6's client-side timing) - the same signal Module 1's risk model "
            "consumes, kept consistent with how Phase 5's controllers already measure "
            "latency. sla_violation_duration_s is computed from the "
            f"{poll_interval_s}s poll interval, an approximation not a precise "
            "integral. cost_proxy_pod_seconds/replica_trajectory cover the FULL trial "
            "(real cost incurred, not censored); p95/p99/sla_violation_count/elasticity "
            f"exclude the first {warmup_exclude} sample(s) when scheduler_swapped=true, "
            "since the first-pass ablation found a real cold-start latency spike right "
            "after a scheduler swap that isn't representative of steady-state behavior "
            "(see docs/Progress_Trace_MultiSignal_Autoscaling.md's Phase 6 section)."
        ),
    }

    out_dir = RESULTS_DIR / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"Wrote {out_dir / 'metrics.json'}")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--arm", required=True, choices=list(ARM_CONFIGS))
    parser.add_argument("--run-tag", default="trial1")
    parser.add_argument("--min-rps", type=float, default=8.0)
    parser.add_argument("--max-rps", type=float, default=24.0)
    parser.add_argument("--duration", type=int, default=900)
    parser.add_argument("--min-free-gb", type=float, default=2.0)
    parser.add_argument("--poll-seconds", type=int, default=30)
    args = parser.parse_args()

    metrics = run_trial(
        args.arm, args.run_tag, args.min_rps, args.max_rps, args.duration, args.min_free_gb, args.poll_seconds
    )
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("replica_trajectory", "module1_predicted_risk_trace", "module3_threshold_trace", "k6_stages")}, indent=2))


if __name__ == "__main__":
    main()
