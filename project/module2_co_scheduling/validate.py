"""
Module 2 full validation suite (Full_Plan.md Sections 5 and 7):
- Cumulative regret vs. oracle-in-hindsight, random, and heuristic-fallback
- Discounted-vs-vanilla Thompson Sampling mini-ablation on a non-stationary
  sub-window (the individual contribution's proof)
- Convergence check (does node preference stabilize, and re-adapt after a shift)

Writes results/module2/metrics.json plus plots, per Full_Plan.md Section 13.2.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bandit import ThompsonSamplingBandit, heuristic_select
from common import DEFAULT_PROCESSED_DIR, DEFAULT_RESULTS_DIR, Module2Config, load_node_table
from simulator import NodeSimulator


def precompute_events(events_df: pd.DataFrame, sim: NodeSimulator, cfg: Module2Config) -> list[dict]:
    """For every placement event, sample its candidate set once and compute
    every candidate's real reward - shared "experience" replayed identically
    across every policy being compared, so differences reflect the policy,
    not different random draws of candidates.
    """
    precomputed = []
    for i, row in events_df.iterrows():
        rng = np.random.default_rng(cfg.seed + i)
        candidates = sim.sample_candidates(int(row["event_timestamp"]), rng)
        if candidates is None:
            continue
        rewards = {c: sim.reward(c, int(row["event_timestamp"])) for c in candidates["nodeid"]}
        if any(r is None for r in rewards.values()):
            continue
        precomputed.append({
            "event_idx": i,
            "timestamp": int(row["event_timestamp"]),
            "candidates": candidates,
            "rewards": rewards,
        })
    return precomputed


def batch_init_bandit(bandit: ThompsonSamplingBandit, static_events: pd.DataFrame, sim: NodeSimulator) -> int:
    """Seed each node's arm with real reward history from the 306 instances
    that were already running at trace start (see extract_events.py's module
    docstring for why this hybrid design exists: this trace has almost no
    genuine mid-trace placement churn to run a sequential bandit over, so the
    static pre-existing fleet instead gives the bandit a realistic warm
    start, and the actual sequential comparison runs on the real churn
    events that do exist).
    """
    n_applied = 0
    for _, row in static_events.iterrows():
        reward = sim.reward(row["nodeid"], int(row["event_timestamp"]))
        if reward is not None:
            bandit.update(row["nodeid"], reward)
            n_applied += 1
    return n_applied


def run_ts_policy(precomputed: list[dict], gamma: float, seed: int, static_events: pd.DataFrame | None = None,
                   sim: NodeSimulator | None = None) -> pd.DataFrame:
    bandit = ThompsonSamplingBandit(gamma=gamma, seed=seed)
    if static_events is not None:
        batch_init_bandit(bandit, static_events, sim)
    rows = []
    for ev in precomputed:
        candidate_ids = list(ev["rewards"].keys())
        chosen = bandit.select(candidate_ids)
        reward = ev["rewards"][chosen]
        bandit.update(chosen, reward)
        rows.append({"timestamp": ev["timestamp"], "chosen": chosen, "reward": reward,
                      "oracle_reward": max(ev["rewards"].values())})
    return pd.DataFrame(rows)


def run_random_policy(precomputed: list[dict], seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    rows = []
    for ev in precomputed:
        candidate_ids = list(ev["rewards"].keys())
        chosen = candidate_ids[rng.integers(len(candidate_ids))]
        rows.append({"timestamp": ev["timestamp"], "chosen": chosen, "reward": ev["rewards"][chosen],
                      "oracle_reward": max(ev["rewards"].values())})
    return pd.DataFrame(rows)


def run_heuristic_policy(precomputed: list[dict]) -> pd.DataFrame:
    rows = []
    for ev in precomputed:
        chosen = heuristic_select(ev["candidates"])
        rows.append({"timestamp": ev["timestamp"], "chosen": chosen, "reward": ev["rewards"][chosen],
                      "oracle_reward": max(ev["rewards"].values())})
    return pd.DataFrame(rows)


def run_combined_policy(precomputed: list[dict], cfg: Module2Config, static_events: pd.DataFrame,
                         sim: NodeSimulator) -> pd.DataFrame:
    """The system as actually designed: batch-initialized from the static
    fleet, heuristic for any remaining brief warmup, discounted TS thereafter.
    """
    bandit = ThompsonSamplingBandit(gamma=cfg.discount_gamma, seed=cfg.seed)
    batch_init_bandit(bandit, static_events, sim)
    rows = []
    for i, ev in enumerate(precomputed):
        candidate_ids = list(ev["rewards"].keys())
        if i < cfg.warmup_rounds:
            chosen = heuristic_select(ev["candidates"])
        else:
            chosen = bandit.select(candidate_ids)
        reward = ev["rewards"][chosen]
        bandit.update(chosen, reward)
        rows.append({"timestamp": ev["timestamp"], "chosen": chosen, "reward": reward,
                      "oracle_reward": max(ev["rewards"].values()), "used_heuristic": i < cfg.warmup_rounds})
    return pd.DataFrame(rows)


def with_regret(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["regret"] = df["oracle_reward"] - df["reward"]
    df["cumulative_regret"] = df["regret"].cumsum()
    df["cumulative_reward"] = df["reward"].cumsum()
    return df


def rolling_selection_entropy(chosen: pd.Series, window: int) -> np.ndarray:
    entropies = []
    for i in range(len(chosen)):
        start = max(0, i - window + 1)
        window_vals = chosen.iloc[start:i + 1]
        counts = window_vals.value_counts(normalize=True)
        entropies.append(float(-(counts * np.log(counts)).sum()))
    return np.array(entropies)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = Module2Config.load(args.config) if args.config else Module2Config.load()

    # Hybrid event design (see extract_events.py docstring): the 306 static
    # pre-existing instances batch-initialize bandit arms with real reward
    # history; the genuinely time-ordered cluster-wide churn events are the
    # actual sequential rounds the policies are compared on.
    static_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_primary.parquet")
    churn_events = pd.read_parquet(DEFAULT_PROCESSED_DIR / "module2_placement_events_churn.parquet")
    node_df = load_node_table()
    allowed_nodes = set(static_events["nodeid"]) | set(churn_events["nodeid"])
    sim = NodeSimulator(node_df, cfg, allowed_nodes=allowed_nodes)
    print(f"Candidate node pool restricted to {len(allowed_nodes)} nodes "
          f"(union of {static_events['nodeid'].nunique()} batch-init + {churn_events['nodeid'].nunique()} churn nodes)")

    precomputed = precompute_events(churn_events, sim, cfg)
    print(f"Static batch-init events: {len(static_events)}")
    print(f"Usable sequential (churn) events: {len(precomputed)} / {len(churn_events)}")

    # --- Regret validation: combined system vs. random vs. heuristic-only, all vs. oracle ---
    combined = with_regret(run_combined_policy(precomputed, cfg, static_events, sim))
    random_run = with_regret(run_random_policy(precomputed, cfg.seed))
    heuristic_run = with_regret(run_heuristic_policy(precomputed))

    regret_summary = {
        "n_rounds": len(precomputed),
        "final_cumulative_regret": {
            "combined_system": float(combined["cumulative_regret"].iloc[-1]),
            "random": float(random_run["cumulative_regret"].iloc[-1]),
            "heuristic_only": float(heuristic_run["cumulative_regret"].iloc[-1]),
        },
        "mean_reward": {
            "combined_system": float(combined["reward"].mean()),
            "random": float(random_run["reward"].mean()),
            "heuristic_only": float(heuristic_run["reward"].mean()),
            "oracle": float(combined["oracle_reward"].mean()),
        },
    }
    print("\n=== Regret validation ===")
    print(json.dumps(regret_summary, indent=2))

    # --- Discounted vs. vanilla TS mini-ablation on a non-stationary sub-window ---
    lo_bucket, hi_bucket = cfg.non_stationary_bucket_range
    lo_ts, hi_ts = lo_bucket * cfg.bucket_ms, hi_bucket * cfg.bucket_ms

    discounted_full = with_regret(run_ts_policy(precomputed, cfg.discount_gamma, cfg.seed, static_events, sim))
    vanilla_full = with_regret(run_ts_policy(precomputed, 1.0, cfg.seed, static_events, sim))

    window_mask_d = discounted_full["timestamp"].between(lo_ts, hi_ts)
    window_mask_v = vanilla_full["timestamp"].between(lo_ts, hi_ts)

    ablation = {
        "sub_window_buckets": [lo_bucket, hi_bucket],
        "n_rounds_in_window": int(window_mask_d.sum()),
        "discounted_mean_reward_in_window": float(discounted_full.loc[window_mask_d, "reward"].mean()),
        "vanilla_mean_reward_in_window": float(vanilla_full.loc[window_mask_v, "reward"].mean()),
        "discounted_mean_reward_full": float(discounted_full["reward"].mean()),
        "vanilla_mean_reward_full": float(vanilla_full["reward"].mean()),
    }
    ablation["discounted_beats_vanilla_in_window"] = bool(
        ablation["discounted_mean_reward_in_window"] > ablation["vanilla_mean_reward_in_window"]
    )
    print("\n=== Discounted vs. vanilla TS ablation (non-stationary sub-window) ===")
    print(json.dumps(ablation, indent=2))

    # --- Convergence check ---
    # Entropy is mechanically low for the first `window` rounds (fewer than
    # `window` distinct choices are even possible yet) - that's a sample-size
    # artifact, not evidence of a converged preference. Compare from the
    # first fully-populated window onward instead of from round 0.
    ROLLING_WINDOW = 20
    entropy = rolling_selection_entropy(discounted_full["chosen"], window=ROLLING_WINDOW)
    first_full = entropy[ROLLING_WINDOW - 1] if len(entropy) >= ROLLING_WINDOW else entropy[-1]
    convergence = {
        "rolling_window": ROLLING_WINDOW,
        "entropy_at_first_full_window": float(first_full),
        "final_rolling_entropy": float(entropy[-1]),
        "max_possible_entropy": float(np.log(ROLLING_WINDOW)),
        "entropy_at_shift_start": float(entropy[window_mask_d.values.argmax()]) if window_mask_d.any() else None,
        "converges": bool(entropy[-1] < first_full * 0.9) if len(entropy) >= ROLLING_WINDOW else None,
    }
    print("\n=== Convergence check ===")
    print(json.dumps(convergence, indent=2))

    results_dir = DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    metrics = {
        "n_static_batch_init_events": len(static_events),
        "n_churn_events_total": len(churn_events),
        "n_usable_events": len(precomputed),
        "regret_validation": regret_summary,
        "discounted_vs_vanilla_ablation": ablation,
        "convergence_check": convergence,
        "pass_criteria": {
            "combined_beats_random_and_heuristic_regret": (
                regret_summary["final_cumulative_regret"]["combined_system"]
                < regret_summary["final_cumulative_regret"]["random"]
                and regret_summary["final_cumulative_regret"]["combined_system"]
                < regret_summary["final_cumulative_regret"]["heuristic_only"]
            ),
            "discounted_beats_vanilla_on_shift_window": ablation["discounted_beats_vanilla_in_window"],
        },
    }
    with open(results_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nSaved consolidated metrics to {results_dir / 'metrics.json'}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(combined["cumulative_regret"].values, label="combined system (heuristic warmup + discounted TS)")
        ax.plot(random_run["cumulative_regret"].values, label="random")
        ax.plot(heuristic_run["cumulative_regret"].values, label="heuristic only")
        ax.set_xlabel("placement round")
        ax.set_ylabel("cumulative regret")
        ax.set_title("Module 2: cumulative regret vs. oracle")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "regret_comparison.png")
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(discounted_full["timestamp"].values, discounted_full["cumulative_reward"].values, label="discounted TS")
        ax.plot(vanilla_full["timestamp"].values, vanilla_full["cumulative_reward"].values, label="vanilla TS")
        ax.axvspan(lo_ts, hi_ts, color="orange", alpha=0.15, label="non-stationary sub-window")
        ax.set_xlabel("timestamp (ms)")
        ax.set_ylabel("cumulative reward")
        ax.set_title("Module 2: discounted vs. vanilla TS")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "discounted_vs_vanilla.png")
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(entropy)
        ax.axvspan(np.where(window_mask_d.values)[0].min() if window_mask_d.any() else 0,
                   np.where(window_mask_d.values)[0].max() if window_mask_d.any() else 0,
                   color="orange", alpha=0.15, label="non-stationary sub-window")
        ax.set_xlabel("placement round")
        ax.set_ylabel("rolling selection entropy (window=20)")
        ax.set_title("Module 2: node-preference convergence (discounted TS)")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "convergence.png")
        plt.close(fig)

        print(f"Saved plots to {results_dir}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
