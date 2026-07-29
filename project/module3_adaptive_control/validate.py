"""
Module 3 full validation suite (Full_Plan.md Sections 6 and 7):
- PI controller isolated test against synthetic input
- Conformal coverage check
- Step-response test (overshoot, settling time, boundedness)
- Three-way comparison: fixed-parameter vs. PI+conformal (BACC-equivalent) vs.
  full design (+ oscillation widening) - the individual contribution's proof
- Sensitivity check: does the interval widen right after a reversal spike

Writes results/module3/metrics.json plus plots, per Full_Plan.md Section 13.2.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import DEFAULT_RESULTS_DIR, Module3Config, load_holdout_residual_stream, load_walkforward_oos_series
from conformal import AdaptiveConformalInference, oscillation_widening_factor, rolling_reversal_count
from pi_controller import PIController


def run_arm(df: pd.DataFrame, cfg: Module3Config, mode: str) -> pd.DataFrame:
    """mode in {'fixed', 'pi_conformal', 'full'}."""
    pi = PIController(cfg.kp, cfg.ki, cfg.setpoint, cfg.initial_threshold, tuple(cfg.threshold_bounds))
    aci = AdaptiveConformalInference(cfg.alpha_target, tuple(cfg.alpha_bounds), cfg.aci_gamma, cfg.score_window)
    trajectory = [cfg.initial_threshold]

    rows = []
    for _, row in df.iterrows():
        risk = float(row["predicted_risk"])
        actual = float(row["actual_outcome"])
        score = abs(actual - risk)

        if mode == "fixed":
            threshold = cfg.initial_threshold
            width, covered, rev_count, mult = 0.0, None, 0, 1.0
        else:
            width, covered = aci.update(score)
            if mode == "full":
                rev_count = rolling_reversal_count(trajectory, cfg.oscillation_window)
                mult = oscillation_widening_factor(rev_count, cfg.oscillation_k)
            else:
                rev_count, mult = 0, 1.0
            widened_width = width * mult
            max_step = cfg.base_max_step / (1 + cfg.width_sensitivity * widened_width)
            threshold = pi.step(risk, max_step)
            trajectory.append(threshold)

        alert = risk > threshold
        rows.append({
            "time_bucket": row["time_bucket"], "predicted_risk": risk, "actual_outcome": actual,
            "score": score, "width": width, "covered": covered, "reversal_count": rev_count,
            "widening_multiplier": mult, "threshold": threshold, "alert": alert,
        })
    return pd.DataFrame(rows)


def compute_elasticity_metrics(arm_df: pd.DataFrame) -> dict:
    threshold_traj = arm_df["threshold"].values
    deltas = np.diff(threshold_traj)
    signs = np.sign(deltas)
    nonzero = signs[signs != 0]
    instability = int(np.sum(nonzero[1:] != nonzero[:-1])) if len(nonzero) > 1 else 0

    deviation = float(np.std(threshold_traj))

    over_provisioning = float((arm_df["alert"] & (arm_df["actual_outcome"] == 0)).mean())
    under_provisioning = float((~arm_df["alert"] & (arm_df["actual_outcome"] == 1)).mean())

    return {
        "instability_reversals": instability,
        "deviation_std": deviation,
        "over_provisioning_timeshare": over_provisioning,
        "under_provisioning_timeshare": under_provisioning,
    }


def run_isolated_pi_test(cfg: Module3Config) -> dict:
    """Synthetic step input, no conformal bounding - the PI controller alone."""
    n_pre, n_post = 20, 40
    signal = [cfg.setpoint] * n_pre + [cfg.setpoint + 0.5] * n_post
    pi = PIController(cfg.kp, cfg.ki, cfg.setpoint, cfg.initial_threshold, tuple(cfg.threshold_bounds))
    trajectory = [cfg.initial_threshold]
    for risk in signal:
        trajectory.append(pi.step(risk, cfg.base_max_step))

    post = np.array(trajectory[n_pre:])
    bounded = bool(np.all(np.array(trajectory) >= cfg.threshold_bounds[0]) and np.all(np.array(trajectory) <= cfg.threshold_bounds[1]))
    return {
        "trajectory": trajectory,
        "responds_to_step": bool(abs(trajectory[-1] - trajectory[n_pre]) > 1e-6),
        "bounded": bounded,
        "final_value": float(trajectory[-1]),
    }


def run_coverage_check(df: pd.DataFrame, cfg: Module3Config) -> dict:
    aci = AdaptiveConformalInference(cfg.alpha_target, tuple(cfg.alpha_bounds), cfg.aci_gamma, cfg.score_window)
    covered_flags = []
    for _, row in df.iterrows():
        score = abs(row["actual_outcome"] - row["predicted_risk"])
        _, covered = aci.update(score)
        covered_flags.append(covered)
    empirical_coverage = float(np.mean(covered_flags))
    return {
        "target_coverage": 1 - cfg.alpha_target,
        "empirical_coverage": empirical_coverage,
        "n_points": len(covered_flags),
        "close_to_target": bool(abs(empirical_coverage - (1 - cfg.alpha_target)) < 0.15),
    }


def run_step_response_test(cfg: Module3Config) -> dict:
    """Full design (PI+conformal+widening) against a synthetic quiet->busy
    transition with realistic binary outcomes, not just a raw risk step. The
    quiet phase holds risk exactly at the setpoint (the controller's
    equilibrium, zero error) so the threshold starts flat/settled - anything
    else would already be drifting before the "step" even happens, making
    overshoot/settling-time meaningless.
    """
    rng = np.random.default_rng(cfg.seed)
    n_pre, n_post = cfg.step_response_pre_steps, cfg.step_response_post_steps
    risks = np.concatenate([
        np.full(n_pre, cfg.setpoint),
        np.full(n_post, cfg.step_response_high),
    ])
    outcomes = (rng.random(len(risks)) < risks).astype(float)
    df = pd.DataFrame({"time_bucket": np.arange(len(risks)), "predicted_risk": risks, "actual_outcome": outcomes})

    result = run_arm(df, cfg, "full")
    traj = result["threshold"].values
    pre_value = traj[n_pre - 1]
    post_values = traj[n_pre:]

    settled_band = 0.05 * abs(post_values[-1] - pre_value) if abs(post_values[-1] - pre_value) > 1e-6 else 0.01
    settled_idx = None
    for i in range(len(post_values)):
        if np.all(np.abs(post_values[i:] - post_values[-1]) <= max(settled_band, 0.01)):
            settled_idx = i
            break

    overshoot = float(max(0.0, (traj.min() - pre_value)) if post_values[-1] < pre_value
                       else max(0.0, post_values.max() - post_values[-1]))
    bounded = bool(np.all(traj >= cfg.threshold_bounds[0]) and np.all(traj <= cfg.threshold_bounds[1]))

    return {
        "pre_step_value": float(pre_value),
        "final_value": float(post_values[-1]),
        "overshoot": overshoot,
        "settling_time_steps": settled_idx,
        "bounded": bounded,
        "trajectory": traj.tolist(),
    }


def run_sensitivity_check(bursty_df: pd.DataFrame, cfg: Module3Config) -> dict:
    result = run_arm(bursty_df, cfg, "full")
    widened_width = result["width"] * result["widening_multiplier"]
    corr = float(np.corrcoef(result["reversal_count"], widened_width)[0, 1]) if result["reversal_count"].std() > 0 else None
    spike_idx = int(result["reversal_count"].idxmax())
    return {
        "correlation_reversal_count_vs_widened_width": corr,
        "max_reversal_count": int(result["reversal_count"].max()),
        "widened_width_at_max_reversal": float(widened_width.iloc[spike_idx]),
        "widened_width_before_max_reversal": float(widened_width.iloc[max(0, spike_idx - 3):spike_idx].mean()) if spike_idx > 0 else None,
        "widens_after_reversal_spike": bool(corr is not None and corr > 0.1),
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tag", default="primary")
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args(argv)

    cfg = Module3Config.load(args.config) if args.config else Module3Config.load()

    holdout = load_holdout_residual_stream(args.tag)
    print(f"Held-out residual stream: {len(holdout)} rows, "
          f"{int(holdout['actual_outcome'].sum())} actual violations")

    print("\nHeld-out stream is too thin for a bursty stress test "
          f"({int(holdout['actual_outcome'].sum())} violation(s) in {len(holdout)} rows) - "
          "using Module 1's walk-forward out-of-sample series instead (see common.py).")
    bursty = load_walkforward_oos_series(args.tag)
    print(f"Walk-forward OOS series: {len(bursty)} rows, "
          f"{int(bursty['actual_outcome'].sum())} actual violations")

    # --- Isolated PI controller test ---
    pi_test = run_isolated_pi_test(cfg)
    print("\n=== Isolated PI controller test (synthetic step, no conformal) ===")
    print(json.dumps({k: v for k, v in pi_test.items() if k != "trajectory"}, indent=2))

    # --- Conformal coverage check ---
    coverage = run_coverage_check(holdout, cfg)
    print("\n=== Conformal coverage check (held-out stream) ===")
    print(json.dumps(coverage, indent=2))

    # --- Step-response test ---
    step_response = run_step_response_test(cfg)
    print("\n=== Step-response test (full design, synthetic quiet->busy) ===")
    print(json.dumps({k: v for k, v in step_response.items() if k != "trajectory"}, indent=2))

    # --- Three-way comparison on the bursty segment ---
    fixed_result = run_arm(bursty, cfg, "fixed")
    pi_conformal_result = run_arm(bursty, cfg, "pi_conformal")
    full_result = run_arm(bursty, cfg, "full")

    three_way = {
        "fixed": compute_elasticity_metrics(fixed_result),
        "pi_conformal": compute_elasticity_metrics(pi_conformal_result),
        "full": compute_elasticity_metrics(full_result),
    }
    print("\n=== Three-way comparison (bursty segment) ===")
    print(json.dumps(three_way, indent=2))

    # --- Sensitivity check ---
    sensitivity = run_sensitivity_check(bursty, cfg)
    print("\n=== Sensitivity check (widening after reversal spike) ===")
    print(json.dumps(sensitivity, indent=2))

    results_dir = DEFAULT_RESULTS_DIR
    results_dir.mkdir(parents=True, exist_ok=True)
    metrics = {
        "tag": args.tag,
        "n_holdout_rows": len(holdout),
        "n_holdout_violations": int(holdout["actual_outcome"].sum()),
        "n_bursty_rows": len(bursty),
        "n_bursty_violations": int(bursty["actual_outcome"].sum()),
        "isolated_pi_test": {k: v for k, v in pi_test.items() if k != "trajectory"},
        "coverage_check": coverage,
        "step_response_test": {k: v for k, v in step_response.items() if k != "trajectory"},
        "three_way_comparison": three_way,
        "sensitivity_check": sensitivity,
        "pass_criteria": {
            # Full_Plan.md Section 7's literal metric for this row is reversal
            # count specifically - this is the actual pass criterion.
            "pi_responds_and_bounded": pi_test["responds_to_step"] and pi_test["bounded"],
            "coverage_close_to_target": coverage["close_to_target"],
            "step_response_bounded": step_response["bounded"],
            "full_beats_pi_conformal_instability": (
                three_way["full"]["instability_reversals"] < three_way["pi_conformal"]["instability_reversals"]
            ),
            "widens_after_reversal_spike": sensitivity["widens_after_reversal_spike"],
        },
        # Not a Section 7 pass criterion, informational only. Honest finding
        # (corrected after Phase 4 integration testing found and fixed a
        # PI anti-windup bug - see pi_controller.py's docstring): on this
        # 210-row bursty segment there are only 3 genuine reversals, and
        # oscillation widening does not reduce that discrete count at any
        # tested (window, k) combination - but it does monotonically reduce
        # deviation_std as k increases, meaning the reversals still happen
        # but with dampened amplitude/impact. With a sample of only 3
        # reversals, a count-based comparison has little room to show
        # anything either way; the amplitude-dampening effect is the more
        # meaningful signal the mechanism is genuinely doing something.
        "deviation_dampening_effect": {
            "full_deviation_lower_than_pi_conformal": (
                three_way["full"]["deviation_std"] < three_way["pi_conformal"]["deviation_std"]
            ),
            "full_deviation_std": three_way["full"]["deviation_std"],
            "pi_conformal_deviation_std": three_way["pi_conformal"]["deviation_std"],
        },
    }
    with open(results_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    print(f"\nSaved consolidated metrics to {results_dir / 'metrics.json'}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(pi_test["trajectory"])
        ax.axvline(20, color="gray", linestyle="--", label="step input")
        ax.set_xlabel("step")
        ax.set_ylabel("controlled value")
        ax.set_title("Module 3: isolated PI controller step response")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "isolated_pi_test.png")
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(8, 4))
        ax.plot(step_response["trajectory"])
        ax.axvline(cfg.step_response_pre_steps, color="gray", linestyle="--", label="quiet->busy transition")
        ax.set_xlabel("step")
        ax.set_ylabel("threshold")
        ax.set_title("Module 3: full-design step-response test")
        ax.legend()
        fig.tight_layout()
        fig.savefig(results_dir / "step_response.png")
        plt.close(fig)

        fig, axes = plt.subplots(3, 1, figsize=(9, 9), sharex=True)
        for ax, (name, res) in zip(axes, [("fixed", fixed_result), ("pi_conformal", pi_conformal_result), ("full", full_result)]):
            ax.plot(res["time_bucket"], res["threshold"], label=f"{name} threshold")
            ax.plot(res["time_bucket"], res["predicted_risk"], alpha=0.5, label="predicted_risk")
            ax.set_ylabel(name)
            ax.legend(loc="upper right", fontsize=8)
        axes[-1].set_xlabel("time_bucket")
        fig.suptitle("Module 3: three-way comparison on bursty segment")
        fig.tight_layout()
        fig.savefig(results_dir / "three_way_comparison.png")
        plt.close(fig)

        full_widened = full_result["width"] * full_result["widening_multiplier"]
        fig, ax1 = plt.subplots(figsize=(9, 4))
        ax1.plot(full_result["time_bucket"], full_result["reversal_count"], color="tab:red", label="rolling reversal count")
        ax1.set_ylabel("reversal count", color="tab:red")
        ax2 = ax1.twinx()
        ax2.plot(full_result["time_bucket"], full_widened, color="tab:blue", label="widened interval width")
        ax2.set_ylabel("widened width", color="tab:blue")
        ax1.set_xlabel("time_bucket")
        ax1.set_title("Module 3: sensitivity check - widening tracks reversals")
        fig.tight_layout()
        fig.savefig(results_dir / "sensitivity_check.png")
        plt.close(fig)

        print(f"Saved plots to {results_dir}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
