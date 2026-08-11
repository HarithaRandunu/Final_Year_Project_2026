import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile, StatGrid } from "@/components/results/stat-tile";
import { ResultFigure } from "@/components/results/result-figure";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { loadModule2, loadModule2RankInversion, resultImageUrl } from "@/lib/results";

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const sci = (v: number) => v.toExponential(2);

export function Module2Section() {
  const m = loadModule2();
  const r = loadModule2RankInversion();
  if (!m) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module 2 — Co-Scheduling &amp; Placement</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState reason="module2/metrics.json was not found under project/results/." />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module 2 — Co-Scheduling &amp; Placement</CardTitle>
        <CardDescription>
          A Thompson Sampling bandit picks which node a new replica should land on, learning
          from the reward each placement produced. The individual novelty element is a{" "}
          <em>discount factor</em> on the posterior update (gamma = {r?.gamma_discounted ?? 0.9}{" "}
          vs. vanilla&apos;s gamma = {r?.gamma_vanilla ?? 1.0}) — old evidence is deliberately
          forgotten faster, so the bandit adapts when which node is &quot;best&quot; changes
          over time, instead of clinging to outdated confidence.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            Real-trace validation — {m.n_usable_events} usable co-scheduling events
          </h4>
          <p className="text-sm text-muted-foreground">
            Out of {m.n_static_batch_init_events} batch-initialization events in the trace,
            only {m.n_usable_events} involved a genuine placement choice among multiple
            candidate nodes — the rest had just one option. That is a small sample to detect
            a statistically clean win in, which is exactly what the two checks below found.
          </p>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Combined system beats random &amp; heuristic-only (regret)</p>
                <p className="text-xs text-muted-foreground">
                  Final cumulative regret: combined {m.regret_validation.final_cumulative_regret.combined_system.toFixed(2)},
                  random {m.regret_validation.final_cumulative_regret.random.toFixed(2)},
                  heuristic-only {m.regret_validation.final_cumulative_regret.heuristic_only.toFixed(2)} -
                  the combined system beats random but not the heuristic (lower is better).
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.combined_beats_random_and_heuristic_regret ? "pass" : "disclosed"} />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-2">
              <div>
                <p className="text-sm text-foreground">Discounted beats vanilla in the real shift window</p>
                <p className="text-xs text-muted-foreground">
                  Mean reward in the {m.discounted_vs_vanilla_ablation.n_rounds_in_window}-round
                  real regime-shift window: discounted{" "}
                  {m.discounted_vs_vanilla_ablation.discounted_mean_reward_in_window.toFixed(3)} vs.
                  vanilla {m.discounted_vs_vanilla_ablation.vanilla_mean_reward_in_window.toFixed(3)} -
                  vanilla edged it out here (see the disclosed finding below for why).
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.discounted_beats_vanilla_on_shift_window ? "pass" : "disclosed"} />
            </div>
          </div>
          <StatGrid>
            <StatTile
              label="Final cumulative regret — combined system"
              value={m.regret_validation.final_cumulative_regret.combined_system.toFixed(2)}
              detail={`vs. random ${m.regret_validation.final_cumulative_regret.random.toFixed(2)}, heuristic-only ${m.regret_validation.final_cumulative_regret.heuristic_only.toFixed(2)}`}
            />
            <StatTile
              label="Mean reward — combined system"
              value={m.regret_validation.mean_reward.combined_system.toFixed(3)}
              detail={`oracle ceiling ${m.regret_validation.mean_reward.oracle.toFixed(3)}`}
            />
            <StatTile
              label="Discounted mean reward (shift window)"
              value={m.discounted_vs_vanilla_ablation.discounted_mean_reward_in_window.toFixed(3)}
              detail={`vanilla ${m.discounted_vs_vanilla_ablation.vanilla_mean_reward_in_window.toFixed(3)}, n=${m.discounted_vs_vanilla_ablation.n_rounds_in_window} rounds`}
            />
            <StatTile
              label="Bandit convergence"
              value={m.convergence_check.converges ? "Converged" : "Still exploring"}
              detail={`entropy ${m.convergence_check.final_rolling_entropy.toFixed(2)} of max ${m.convergence_check.max_possible_entropy.toFixed(2)}`}
            />
          </StatGrid>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Disclosed finding:</strong> on this real trace,
            the heuristic-only baseline actually had the lowest cumulative regret, and the
            discounted bandit did not clearly beat vanilla Thompson Sampling within the one
            real regime-shift window available (87 events total is too small a sample for
            either comparison to be conclusive). The convergence check also shows the bandit
            still exploring (entropy stayed near its maximum) rather than settling — expected
            with this few rounds. This is why the synthetic stress test below exists: it
            creates the exact scenario — a clean regime shift with enough repeats — that a
            single short real trace can&apos;t supply enough evidence for.
          </p>
        </section>

        {r ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">
              Synthetic regime-shift stress test — the individual novelty validation
            </h4>
            <p className="text-sm text-muted-foreground">
              {r.n_arms} candidate nodes, each with a fixed reward mean, that flip ranking
              exactly once partway through ({r.rounds_per_phase} rounds before the flip,{" "}
              {r.rounds_per_phase} after), repeated {r.n_repeats} independent times. This
              directly tests the claim the discount factor makes: after the flip, does the
              discounted bandit re-learn which node is now best faster than a vanilla one?
            </p>
            <StatGrid>
              <StatTile
                label="Win rate in recovery window"
                value={pct(r.recovery_window.win_rate_discounted)}
                detail={`discounted beat vanilla in ${Math.round(r.recovery_window.win_rate_discounted * r.n_repeats)} of ${r.n_repeats} repeats`}
              />
              <StatTile
                label="Win rate, full post-flip phase"
                value={pct(r.post_inversion_full_phase.win_rate_discounted)}
              />
              <StatTile
                label="Mean reward gain (recovery window)"
                value={`+${r.recovery_window.mean_diff.toFixed(3)}`}
                detail={`discounted ${r.recovery_window.discounted_mean.toFixed(3)} vs. vanilla ${r.recovery_window.vanilla_mean.toFixed(3)}`}
              />
              <StatTile
                label="Wilcoxon signed-rank p-value"
                value={sci(r.recovery_window.wilcoxon_pvalue_one_sided_greater)}
                detail="one-sided: discounted greater than vanilla"
              />
            </StatGrid>
            <p className="text-sm text-muted-foreground">
              Both pass criteria hold cleanly here: discounted Thompson Sampling beat vanilla
              in {pct(r.recovery_window.win_rate_discounted)} of the 50 repeats immediately
              after the rank flip, and the gap is statistically significant
              (p is about {sci(r.recovery_window.wilcoxon_pvalue_one_sided_greater)}, far below any
              conventional threshold) — this is the controlled evidence for the discount
              factor that the small real trace above couldn&apos;t provide on its own.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <ResultFigure
            src={resultImageUrl("module2/convergence.png")}
            alt="Bandit posterior entropy over time, showing exploration versus convergence"
            caption="Posterior entropy over time — how quickly the bandit narrows its choices."
          />
          <ResultFigure
            src={resultImageUrl("module2/discounted_vs_vanilla.png")}
            alt="Discounted versus vanilla Thompson Sampling reward comparison around the regime shift"
            caption="Discounted vs. vanilla reward around the real trace's regime-shift window."
          />
          <ResultFigure
            src={resultImageUrl("module2/regret_comparison.png")}
            alt="Cumulative regret comparison between the combined system, random, and heuristic-only baselines"
            caption="Cumulative regret — combined system vs. random vs. heuristic-only."
          />
          <ResultFigure
            src={resultImageUrl("module2/synthetic_rank_inversion.png")}
            alt="Synthetic regime-shift stress test showing discounted Thompson Sampling recovering faster than vanilla"
            caption="Synthetic stress test — reward recovery speed after the node-ranking flip."
          />
        </section>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Thompson Sampling</Badge>
          <Badge variant="secondary">Discounted posterior updates</Badge>
          <Badge variant="secondary">Wilcoxon signed-rank test</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
