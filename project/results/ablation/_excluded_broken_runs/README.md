# Excluded broken runs

`2026-07-28T10-14-26_baseline_firstpass/` is the very first ablation trial ever run, produced *before* a real k6 bug was found and fixed the same day: `ramping-arrival-rate` requires an integer `target`, but the replay-stage generator was producing floats, which crashed the k6 job on script-parse. At the time, the harness's success/failure check didn't distinguish the two, so this crash was silently recorded as a "successful" 33-second trial with zero real load data.

It is moved here, not deleted, as the artifact of that finding — see `docs/Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 6 section ("A real bug found and fixed while building the harness") for the full story.

**Not part of the analyzed dataset.** `project/phase7_analysis/statistical_analysis.py` only loads trials tagged `scaleup1_t*`/`scaleup2_t*` (the 25-trial, 5-per-arm dataset used for every Phase 7 result) — this folder was never included, both because of the `firstpass` tag and now because of its location. The corrected rerun, `2026-07-28T10-38-19_baseline_firstpass/`, remains in the parent directory alongside the other valid `firstpass`/`recalibrated`/`scaleup1`/`scaleup2` runs.
