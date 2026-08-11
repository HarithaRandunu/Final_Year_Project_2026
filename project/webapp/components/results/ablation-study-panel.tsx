import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArmBarChart } from "@/components/results/arm-bar-chart";
import { ResultFigure } from "@/components/results/result-figure";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState, InfoNote } from "@/components/empty-state";
import {
  ABLATION_METRIC_EXPLANATIONS,
  ABLATION_METRIC_LABELS,
  loadStatisticalAnalysis,
  loadTrialLevelData,
  resultImageUrl,
  type AblationMetricKey,
  type AblationStudy,
} from "@/lib/results";
import type { CsvRow } from "@/lib/data";
import { ARM_LABELS, ARM_ORDER, type Arm } from "@/lib/colors";

const METRIC_KEYS = Object.keys(ABLATION_METRIC_LABELS) as AblationMetricKey[];

function formatMetricValue(key: AblationMetricKey, v: number): string {
  if (key === "over_provisioning_timeshare" || key === "under_provisioning_timeshare") {
    return `${(v * 100).toFixed(1)}%`;
  }
  if (key === "p99_latency_ms" || key === "cost_proxy_pod_seconds") {
    return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return v.toFixed(2);
}

/**
 * Mean and sample standard deviation (n-1 denominator, matching pandas'
 * default .std() - what phase7_analysis/statistical_analysis.py itself
 * uses) per arm per metric, computed directly from the raw trial rows
 * since statistical_analysis.json's omnibus_tests only carries the mean.
 */
function computeArmStats(
  trials: CsvRow[],
  arms: Arm[],
): Record<Arm, Record<AblationMetricKey, { mean: number; std: number; n: number }>> {
  const result = {} as Record<Arm, Record<AblationMetricKey, { mean: number; std: number; n: number }>>;
  for (const arm of arms) {
    const armTrials = trials.filter((t) => String(t.arm) === arm);
    const metricStats = {} as Record<AblationMetricKey, { mean: number; std: number; n: number }>;
    for (const key of METRIC_KEYS) {
      const values = armTrials.map((t) => Number(t[key])).filter((v) => !Number.isNaN(v));
      const n = values.length;
      const mean = n > 0 ? values.reduce((a, b) => a + b, 0) / n : 0;
      const variance = n > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
      metricStats[key] = { mean, std: Math.sqrt(variance), n };
    }
    result[arm] = metricStats;
  }
  return result;
}

export function AblationStudyPanel({ study }: Readonly<{ study: AblationStudy }>) {
  const analysis = loadStatisticalAnalysis(study);
  const trials = loadTrialLevelData(study);

  if (!analysis) {
    return (
      <EmptyState
        reason={`statistical_analysis.json was not found for the ${study === "v1" ? "original" : "follow-up"} study.`}
      />
    );
  }

  const significantPairs = METRIC_KEYS.flatMap((key) =>
    (analysis.pairwise_comparisons[key] ?? [])
      .filter((p) => p["significant_bh_0.05"])
      .map((p) => ({ metric: key, ...p })),
  );

  const armStats = trials ? computeArmStats(trials, ARM_ORDER) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Study design</CardTitle>
          <CardDescription>
            {analysis.metadata.n_trials_total} live trials on a real 2-node Kubernetes
            cluster running TeaStore, {analysis.metadata.n_trials_per_arm.baseline} per arm
            across the {analysis.metadata.arms.length} arms below, replaying the{" "}
            {analysis.metadata.workload_type} workload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InfoNote>
            <strong className="text-foreground">Why so few significant results below:</strong>{" "}
            {analysis.metadata.power_caveat}
          </InfoNote>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-metric comparison across arms</CardTitle>
          <CardDescription>
            A Kruskal-Wallis test checks whether the five arms differ at all on each metric
            before looking pairwise. Bars show each arm&apos;s mean.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {METRIC_KEYS.map((key) => {
            const test = analysis.omnibus_tests[key];
            if (!test) return null;
            return (
              <div key={key} className="space-y-2 border-b pb-6 last:border-b-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {ABLATION_METRIC_LABELS[key]}
                  </h4>
                  <StatusBadge
                    status={test["significant_at_0.05"] ? "pass" : "neutral"}
                    label={
                      test["significant_at_0.05"]
                        ? `Significant (p = ${test.pvalue.toFixed(4)})`
                        : `Not significant (p = ${test.pvalue.toFixed(2)})`
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">{ABLATION_METRIC_EXPLANATIONS[key]}</p>
                <ArmBarChart
                  data={test.arm_means}
                  formatValue={(v) => formatMetricValue(key, v)}
                  highlightArm="full"
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mean +/- standard deviation, by arm</CardTitle>
          <CardDescription>
            Every metric, every arm, as one summary table - mean and sample standard
            deviation across the {analysis.metadata.n_trials_per_arm.baseline} trials each
            arm ran. Computed directly from the raw trial rows below, the same way{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">phase7_analysis/statistical_analysis.py</code>{" "}
            computes its own means.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {armStats ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Measure</TableHead>
                  {ARM_ORDER.map((arm) => (
                    <TableHead key={arm}>{ARM_LABELS[arm]}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {METRIC_KEYS.map((key) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-foreground">
                      {ABLATION_METRIC_LABELS[key]}
                    </TableCell>
                    {ARM_ORDER.map((arm) => {
                      const s = armStats[arm][key];
                      return (
                        <TableCell key={arm}>
                          {formatMetricValue(key, s.mean)} +/- {formatMetricValue(key, s.std)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState reason="trial_level_data.csv was not found for this study." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metric distributions by arm</CardTitle>
          <CardDescription>
            The same {analysis.metadata.n_trials_total} trials as a box plot per metric -
            every individual trial (dots) alongside each arm&apos;s median (box) and mean
            (triangle), so the spread behind the mean +/- standard deviation table above is
            visible directly, not just summarized into two numbers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResultFigure
            src={resultImageUrl("phase7/metric_distributions_by_arm.png", study)}
            alt="Box plots showing the distribution of each evaluation metric across the five ablation arms, five trials each"
            caption={`Distribution of each evaluation metric across the five configurations (${analysis.metadata.n_trials_per_arm.baseline} trials each).`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Does the full framework beat every single module alone?</CardTitle>
          <CardDescription>
            For each metric: the full framework&apos;s mean vs. the best result any one module
            achieved by itself. A framework built from three individually-validated parts
            doesn&apos;t automatically beat all three combined on every metric — this table
            reports it either way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Baseline mean</TableHead>
                <TableHead>Full mean</TableHead>
                <TableHead>Best single-module mean</TableHead>
                <TableHead>Full beats all three alone?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {METRIC_KEYS.map((key) => {
                const d = analysis.ablation_decomposition[key];
                if (!d) return null;
                const singleValues = Object.values(d.single_module_means);
                const bestSingle = Math.min(...singleValues);
                return (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-foreground">
                      {ABLATION_METRIC_LABELS[key]}
                    </TableCell>
                    <TableCell>{formatMetricValue(key, d.baseline_mean)}</TableCell>
                    <TableCell>{formatMetricValue(key, d.full_mean)}</TableCell>
                    <TableCell>{formatMetricValue(key, bestSingle)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={d.full_beats_all_single_modules ? "pass" : "disclosed"}
                        label={d.full_beats_all_single_modules ? "Yes" : "No"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Statistically significant pairwise differences</CardTitle>
          <CardDescription>
            Every arm-vs-arm comparison that survived Benjamini-Hochberg correction at p &lt;
            0.05, across all {METRIC_KEYS.length} metrics — the comparisons the power caveat
            above says to trust most.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {significantPairs.length === 0 ? (
            <EmptyState reason="No pairwise comparison survived correction in this study." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Arm A</TableHead>
                  <TableHead>Arm B</TableHead>
                  <TableHead>Mean A</TableHead>
                  <TableHead>Mean B</TableHead>
                  <TableHead>Adjusted p-value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {significantPairs.map((p, i) => (
                  <TableRow key={`${p.metric}-${p.arm_a}-${p.arm_b}-${i}`}>
                    <TableCell>{ABLATION_METRIC_LABELS[p.metric]}</TableCell>
                    <TableCell>{ARM_LABELS[p.arm_a]}</TableCell>
                    <TableCell>{ARM_LABELS[p.arm_b]}</TableCell>
                    <TableCell>{formatMetricValue(p.metric, p.mean_a)}</TableCell>
                    <TableCell>{formatMetricValue(p.metric, p.mean_b)}</TableCell>
                    <TableCell>{p.pvalue_bh_adjusted.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Raw trial-level data</CardTitle>
          <CardDescription>Every one of the {analysis.metadata.n_trials_total} trials, unaggregated.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {trials && trials.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run tag</TableHead>
                  <TableHead>Arm</TableHead>
                  <TableHead>SLA violations</TableHead>
                  <TableHead>P99 latency (ms)</TableHead>
                  <TableHead>Cost proxy</TableHead>
                  <TableHead>Reversals</TableHead>
                  <TableHead>Deviation std.</TableHead>
                  <TableHead>Over-prov.</TableHead>
                  <TableHead>Under-prov.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trials.map((row) => {
                  const armKey = String(row.arm) as keyof typeof ARM_LABELS;
                  return (
                  <TableRow key={String(row.run_id)}>
                    <TableCell className="font-mono text-xs">{row.run_tag}</TableCell>
                    <TableCell>{ARM_LABELS[armKey] ?? String(row.arm)}</TableCell>
                    <TableCell>{row.sla_violation_count}</TableCell>
                    <TableCell>{Number(row.p99_latency_ms).toFixed(1)}</TableCell>
                    <TableCell>{row.cost_proxy_pod_seconds}</TableCell>
                    <TableCell>{row.instability_reversals}</TableCell>
                    <TableCell>{Number(row.deviation_std).toFixed(3)}</TableCell>
                    <TableCell>{(Number(row.over_provisioning_timeshare) * 100).toFixed(1)}%</TableCell>
                    <TableCell>{(Number(row.under_provisioning_timeshare) * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState reason="trial_level_data.csv was not found for this study." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
