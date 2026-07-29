"""
Phase 4 - Simulated Integration (Full_Plan.md Section 9 repo layout; Phase_Plan.md
Phase 4): wires Module 1 -> Module 2 (attribution as bandit context) and
Module 1 -> Module 3 (predicted-risk stream as conformal input) into one
reviewable run over the full 12-hour trace.

This script does not re-implement or re-validate any module's own logic -
each module's own {export_full_trace,export_decision_log,export_trajectory}.py
script (run first, see main() below) produces its log using exactly the same
validated code from Phases 2-3. This script's job is purely to assemble the
three logs Phase 4's exit criteria calls for (decision log, placement log,
parameter trajectory), check they're internally consistent with each other,
and produce one combined view of the closed loop's behavior.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data" / "processed"
RESULTS_DIR = PROJECT_DIR / "results" / "integration"
TAG = "primary"


def run_export_scripts() -> None:
    scripts = [
        PROJECT_DIR / "module1_signal_fusion" / "export_full_trace.py",
        PROJECT_DIR / "module2_co_scheduling" / "export_decision_log.py",
        PROJECT_DIR / "module3_adaptive_control" / "export_trajectory.py",
    ]
    for script in scripts:
        print(f"--- Running {script.relative_to(PROJECT_DIR)} ---")
        result = subprocess.run([sys.executable, str(script)], cwd=script.parent, capture_output=True, text=True)
        print(result.stdout)
        if result.returncode != 0:
            print(result.stderr)
            raise RuntimeError(f"{script} failed with exit code {result.returncode}")


def load_logs() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    decision_log = pd.read_parquet(DATA_DIR / f"module1_full_trace_{TAG}.parquet")
    placement_log = pd.read_parquet(DATA_DIR / "module2_decision_log_primary.parquet")
    parameter_trajectory = pd.read_parquet(DATA_DIR / f"module3_trajectory_{TAG}.parquet")
    return decision_log, placement_log, parameter_trajectory


def check_coherence(decision_log: pd.DataFrame, placement_log: pd.DataFrame, trajectory: pd.DataFrame) -> dict:
    checks = {}

    checks["decision_log_rows"] = len(decision_log)
    checks["decision_log_covers_full_trace"] = bool(
        decision_log["time_bucket"].min() == 0 and decision_log["time_bucket"].max() == 359
        and decision_log["time_bucket"].is_unique and len(decision_log) == 360
    )
    checks["decision_log_no_nans"] = bool(decision_log[["predicted_risk", "dominant_signal"]].notna().all().all())
    checks["decision_log_risk_in_bounds"] = bool(
        decision_log["predicted_risk"].between(0, 1).all()
    )

    checks["placement_log_rows"] = len(placement_log)
    checks["placement_log_context_matched"] = bool(placement_log["dominant_signal"].notna().all())
    checks["placement_log_rewards_in_bounds"] = bool(placement_log["reward"].between(0, 1).all())

    checks["trajectory_rows"] = len(trajectory)
    checks["trajectory_covers_full_trace"] = bool(len(trajectory) == 360)
    checks["trajectory_no_nans"] = bool(trajectory[["threshold", "width"]].notna().all().all())
    with open(PROJECT_DIR / "configs" / "module3_default.json") as f:
        bounds = json.load(f)["threshold_bounds"]
    checks["trajectory_threshold_bounded"] = bool(trajectory["threshold"].between(bounds[0], bounds[1]).all())

    # Cross-log consistency: module3's trajectory ran on module1's own
    # predicted_risk values - they should match exactly (same source data,
    # no divergence introduced by re-deriving anything).
    merged = decision_log[["time_bucket", "predicted_risk"]].merge(
        trajectory[["time_bucket", "predicted_risk"]], on="time_bucket", suffixes=("_m1", "_m3")
    )
    checks["m1_m3_predicted_risk_consistent"] = bool(
        np.allclose(merged["predicted_risk_m1"], merged["predicted_risk_m3"], atol=1e-9)
    )

    # alert flag should exactly equal (predicted_risk > threshold) - a direct
    # sanity check on module3's own internal logic, re-derived independently here
    recomputed_alert = trajectory["predicted_risk"] > trajectory["threshold"]
    checks["trajectory_alert_flag_consistent"] = bool((recomputed_alert == trajectory["alert"]).all())

    checks["all_checks_passed"] = all(
        v for k, v in checks.items() if isinstance(v, bool)
    )
    return checks


def main() -> None:
    run_export_scripts()
    decision_log, placement_log, trajectory = load_logs()

    print("\n=== Coherence checks ===")
    checks = check_coherence(decision_log, placement_log, trajectory)
    print(json.dumps(checks, indent=2))

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "tag": TAG,
        "decision_log_path": str(DATA_DIR / f"module1_full_trace_{TAG}.parquet"),
        "placement_log_path": str(DATA_DIR / "module2_decision_log_primary.parquet"),
        "parameter_trajectory_path": str(DATA_DIR / f"module3_trajectory_{TAG}.parquet"),
        "coherence_checks": checks,
        "summary_stats": {
            "n_buckets": len(decision_log),
            "n_placement_rounds": len(placement_log),
            "n_alerts": int(trajectory["alert"].sum()),
            "mean_predicted_risk": float(decision_log["predicted_risk"].mean()),
            "mean_placement_reward": float(placement_log["reward"].mean()),
            "final_threshold": float(trajectory["threshold"].iloc[-1]),
        },
    }
    with open(RESULTS_DIR / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\nSaved summary to {RESULTS_DIR / 'metrics.json'}")

    if not checks["all_checks_passed"]:
        failed = [k for k, v in checks.items() if isinstance(v, bool) and not v]
        raise RuntimeError(f"Coherence checks failed: {failed}")

    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, ax1 = plt.subplots(figsize=(12, 5))
        ax1.plot(decision_log["time_bucket"], decision_log["predicted_risk"], color="tab:orange",
                  alpha=0.7, label="M1 predicted_risk")
        ax1.plot(trajectory["time_bucket"], trajectory["threshold"], color="tab:blue", label="M3 threshold")
        ax1.fill_between(trajectory["time_bucket"], 0, 1, where=trajectory["alert"],
                          color="red", alpha=0.05, label="M3 alert state")

        placement_buckets = placement_log["timestamp"] // (120 * 1000)
        ax1.scatter(placement_buckets, placement_log["reward"], color="green", marker="^",
                    s=40, label="M2 placement (y=reward)", zorder=5)

        ax1.set_xlabel("time_bucket")
        ax1.set_ylabel("risk / threshold / reward")
        ax1.set_title("Phase 4: simulated closed loop (M1 predictions -> M2 placements + M3 control)")
        ax1.legend(loc="upper right", fontsize=8)
        fig.tight_layout()
        fig.savefig(RESULTS_DIR / "closed_loop_overview.png")
        plt.close(fig)
        print(f"Saved plot to {RESULTS_DIR / 'closed_loop_overview.png'}")
    except ImportError:
        pass

    print("\nPhase 4 simulated closed loop: all coherence checks passed.")


if __name__ == "__main__":
    main()
