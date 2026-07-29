"""
Shared config and data loading for Module 2 (Co-Scheduling).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DEFAULT_CONFIG_PATH = PROJECT_DIR / "configs" / "module2_default.json"
DEFAULT_PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
DEFAULT_RESULTS_DIR = PROJECT_DIR / "results" / "module2"
DEFAULT_DATA_DIR = (
    PROJECT_DIR.parent
    / "DataSet01"
    / "clusterdata"
    / "cluster-trace-microservices-v2021"
    / "data"
)


@dataclass
class Module2Config:
    seed: int = 42
    msname: str = ""
    n_candidates: int = 6
    reward_window_minutes: int = 5
    node_max_cpu_for_candidate: float = 0.9
    node_max_mem_for_candidate: float = 0.9
    discount_gamma: float = 0.9
    warmup_rounds: int = 15
    non_stationary_bucket_range: list = None
    bucket_seconds: int = 120

    @classmethod
    def load(cls, path: Path = DEFAULT_CONFIG_PATH) -> "Module2Config":
        with open(path, "r", encoding="utf-8") as f:
            d = json.load(f)
        return cls(**d)

    @property
    def reward_window_ms(self) -> int:
        return self.reward_window_minutes * 60 * 1000

    @property
    def bucket_ms(self) -> int:
        return self.bucket_seconds * 1000


def load_node_table(data_dir: Path = DEFAULT_DATA_DIR) -> pd.DataFrame:
    path = data_dir / "Node" / "Node_0" / "Node_0.csv"
    df = pd.read_csv(path, usecols=["timestamp", "nodeid", "node_cpu_usage", "node_memory_usage"])
    return df.sort_values(["nodeid", "timestamp"]).reset_index(drop=True)


def load_resource_rows_for_service(msname: str, data_dir: Path = DEFAULT_DATA_DIR, chunksize: int = 500_000) -> pd.DataFrame:
    cols = ["timestamp", "msname", "msinstanceid", "nodeid", "instance_cpu_usage", "instance_memory_usage"]
    res_dir = data_dir / "MSResource"
    paths = sorted(res_dir.glob("MSResource_*/MSResource_*.csv"))
    matches = []
    for path in paths:
        for chunk in pd.read_csv(path, usecols=cols, chunksize=chunksize):
            subset = chunk[chunk["msname"] == msname]
            if not subset.empty:
                matches.append(subset)
    return pd.concat(matches, ignore_index=True) if matches else pd.DataFrame(columns=cols)


DEFAULT_BANDIT_STATE_PATH = DEFAULT_RESULTS_DIR / "final_bandit_state.json"


def select_node(candidate_nodeids: list[str], state_path: Path = DEFAULT_BANDIT_STATE_PATH,
                 gamma: float | None = None, seed: int | None = None) -> dict:
    """Module 2's "decide right now" function (Full_Plan.md Section 13.2),
    for the Phase 8 dashboard's what-if panel. Loads the validated
    combined-policy bandit's final per-node posterior
    (export_final_bandit_state.py's output - reconstructed once from the
    real event stream, not recomputed live, so this function has zero
    dependency on the raw dataset) and answers: given these candidate
    nodes, which would the trained bandit pick right now?

    Candidate node IDs never seen in the validated run get an
    uninformative Beta(1,1) prior - a real, valid case (what the bandit
    does when faced with a genuinely new node), not an error.
    """
    from bandit import ThompsonSamplingBandit  # local import: avoids a hard
    # dependency on bandit.py for callers that only need config loading

    with open(state_path, "r", encoding="utf-8") as f:
        saved = json.load(f)

    cfg_gamma = gamma if gamma is not None else saved["gamma"]
    cfg_seed = seed if seed is not None else 42
    bandit = ThompsonSamplingBandit(gamma=cfg_gamma, seed=cfg_seed)

    candidate_info = {}
    for nodeid in candidate_nodeids:
        node_state = saved["nodes"].get(str(nodeid))
        if node_state is not None:
            bandit.alpha[nodeid] = node_state["alpha"]
            bandit.beta[nodeid] = node_state["beta"]
            bandit.pulls[nodeid] = node_state["pulls"]
            candidate_info[nodeid] = {"seen_in_training": True, "pulls": node_state["pulls"],
                                       "posterior_mean": node_state["posterior_mean"]}
        else:
            bandit._ensure_arm(nodeid)
            candidate_info[nodeid] = {"seen_in_training": False, "pulls": 0,
                                       "posterior_mean": bandit.posterior_mean(nodeid)}

    chosen = bandit.select(candidate_nodeids)
    return {
        "chosen_node": chosen,
        "candidates": candidate_info,
        "gamma_used": cfg_gamma,
        "n_nodes_in_training_state": saved["n_nodes"],
    }
