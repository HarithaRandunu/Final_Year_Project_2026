"""
Runs all five arms back-to-back in the order that minimizes kube-scheduler
swaps: [baseline, m1_only, m3_only] all use the default scheduler, then
[m2_only, full] both need the extender - so this order costs exactly one
swap (default -> extender), not the 3 the first-pass run's ad-hoc order
(baseline, m1_only, m2_only, m3_only, full) actually cost. See
docs/Phase6_Ablation_Design.md Section 3's "arm switching procedure" and
Progress_Trace.md's Phase 6 section for why this matters.

Checks free memory before every trial and stops the whole sequence (not
just the current trial) if it's already below --min-free-gb before a
trial even starts - run_trial.py's own in-trial check handles drops
during a trial, this handles starting a new one on an already-degraded
host.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_trial import free_gb, run_trial  # noqa: E402

ARM_ORDER = ["baseline", "m1_only", "m3_only", "m2_only", "full"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-tag", default="trial1")
    parser.add_argument("--n-trials", type=int, default=1, help="Trials per arm this invocation")
    parser.add_argument("--min-rps", type=float, default=8.0)
    parser.add_argument("--max-rps", type=float, default=24.0)
    parser.add_argument("--duration", type=int, default=900)
    parser.add_argument("--min-free-gb", type=float, default=2.0)
    parser.add_argument("--start-min-free-gb", type=float, default=3.0, help="Floor to even start the next trial")
    parser.add_argument("--poll-seconds", type=int, default=30)
    args = parser.parse_args()

    results = []
    for arm in ARM_ORDER:
        for trial_n in range(1, args.n_trials + 1):
            mem = free_gb()
            if mem < args.start_min_free_gb:
                print(f"STOPPING SEQUENCE: {mem:.1f}GB free < {args.start_min_free_gb}GB floor before {arm} trial {trial_n}")
                print(f"Completed {len(results)}/{len(ARM_ORDER) * args.n_trials} trials before stopping.")
                return
            run_tag = f"{args.run_tag}_t{trial_n}" if args.n_trials > 1 else args.run_tag
            print(f"\n{'='*70}\nStarting {arm} trial {trial_n}/{args.n_trials} ({mem:.1f}GB free)\n{'='*70}")
            metrics = run_trial(arm, run_tag, args.min_rps, args.max_rps, args.duration, args.min_free_gb, args.poll_seconds)
            results.append((arm, trial_n, metrics["aborted"], metrics["run_id"]))
            if metrics["aborted"]:
                print(f"Trial aborted: {metrics['abort_reason']}")

    print(f"\n{'='*70}\nSequence complete: {len(results)} trials\n{'='*70}")
    for arm, trial_n, aborted, run_id in results:
        print(f"  {arm} #{trial_n}: {'ABORTED' if aborted else 'ok'} - {run_id}")


if __name__ == "__main__":
    main()
