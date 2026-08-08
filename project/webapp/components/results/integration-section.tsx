import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile, StatGrid } from "@/components/results/stat-tile";
import { ResultFigure } from "@/components/results/result-figure";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { loadIntegration, resultImageUrl } from "@/lib/results";

const CHECK_LABELS: Record<string, string> = {
  decision_log_covers_full_trace: "Module 1's decision log covers the full trace",
  decision_log_no_nans: "Module 1's decision log has no missing values",
  decision_log_risk_in_bounds: "Module 1's risk scores stay in [0, 1]",
  placement_log_context_matched: "Module 2's placements match the risk context that triggered them",
  placement_log_rewards_in_bounds: "Module 2's placement rewards stay in bounds",
  trajectory_covers_full_trace: "Module 3's threshold trajectory covers the full trace",
  trajectory_no_nans: "Module 3's threshold trajectory has no missing values",
  trajectory_threshold_bounded: "Module 3's threshold stays within its configured bounds",
  m1_m3_predicted_risk_consistent: "Module 1's risk score matches what Module 3 received",
  trajectory_alert_flag_consistent: "Module 3's alert flag agrees with the threshold crossing",
};

export function IntegrationSection() {
  const m = loadIntegration();
  if (!m) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Integration — Simulated Closed Loop</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState reason="integration/metrics.json was not found under project/results/." />
        </CardContent>
      </Card>
    );
  }

  const checks = Object.entries(CHECK_LABELS);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integration — Simulated Closed Loop</CardTitle>
        <CardDescription>
          Before ever touching a live cluster (Phases 5–6), all three modules were wired
          together and replayed over the full offline trace — Module 1&apos;s risk score
          feeding Module 3&apos;s threshold, Module 2 placing each new replica, Module 3&apos;s
          threshold feeding back into what counts as an alert. These checks confirm the three
          modules&apos; outputs are actually internally consistent with each other, not just
          individually correct in isolation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Coherence checks</h4>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={m.coherence_checks.all_checks_passed ? "pass" : "disclosed"}
              label={m.coherence_checks.all_checks_passed ? "All checks passed" : "Some checks failed"}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {checks.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                <span className="text-sm text-foreground">{label}</span>
                <StatusBadge
                  status={m.coherence_checks[key as keyof typeof m.coherence_checks] ? "pass" : "disclosed"}
                  label={m.coherence_checks[key as keyof typeof m.coherence_checks] ? "Pass" : "Fail"}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-foreground">Closed-loop summary</h4>
          <StatGrid>
            <StatTile label="Time buckets replayed" value={m.summary_stats.n_buckets.toLocaleString()} />
            <StatTile label="Placement rounds" value={m.summary_stats.n_placement_rounds.toLocaleString()} />
            <StatTile label="Alerts raised" value={m.summary_stats.n_alerts.toLocaleString()} />
            <StatTile
              label="Mean predicted risk"
              value={m.summary_stats.mean_predicted_risk.toFixed(3)}
            />
            <StatTile
              label="Mean placement reward"
              value={m.summary_stats.mean_placement_reward.toFixed(3)}
            />
            <StatTile label="Final threshold" value={m.summary_stats.final_threshold.toFixed(2)} />
          </StatGrid>
        </section>

        <ResultFigure
          src={resultImageUrl("integration/closed_loop_overview.png")}
          alt="Overview of the simulated closed loop showing risk score, threshold, and placement reward over the full trace"
          caption="The full closed loop replayed over the offline trace: risk, threshold, and placement reward together."
        />
      </CardContent>
    </Card>
  );
}
