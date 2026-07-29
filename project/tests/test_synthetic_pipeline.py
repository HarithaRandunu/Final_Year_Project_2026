"""
Synthetic-burst validation for build_features.py, per
docs/Preprocessing_Manual_MultiSignal_Autoscaling.md Section 17:

"The step-by-step logic here was validated against synthetic data matching the real
schema, with a deliberate latency/CPU burst injected: the resulting label correctly
went positive one bucket *before* the injected spike ... When you build the script,
re-run that same test against your own synthetic fixture before trusting it on the
real trace - if your script's output doesn't reproduce that early-detection behavior,
the bug is in the script, not in the logic documented here."

This builds a fixture matching the real on-disk schema (see build_features.py's module
docstring for the MSResource column-name correction), with one bucket's latency and
resource usage deliberately spiked, and asserts the forward-shifted label goes positive
exactly one bucket before that spike - not at the spike itself, not two buckets before.
"""
from pathlib import Path

import numpy as np
import pandas as pd

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "preprocessing"))

from build_features import PipelineConfig, run_pipeline  # noqa: E402

MSNAME = "synthetic_service_hash"
CALLER = "synthetic_caller_hash"
BUCKET_SECONDS = 120
BUCKET_MS = BUCKET_SECONDS * 1000
N_BUCKETS = 50
BURST_BUCKET = 30
CALLS_PER_BUCKET = 20
INSTANCES_PER_BUCKET = 3


def _write_callgraph(data_dir: Path, rng: np.random.Generator) -> None:
    rows = []
    trace_id = 0
    for bucket in range(N_BUCKETS):
        base_ts = bucket * BUCKET_MS
        latency_ms = 500.0 if bucket == BURST_BUCKET else rng.normal(50.0, 5.0)
        for i in range(CALLS_PER_BUCKET):
            ts = base_ts + int(i * (BUCKET_MS / CALLS_PER_BUCKET))
            per_call_latency = max(1.0, latency_ms + rng.normal(0, 2.0))
            rows.append(
                {
                    "traceid": f"trace{trace_id}",
                    "timestamp": ts,
                    "rpcid": f"0.1.{i}",
                    "um": CALLER,
                    "rpctype": "rpc",
                    "dm": MSNAME,
                    "interface": "",
                    # negative rt = downstream/callee side (Manual 4.1) - our service's own latency
                    "rt": -per_call_latency,
                }
            )
            trace_id += 1
    df = pd.DataFrame(rows)
    out_dir = data_dir / "MSCallGraph" / "MSCallGraph_0"
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / "MSCallGraph_0.csv", index=False)


def _write_msrtqps(data_dir: Path, rng: np.random.Generator) -> None:
    rows = []
    for bucket in range(N_BUCKETS):
        ts = bucket * BUCKET_MS
        for metric, base in (
            ("providerRPC_MCR", 100.0),
            ("providerRPC_RT", 50.0),
        ):
            rows.append(
                {
                    "timestamp": ts,
                    "msname": MSNAME,
                    "msinstanceid": "inst0",
                    "metric": metric,
                    "value": base + rng.normal(0, 2.0),
                }
            )
    df = pd.DataFrame(rows)
    out_dir = data_dir / "MSRTQps" / "MSRTQps_0"
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / "MSRTQps_0.csv", index=False)


def _write_msresource(data_dir: Path, rng: np.random.Generator) -> None:
    rows = []
    for bucket in range(N_BUCKETS):
        ts = bucket * BUCKET_MS
        cpu = 0.85 if bucket == BURST_BUCKET else max(0.05, rng.normal(0.3, 0.03))
        mem = 0.80 if bucket == BURST_BUCKET else max(0.05, rng.normal(0.4, 0.03))
        for i in range(INSTANCES_PER_BUCKET):
            rows.append(
                {
                    # real on-disk column order (see build_features.py docstring)
                    "msname": MSNAME,
                    "msinstanceid": f"inst{i}",
                    "nodeid": f"node{i}",
                    "instance_cpu_usage": cpu + rng.normal(0, 0.01),
                    "instance_memory_usage": mem + rng.normal(0, 0.01),
                    "timestamp": ts,
                }
            )
    df = pd.DataFrame(rows)
    out_dir = data_dir / "MSResource" / "MSResource_0"
    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_dir / "MSResource_0.csv", index=False)


def build_synthetic_fixture(data_dir: Path) -> None:
    rng = np.random.default_rng(42)
    _write_callgraph(data_dir, rng)
    _write_msrtqps(data_dir, rng)
    _write_msresource(data_dir, rng)


def test_label_goes_positive_one_bucket_before_injected_burst(tmp_path: Path) -> None:
    build_synthetic_fixture(tmp_path)
    cfg = PipelineConfig(data_dir=tmp_path, bucket_seconds=BUCKET_SECONDS)

    result = run_pipeline(cfg, MSNAME)
    df = result["table"]

    assert not df.empty, "pipeline produced an empty table on the synthetic fixture"

    lookup = df.set_index("time_bucket")["label_next_violation"]

    lead_bucket = BURST_BUCKET - 1
    assert lead_bucket in lookup.index, "the bucket before the burst was dropped from the table"
    assert lookup.loc[lead_bucket] == 1, (
        f"expected label_next_violation == 1 at bucket {lead_bucket} "
        f"(predicting the burst at bucket {BURST_BUCKET}), got {lookup.loc[lead_bucket]}"
    )

    for quiet_bucket in (lead_bucket - 5, lead_bucket - 2):
        if quiet_bucket in lookup.index:
            assert lookup.loc[quiet_bucket] == 0, (
                f"expected label_next_violation == 0 at quiet bucket {quiet_bucket}, "
                f"got {lookup.loc[quiet_bucket]} - burst is leaking into buckets that "
                "shouldn't be flagged"
            )

    checks = result["checks"]
    assert 0.0 < checks["label_mean_overall"] < 1.0, "label is degenerate (all-0 or all-1)"
