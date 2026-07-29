"""
Phase 4 support: re-run Module 2's actual combined policy (batch-init +
heuristic warmup + discounted TS - exactly Phase 3A's validated design) and
save the full per-round placement log, enriched with Module 1's attribution
context at each event's timestamp (Full_Plan.md Section 4's "attribution
vector as bandit context" wiring). Doesn't change Module 2's own bandit math -
the individual contribution was already proven in Phase 3A; this just logs
what Module 1 was seeing at each real decision point alongside what Module 2
actually decided.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_PROCESSED_DIR, Module2Config, load_node_table
from simulator import NodeSimulator
from validate import precompute_events, run_combined_policy


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("--tag", default="primary")
    args = parser.parse_args(argv)

    cfg = Module2Config.load(args.config) if args.config else Module2Config.load()

    static_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_primary.parquet")
    churn_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_churn.parquet")
    node_df = load_node_table()
    allowed_nodes = set(static_events["nodeid"]) | set(churn_events["nodeid"])
    sim = NodeSimulator(node_df, cfg, allowed_nodes=allowed_nodes)

    precomputed = precompute_events(churn_events, sim, cfg)
    decision_log = run_combined_policy(precomputed, cfg, static_events, sim)

    m1_path = DEFAULT_PROCESSED_DIR / f"module1_full_trace_{args.tag}.parquet"
    if m1_path.exists():
        m1 = pd.read_parquet(m1_path)
        decision_log["time_bucket"] = decision_log["timestamp"] // (cfg.bucket_seconds * 1000)
        decision_log = decision_log.merge(
            m1[["time_bucket", "predicted_risk", "dominant_signal", "dominant_weight"]],
            on="time_bucket", how="left",
        )
        n_matched = decision_log["dominant_signal"].notna().sum()
        print(f"Matched Module 1 context for {n_matched}/{len(decision_log)} placement rounds")
    else:
        print(f"WARNING: {m1_path} not found - run module1_signal_fusion/export_full_trace.py first. "
              "Saving placement log without Module 1 context.")

    out_path = DEFAULT_PROCESSED_DIR / "module2_decision_log_primary.parquet"
    decision_log.to_parquet(out_path, index=False)
    print(f"Saved {len(decision_log)} rounds to {out_path}")


if __name__ == "__main__":
    main()
