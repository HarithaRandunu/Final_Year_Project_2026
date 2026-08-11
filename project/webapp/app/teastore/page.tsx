import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { StepFlow } from "@/components/step-flow";
import { StatTile, StatGrid } from "@/components/results/stat-tile";
import { StatusBadge } from "@/components/status-badge";
import { InfoNote, EmptyState } from "@/components/empty-state";
import { MultiLineChart } from "@/components/live/multi-line-chart";
import { MODULE3_THRESHOLD_BOUNDS, REFERENCE_ACTUATOR_REPLICA_BOUNDS } from "@/lib/config";
import { loadReferenceTrial, getReferenceTimeSeries } from "@/lib/results";

const SERVICES = [
  { name: "teastore-webui", role: "The web front end — the only service Promex actually scales, and the only one that receives outside traffic (from k6's replay load, or real users during a live demo)." },
  { name: "teastore-auth", role: "Handles login/session logic for the storefront." },
  { name: "teastore-image", role: "Serves product images." },
  { name: "teastore-recommender", role: "Generates product recommendations." },
  { name: "teastore-persistence", role: "The data-access layer sitting between the other services and the database." },
  { name: "teastore-registry", role: "Service discovery — every other service looks up its peers here (a Netflix Eureka/Ribbon-style client) rather than using hardcoded addresses." },
  { name: "teastore-db", role: "The MySQL database backing the whole store." },
];

const ARMS = [
  { arm: "baseline", drivenBy: "Raw CPU utilization", threshold: "Fixed 50% (Kubernetes HPA)", scheduler: "Default", note: "Unchanged Phase 5 setup — the platform's own standard autoscaler." },
  { arm: "m1_only", drivenBy: "Module 1's predicted_risk", threshold: "Fixed 0.08 (static)", scheduler: "Default", note: "Isolates whether the fused signal beats raw CPU as the scaling trigger, with everything else held constant." },
  { arm: "m2_only", drivenBy: "Raw CPU utilization", threshold: "Fixed 50% (Kubernetes HPA)", scheduler: "Module 2 extender", note: "Only the scheduler changes — isolates Module 2's placement effect alone." },
  { arm: "m3_only", drivenBy: "Raw CPU, through PI + conformal + widening", threshold: "Adaptive (Module 3, ablated to not depend on Module 1)", scheduler: "Default", note: "Isolates whether adaptive control beats a fixed threshold, on the same raw signal as baseline." },
  { arm: "full", drivenBy: "Module 1's predicted_risk", threshold: "Adaptive (Module 3's full live control loop)", scheduler: "Module 2 extender", note: "All three modules combined — the framework being evaluated." },
];

export default function TeaStorePage() {
  const referenceTrial = loadReferenceTrial();
  const referenceSeries = referenceTrial ? getReferenceTimeSeries(referenceTrial) : null;

  return (
    <section className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">TeaStore — the app being scaled</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every training figure on the Results page, every trial in both 25-trial ablation
          studies, and everything the Live Run page reads all point at the same one
          application: <strong className="text-foreground">TeaStore</strong>. This page explains
          what it is, exactly how Promex&apos;s three modules connect to it, and where the
          traffic each trial replays actually comes from.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">What TeaStore is</h2>
        <p className="max-w-3xl text-muted-foreground">
          TeaStore is an open-source reference web application built by the Descartes
          Research Group (University of Wuerzburg, Germany) specifically for cloud elasticity and
          autoscaling research — it&apos;s a small e-commerce storefront, deliberately built
          as several independent Java microservices rather than one monolith, so that
          scaling any one part of it behaves like scaling a real production
          service. Promex doesn&apos;t modify TeaStore&apos;s own code at all — it&apos;s used
          exactly as published (image names <code className="rounded bg-muted px-1 py-0.5 text-xs">descartesresearch/teastore-*</code>),
          deployed as seven Kubernetes Deployments/Services from
          {" "}<code className="rounded bg-muted px-1 py-0.5 text-xs">project/live_cluster/teastore/teastore.yaml</code>.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {SERVICES.map((s) => (
            <div key={s.name} className="rounded-lg border bg-card p-3">
              <p className="font-mono text-xs font-semibold text-foreground">{s.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.role}</p>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">How Promex connects to it</h2>
        <p className="max-w-3xl text-muted-foreground">
          Of TeaStore&apos;s seven services, exactly one — <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui</code> —
          is where every part of Promex actually touches TeaStore. It&apos;s the sole{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">TARGET_DEPLOYMENT</code>{" "}
          read by Module 1&apos;s controller and the Actuator alike (confirmed directly in
          both components&apos; source — not a separate config that could drift out of sync).
        </p>
        <StepFlow
          steps={[
            { title: "Traffic arrives", description: "k6's replay load during a trial, or real requests during a live demo" },
            { title: "teastore-webui", description: "The only deployment Promex scales, and the only service that receives this traffic directly" },
            { title: "Internal services", description: "webui calls auth, image, and recommender as needed to build each page" },
            { title: "teastore-persistence", description: "The data-access layer those services go through" },
            { title: "teastore-db", description: "The MySQL database backing everything" },
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">The one deployment that gets scaled</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Whichever arm is running — the Kubernetes HPA (baseline/m2_only) or Promex&apos;s
              own Actuator (m1_only/m3_only/full) — the replica count being changed is always{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui</code>. Nothing
              else in TeaStore is ever scaled by this project.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How Module 1 senses load</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Module 1 actively probes{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui:8080/tools.descartes.teastore.webui/</code>{" "}
              itself on a timer to measure real response time — it doesn&apos;t passively
              scrape a metrics endpoint TeaStore exposes on its own.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">How load gets generated</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              k6 (run as a Kubernetes Job) hits that exact same URL, at a rate that ramps up
              and down according to a replay curve derived from real data — see below.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Where the traffic pattern comes from</h2>
        <p className="max-w-3xl text-muted-foreground">
          Each trial doesn&apos;t hit TeaStore with made-up traffic — the request rate over
          time is derived from the same real Alibaba microservice trace
          (<code className="rounded bg-muted px-1 py-0.5 text-xs">cluster-trace-microservices-v2021</code>) that
          trains Module 1 and validates every other offline result on this site.
        </p>
        <StepFlow
          steps={[
            { title: "Real trace", description: "The case-study service's call_count curve — 360 buckets covering a 12-hour window at 0.5% sampling" },
            { title: "Block-average", description: "Downsampled to 30 stages, coarse enough for a short k6 script" },
            { title: "Normalize & rescale", description: "Min-max normalized, then rescaled into a realistic req/s range for a single-pod TeaStore" },
            { title: "Compress in time", description: "The 30 stages are compressed into a ~15-minute trial" },
            { title: "Replay with k6", description: "A ramping-arrival-rate load test follows that exact shape against teastore-webui" },
          ]}
        />
        <InfoNote>
          Only the <em>shape</em> of the real trace is replayed, not its absolute rate — the
          real trace&apos;s ~323 requests/second (already scaled down by the dataset&apos;s own
          0.5% sampling) would be meaningless against a single-pod TeaStore on a laptop or one
          cloud VM. What&apos;s preserved is the pattern that matters for autoscaling: quiet
          periods, ramps, and the elevated plateau a real service would need to react to.
        </InfoNote>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">The five ablation arms, and what changes in TeaStore for each</h2>
        <p className="max-w-3xl text-muted-foreground">
          Both 25-trial studies on the Results page run the same TeaStore deployment through
          five different configurations. Only three things ever change between them: what
          signal drives scaling, where the scale-up/down threshold comes from, and which
          Kubernetes scheduler is in front of the cluster — TeaStore itself is identical in
          every arm.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Arm</TableHead>
              <TableHead>Scaling driven by</TableHead>
              <TableHead>Threshold source</TableHead>
              <TableHead>Scheduler</TableHead>
              <TableHead>What it isolates</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ARMS.map((a) => (
              <TableRow key={a.arm}>
                <TableCell className="font-mono text-xs font-medium text-foreground">{a.arm}</TableCell>
                <TableCell>{a.drivenBy}</TableCell>
                <TableCell>{a.threshold}</TableCell>
                <TableCell>{a.scheduler}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Between every trial, <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-image</code> are both
          reset to exactly 1 replica, so every trial starts from the same clean state
          regardless of where the previous trial left off.
        </p>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Two studies, one app, different scaling headroom</h2>
        <p className="max-w-3xl text-muted-foreground">
          The same TeaStore setup and the same five arms were run twice — see the Results
          page for the full statistical comparison. What changed between the two studies was
          the platform TeaStore ran on, not TeaStore itself.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Primary study</CardTitle>
              <CardDescription>Replica ceiling 2</CardDescription>
            </CardHeader>
            <CardContent>
              <StatGrid className="sm:grid-cols-2 lg:grid-cols-2">
                <StatTile label="Host" value="Shared workstation" />
                <StatTile label="Traffic peak" value="24 req/s" />
              </StatGrid>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Follow-up study</CardTitle>
              <CardDescription>Replica ceiling 3</CardDescription>
            </CardHeader>
            <CardContent>
              <StatGrid className="sm:grid-cols-2 lg:grid-cols-2">
                <StatTile label="Host" value="Dedicated cloud VM" />
                <StatTile label="Traffic peak" value="32 req/s" />
              </StatGrid>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">A recorded reference trial, charted</h2>
        {referenceTrial && referenceSeries ? (
          <>
            <p className="max-w-3xl text-muted-foreground">
              This is one real, complete trial from the primary study — arm{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{referenceTrial.arm}</code>{" "}
              (the full framework), run tag{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{referenceTrial.run_tag}</code>. It&apos;s
              the same recorded run the old Live Run page used to overlay against live readings
              — shown here on its own instead, since overlaying a 15-minute-long finished run
              against an open-ended live session on one shared axis made the two hard to read
              together. Charted the same way as the Live Run page (elapsed time since the
              trial&apos;s own start, nothing scrolled off), so the shapes are directly
              comparable even though they&apos;re viewed separately.
            </p>
            <StatGrid className="sm:grid-cols-3 lg:grid-cols-3">
              <StatTile label="SLA violations" value={String(referenceTrial.sla_violation_count)} />
              <StatTile label="P99 latency" value={`${referenceTrial.p99_latency_ms.toFixed(0)}ms`} />
              <StatTile label="Cost" value={`${referenceTrial.cost_proxy_pod_seconds} pod-seconds`} />
            </StatGrid>
            <div className="grid gap-4 lg:grid-cols-3">
              <MultiLineChart
                label="Risk score during this trial"
                min={0}
                max={1}
                series={[{ label: "Predicted risk", color: "var(--viz-orange)", values: referenceSeries.risk }]}
              />
              <MultiLineChart
                label="Alert threshold during this trial"
                min={MODULE3_THRESHOLD_BOUNDS[0]}
                max={MODULE3_THRESHOLD_BOUNDS[1]}
                series={[{ label: "Threshold", color: "var(--viz-yellow)", values: referenceSeries.threshold }]}
              />
              <MultiLineChart
                label="Replica count during this trial"
                min={REFERENCE_ACTUATOR_REPLICA_BOUNDS[0]}
                max={REFERENCE_ACTUATOR_REPLICA_BOUNDS[1]}
                series={[{ label: "Replicas", color: "var(--viz-magenta)", values: referenceSeries.replicas }]}
              />
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              <strong className="text-foreground">What this shows:</strong> risk stayed low
              throughout (never above about 0.06), so the same PI controller described on the
              Live Run page spent this entire 15-minute trial pushing the threshold{" "}
              <em>up</em> — from its starting value of 0.1 toward roughly 0.43 by the end,
              trending toward the same ceiling behaviour seen live, just not long enough a run
              to actually reach it. Because risk never got close to even that rising threshold,
              the actuator never had a reason to scale up: replicas stayed flat at 1 for the
              whole trial, and the trial recorded zero SLA violations — a genuinely quiet run,
              not a broken one.
            </p>
          </>
        ) : (
          <EmptyState reason="The recorded reference trial's metrics.json was not found under project/results/ablation/." />
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">A real bug we found in TeaStore itself</h2>
        <div className="flex items-center gap-2">
          <StatusBadge status="disclosed" />
          <Badge variant="secondary">Not a Promex defect</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The follow-up study&apos;s latency figures turned out not to be comparable with the
          primary study&apos;s — investigation traced this to a defect inside TeaStore&apos;s own{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-registry</code> client
          (its Netflix-Ribbon-based service discovery), which raises an unhandled exception
          under the pod churn produced by three <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui</code> replicas
          instead of two — confirmed directly from container logs, not guessed. It crashes and
          restarts the affected pod, and because the reported latency figure is a maximum
          across time windows, a handful of restarts is enough to dominate it. This is a
          genuine property of TeaStore at three replicas, not something Promex&apos;s own code
          introduced — reported plainly rather than smoothed over. Full detail on how this
          affected the comparison is on the Final Conclusion page.
        </p>
      </section>
    </section>
  );
}
