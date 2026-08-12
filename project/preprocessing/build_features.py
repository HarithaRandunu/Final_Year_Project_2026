"""
Phase 1 preprocessing pipeline: cluster-trace-microservices-v2021 -> labeled feature table.

Implements, as one script, the exact logic documented step-by-step in
docs/Preprocessing_Manual_MultiSignal_Autoscaling.md (Sections 3-14). That manual is the
authoritative spec; if the two ever disagree, the manual wins and this file is the bug.

Two entry points (per docs/Full_Plan_MultiSignal_Autoscaling.md Section 3):
    select-candidates   Section 3 - rank msnames by call volume and instance count.
    build               Sections 4-14 - build one labeled, split feature table for one msname.

Column-name note: the Manual's Section 2/7 documented MSResource_0.csv as having
`cpu_utilization`/`memory_utilization` columns; the actual extracted file uses
`instance_cpu_usage`/`instance_memory_usage`. This script reads the real column names and
renames them to `cpu_utilization`/`memory_utilization` immediately, so every downstream
column name (deltas, sanity checks, saved output) matches the Manual exactly from Section 7
onward. See the Manual's corrected Section 2/7 for the full note.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd

# ---------------------------------------------------------------------------
# Defaults (Manual Sections 5, 6, 9, 10, 11, 12; Full_Plan Section 10 asks for
# config-driven, not hardcoded, thresholds - these are the defaults, overridable
# via CLI flags or a JSON config file passed with --config).
# ---------------------------------------------------------------------------

DEFAULT_BUCKET_SECONDS = 120
DEFAULT_PROVIDER_METRICS = ["providerRPC_MCR", "providerRPC_RT", "HTTP_MCR", "HTTP_RT"]
DEFAULT_FFILL_LIMIT = 2
DEFAULT_DELTA_WINDOWS = (1, 2, 4)
DEFAULT_DELTA_EXCLUDE = frozenset({"call_count", "active_instances"})
DEFAULT_VIOLATION_PERCENTILE = 0.90
DEFAULT_TRAIN_FRAC = 0.75

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DEFAULT_DATA_DIR = (
    PROJECT_DIR.parent
    / "DataSet01"
    / "clusterdata"
    / "cluster-trace-microservices-v2021"
    / "data"
)
DEFAULT_PROCESSED_DIR = PROJECT_DIR / "data" / "processed"
DEFAULT_RESULTS_DIR = PROJECT_DIR / "results" / "phase1_preprocessing"


@dataclass
class PipelineConfig:
    data_dir: Path
    bucket_seconds: int = DEFAULT_BUCKET_SECONDS
    provider_metrics: list = field(default_factory=lambda: list(DEFAULT_PROVIDER_METRICS))
    ffill_limit: int = DEFAULT_FFILL_LIMIT
    delta_windows: tuple = DEFAULT_DELTA_WINDOWS
    violation_percentile: float = DEFAULT_VIOLATION_PERCENTILE
    train_frac: float = DEFAULT_TRAIN_FRAC
    callgraph_chunksize: int = 500_000
    load_chunksize: int = 500_000
    resource_chunksize: int = 500_000

    @property
    def bucket_ms(self) -> int:
        return self.bucket_seconds * 1000

    def callgraph_paths(self) -> list[Path]:
        cg_dir = self.data_dir / "MSCallGraph"
        paths = sorted(cg_dir.glob("MSCallGraph_*/MSCallGraph_*.csv"))
        if not paths:
            raise FileNotFoundError(f"No MSCallGraph_*.csv files found under {cg_dir}")
        return paths

    def msrtqps_paths(self) -> list[Path]:
        qps_dir = self.data_dir / "MSRTQps"
        paths = sorted(qps_dir.glob("MSRTQps_*/MSRTQps_*.csv"))
        if not paths:
            raise FileNotFoundError(f"No MSRTQps_*.csv files found under {qps_dir}")
        return paths

    def msresource_paths(self) -> list[Path]:
        res_dir = self.data_dir / "MSResource"
        paths = sorted(res_dir.glob("MSResource_*/MSResource_*.csv"))
        if not paths:
            raise FileNotFoundError(f"No MSResource_*.csv files found under {res_dir}")
        return paths


def load_config(config_path: Path | None, data_dir: Path, overrides: dict) -> PipelineConfig:
    cfg_dict: dict = {}
    if config_path is not None:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg_dict = json.load(f)
    cfg_dict["data_dir"] = data_dir
    for key, value in overrides.items():
        if value is not None:
            cfg_dict[key] = value
    if "delta_windows" in cfg_dict:
        cfg_dict["delta_windows"] = tuple(cfg_dict["delta_windows"])
    return PipelineConfig(**cfg_dict)


# ---------------------------------------------------------------------------
# Section 3 - candidate selection 
# ---------------------------------------------------------------------------

def count_calls_per_receiver(paths: Iterable[Path], chunksize: int = 1_000_000) -> pd.Series:
    """Call volume per `dm` (receiver / callee) across MSCallGraph shards."""
    counts: dict[str, int] = {}
    for path in paths:
        for chunk in pd.read_csv(path, usecols=["dm"], chunksize=chunksize):
            vc = chunk["dm"].value_counts()
            for k, v in vc.items():
                if k in (None, "", "(?)"):
                    continue
                counts[k] = counts.get(k, 0) + int(v)
    return pd.Series(counts).sort_values(ascending=False)


def count_instances_per_service(
    resource_paths: Iterable[Path], chunksize: int = 1_000_000
) -> pd.Series:
    """Distinct msinstanceid count per msname in MSResource."""
    inst: dict[str, set] = {}
    for path in resource_paths:
        for chunk in pd.read_csv(
            path, usecols=["msname", "msinstanceid"], chunksize=chunksize
        ):
            for msname, grp in chunk.groupby("msname")["msinstanceid"]:
                inst.setdefault(msname, set()).update(grp.unique())
    return pd.Series({k: len(v) for k, v in inst.items()}).sort_values(ascending=False)


def select_candidates(
    cfg: PipelineConfig, top_n: int = 20
) -> tuple[pd.Series, pd.Series, list[str]]:
    top_by_calls = count_calls_per_receiver(
        cfg.callgraph_paths(), chunksize=cfg.callgraph_chunksize
    ).head(top_n)
    top_by_instances = count_instances_per_service(
        cfg.msresource_paths(), chunksize=cfg.resource_chunksize
    ).head(top_n)
    both = [k for k in top_by_calls.index if k in set(top_by_instances.index)]
    return top_by_calls, top_by_instances, both


# ---------------------------------------------------------------------------
# Section 5 - latency signal
# ---------------------------------------------------------------------------

def build_latency_signal(cfg: PipelineConfig, msname: str) -> pd.DataFrame:
    cols = ["timestamp", "rpctype", "dm", "rt"]
    matches = []
    for path in cfg.callgraph_paths():
        for chunk in pd.read_csv(path, usecols=cols, chunksize=cfg.callgraph_chunksize):
            subset = chunk[chunk["dm"] == msname]
            if not subset.empty:
                matches.append(subset)
    if not matches:
        raise ValueError(
            f"No MSCallGraph rows found with dm == {msname!r}. "
            "Check you copied the msname as receiver (dm), not caller (um)."
        )
    df_cg = pd.concat(matches, ignore_index=True)

    keep = (df_cg["rt"] < 0) | (df_cg["rpctype"] == "mq")
    df_cg = df_cg[keep].copy()
    df_cg["rt"] = df_cg["rt"].abs()
    df_cg["time_bucket"] = (df_cg["timestamp"] // cfg.bucket_ms).astype(int)

    latency = df_cg.groupby("time_bucket")["rt"].agg(
        p95_latency_ms=lambda s: s.quantile(0.95),
        p99_latency_ms=lambda s: s.quantile(0.99),
        call_count="count",
    ).reset_index()
    return latency


# ---------------------------------------------------------------------------
# Section 6 - load/backlog signal
# ---------------------------------------------------------------------------

def build_load_signal(cfg: PipelineConfig, msname: str) -> pd.DataFrame:
    cols = ["timestamp", "msname", "metric", "value"]
    matches = []
    for path in cfg.msrtqps_paths():
        for chunk in pd.read_csv(path, usecols=cols, chunksize=cfg.load_chunksize):
            subset = chunk[chunk["msname"] == msname]
            if not subset.empty:
                matches.append(subset)
    df_qps = pd.concat(matches, ignore_index=True) if matches else pd.DataFrame(columns=cols)

    df_qps = df_qps[df_qps["metric"].isin(cfg.provider_metrics)].copy()
    df_qps["time_bucket"] = (df_qps["timestamp"] // cfg.bucket_ms).astype(int)

    load = df_qps.pivot_table(
        index="time_bucket", columns="metric", values="value", aggfunc="mean"
    ).reset_index()
    load.columns.name = None
    return load


# ---------------------------------------------------------------------------
# Section 7 - resource signal
# ---------------------------------------------------------------------------

def build_resource_signal(cfg: PipelineConfig, msname: str) -> pd.DataFrame:
    cols = ["timestamp", "msname", "msinstanceid", "instance_cpu_usage", "instance_memory_usage"]
    matches = []
    for path in cfg.msresource_paths():
        for chunk in pd.read_csv(path, usecols=cols, chunksize=cfg.resource_chunksize):
            subset = chunk[chunk["msname"] == msname]
            if not subset.empty:
                matches.append(subset)
    if not matches:
        raise ValueError(f"No MSResource rows found with msname == {msname!r}.")
    df_res = pd.concat(matches, ignore_index=True)

    df_res["time_bucket"] = (df_res["timestamp"] // cfg.bucket_ms).astype(int)
    resource = df_res.groupby("time_bucket").agg(
        cpu_utilization=("instance_cpu_usage", "mean"),
        memory_utilization=("instance_memory_usage", "mean"),
        active_instances=("msinstanceid", "nunique"),
    ).reset_index()
    return resource


# ---------------------------------------------------------------------------
# Sections 8-12 - join, gap-fill, deltas, label, split
# ---------------------------------------------------------------------------

def join_signal_tables(
    latency: pd.DataFrame, load: pd.DataFrame, resource: pd.DataFrame
) -> pd.DataFrame:
    df = latency.merge(load, on="time_bucket", how="outer").merge(
        resource, on="time_bucket", how="outer"
    )
    df = df.sort_values("time_bucket").reset_index(drop=True)
    return df


def handle_gaps(df: pd.DataFrame, ffill_limit: int = DEFAULT_FFILL_LIMIT) -> pd.DataFrame:
    signal_cols = [c for c in df.columns if c != "time_bucket"]
    df = df.copy()
    df[signal_cols] = df[signal_cols].ffill(limit=ffill_limit)
    df = df.dropna(subset=["p99_latency_ms"]).reset_index(drop=True)
    return df


def engineer_rolling_deltas(
    df: pd.DataFrame,
    windows: tuple = DEFAULT_DELTA_WINDOWS,
    exclude: frozenset = DEFAULT_DELTA_EXCLUDE,
) -> pd.DataFrame:
    df = df.copy()
    signal_cols = [c for c in df.columns if c != "time_bucket"]
    for w in windows:
        for col in signal_cols:
            if col in exclude:
                continue
            df[f"{col}_delta{w}"] = df[col].diff(w)
    return df


def construct_label(
    df: pd.DataFrame, violation_percentile: float = DEFAULT_VIOLATION_PERCENTILE
) -> tuple[pd.DataFrame, float]:
    df = df.copy()
    threshold = df["p99_latency_ms"].quantile(violation_percentile)
    df["violation_now"] = (df["p99_latency_ms"] > threshold).astype(int)

    df["label_next_violation"] = df["violation_now"].shift(-1)
    df = df.dropna(subset=["label_next_violation"]).reset_index(drop=True)
    df["label_next_violation"] = df["label_next_violation"].astype(int)
    return df, float(threshold)


def time_based_split(
    df: pd.DataFrame, train_frac: float = DEFAULT_TRAIN_FRAC
) -> tuple[pd.DataFrame, pd.DataFrame]:
    split_idx = int(len(df) * train_frac)
    train, test = df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    return train, test


# ---------------------------------------------------------------------------
# Section 13 - sanity checks (structured, not console-only - Full_Plan Section 13.2)
# ---------------------------------------------------------------------------

def run_sanity_checks(
    df: pd.DataFrame, train: pd.DataFrame, test: pd.DataFrame, threshold: float
) -> dict:
    na_counts = df.isna().sum()
    return {
        "row_count": int(len(df)),
        "column_count": int(df.shape[1]),
        "na_counts_nonzero": {k: int(v) for k, v in na_counts[na_counts > 0].items()},
        "label_mean_overall": float(df["label_next_violation"].mean()),
        "label_mean_train": float(train["label_next_violation"].mean()) if len(train) else None,
        "label_mean_test": float(test["label_next_violation"].mean()) if len(test) else None,
        "violation_threshold_p99_ms": threshold,
        "call_count_describe": {
            k: (float(v) if pd.notna(v) else None)
            for k, v in df["call_count"].describe().items()
        },
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
    }


# ---------------------------------------------------------------------------
# Section 14 - save output
# ---------------------------------------------------------------------------

def save_feature_table(df: pd.DataFrame, output_stem: Path) -> Path:
    output_stem.parent.mkdir(parents=True, exist_ok=True)
    try:
        path = output_stem.with_suffix(".parquet")
        df.to_parquet(path, index=False)
        return path
    except ImportError:
        path = output_stem.with_suffix(".csv")
        df.to_csv(path, index=False)
        return path


# ---------------------------------------------------------------------------
# Full pipeline (Sections 4-14) for one msname
# ---------------------------------------------------------------------------

def run_pipeline(cfg: PipelineConfig, msname: str) -> dict:
    """Runs Sections 5-13 in order and returns everything a caller needs:
    the full joined/labeled table, the train/test split, the threshold, and
    the sanity-check dict. Saving to disk is left to the CLI (`build`) so this
    function stays reusable for tests without touching the filesystem.
    """
    latency = build_latency_signal(cfg, msname)
    load = build_load_signal(cfg, msname)
    resource = build_resource_signal(cfg, msname)

    df = join_signal_tables(latency, load, resource)
    df = handle_gaps(df, ffill_limit=cfg.ffill_limit)
    df = engineer_rolling_deltas(df, windows=cfg.delta_windows)
    df, threshold = construct_label(df, violation_percentile=cfg.violation_percentile)
    train, test = time_based_split(df, train_frac=cfg.train_frac)
    checks = run_sanity_checks(df, train, test, threshold)

    return {
        "table": df,
        "train": train,
        "test": test,
        "threshold": threshold,
        "checks": checks,
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _add_common_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--data-dir", type=Path, default=None, help=f"Default: {DEFAULT_DATA_DIR}")
    p.add_argument("--config", type=Path, default=None, help="Optional JSON config file")


def cmd_select_candidates(args: argparse.Namespace) -> None:
    data_dir = args.data_dir or DEFAULT_DATA_DIR
    cfg = load_config(args.config, data_dir, {})

    print(f"Scanning MSCallGraph shards under {cfg.data_dir / 'MSCallGraph'} ...")
    top_by_calls, top_by_instances, both = select_candidates(cfg, top_n=args.top_n)

    print(f"\nTop {args.top_n} msname by call volume (as receiver / dm):")
    print(top_by_calls)
    print(f"\nTop {args.top_n} msname by distinct instance count:")
    print(top_by_instances)
    print(f"\nAppears in both top-{args.top_n} lists ({len(both)} candidates):")
    for name in both:
        print(
            f"  {name}  calls={int(top_by_calls[name])}  "
            f"instances={int(top_by_instances[name])}"
        )
    if not both:
        print(
            "  (none - widen --top-n, or pick the strongest candidate from each list "
            "and cross-check its counts individually)"
        )

    results_dir = args.results_dir or DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    out_path = results_dir / "candidate_selection.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "top_by_calls": top_by_calls.to_dict(),
                "top_by_instances": top_by_instances.to_dict(),
                "in_both": both,
            },
            f,
            indent=2,
        )
    print(f"\nSaved candidate selection results to {out_path}")


def cmd_build(args: argparse.Namespace) -> None:
    data_dir = args.data_dir or DEFAULT_DATA_DIR
    overrides = {
        "bucket_seconds": args.bucket_seconds,
        "violation_percentile": args.violation_percentile,
        "train_frac": args.train_frac,
        "ffill_limit": args.ffill_limit,
    }
    cfg = load_config(args.config, data_dir, overrides)

    tag = args.tag or args.msname[:12]
    print(f"Building feature table for msname={args.msname} (tag={tag}) ...")

    result = run_pipeline(cfg, args.msname)
    df, train, test, threshold, checks = (
        result["table"],
        result["train"],
        result["test"],
        result["threshold"],
        result["checks"],
    )

    processed_dir = args.output_dir or DEFAULT_PROCESSED_DIR
    full_path = save_feature_table(df, processed_dir / f"features_{tag}")
    train_path = save_feature_table(train, processed_dir / f"features_{tag}_train")
    test_path = save_feature_table(test, processed_dir / f"features_{tag}_test")

    results_dir = (args.results_dir or DEFAULT_RESULTS_DIR) / tag
    results_dir.mkdir(parents=True, exist_ok=True)

    metrics = {
        "msname": args.msname,
        "tag": tag,
        "bucket_seconds": cfg.bucket_seconds,
        "violation_percentile": cfg.violation_percentile,
        "train_frac": cfg.train_frac,
        "output_paths": {
            "full": str(full_path),
            "train": str(train_path),
            "test": str(test_path),
        },
        "sanity_checks": checks,
    }
    metrics_path = results_dir / "metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(10, 4))
        ax.plot(df["time_bucket"], df["p99_latency_ms"], label="p99 latency (ms)")
        ax.axhline(threshold, color="red", linestyle="--", label="violation threshold")
        ax.set_xlabel("time bucket")
        ax.set_ylabel("p99 latency (ms)")
        ax.set_title(f"p99 latency over time - {tag}")
        ax.legend()
        fig.tight_layout()
        plot_path = results_dir / "p99_latency.png"
        fig.savefig(plot_path)
        plt.close(fig)
        print(f"Saved latency plot to {plot_path}")
    except ImportError:
        print("matplotlib not installed - skipping p99 latency plot (pip install matplotlib)")

    print(f"\nSanity checks:\n{json.dumps(checks, indent=2)}")
    print(f"\nSaved feature tables to {processed_dir} (full/train/test)")
    print(f"Saved metrics to {metrics_path}")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_select = subparsers.add_parser(
        "select-candidates", help="Section 3 - rank msnames by call volume and instance count"
    )
    _add_common_args(p_select)
    p_select.add_argument("--top-n", type=int, default=20)
    p_select.add_argument("--results-dir", type=Path, default=None)
    p_select.set_defaults(func=cmd_select_candidates)

    p_build = subparsers.add_parser(
        "build", help="Sections 4-14 - build one labeled feature table for one msname"
    )
    _add_common_args(p_build)
    p_build.add_argument("--msname", required=True)
    p_build.add_argument("--tag", default=None, help="Short label for output filenames")
    p_build.add_argument("--bucket-seconds", type=int, default=None)
    p_build.add_argument("--violation-percentile", type=float, default=None)
    p_build.add_argument("--train-frac", type=float, default=None)
    p_build.add_argument("--ffill-limit", type=int, default=None)
    p_build.add_argument("--output-dir", type=Path, default=None)
    p_build.add_argument("--results-dir", type=Path, default=None)
    p_build.set_defaults(func=cmd_build)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
