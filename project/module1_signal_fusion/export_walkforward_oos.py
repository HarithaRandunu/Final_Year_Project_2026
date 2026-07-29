"""
Small, standalone export: saves Module 1's walk-forward out-of-sample series
to disk. Not part of Module 1's own validation flow (that's still just
console output + metrics.json, unchanged) - added so Module 3 can consume
this richer, still-genuinely-out-of-sample series (it covers the trace's
actual bursty plateau, unlike the calm 90-row held-out test window) without
any fragile cross-directory Python importing.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_PROCESSED_DIR, Module1Config, load_feature_table
from validate import run_walk_forward


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    args = parser.parse_args(argv)

    cfg = Module1Config.load()
    full_df = load_feature_table(args.tag, None)
    wf = run_walk_forward(full_df, cfg)
    oos = wf["oos_series"].rename(columns={"fused_pred": "predicted_risk", "actual": "actual_outcome"})
    oos = oos[["time_bucket", "predicted_risk", "actual_outcome"]].reset_index(drop=True)

    out_path = DEFAULT_PROCESSED_DIR / f"module1_walkforward_oos_{args.tag}.parquet"
    oos.to_parquet(out_path, index=False)
    print(f"Saved {len(oos)} rows to {out_path}")
    print(f"Violations in series: {int(oos['actual_outcome'].sum())}")


if __name__ == "__main__":
    main()
