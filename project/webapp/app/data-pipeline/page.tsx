import path from "node:path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StepFlow } from "@/components/step-flow";
import { InfoNote } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CodeSnippet } from "@/components/code-snippet";
import { PipelineDiagram } from "@/components/pipeline-diagram";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readCsv } from "@/lib/data";
import { DATA_PROCESSED_DIR } from "@/lib/config";

// Columns shown from features_primary_preview.csv - the delta1/delta2/delta4
// rolling-change columns (24 more) are omitted here purely for table width;
// the exit artifact note below links to the full file.
const FEATURE_PREVIEW_COLUMNS = [
  "time_bucket",
  "p95_latency_ms",
  "p99_latency_ms",
  "call_count",
  "HTTP_MCR",
  "HTTP_RT",
  "providerRPC_MCR",
  "providerRPC_RT",
  "cpu_utilization",
  "memory_utilization",
  "active_instances",
  "violation_now",
  "label_next_violation",
];

function formatCell(value: string | number | undefined): string {
  if (value === undefined || value === "") return "-";
  if (typeof value !== "number") return String(value);
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(Math.abs(value) < 10 ? 3 : 1);
}

function truncateHash(value: string | number | undefined): string {
  const s = String(value ?? "");
  return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}

const RAW_TABLES = [
  { name: "Node", shards: "1 shard (1/1)", covers: "Full 12h", role: "Per-node CPU/memory headroom at a point in time — feeds only Module 2's candidate-node sampling." },
  { name: "MSResource", shards: "12 shards (12/12)", covers: "Full 12h", role: "Per-instance CPU/memory usage over time — used twice: aggregated into Module 1's feature table, and scanned directly for Module 2's real placement events." },
  { name: "MSRTQps", shards: "25 shards (25/25)", covers: "Full 12h", role: "Per-service request-rate/response-time metrics — the load/backlog signal for Module 1's feature table." },
  { name: "MSCallGraph", shards: "145 shards (145/145)", covers: "Full 12h", role: "Individual call records with response time — the source of the true p95/p99 latency signal." },
];

export default function DataPipelinePage() {
  const featureRows = readCsv(path.join(DATA_PROCESSED_DIR, "features_primary_preview.csv")) ?? [];
  const placementRows = readCsv(path.join(DATA_PROCESSED_DIR, "module2_placement_events_preview.csv")) ?? [];
  const featureSample = featureRows.slice(0, 8);
  const placementSample = placementRows.slice(0, 8);

  return (
    <section className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Data Pipeline — from the Alibaba trace to three trained modules</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every number reported on the Results page traces back to one dataset. This page
          follows that whole path: the four raw tables, the one shared preprocessing script
          that builds Module 1&apos;s feature table, the separate path Module 2 takes over the
          same raw data, how each module is actually trained, and exactly how each was
          validated — with real code and real numbers throughout, not paraphrased.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">The dataset</h2>
        <p className="max-w-3xl text-muted-foreground">
          <strong className="text-foreground">cluster-trace-microservices-v2021</strong>, a
          12-hour production microservice trace published by Alibaba. Four raw tables are
          used, extracted to <strong className="text-foreground">full 12-hour coverage</strong>{" "}
          (every shard of every table, not a sample — an early Phase 0 pass only extracted the
          first shard of each and was corrected once it became clear shards are contiguous
          time slices, not random samples, of one global 12h timeline).
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {RAW_TABLES.map((t) => (
            <div key={t.name} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-semibold text-foreground">{t.name}</p>
                <span className="text-[11px] text-muted-foreground">{t.shards}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.role}</p>
            </div>
          ))}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          One case-study service (<code className="rounded bg-muted px-1 py-0.5 text-xs">msname</code>) is
          selected before anything else — chosen for high call volume <em>and</em> multiple
          instances, since a low-traffic service produces noisy percentile estimates and a
          single-instance service gives Module 2 nothing to place. The primary service used
          runs 306 container instances and receives roughly thirty-nine thousand sampled
          calls per interval.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Preprocessing — raw tables to one labeled feature table</h2>
        <p className="max-w-3xl text-muted-foreground">
          All in <code className="rounded bg-muted px-1 py-0.5 text-xs">project/preprocessing/build_features.py</code>,
          one script implementing every step below, validated against a synthetic burst test
          (<code className="rounded bg-muted px-1 py-0.5 text-xs">project/tests/test_synthetic_pipeline.py</code>)
          before ever touching the real trace.
        </p>
        <StepFlow
          steps={[
            { title: "Latency signal", description: "MSCallGraph, receiver-side (dm) only, p95/p99 per 2-min bucket" },
            { title: "Load signal", description: "MSRTQps, provider-side request rate/response time" },
            { title: "Resource signal", description: "MSResource, mean CPU/memory + active instance count" },
            { title: "Join + gap-fill", description: "Outer join on time bucket, bounded forward-fill" },
            { title: "Rolling deltas", description: "1/2/4-bucket change for every signal" },
            { title: "Label + split", description: "Self-referential shifted label, time-ordered 75/25 split" },
          ]}
        />

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              The latency signal keeps only genuine outbound-response rows (<code className="rounded bg-muted px-1 py-0.5 text-xs">rt &lt; 0</code>,
              this trace&apos;s sign convention for a receiver-side response — or message-queue
              calls, which don&apos;t follow it) and takes the true 95th/99th percentile per bucket,
              not an average:
            </p>
            <CodeSnippet
              source="project/preprocessing/build_features.py"
              code={`keep = (df_cg["rt"] < 0) | (df_cg["rpctype"] == "mq")
df_cg = df_cg[keep].copy()
df_cg["rt"] = df_cg["rt"].abs()
df_cg["time_bucket"] = (df_cg["timestamp"] // cfg.bucket_ms).astype(int)

latency = df_cg.groupby("time_bucket")["rt"].agg(
    p95_latency_ms=lambda s: s.quantile(0.95),
    p99_latency_ms=lambda s: s.quantile(0.99),
    call_count="count",
).reset_index()`}
            />
          </div>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              The label isn&apos;t an external SLA number — it&apos;s derived from the service&apos;s
              own observed latency distribution, then shifted one bucket into the future so the
              model is trained to <em>forecast</em>, not just detect:
            </p>
            <CodeSnippet
              source="project/preprocessing/build_features.py (construct_label)"
              code={`threshold = df["p99_latency_ms"].quantile(violation_percentile)  # 0.90
df["violation_now"] = (df["p99_latency_ms"] > threshold).astype(int)
df["label_next_violation"] = df["violation_now"].shift(-1)
df = df.dropna(subset=["label_next_violation"]).reset_index(drop=True)`}
            />
          </div>

          <div>
            <p className="mb-2 text-sm text-muted-foreground">
              The train/test split is strictly time-ordered — never shuffled, since shuffling a
              forecasting problem lets the model train on rows that come after the ones it&apos;s
              tested on:
            </p>
            <CodeSnippet
              source="project/preprocessing/build_features.py (time_based_split)"
              code={`def time_based_split(df, train_frac=0.75):
    split_idx = int(len(df) * train_frac)
    train, test = df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()
    return train, test`}
            />
          </div>
        </div>

        <InfoNote>
          Exit artifact: one 360-row feature table (270 train / 90 test — full 12-hour
          coverage), saved to <code className="rounded bg-muted px-1 py-0.5 text-xs">project/data/processed/features_primary.parquet</code>,
          plus a matching secondary-service table used only for Module 1&apos;s generalization
          check.
        </InfoNote>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">The whole path, in one diagram</h2>
        <p className="max-w-3xl text-muted-foreground">
          Module 2 does <strong className="text-foreground">not</strong> go through
          the preprocessing script above — it runs its own separate pass over the raw
          <code className="rounded bg-muted px-1 py-0.5 text-xs">MSResource</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">Node</code> tables to find real
          historical placement events. Module 3 trains and validates purely on Module 1&apos;s
          exported output — it never touches the raw trace at all.
        </p>
        <PipelineDiagram />
      </section>

      <Separator />

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Preprocessed data — real rows, both datasets</h2>
          <p className="max-w-3xl text-muted-foreground">
            The two datasets that actually feed Module 1 and Module 2, straight off disk —
            not paraphrased. Both are produced by the steps described above and committed
            under <code className="rounded bg-muted px-1 py-0.5 text-xs">project/data/processed/</code>.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">Module 1&apos;s feature table</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">features_primary.parquet</code> —
            360 rows (one per 2-minute bucket, full 12h), 37 columns. The first 8 rows are shown
            below across 13 of those columns; the other 24 (the 1/2/4-bucket rolling-change
            columns for every signal) are omitted here only for table width.
          </p>
          {featureSample.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableCaption className="pb-3">
                  Rows 1–8 of 360 from features_primary.parquet. violation_now / label_next_violation
                  are the current and one-bucket-ahead labels described above.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    {FEATURE_PREVIEW_COLUMNS.map((col) => (
                      <TableHead key={col} className="font-mono text-[11px]">{col}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureSample.map((row, i) => (
                    <TableRow key={i}>
                      {FEATURE_PREVIEW_COLUMNS.map((col) => (
                        <TableCell key={col} className="font-mono text-[11px]">
                          {formatCell(row[col])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <InfoNote>features_primary_preview.csv was not found on disk.</InfoNote>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">Module 2&apos;s placement events</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">module2_placement_events_primary.parquet</code> —
            the 306 pre-existing instance-to-node pairs used to batch-initialize each node&apos;s
            posterior (event_timestamp 0.0, since these already existed at trace start rather
            than being observed as live placements). Instance and node IDs are the trace&apos;s own
            long hex identifiers, truncated below for width.
          </p>
          {placementSample.length > 0 ? (
            <div className="rounded-lg border">
              <Table>
                <TableCaption className="pb-3">
                  Rows 1–8 of 306 from module2_placement_events_primary.parquet.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-[11px]">msinstanceid</TableHead>
                    <TableHead className="font-mono text-[11px]">nodeid</TableHead>
                    <TableHead className="font-mono text-[11px]">event_timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placementSample.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-[11px]">{truncateHash(row.msinstanceid)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{truncateHash(row.nodeid)}</TableCell>
                      <TableCell className="font-mono text-[11px]">{formatCell(row.event_timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <InfoNote>module2_placement_events_preview.csv was not found on disk.</InfoNote>
          )}
          <InfoNote>
            The other 87 rounds Module 2 is actually evaluated on come from a separate churn
            table (<code className="rounded bg-muted px-1 py-0.5 text-xs">module2_placement_events_churn.parquet</code>,
            same msinstanceid/nodeid/event_timestamp columns plus msname), not shown here for
            brevity.
          </InfoNote>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Module 1 — training and validation</h2>
        <p className="max-w-3xl text-muted-foreground">
          Trains directly on the feature table above. A LightGBM classifier, heavily
          regularized given only 270 training rows, with balanced class weights since real
          violations are the rare class:
        </p>
        <CodeSnippet
          source="project/configs/module1_default.json"
          code={`{
  "lgbm_params": {
    "n_estimators": 150, "learning_rate": 0.05,
    "num_leaves": 7, "max_depth": 4, "min_child_samples": 5,
    "subsample": 0.8, "colsample_bytree": 0.8,
    "reg_alpha": 0.1, "reg_lambda": 0.1,
    "class_weight": "balanced"
  }
}`}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation results (real numbers, project/results/module1/primary/metrics.json)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">1. Beats CPU-only baseline — single holdout split</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                A strictly time-ordered 75/25 split (270 train / 90 test rows), tested once.
                Fused AUC-ROC 0.652 vs. baseline 0.427; fused AUC-PR 0.031 vs. baseline 0.019.
                The source file flags this itself: single-holdout AUC-PR is high-variance with
                this few positives in the test split — check 2 below is the more reliable
                estimate.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">2. Beats CPU-only baseline — walk-forward, 5 folds</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                Retrained on progressively larger windows of the trace, tested on the next
                unseen window each time. 2 of 5 folds had zero positive test rows and are
                excluded from the mean. Mean fused AUC-PR 0.294 vs. baseline 0.271; mean fused
                AUC-ROC 0.602 vs. baseline 0.528.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">3. Warns earlier than the baseline — lead time</span>
                <StatusBadge status="disclosed" />
              </div>
              <p>
                Both scores thresholded to the same 15% alert rate, then measured across 18 real
                SLA-violation episodes on how many time buckets earlier each crosses into alert
                state. Fused: 0.44 buckets mean lead time. Baseline: 1.06 buckets — the baseline
                warned earlier on this trace. Reported as a real negative result, not smoothed
                over: fusing signals improved checks 1–2 but did not translate into an earlier
                warning here.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">4. Generalizes to a second, differently-patterned service</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                Same trained model, genuinely unseen data: tested on a second service&apos;s 90
                held-out rows (differently-patterned call volume and instance count from the
                primary service it was trained on). AUC-ROC 0.624, AUC-PR 0.420.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">5. TreeSHAP sanity check — the individual novelty element</span>
                <StatusBadge status="partial" />
              </div>
              <p>
                Each of the model&apos;s 4 signal families is perturbed one at a time in a
                synthetic input; the check passes if TreeSHAP correctly names it as the dominant
                driver of the resulting change in risk score. 3 of 4 passed:
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signal perturbed</TableHead>
                    <TableHead>Risk increased?</TableHead>
                    <TableHead>Correctly attributed?</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">p99_latency_ms</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell><StatusBadge status="pass" label="Pass" /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">cpu_utilization</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell><StatusBadge status="pass" label="Pass" /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">providerRPC_MCR</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell><StatusBadge status="pass" label="Pass" /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">memory_utilization</TableCell>
                    <TableCell>No (risk decreased)</TableCell>
                    <TableCell>No — ranked p99_latency_ms dominant instead</TableCell>
                    <TableCell><StatusBadge status="disclosed" label="Misattributed" /></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Module 2 — training and validation</h2>
        <p className="max-w-3xl text-muted-foreground">
          Doesn&apos;t train on a feature table at all — it replays real historical placement
          events chronologically. This trace turned out to have almost no genuine mid-experiment
          placement churn (99.9% of instance-node pairs cluster-wide already existed at t=0), so
          the design uses both: the 306 pre-existing pairs batch-initialize each node&apos;s belief
          with real reward history, and the 87 genuine cluster-wide churn events are the actual
          sequential rounds the bandit is evaluated on.
        </p>
        <p className="text-sm text-muted-foreground">The discounted posterior update — the individual contribution:</p>
        <CodeSnippet
          source="project/module2_co_scheduling/bandit.py"
          code={`def update(self, nodeid, reward: float) -> None:
    self._ensure_arm(nodeid)
    reward = float(np.clip(reward, 0.0, 1.0))
    self.alpha[nodeid] = 1.0 + self.gamma * (self.alpha[nodeid] - 1.0) + reward
    self.beta[nodeid]  = 1.0 + self.gamma * (self.beta[nodeid] - 1.0) + (1.0 - reward)
    self.pulls[nodeid] += 1`}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation results (real numbers, project/results/module2/metrics.json)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Of the 306 batch-initialization pairs plus 87 churn events (393 total placement
              rounds), only the <strong className="text-foreground">87 churn events</strong> are
              genuine choices among multiple candidate nodes — the rest had just one option, so
              they can only initialize belief, not be evaluated on. That is a small sample to
              detect a statistically clean win in, which the two checks below found directly.
            </p>
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">1. Beats random and heuristic-only baselines — cumulative regret</span>
                <StatusBadge status="disclosed" />
              </div>
              <p>
                Final cumulative regret over the 87 usable rounds (lower is better): combined
                system 4.68, random 5.73, heuristic-only 0.49. The combined system beats random,
                but the CPU x memory-headroom heuristic alone had the lowest regret of all three
                — mean reward tells the same story (combined 0.318, heuristic-only 0.366, oracle
                ceiling 0.372). A convergence check on the same run shows why: posterior entropy
                stayed at 2.996 of a 2.996 maximum, meaning the bandit was still exploring, not
                settling, over these 87 rounds — too few rounds for it to have learned enough to
                beat a hand-tuned heuristic yet.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">2. Discounted beats vanilla TS — the real trace&apos;s one non-stationary window</span>
                <StatusBadge status="disclosed" />
              </div>
              <p>
                Mean reward across the 43 rounds inside the trace&apos;s one real regime-shift
                window (buckets 238–263): discounted 0.317 vs. vanilla 0.330 — vanilla edged it
                out. Root cause: this window had <em>uniform</em> drift (every node&apos;s
                reward drops together) rather than the <em>differential</em> drift (rankings
                between nodes swapping) that discounting is specifically built to help with. The
                synthetic test below exists because a single 43-round real window can&apos;t
                supply the repeated, isolated regime shifts needed to test that condition
                cleanly.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">3. Addendum — synthetic rank-inversion stress test</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                6 candidate nodes with a fixed reward ranking that flips exactly once partway
                through (150 rounds before, 150 after), repeated 50 independent times — the
                controlled version of check 2&apos;s condition. Discounted TS won 100% of the 50
                repeats in the 30-round recovery window immediately after the flip (mean reward
                0.36 vs. 0.18) and 98% of repeats over the full post-flip phase (0.66 vs. 0.46),
                both statistically significant (one-sided Wilcoxon p under 0.0001).
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Module 3 — training and validation</h2>
        <p className="max-w-3xl text-muted-foreground">
          Trains and validates purely on Module 1&apos;s held-out residual stream (
          <code className="rounded bg-muted px-1 py-0.5 text-xs">predicted_risk</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">actual_outcome</code> per
          bucket) — it never touches the raw trace. The individual contribution: a rolling
          count of the threshold&apos;s own recent direction reversals multiplies the conformal
          interval width before it bounds the controller&apos;s next move:
        </p>
        <CodeSnippet
          source="project/module3_adaptive_control/conformal.py"
          code={`def rolling_reversal_count(trajectory: list[float], window: int) -> int:
    if len(trajectory) < 3:
        return 0
    recent = trajectory[-(window + 1):]
    deltas = np.diff(recent)
    signs = np.sign(deltas)
    nonzero = signs[signs != 0]
    if len(nonzero) < 2:
        return 0
    return int(np.sum(nonzero[1:] != nonzero[:-1]))

def oscillation_widening_factor(reversal_count: int, k: float) -> float:
    return 1.0 + k * reversal_count`}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Validation results (real numbers, project/results/module3/metrics.json)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">1. PI controller responds and stays bounded — isolated, before conformal is added</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                A synthetic step input, PI controller alone. It responds to the step and settles
                at a bounded final value (0.01) rather than diverging.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">2. Conformal coverage close to its 90% target</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                Across 90 holdout points, the conformal interval actually contained the true
                outcome 88.9% of the time — within 1.1 points of the 90% target it was
                calibrated for.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">3. Step response bounded, no runaway overshoot</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                Full loop (PI + conformal), same synthetic step: pre-step value 0.1, settles to
                0.01 within 2 steps, zero overshoot.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">4. Widens right after a reversal-count spike — sensitivity check</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                Correlation between the rolling reversal count and the resulting widened
                interval width: 0.97. Concretely, interval width was 2.33 before the run&apos;s
                worst reversal spike (2 reversals) and 8.98 right after it — the mechanism reacts
                to real instability, not just noise.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">5. Full design beats PI+conformal-only on instability — real bursty segment</span>
                <StatusBadge status="disclosed" />
              </div>
              <p>
                Fixed-threshold, PI+conformal-only, and the full oscillation-aware controller run
                on the same real trace (lower is better throughout):
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
                  <TableRow>
                    <TableCell className="font-medium text-foreground">Fixed threshold (no PI, no conformal)</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>0.000</TableCell>
                    <TableCell>21.0%</TableCell>
                    <TableCell>8.6%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">PI + conformal (published BACC mechanism)</TableCell>
                    <TableCell>4</TableCell>
                    <TableCell>0.294</TableCell>
                    <TableCell>21.9%</TableCell>
                    <TableCell>11.4%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-foreground">Full — + oscillation-conditioned widening</TableCell>
                    <TableCell>4</TableCell>
                    <TableCell>0.277</TableCell>
                    <TableCell>24.3%</TableCell>
                    <TableCell>11.4%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p>
                <strong className="text-foreground">Disclosed finding:</strong> the full
                controller and PI+conformal-only tied on instability (4 reversals each) — the
                fixed-threshold arm shows 0 only because it never reacts to anything, not because
                it&apos;s better. The full controller did produce a lower deviation std. dev.
                (0.277 vs. 0.294), a smaller, complementary sign of steadier control. One real
                trace is too small a sample to settle the headline instability claim on, which is
                exactly what check 6 was built to do.
              </p>
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">6. Addendum — synthetic multi-burst stress test</span>
                <StatusBadge status="pass" />
              </div>
              <p>
                15 synthetic load bursts per run, repeated 50 independent times (~393 rows each)
                — enough repeats to tell a real difference apart from noise, which the single
                real trace above couldn&apos;t. Mean reversal count: 14.04 for PI+conformal-only
                vs. 7.64 for the full design — a statistically significant reduction (one-sided
                Wilcoxon p under 0.0001), strictly lower in 46% of repeats and never worse in 96%
                of them. The matching deviation-std.-dev. comparison did <em>not</em> reach
                significance (p ~= 0.45) — the novelty element&apos;s proven effect across these
                50 repeats is fewer oscillation reversals specifically, not a smaller deviation.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Phase 4 — does it actually work together</h2>
        <p className="max-w-3xl text-muted-foreground">
          Each module&apos;s validated logic exports its own log over the full 12-hour trace
          (<code className="rounded bg-muted px-1 py-0.5 text-xs">export_full_trace.py</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">export_decision_log.py</code>,{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">export_trajectory.py</code>);{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">project/integration/simulated_closed_loop.py</code>{" "}
          re-implements nothing — it only assembles those three logs and checks they&apos;re
          internally consistent, entirely offline, before anything runs on a real cluster.
        </p>
        <InfoNote>
          This step genuinely caught a real bug, not just a formality: the first full-trace run
          found Module 3&apos;s PI controller stuck at its lower threshold bound for roughly 230
          of the trace&apos;s 360 buckets, never recovering even after predicted risk returned to
          calm. The anti-windup logic in <code className="rounded bg-muted px-1 py-0.5 text-xs">pi_controller.py</code>{" "}
          was rewritten to check the current error&apos;s own sign directly, rather than a
          tentative output value that stayed dominated by a stale integral term — fixed and
          re-verified before the live cluster phase began.
        </InfoNote>
      </section>
    </section>
  );
}
