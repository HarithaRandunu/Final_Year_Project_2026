"""
Phase 4 support: run Module 3's full design (PI + adaptive conformal +
oscillation widening - exactly Phase 3B's validated design) continuously
over Module 1's full-trace predictions, producing the parameter trajectory
log Phase 4's exit criteria calls for. Doesn't change Module 3's own control
logic - the individual contribution was already proven in Phase 3B.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_PROCESSED_DIR, DEFAULT_RESULTS_DIR, Module3Config
from validate import run_arm


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--tag", default="primary")
    args = parser.parse_args(argv)

    cfg = Module3Config.load(args.config) if args.config else Module3Config.load()

    m1_path = DEFAULT_PROCESSED_DIR / f"module1_full_trace_{args.tag}.parquet"
    full_trace = pd.read_parquet(m1_path)[["time_bucket", "predicted_risk", "actual_outcome"]]

    trajectory = run_arm(full_trace, cfg, "full")

    out_path = DEFAULT_PROCESSED_DIR / f"module3_trajectory_{args.tag}.parquet"
    trajectory.to_parquet(out_path, index=False)
    print(f"Saved {len(trajectory)} rows to {out_path}")
    print(f"Threshold range: [{trajectory['threshold'].min():.4f}, {trajectory['threshold'].max():.4f}]")
    print(f"Total alerts: {int(trajectory['alert'].sum())} / {len(trajectory)}")


if __name__ == "__main__":
    main()
