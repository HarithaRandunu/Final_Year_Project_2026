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
