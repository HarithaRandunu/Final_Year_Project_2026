"""
Module 2 - synthetic rank-inversion stress test (Full_Plan.md Section 5,
individual contribution proof, addendum).

Why this exists: the real trace's non-stationary sub-window (validate.py's
discounted-vs-vanilla mini-ablation) has genuine drift, but it's *uniform*
across nodes (overall reward level drops together) rather than *differential*
(which node is relatively best doesn't change) - discounting is specifically
designed to help when RELATIVE rankings shift, so it had nothing to exploit
there, and vanilla TS edged it out (see results/module2/metrics.json,
discounted_vs_vanilla_ablation). This script builds a controlled synthetic
environment with a genuine, engineered rank inversion - the best-to-worst node
ordering flips partway through - isolating exactly the condition the discount
factor targets. Same methodological move as Module 1's synthetic-perturbation
SHAP test and Module 3's synthetic step-response test: neither of those relies
on real data alone for its individual-contribution proof either.

This does NOT replace or overwrite the honest real-data finding already in
results/module2/metrics.json - it is an additional, clearly-labeled controlled
test, written to its own file: results/module2/synthetic_rank_inversion.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bandit import ThompsonSamplingBandit
from common import DEFAULT_RESULTS_DIR, Module2Config

N_ARMS = 6
ROUNDS_PER_PHASE = 150
RECOVERY_WINDOW = 30
N_REPEATS = 50
NOISE_STD = 0.08
# Arm 0 best ... arm 5 worst in phase 1. Phase 2 uses the exact same means,
# reversed across arms - a genuine rank inversion, not just a level shift.
PHASE1_MEANS = np.array([0.85, 0.70, 0.55, 0.40, 0.25, 0.10])


def build_environment(seed: int) -> np.ndarray:
    """Returns the full (2*ROUNDS_PER_PHASE, N_ARMS) reward matrix - one real
    draw per (round, arm), shared across policies being compared so
    differences reflect the policy, not different random draws (mirrors
    validate.py's precompute_events pattern for the real-data ablation).
    """
    rng = np.random.default_rng(seed)
    phase2_means = PHASE1_MEANS[::-1]
    phase1 = rng.normal(loc=PHASE1_MEANS, scale=NOISE_STD, size=(ROUNDS_PER_PHASE, N_ARMS))
    phase2 = rng.normal(loc=phase2_means, scale=NOISE_STD, size=(ROUNDS_PER_PHASE, N_ARMS))
    return np.clip(np.vstack([phase1, phase2]), 0.0, 1.0)


def run_policy(rewards: np.ndarray, gamma: float, seed: int) -> np.ndarray:
    bandit = ThompsonSamplingBandit(gamma=gamma, seed=seed)
    arm_ids = list(range(rewards.shape[1]))
    received = np.zeros(rewards.shape[0])
    for t in range(rewards.shape[0]):
        chosen = bandit.select(arm_ids)
        reward = float(rewards[t, chosen])
        bandit.update(chosen, reward)
        received[t] = reward
    return received


def run_one_repeat(seed: int, gamma: float) -> dict:
    rewards = build_environment(seed)
    discounted = run_policy(rewards, gamma, seed)
    vanilla = run_policy(rewards, 1.0, seed)

    recovery = slice(ROUNDS_PER_PHASE, ROUNDS_PER_PHASE + RECOVERY_WINDOW)
    post = slice(ROUNDS_PER_PHASE, None)

    return {
        "seed": seed,
        "discounted_mean_recovery_window": float(discounted[recovery].mean()),
        "vanilla_mean_recovery_window": float(vanilla[recovery].mean()),
        "discounted_mean_post_inversion_full": float(discounted[post].mean()),
        "vanilla_mean_post_inversion_full": float(vanilla[post].mean()),
        "discounted_cum_reward_curve": np.cumsum(discounted).tolist(),
        "vanilla_cum_reward_curve": np.cumsum(vanilla).tolist(),
    }


def main() -> None:
    cfg = Module2Config.load()
    gamma = cfg.discount_gamma

    repeats = [run_one_repeat(cfg.seed + i, gamma) for i in range(N_REPEATS)]

    recovery_diff = np.array([r["discounted_mean_recovery_window"] - r["vanilla_mean_recovery_window"] for r in repeats])
    post_diff = np.array([r["discounted_mean_post_inversion_full"] - r["vanilla_mean_post_inversion_full"] for r in repeats])

    recovery_wilcoxon = stats.wilcoxon(recovery_diff, alternative="greater")
    post_wilcoxon = stats.wilcoxon(post_diff, alternative="greater")

    summary = {
        "gamma_discounted": gamma,
        "gamma_vanilla": 1.0,
        "n_arms": N_ARMS,
        "rounds_per_phase": ROUNDS_PER_PHASE,
        "recovery_window_rounds": RECOVERY_WINDOW,
        "n_repeats": N_REPEATS,
        "phase1_means": PHASE1_MEANS.tolist(),
        "phase2_means": PHASE1_MEANS[::-1].tolist(),
        "recovery_window": {
            "discounted_mean": float(np.mean([r["discounted_mean_recovery_window"] for r in repeats])),
            "vanilla_mean": float(np.mean([r["vanilla_mean_recovery_window"] for r in repeats])),
            "win_rate_discounted": float((recovery_diff > 0).mean()),
            "mean_diff": float(recovery_diff.mean()),
            "wilcoxon_statistic": float(recovery_wilcoxon.statistic),
            "wilcoxon_pvalue_one_sided_greater": float(recovery_wilcoxon.pvalue),
        },
        "post_inversion_full_phase": {
            "discounted_mean": float(np.mean([r["discounted_mean_post_inversion_full"] for r in repeats])),
            "vanilla_mean": float(np.mean([r["vanilla_mean_post_inversion_full"] for r in repeats])),
            "win_rate_discounted": float((post_diff > 0).mean()),
            "mean_diff": float(post_diff.mean()),
            "wilcoxon_statistic": float(post_wilcoxon.statistic),
            "wilcoxon_pvalue_one_sided_greater": float(post_wilcoxon.pvalue),
        },
    }
    summary["pass_criteria"] = {
        "discounted_beats_vanilla_recovery_window": (
            summary["recovery_window"]["win_rate_discounted"] > 0.5
            and summary["recovery_window"]["wilcoxon_pvalue_one_sided_greater"] < 0.05
        ),
        "discounted_beats_vanilla_full_post_inversion": (
            summary["post_inversion_full_phase"]["win_rate_discounted"] > 0.5
            and summary["post_inversion_full_phase"]["wilcoxon_pvalue_one_sided_greater"] < 0.05
        ),
    }

    print("\n=== Module 2: synthetic rank-inversion stress test ===")
    print(json.dumps({k: v for k, v in summary.items() if k not in ("phase1_means", "phase2_means")}, indent=2))

    results_dir = DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    with open(results_dir / "synthetic_rank_inversion.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSaved to {results_dir / 'synthetic_rank_inversion.json'}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        discounted_curves = np.array([r["discounted_cum_reward_curve"] for r in repeats])
        vanilla_curves = np.array([r["vanilla_cum_reward_curve"] for r in repeats])

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(discounted_curves.mean(axis=0), label=f"discounted TS (gamma={gamma})")
        ax.plot(vanilla_curves.mean(axis=0), label="vanilla TS (gamma=1.0)")
        ax.axvline(ROUNDS_PER_PHASE, color="gray", linestyle="--", label="engineered rank inversion")
        ax.set_xlabel("round")
        ax.set_ylabel(f"mean cumulative reward across {N_REPEATS} repeats")
        ax.set_title("Module 2: synthetic rank-inversion stress test")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "synthetic_rank_inversion.png")
        plt.close(fig)
        print(f"Saved plot to {results_dir / 'synthetic_rank_inversion.png'}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
