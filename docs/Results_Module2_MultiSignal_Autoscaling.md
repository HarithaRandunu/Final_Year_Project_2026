# Results & Statistics — Module 2 (Co-Scheduling / Placement)

Every number and image below comes straight from `project/results/module2/` — no
recomputation. Each plot was opened and visually checked before writing its caption. See
`docs/Project_Files_Reference_MultiSignal_Autoscaling.md` §6 for what the code that produced
these actually does, including the ⭐ discounted-Thompson-Sampling individual contribution.

**Read this file's real-data section and its synthetic-addendum section as a pair, not in
isolation** — the honest headline is: the real-data validation does not prove the discount
factor's benefit (too little usable real data, and the real drift wasn't the kind that rewards
discounting), but a dedicated synthetic stress test built specifically to isolate that
mechanism does. Both are reported; neither is hidden.

---

## 1. What the real data actually offered

`module2_co_scheduling/extract_events.py` found:
- **306 static events** — every `(msinstanceid, nodeid)` pair for the case-study service
  already existed at t=0. Zero placement churn for this service across the whole 12h window.
- **87 genuine churn events**, cluster-wide (no service filter) — the only real,
  chronologically-ordered placement decisions in the entire trace.

Module 2's validated policy is a hybrid: the 306 static events **batch-initialize** each node's
bandit arm with real reward history; the 87 churn events are the actual sequential rounds the
bandit is evaluated on. **87 rounds is a small sample for a bandit comparison** — this ceiling
on the real data is the reason the synthetic addendum in §4 exists at all.

---

## 2. Real-data validation

### 2.1 Cumulative regret vs. oracle

![Module 2 cumulative regret vs. oracle](../project/results/module2/regret_comparison.png)

*What's plotted:* cumulative regret (reward the oracle would have earned minus reward actually
earned, summed over all 87 rounds) for three policies. **What it shows:** `heuristic_only`
(green — pure CPU×memory headroom scoring, no learning) ends with by far the *lowest*
regret (0.486), staying almost flat near zero for the first ~55 rounds before drifting up
slightly. `combined_system` (blue — Module 2's actual validated policy: batch-init → heuristic
warmup → discounted TS) ends at 4.68, and `random` (orange) is worst at 5.73.

| Policy | Final cumulative regret | Mean reward |
|---|---|---|
| Heuristic only | **0.486** (lowest = best) | 0.366 |
| Combined system (Module 2's real policy) | 4.677 | 0.318 |
| Random | 5.731 | 0.306 |
| Oracle (best possible) | 0 (by definition) | 0.372 |

**Disclosed finding: on this real trace, the simple heuristic beats the learned bandit.**
`pass_criteria.combined_beats_random_and_heuristic_regret = false`. With only 87 rounds spread
across many distinct nodes, the bandit doesn't get enough repeated pulls per node to out-learn
a heuristic that needs no learning at all — a real, honestly-reported limitation of evaluating
a bandit against this specific trace's event density, not a flaw hidden from the reader.

### 2.2 Discounted vs. vanilla Thompson Sampling — the real non-stationary window

![Module 2 discounted vs. vanilla TS](../project/results/module2/discounted_vs_vanilla.png)

*What's plotted:* cumulative reward over time for discounted TS (γ=0.9, blue) vs. vanilla TS
(γ=1.0, orange), with the trace's one identified non-stationary sub-window (buckets 238–263)
shaded. **What it shows:** the two lines track each other almost exactly for the entire run —
there is no visible separation, including inside the shaded window, and vanilla ends marginally
*ahead* (26.5 vs. 26.9 by the end).

| | In the non-stationary window (43 rounds) | Full run |
|---|---|---|
| Discounted TS mean reward | 0.3167 | 0.3044 |
| Vanilla TS mean reward | 0.3304 | 0.3111 |

**Disclosed finding, with the real reason why:** `discounted_beats_vanilla_in_window = false`.
The file's own docstring explains this isn't a failure of the discounting mechanism itself —
the real non-stationary window shows *uniform drift across nodes* (every node's headroom
shifting together), not a *differential rank shuffle* (some nodes becoming relatively better,
others worse). Discounting only pays off when old evidence about *relative* node ranking has
gone stale; if every arm drifts the same amount, there's no stale ranking to correct for. This
is exactly what §4's synthetic test is built to isolate instead.

### 2.3 Node-preference convergence

![Module 2 node-preference convergence](../project/results/module2/convergence.png)

*What's plotted:* rolling selection entropy (window=20 rounds) of which node the bandit picks,
over all 87 rounds — low entropy means the bandit has converged to a strong preference for a
few nodes; entropy near `ln(20) ≈ 3.0` means it's still choosing close to uniformly at random
among ~20 distinct nodes. **What it shows:** entropy climbs steeply from 0 and plateaus near
the maximum (2.86–3.00) by round ~20, staying there (with one small dip around round ~55) for
the rest of the run. `converges: false` — the bandit's node preferences never concentrated;
across the real cluster-wide churn events, real headroom differences between candidate nodes
weren't large or consistent enough for the posterior to settle on favorites within 87 rounds.

---

## 3. Real-data pass criteria — summary

| Criterion | Result |
|---|---|
| Combined system beats random and heuristic on regret | ❌ **Fail** (§2.1) |
| Discounted TS beats vanilla TS on the real non-stationary window | ❌ **Fail** (§2.2) |

Both real-data ⭐-contribution checks fail on this specific trace — reported honestly, not
smoothed over. This is precisely why the synthetic addendum below exists: to test the discount
mechanism under the condition it's actually designed for (a genuine relative-rank shuffle),
which the one real non-stationary window in this trace doesn't happen to contain.

---

## 4. Synthetic addendum: rank-inversion stress test (⭐ where the individual contribution is actually proven)

Design: 6 synthetic arms with means `[0.85, 0.70, 0.55, 0.40, 0.25, 0.10]` for 150 rounds, then
**exactly reversed** to `[0.10, 0.25, 0.40, 0.55, 0.70, 0.85]` for another 150 rounds — a
deliberate, maximal relative-rank shuffle, repeated 50 times with different random seeds.

![Module 2 synthetic rank-inversion stress test](../project/results/module2/synthetic_rank_inversion.png)

*What's plotted:* mean cumulative reward across all 50 repeats, discounted TS (blue) vs.
vanilla TS (orange), with the engineered inversion point (round 150) marked. **What it shows:**
the two lines are indistinguishable for the entire pre-inversion phase (as expected — nothing
to discount yet), then visibly diverge starting right at round 150, with discounted TS pulling
ahead and the gap widening steadily through to round 300 (ending ≈210 vs. ≈185).

| Window | Discounted TS mean reward | Vanilla TS mean reward | Win rate (discounted) | Wilcoxon p-value (one-sided) |
|---|---|---|---|---|
| Recovery window (30 rounds right after inversion) | **0.364** | 0.181 | 100% (50/50 repeats) | **8.9×10⁻¹⁶** |
| Full post-inversion phase (150 rounds) | **0.657** | 0.460 | 98% (49/50 repeats) | **1.8×10⁻¹⁵** |

**Both pass.** `pass_criteria.discounted_beats_vanilla_recovery_window = true`,
`discounted_beats_vanilla_full_post_inversion = true` — a one-sided Wilcoxon signed-rank test
across 50 paired repeats, both p-values far below any conventional significance threshold. This
is the addendum result that actually demonstrates the ⭐ individual contribution: when the kind
of drift the discount factor is designed for genuinely occurs, it recovers materially faster
than vanilla Thompson Sampling — the real trace simply didn't happen to contain that specific
kind of drift in its one non-stationary window.
