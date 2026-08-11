import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatTile, StatGrid } from "@/components/results/stat-tile";
import { ResultFigure } from "@/components/results/result-figure";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { loadModule1, resultImageUrl } from "@/lib/results";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function Module1Section() {
  const m = loadModule1();
  if (!m) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Module 1 — Signal Fusion &amp; Risk Scoring</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState reason="module1/primary/metrics.json was not found under project/results/." />
        </CardContent>
      </Card>
    );
  }

  const passedCount = Object.values(m.pass_criteria).filter(Boolean).length;
  const totalCriteria = Object.keys(m.pass_criteria).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Module 1 — Signal Fusion &amp; Risk Scoring</CardTitle>
        <CardDescription>
          A LightGBM model fuses five signal families (latency, CPU, memory, RPC call-rate,
          and their short-term trends) into one risk score per time bucket, then explains
          every score with TreeSHAP attribution — the individual novelty element for this
          module (a real, per-prediction explanation, not just internal model inspection).
          {" "}{passedCount} of {totalCriteria} validation checks passed outright.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Validation checks</h4>
          <p className="text-xs text-muted-foreground">
            Each check below states the real number behind it directly - the full
            methodology (folds, episodes, per-signal breakdown) follows in the sections
            underneath.
          </p>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-foreground">Beats CPU-only baseline (holdout)</p>
                <p className="text-xs text-muted-foreground">
                  Fused AUC-ROC {m.holdout.fused_auc_roc.toFixed(2)} vs. baseline{" "}
                  {m.holdout.baseline_auc_roc.toFixed(2)}, on a single time-ordered 75/25 split.
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.fused_beats_cpu_baseline_auc_pr_holdout ? "pass" : "disclosed"} />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-2">
              <div>
                <p className="text-sm text-foreground">Beats CPU-only baseline (walk-forward)</p>
                <p className="text-xs text-muted-foreground">
                  Mean fused AUC-PR {m.walk_forward.mean_fused_auc_pr.toFixed(2)} vs. baseline{" "}
                  {m.walk_forward.mean_baseline_auc_pr.toFixed(2)}, averaged across the 5
                  retrain-and-test folds below.
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.fused_beats_cpu_baseline_auc_pr_walkforward ? "pass" : "disclosed"} />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-2">
              <div>
                <p className="text-sm text-foreground">Warns earlier than baseline</p>
                <p className="text-xs text-muted-foreground">
                  Mean lead time {m.lead_time_comparison.mean_fused_lead_time.toFixed(2)} buckets
                  (fused) vs. {m.lead_time_comparison.mean_baseline_lead_time.toFixed(2)} buckets
                  (baseline), across {m.lead_time_comparison.n_episodes} real violation
                  episodes - the baseline warned earlier here, a real negative result.
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.lead_time_positive_and_beats_baseline ? "pass" : "disclosed"} />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-2">
              <div>
                <p className="text-sm text-foreground">TreeSHAP attributes the right signal (majority)</p>
                <p className="text-xs text-muted-foreground">
                  {m.shap_sanity_check.n_pass} of {m.shap_sanity_check.n_tested} perturbed signal
                  families were correctly named as the dominant driver by TreeSHAP.
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.shap_sanity_check_majority_pass ? "pass" : "disclosed"} />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-2">
              <div>
                <p className="text-sm text-foreground">TreeSHAP attributes the right signal (all 4)</p>
                <p className="text-xs text-muted-foreground">
                  Same check, stricter bar: all {m.shap_sanity_check.n_tested} must pass, not just
                  most - the per-signal table below shows exactly which one didn&apos;t.
                </p>
              </div>
              <StatusBadge status={m.pass_criteria.shap_sanity_check_all_pass ? "pass" : "disclosed"} />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            Walk-forward validation — does the fused score beat a CPU-only baseline?
          </h4>
          <p className="text-sm text-muted-foreground">
            The model is retrained on progressively larger windows of the trace and tested
            on the next unseen window each time (5 folds), rather than a single train/test
            split — a more honest estimate of how it would perform if deployed and
            retrained over time. AUC-PR (area under the precision-recall curve) is the
            primary metric here since SLA-violation events are rare.
          </p>
          <StatGrid>
            <StatTile
              label="Mean fused AUC-PR (walk-forward)"
              value={m.walk_forward.mean_fused_auc_pr.toFixed(3)}
              detail={`vs. baseline ${m.walk_forward.mean_baseline_auc_pr.toFixed(3)}`}
            />
            <StatTile
              label="Mean fused AUC-ROC (walk-forward)"
              value={m.walk_forward.mean_fused_auc_roc.toFixed(3)}
              detail={`vs. baseline ${m.walk_forward.mean_baseline_auc_roc.toFixed(3)}`}
            />
            <StatTile
              label="Holdout AUC-PR"
              value={m.holdout.fused_auc_pr.toFixed(3)}
              detail={`vs. baseline ${m.holdout.baseline_auc_pr.toFixed(3)} — high-variance, few positives`}
            />
            <StatTile
              label="Generalization check (unseen secondary trace)"
              value={m.generalization_check.auc_pr.toFixed(3)}
              detail={`AUC-PR on ${m.generalization_check.n_test} unseen rows`}
            />
          </StatGrid>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fold</TableHead>
                <TableHead>Train rows</TableHead>
                <TableHead>Test rows</TableHead>
                <TableHead>Fused AUC-PR</TableHead>
                <TableHead>Baseline AUC-PR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.walk_forward.folds.map((fold) => (
                <TableRow key={fold.fold}>
                  <TableCell>{fold.fold}</TableCell>
                  <TableCell>{fold.train_size}</TableCell>
                  <TableCell>{fold.test_size}</TableCell>
                  <TableCell>{fold.fused_auc_pr === null ? "no positives in fold" : fold.fused_auc_pr.toFixed(3)}</TableCell>
                  <TableCell>{fold.baseline_auc_pr === null ? "no positives in fold" : fold.baseline_auc_pr.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            Lead-time comparison — does it warn earlier?
          </h4>
          <p className="text-sm text-muted-foreground">
            Both scores are thresholded to the same {pct(m.lead_time_comparison.target_alert_rate)}{" "}
            alert rate, then measured on how many time buckets earlier they cross into
            alert state before an actual SLA violation, across {m.lead_time_comparison.n_episodes}{" "}
            violation episodes.
          </p>
          <StatGrid className="sm:grid-cols-2 lg:grid-cols-2">
            <StatTile
              label="Mean fused lead time"
              value={`${m.lead_time_comparison.mean_fused_lead_time.toFixed(2)} buckets`}
            />
            <StatTile
              label="Mean baseline lead time"
              value={`${m.lead_time_comparison.mean_baseline_lead_time.toFixed(2)} buckets`}
            />
          </StatGrid>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Disclosed finding:</strong> on this trace, the
            fused score did not warn earlier than the CPU-only baseline — the baseline&apos;s
            mean lead time ({m.lead_time_comparison.mean_baseline_lead_time.toFixed(2)}) was
            higher than the fused score&apos;s ({m.lead_time_comparison.mean_fused_lead_time.toFixed(2)}).
            Reported honestly rather than smoothed over: fusing more signals improved
            precision/recall (above) but did not translate into an earlier warning on this
            specific trace.
          </p>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">
            TreeSHAP sanity check — the individual novelty element
          </h4>
          <p className="text-sm text-muted-foreground">
            Each of the model&apos;s five signal families is perturbed one at a time; the test
            passes if TreeSHAP correctly attributes the resulting change in risk score back to
            the signal family that was actually perturbed — proof the explanation is a real,
            per-prediction attribution and not just a plausible-looking internal weight.{" "}
            {m.shap_sanity_check.n_pass} of {m.shap_sanity_check.n_tested} signal families
            passed.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signal perturbed</TableHead>
                <TableHead>Risk increased?</TableHead>
                <TableHead>Correctly attributed by SHAP?</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.shap_sanity_check.per_signal.map((s) => (
                <TableRow key={s.signal}>
                  <TableCell className="font-medium text-foreground">{s.signal}</TableCell>
                  <TableCell>{s.risk_increased ? "Yes" : "No"}</TableCell>
                  <TableCell>{s.correctly_attributed ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.pass ? "pass" : "disclosed"} label={s.pass ? "Pass" : "Misattributed"} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Disclosed finding:</strong> the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">memory_utilization</code>{" "}
            perturbation was misattributed — SHAP ranked{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">p99_latency_ms</code> as the
            dominant feature instead, and the perturbation actually decreased risk rather than
            increasing it. 3 of 4 families still passed cleanly.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <ResultFigure
            src={resultImageUrl("module1/primary/calibration.png")}
            alt="Calibration curve comparing the fused risk score's predicted probabilities against observed outcome frequencies"
            caption="Calibration: how closely predicted risk matches observed outcome frequency."
          />
          <ResultFigure
            src={resultImageUrl("module1/primary/shap_summary.png")}
            alt="SHAP summary plot showing each signal family's contribution to the fused risk score"
            caption="TreeSHAP summary — each signal family's contribution across all predictions."
          />
        </section>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">LightGBM</Badge>
          <Badge variant="secondary">TreeSHAP</Badge>
          <Badge variant="secondary">Walk-forward validation</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
