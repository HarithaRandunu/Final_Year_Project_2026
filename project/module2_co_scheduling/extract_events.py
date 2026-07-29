"""
Module 2 Step 1 (Full_Plan.md Section 5): scan MSResource for real historical
placement events - each distinct (msinstanceid, nodeid) pair's first
appearance is treated as a real placement decision that actually happened.

Finding (2026-07-27): the primary service's own 306 instances are all
already present at timestamp 0 - zero placement churn for this service
within the 12h window. A cluster-wide scan (below, no msname filter) shows
this is a trace-wide characteristic, not specific to this service: of 96,444
distinct (instanceid, nodeid) pairs cluster-wide, 96,357 (99.9%) are already
present at t=0, and only 87 show a genuine new placement anywhere in the
12h trace. Module 2 therefore uses a hybrid event design (decided with the
user): the 306 static pairs batch-initialize each node's bandit arm with
real reward history (representing accumulated fleet knowledge), and the 87
genuinely time-ordered cluster-wide events are the actual sequential rounds
the bandit is evaluated on.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_DATA_DIR, DEFAULT_PROCESSED_DIR, Module2Config, load_resource_rows_for_service


def extract_placement_events(cfg: Module2Config):
    df = load_resource_rows_for_service(cfg.msname)
    if df.empty:
        raise ValueError(f"No MSResource rows found for msname={cfg.msname!r}")

    events = (
        df.groupby(["msinstanceid", "nodeid"])["timestamp"]
        .min()
        .reset_index()
        .rename(columns={"timestamp": "event_timestamp"})
        .sort_values("event_timestamp")
        .reset_index(drop=True)
    )
    return events


def extract_cluster_wide_churn_events(data_dir: Path = DEFAULT_DATA_DIR, chunksize: int = 1_000_000) -> pd.DataFrame:
    """Cluster-wide (instanceid, nodeid) first-appearance scan, no msname
    filter - the only way to find genuine mid-trace placement churn, since
    any single service may (like our primary case-study service) simply have
    none. Keeps msname per pair for documentation, though reward computation
    only depends on the node, not which service triggered the event.
    """
    res_dir = data_dir / "MSResource"
    paths = sorted(res_dir.glob("MSResource_*/MSResource_*.csv"))
    cols = ["timestamp", "msname", "msinstanceid", "nodeid"]

    first_seen: dict[tuple, tuple] = {}  # (instanceid, nodeid) -> (timestamp, msname)
    for path in paths:
        for chunk in pd.read_csv(path, usecols=cols, chunksize=chunksize):
            grouped = chunk.groupby(["msinstanceid", "nodeid"]).agg(
                timestamp=("timestamp", "min"), msname=("msname", "first")
            )
            for key, row in grouped.iterrows():
                ts = row["timestamp"]
                if key not in first_seen or ts < first_seen[key][0]:
                    first_seen[key] = (ts, row["msname"])

    records = [
        {"msinstanceid": k[0], "nodeid": k[1], "event_timestamp": v[0], "msname": v[1]}
        for k, v in first_seen.items()
    ]
    all_events = pd.DataFrame.from_records(records)
    churn_events = all_events[all_events["event_timestamp"] > 0].sort_values("event_timestamp").reset_index(drop=True)
    return churn_events


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--skip-static", action="store_true", help="Skip the primary-service static event extraction")
    parser.add_argument("--skip-churn", action="store_true", help="Skip the cluster-wide churn scan")
    args = parser.parse_args(argv)

    cfg = Module2Config.load(args.config) if args.config else Module2Config.load()

    if not args.skip_static:
        events = extract_placement_events(cfg)
        print(f"Static batch-init events: {len(events)} for {len(events['msinstanceid'].unique())} instances "
              f"across {len(events['nodeid'].unique())} distinct nodes")
        out_path = DEFAULT_PROCESSED_DIR / "module2_placement_events_primary.parquet"
        events.to_parquet(out_path, index=False)
        print(f"Saved to {out_path}")

    if not args.skip_churn:
        print("\nScanning cluster-wide for genuine mid-trace churn (no msname filter - this is the heavy pass)...")
        churn = extract_cluster_wide_churn_events()
        print(f"\nGenuine cluster-wide churn events (timestamp > 0): {len(churn)}")
        print(churn.describe())
        print()
        print(churn.head(20).to_string(index=False))
        out_path = DEFAULT_PROCESSED_DIR / "module2_placement_events_churn.parquet"
        churn.to_parquet(out_path, index=False)
        print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
