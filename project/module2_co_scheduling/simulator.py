"""
Module 2 Step 2 (Full_Plan.md Section 5): a node-state simulator built from
real Node_0 telemetry. At any historical timestamp, it can name which nodes
had real headroom and look up what actually happened to any node's
CPU/memory over the following window - real historical trajectories, not
simulated ones, for every candidate (the "factual-only reward" approximation
documented in Full_Plan.md's Known Risks).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from common import Module2Config


class NodeSimulator:
    def __init__(self, node_df: pd.DataFrame, cfg: Module2Config, allowed_nodes: set | None = None):
        """allowed_nodes restricts the candidate pool to a specific set of
        nodes. Node_0 covers 1300+ cluster nodes; sampling candidates from
        that whole pool leaves almost every arm touched at most once across
        an ~87-400 round simulation, so a discount factor - whose entire
        purpose is down-weighting *repeated, aging* evidence - never gets a
        chance to matter. Restricting to the nodes actually involved in real
        placement activity for this service (batch-init + churn events) is
        both the more realistic scope and what gives discounting a genuine
        opportunity to show an effect.
        """
        self.cfg = cfg
        self.allowed_nodes = allowed_nodes
        cpu_wide = node_df.pivot(index="timestamp", columns="nodeid", values="node_cpu_usage")
        mem_wide = node_df.pivot(index="timestamp", columns="nodeid", values="node_memory_usage")
        if allowed_nodes is not None:
            cols = [c for c in cpu_wide.columns if c in allowed_nodes]
            cpu_wide = cpu_wide[cols]
            mem_wide = mem_wide[cols]
        self.cpu_wide = cpu_wide
        self.mem_wide = mem_wide
        self._timestamps = self.cpu_wide.index.to_numpy()

    def _nearest_prior_row(self, wide: pd.DataFrame, timestamp: int) -> pd.Series | None:
        pos = np.searchsorted(self._timestamps, timestamp, side="right") - 1
        if pos < 0:
            return None
        return wide.iloc[pos]

    def eligible_nodes(self, timestamp: int) -> pd.DataFrame:
        cpu_row = self._nearest_prior_row(self.cpu_wide, timestamp)
        mem_row = self._nearest_prior_row(self.mem_wide, timestamp)
        if cpu_row is None or mem_row is None:
            return pd.DataFrame(columns=["nodeid", "cpu", "mem"])

        combined = pd.DataFrame({"cpu": cpu_row, "mem": mem_row}).dropna()
        combined = combined[
            (combined["cpu"] <= self.cfg.node_max_cpu_for_candidate)
            & (combined["mem"] <= self.cfg.node_max_mem_for_candidate)
        ]
        return combined.reset_index().rename(columns={"index": "nodeid"})

    def sample_candidates(self, timestamp: int, rng: np.random.Generator) -> pd.DataFrame | None:
        eligible = self.eligible_nodes(timestamp)
        if len(eligible) < self.cfg.n_candidates:
            return None
        idx = rng.choice(len(eligible), size=self.cfg.n_candidates, replace=False)
        return eligible.iloc[idx].reset_index(drop=True)

    def reward(self, nodeid, timestamp: int) -> float | None:
        """Mean headroom (1 - usage) retained over the reward window, using
        the node's own real subsequent trajectory - directly observed for
        the chosen node, and equally available for every unchosen candidate
        since we have real historical data for all of them.
        """
        if nodeid not in self.cpu_wide.columns:
            return None
        window_end = timestamp + self.cfg.reward_window_ms
        if window_end > self._timestamps.max():
            return None

        mask = (self._timestamps > timestamp) & (self._timestamps <= window_end)
        cpu_vals = self.cpu_wide.loc[mask, nodeid].dropna()
        mem_vals = self.mem_wide.loc[mask, nodeid].dropna()
        if cpu_vals.empty or mem_vals.empty:
            return None

        headroom = (1 - cpu_vals.mean() + 1 - mem_vals.mean()) / 2
        return float(np.clip(headroom, 0.0, 1.0))
