"""
Exports the validated combined-policy bandit's final per-node posterior
state to a small, self-contained JSON artifact (Phase 8 prep).

Why this exists: Module 2's `select_node()` decide-now function
(common.py, for the Phase 8 dashboard's what-if panel) needs to reflect
the *actual trained/calibrated* bandit, not a cold-start stranger - but
reconstructing that state by replaying the real event stream requires
Node_0's raw CPU/memory time series (part of DataSet01, ~216GB, not
committed to git). Running this once and committing the small resulting
JSON instead means the dashboard itself has zero dependency on the raw
dataset - it only needs to load a ~dozens-of-KB file.

Reuses validate.py's own already-tested precompute_events/batch_init_bandit/
run_combined_policy - no new bandit logic, just a state dump at the end.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bandit import ThompsonSamplingBandit
from common import DEFAULT_PROCESSED_DIR, DEFAULT_RESULTS_DIR, Module2Config, load_node_table
from simulator import NodeSimulator
from validate import batch_init_bandit, precompute_events, run_combined_policy


def main() -> None:
    cfg = Module2Config.load()

    static_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_primary.parquet")
    churn_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_churn.parquet")
    node_df = load_node_table()
    allowed_nodes = set(static_events["nodeid"]) | set(churn_events["nodeid"])
    sim = NodeSimulator(node_df, cfg, allowed_nodes=allowed_nodes)

    precomputed = precompute_events(churn_events, sim, cfg)

    bandit = ThompsonSamplingBandit(gamma=cfg.discount_gamma, seed=cfg.seed)
    batch_init_bandit(bandit, static_events, sim)
    for i, ev in enumerate(precomputed):
        candidate_ids = list(ev["rewards"].keys())
        if i < cfg.warmup_rounds:
            from bandit import heuristic_select
            chosen = heuristic_select(ev["candidates"])
        else:
            chosen = bandit.select(candidate_ids)
        bandit.update(chosen, ev["rewards"][chosen])

    state = {
        str(nodeid): {
            "alpha": bandit.alpha[nodeid],
            "beta": bandit.beta[nodeid],
            "pulls": bandit.pulls[nodeid],
            "posterior_mean": bandit.posterior_mean(nodeid),
        }
        for nodeid in bandit.alpha
    }
    # Sort by pulls desc so the dashboard's dropdown can show the most
    # frequently-touched (most realistically-calibrated) nodes first.
    state = dict(sorted(state.items(), key=lambda kv: kv[1]["pulls"], reverse=True))

    out = {
        "gamma": cfg.discount_gamma,
        "n_nodes": len(state),
        "n_static_batch_init_events": len(static_events),
        "n_churn_events_applied": len(precomputed),
        "nodes": state,
    }

    results_dir = DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    out_path = results_dir / "final_bandit_state.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Saved final bandit state ({len(state)} nodes) to {out_path}")


if __name__ == "__main__":
    main()
