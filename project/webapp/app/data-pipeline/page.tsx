import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StepFlow } from "@/components/step-flow";
import { InfoNote } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { CodeSnippet } from "@/components/code-snippet";
import { PipelineDiagram } from "@/components/pipeline-diagram";

const RAW_TABLES = [
  { name: "Node", shards: "1 shard (1/1)", covers: "Full 12h", role: "Per-node CPU/memory headroom at a point in time — feeds only Module 2's candidate-node sampling." },
  { name: "MSResource", shards: "12 shards (12/12)", covers: "Full 12h", role: "Per-instance CPU/memory usage over time — used twice: aggregated into Module 1's feature table, and scanned directly for Module 2's real placement events." },
  { name: "MSRTQps", shards: "25 shards (25/25)", covers: "Full 12h", role: "Per-service request-rate/response-time metrics — the load/backlog signal for Module 1's feature table." },
  { name: "MSCallGraph", shards: "145 shards (145/145)", covers: "Full 12h", role: "Individual call records with response time — the source of the true p95/p99 latency signal." },
];

export default function DataPipelinePage() {
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
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start justify-between gap-3">
              <span>AUC-PR beats CPU-only baseline (holdout: 0.65 vs. 0.43 AUC-ROC, and walk-forward mean)</span>
              <StatusBadge status="pass" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Lead-time positive and beats baseline (real: fused 0.44 buckets vs. baseline 1.06 — did not beat it)</span>
              <StatusBadge status="disclosed" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Generalizes to a second, differently-patterned service (AUC-ROC 0.62)</span>
              <StatusBadge status="pass" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>SHAP sanity check — synthetic single-signal perturbation correctly attributed (majority of signals pass; not all)</span>
              <StatusBadge status="partial" />
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
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start justify-between gap-3">
              <span>Beats a random policy and the CPU x memory-headroom heuristic on cumulative regret</span>
              <StatusBadge status="disclosed" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Discounted TS beats vanilla TS on the real trace&apos;s one non-stationary window</span>
              <StatusBadge status="disclosed" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Addendum: discounted TS beats vanilla on a synthetic rank-inversion test (50 repeats, paired Wilcoxon p under 0.0001)</span>
              <StatusBadge status="pass" />
            </div>
          </CardContent>
        </Card>
        <InfoNote>
          The real-data non-stationary window had <em>uniform</em> drift (every node&apos;s reward
          drops together) rather than <em>differential</em> drift (rankings between nodes
          changing) — discounting specifically helps with the latter, so vanilla TS edged it
          out there. The synthetic test deliberately reverses which node is best partway
          through (same means, swapped assignment) to isolate exactly that condition, and
          discounted TS wins clearly there (mean reward 0.66 vs. 0.46 post-inversion).
        </InfoNote>
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
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start justify-between gap-3">
              <span>PI controller responds and stays bounded on synthetic step input</span>
              <StatusBadge status="pass" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Conformal coverage close to target (88.9% observed vs. 90% target)</span>
              <StatusBadge status="pass" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Widens right after a reversal-count spike (sensitivity check)</span>
              <StatusBadge status="pass" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Full design beats PI+conformal-only on instability, real bursty segment (4 vs. 4 reversals — tied, too few events to separate)</span>
              <StatusBadge status="disclosed" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Addendum: full design beats PI+conformal on a synthetic multi-burst test (50 repeats, reversal count 7.64 vs. 14.04, Wilcoxon p under 0.0001)</span>
              <StatusBadge status="pass" />
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
