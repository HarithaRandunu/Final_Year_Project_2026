import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile, StatGrid } from "@/components/results/stat-tile";
import { ResultFigure } from "@/components/results/result-figure";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { loadModule3, loadModule3MultiBurst, resultImageUrl } from "@/lib/results";

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
const sci = (v: number) => v.toExponential(2);

export function Module3Section() {
  const m = loadModule3();
  const b = loadModule3MultiBurst();
  if (!m) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module 3 — Adaptive Control</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState reason="module3/metrics.json was not found under project/results/." />
        </CardContent>
      </Card>
    );
  }

  const arms = [
    { key: "fixed" as const, label: "Fixed threshold (no PI, no conformal)" },
    { key: "pi_conformal" as const, label: "PI + conformal (published BACC mechanism)" },
    { key: "full" as const, label: "Full — + oscillation-conditioned widening" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module 3 — Adaptive Control</CardTitle>
        <CardDescription>
          A PI controller adjusts the scale-up/down threshold, wrapped in a conformal
          prediction interval so it reacts to genuine risk rather than noise. The individual
          novelty element widens that interval further whenever the controller has recently
          been oscillating (reversing direction) — the published PI+conformal mechanism on
          its own has no such guard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Core control checks</h4>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={m.pass_criteria.pi_responds_and_bounded ? "pass" : "disclosed"} label="PI responds to step change, stays bounded" />
            <StatusBadge status={m.pass_criteria.coverage_close_to_target ? "pass" : "disclosed"} label="Conformal coverage close to target" />
            <StatusBadge status={m.pass_criteria.step_response_bounded ? "pass" : "disclosed"} label="Step response bounded" />
            <StatusBadge status={m.pass_criteria.widens_after_reversal_spike ? "pass" : "disclosed"} label="Widens after reversal spike" />
            <StatusBadge status={m.pass_criteria.full_beats_pi_conformal_instability ? "pass" : "disclosed"} label="Full beats PI+conformal (real trace)" />
          </div>
          <StatGrid>
            <StatTile
              label="Conformal coverage"
              value={pct(m.coverage_check.empirical_coverage)}
              detail={`target ${pct(m.coverage_check.target_coverage)}, n=${m.coverage_check.n_points}`}
            />
            <StatTile
              label="Step response settling time"
              value={`${m.step_response_test.settling_time_steps} steps`}
              detail={`overshoot ${m.step_response_test.overshoot.toFixed(2)}`}
            />
            <StatTile
              label="Holdout SLA violations"
              value={`${m.n_holdout_violations} / ${m.n_holdout_rows}`}
              detail="rows with a real SLA breach"
            />
            <StatTile
              label="Bursty-window violations"
              value={`${m.n_bursty_violations} / ${m.n_bursty_rows}`}
              detail="the harder, high-churn slice of the trace"
            />
          </StatGrid>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            Three-way comparison on the real held-out trace
          </h4>
          <p className="text-sm text-muted-foreground">
            Fixed-threshold, PI+conformal-only, and the full oscillation-aware controller run
            on the same trace. Lower is better for all four columns.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arm</TableHead>
                <TableHead>Instability reversals</TableHead>
                <TableHead>Deviation std. dev.</TableHead>
                <TableHead>Over-provisioning</TableHead>
                <TableHead>Under-provisioning</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {arms.map(({ key, label }) => (
                <TableRow key={key}>
                  <TableCell className="font-medium text-foreground">{label}</TableCell>
                  <TableCell>{m.three_way_comparison[key].instability_reversals}</TableCell>
                  <TableCell>{m.three_way_comparison[key].deviation_std.toFixed(3)}</TableCell>
                  <TableCell>{pct(m.three_way_comparison[key].over_provisioning_timeshare)}</TableCell>
                  <TableCell>{pct(m.three_way_comparison[key].under_provisioning_timeshare)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Disclosed finding:</strong> on this one real
            trace, the full controller and PI+conformal-only tied on instability reversals (4
            each) — the fixed-threshold arm had zero reversals only because it never reacts to
            anything. The full controller did produce a lower deviation std. dev. than
            PI+conformal-only ({m.deviation_dampening_effect.full_deviation_std.toFixed(3)} vs.{" "}
            {m.deviation_dampening_effect.pi_conformal_deviation_std.toFixed(3)}), a smaller,
            complementary sign of steadier control. One real trace is too small a sample to
            call the headline instability claim on — which is what the synthetic stress test
            below was built to settle.
          </p>
        </section>

        {b ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">
              Synthetic multi-burst stress test — the individual novelty validation
            </h4>
            <p className="text-sm text-muted-foreground">
              {b.n_bursts_per_repeat} synthetic load bursts per run, repeated {b.n_repeats}{" "}
              independent times (~{b.avg_rows_per_repeat.toFixed(0)} rows each) — enough
              repeats to tell a real, statistically significant difference apart from noise,
              which the single real trace above couldn&apos;t.
            </p>
            <StatGrid>
              <StatTile
                label="Mean reversals — PI+conformal only"
                value={b.reversal_count.pi_conformal_mean.toFixed(2)}
              />
              <StatTile
                label="Mean reversals — full (oscillation-aware)"
                value={b.reversal_count.full_mean.toFixed(2)}
                detail={`${pct(b.reversal_count.full_never_worse_rate)} of runs, full was never worse`}
              />
              <StatTile
                label="Full strictly lower rate"
                value={pct(b.reversal_count.full_strictly_lower_rate)}
                detail={`tie rate ${pct(b.reversal_count.tie_rate)}`}
              />
              <StatTile
                label="Wilcoxon signed-rank p-value"
                value={sci(b.reversal_count.wilcoxon_pvalue_one_sided_greater)}
                detail="one-sided: PI-only reversals greater than full"
              />
            </StatGrid>
            <p className="text-sm text-muted-foreground">
              Across {b.n_repeats} repeats, oscillation-conditioned widening cut mean
              instability reversals from {b.reversal_count.pi_conformal_mean.toFixed(2)} to{" "}
              {b.reversal_count.full_mean.toFixed(2)} — a statistically significant reduction
              (p is about {sci(b.reversal_count.wilcoxon_pvalue_one_sided_greater)}) — and was never
              worse than PI+conformal-only in {pct(b.reversal_count.full_never_worse_rate)} of
              runs.{" "}
              <strong className="text-foreground">Disclosed finding:</strong> the matching
              deviation-std.-dev. comparison did <em>not</em> reach significance
              (p is about {b.deviation_std.wilcoxon_pvalue_one_sided_greater.toFixed(2)}) — the
              novelty element&apos;s real, proven effect is fewer oscillation reversals, not a
              smaller deviation on this synthetic setup.
            </p>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <ResultFigure
            src={resultImageUrl("module3/step_response.png")}
            alt="Step response test showing the threshold's reaction to a sudden load change"
            caption="Step response — how the threshold reacts to a sudden load change."
          />
          <ResultFigure
            src={resultImageUrl("module3/three_way_comparison.png")}
            alt="Three-way comparison of fixed, PI+conformal, and full controller behavior"
            caption="Three-way comparison on the real held-out trace."
          />
          <ResultFigure
            src={resultImageUrl("module3/sensitivity_check.png")}
            alt="Sensitivity check showing interval width widening after a reversal spike"
            caption="Interval width widening in response to a reversal spike."
          />
          <ResultFigure
            src={resultImageUrl("module3/isolated_pi_test.png")}
            alt="Isolated PI controller test in isolation from the conformal interval"
            caption="The PI controller in isolation, before the conformal interval is added."
          />
        </section>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">PI control</Badge>
          <Badge variant="secondary">Conformal prediction</Badge>
          <Badge variant="secondary">Oscillation-conditioned widening</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
