"""
Phase 6 (docs/Phase6_Ablation_Design.md Section 4): turns the case-study
service's real call_count curve (data/processed/features_primary.parquet,
360 buckets x 120s = the full 12h Alibaba trace at 0.5% sampling) into a k6
ramping-arrival-rate `stages` array for the ablation trials.

The absolute call rate (~323 req/s at sampled scale) is meaningless against
a single-pod TeaStore on this host - only the *shape* is replayed. The
curve is min-max normalized, rescaled into [--min-rps, --max-rps] (pick
this range from the capacity probe's own observed results, not a guess),
and the 360 buckets are time-compressed into --duration seconds of k6
stages (default 900s / 15min) so a trial is a tractable length while still
preserving the relative shape (quiet periods, the elevated plateau).

Usage:
    python generate_replay_stages.py --min-rps 2 --max-rps 10 --duration 900 \
        --out capacity_probe_stages.json
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_FEATURES_PATH = Path(__file__).resolve().parents[2] / "data" / "processed" / "features_primary.parquet"


def build_stages(min_rps: float, max_rps: float, duration_seconds: int, features_path: Path, n_stages: int = 30) -> list[dict]:
    df = pd.read_parquet(features_path, columns=["call_count"])
    curve = df["call_count"].to_numpy()

    # Block-average the full 360-bucket curve down to n_stages - keeps the
    # k6 stages list (and the env var it's passed through) small while
    # still preserving the overall shape (quiet periods, the elevated
    # plateau) at a coarser grain. Appropriate for a first-pass harness-
    # proving run; revisit if finer granularity turns out to matter once
    # trial counts scale up.
    n_buckets = len(curve)
    edges = np.linspace(0, n_buckets, n_stages + 1).astype(int)
    downsampled = np.array([
        curve[edges[i]:edges[i + 1]].mean() if edges[i + 1] > edges[i] else curve[edges[i]]
        for i in range(n_stages)
    ])

    lo, hi = downsampled.min(), downsampled.max()
    normalized = (downsampled - lo) / (hi - lo) if hi > lo else downsampled * 0.0
    rps_curve = min_rps + normalized * (max_rps - min_rps)

    stage_seconds = max(1, duration_seconds // n_stages)

    # k6's ramping-arrival-rate executor requires an integer `target` (Go's
    # Options.scenarios.stages.target is int64) - a float here fails at
    # script-parse time, not silently, so round rather than truncate to
    # keep the low end of the range (e.g. min_rps=8) from rounding to 0.
    stages = [{"target": max(1, round(rate)), "duration": f"{stage_seconds}s"} for rate in rps_curve]
    return stages


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--min-rps", type=float, required=True)
    parser.add_argument("--max-rps", type=float, required=True)
    parser.add_argument("--duration", type=int, default=900, help="Total compressed trial duration in seconds")
    parser.add_argument("--n-stages", type=int, default=30, help="Number of block-averaged k6 stages")
    parser.add_argument("--features-path", type=Path, default=DEFAULT_FEATURES_PATH)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    stages = build_stages(args.min_rps, args.max_rps, args.duration, args.features_path, args.n_stages)
    args.out.write_text(json.dumps(stages, indent=2))
    total_s = sum(int(s["duration"].rstrip("s")) for s in stages)
    print(f"Wrote {len(stages)} stages ({total_s}s total) to {args.out}")


if __name__ == "__main__":
    main()
