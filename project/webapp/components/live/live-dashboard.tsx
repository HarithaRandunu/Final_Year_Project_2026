"use client";

import { useEffect, useState } from "react";
import { InfoNote } from "@/components/empty-state";
import { Speedometer } from "@/components/live/speedometer";
import { MultiLineChart, type NamedSeries, type TimeSeriesPoint } from "@/components/live/multi-line-chart";
import { NoClusterCard } from "@/components/live/no-cluster-card";
import { ComponentStatusTiles } from "@/components/live/component-status-tiles";
import { ThresholdPinNote } from "@/components/live/threshold-pin-note";
import { MODULE3_THRESHOLD_BOUNDS, ACTUATOR_REPLICA_BOUNDS } from "@/lib/config";
import type { ActuatorStateResponse, ComponentFetch, Module1RiskResponse, Module3StateResponse } from "@/lib/live";
import type { LiveHistoryPoint } from "@/lib/live-history";

// Polled every 2s per the user's request, purely to refresh the display -
// the actual data COLLECTION happens on the server on its own independent
// 2s timer (lib/live-history.ts), so reloading this page never loses
// history or "restarts": every poll response carries the server's full
// history since it first started polling, not just this tab's own memory.
const POLL_MS = 2000;

interface LiveStateResponse {
  clusterReachable: boolean;
  forwards: Record<string, { status: string; lastError: string | null }>;
  module1: ComponentFetch<Module1RiskResponse>;
  module3: ComponentFetch<Module3StateResponse>;
  actuator: ComponentFetch<ActuatorStateResponse>;
  fetchedAt: number;
  history: { startedAt: number | null; points: LiveHistoryPoint[] };
}

function toSeries(
  history: LiveStateResponse["history"],
  pick: (p: LiveHistoryPoint) => number | null,
): TimeSeriesPoint[] {
  if (history.startedAt === null) return [];
  return history.points.map((p) => ({ t: (p.t - history.startedAt!) / 1000, v: pick(p) }));
}

function module2NodeSeries(history: LiveStateResponse["history"]): Record<string, TimeSeriesPoint[]> {
  if (history.startedAt === null) return {};
  const nodes = new Set<string>();
  history.points.forEach((p) => Object.keys(p.module2).forEach((n) => nodes.add(n)));
  const out: Record<string, TimeSeriesPoint[]> = {};
  nodes.forEach((node) => {
    out[node] = history.points.map((p) => ({ t: (p.t - history.startedAt!) / 1000, v: p.module2[node] ?? null }));
  });
  return out;
}

/** The best (highest posterior-mean) node Module 2's bandit currently favors, or null if no data yet. */
function bestNodePosteriorMean(state: LiveStateResponse | null): number | null {
  const posterior = state?.module3.data?.module2_bandit_state?.posterior_mean;
  if (!posterior) return null;
  const values = Object.values(posterior);
  return values.length > 0 ? Math.max(...values) : null;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Cycled per-node (not per-module) - Module 2's node set isn't fixed ahead
// of time, so these are purely for telling lines apart, not the same
// module-identity mapping the architecture diagram/results charts use.
const NODE_COLORS = ["var(--viz-aqua)", "var(--viz-blue)", "var(--viz-magenta)", "var(--viz-yellow)", "var(--viz-orange)"];

function useLiveState() {
  const [state, setState] = useState<LiveStateResponse | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/live/state", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LiveStateResponse;
        if (cancelled) return;
        setState(data);
        setPollError(null);
      } catch (err) {
        if (!cancelled) setPollError(err instanceof Error ? err.message : String(err));
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { state, pollError };
}

export function LiveDashboard() {
  const { state, pollError } = useLiveState();

  const clusterReachable = state?.clusterReachable ?? false;
  const risk = state?.module1.data?.predicted_risk ?? null;
  const m3RiskValue = state?.module3.data?.predicted_risk ?? null;
  const threshold = state?.module3.data?.threshold ?? null;
  const replicas = state?.actuator.data?.replicas ?? null;
  const module2Value = bestNodePosteriorMean(state);
  const module2Nodes = state?.module3.data?.module2_bandit_state?.posterior_mean ?? null;
  const module2Updates = state?.module3.data?.module2_bandit_state?.reward_updates_applied ?? null;
  const module2Pulls = state?.module3.data?.module2_bandit_state?.pulls ?? null;
  const cpuValue = state?.module1.data?.last_bucket?.cpu_utilization ?? null;
  const memoryValue = state?.module1.data?.last_bucket?.memory_utilization ?? null;

  const history = state?.history ?? { startedAt: null, points: [] };
  const riskLive = toSeries(history, (p) => p.risk);
  const m3RiskLive = toSeries(history, (p) => p.m3Risk);
  const thresholdLive = toSeries(history, (p) => p.threshold);
  const replicasLive = toSeries(history, (p) => p.replicas);
  const cpuLive = toSeries(history, (p) => p.cpuUtilization);
  const memoryLive = toSeries(history, (p) => p.memoryUtilization);
  const module2Live = module2NodeSeries(history);
  const module2Series = Object.entries(module2Live).map(
    ([node, values], i): NamedSeries => ({ label: node, color: NODE_COLORS[i % NODE_COLORS.length], values }),
  );

  return (
    <div className="space-y-6">
      {!state && !pollError ? (
        <InfoNote>Connecting to the cluster through kubectl port-forward…</InfoNote>
      ) : null}

      {pollError ? (
        <InfoNote>
          Couldn&apos;t reach this app&apos;s own <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/live/state</code>{" "}
          route ({pollError}). This is different from the cluster itself being unreachable — retrying every {POLL_MS / 1000}s.
        </InfoNote>
      ) : null}

      {state && !clusterReachable ? <NoClusterCard forwards={state.forwards} /> : null}

      {state ? (
        <ComponentStatusTiles
          module1={{ reachable: state.module1.reachable, hasError: !!state.module1.data?.error }}
          module3={{ reachable: state.module3.reachable, hasError: !!state.module3.data?.error }}
          actuator={{ reachable: state.actuator.reachable, hasError: false }}
        />
      ) : null}

      {history.startedAt !== null ? (
        <p className="text-xs text-muted-foreground">
          This server has been polling the live cluster since{" "}
          {new Date(history.startedAt).toLocaleString()} — every chart below covers that
          entire span, not just this browser tab&apos;s own session. Reloading the page does
          not reset it. Want to see how a completed run compares? The TeaStore page has one
          full recorded trial charted the same way.
        </p>
      ) : null}

      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">What decides the replica count</h2>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Module 1&apos;s risk score and Module 3&apos;s threshold, side by side, are the two
          inputs the Actuator compares every cycle to decide whether to scale.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Speedometer
            label="Risk score (Module 1)"
            value={risk}
            min={0}
            max={1}
            tone="var(--viz-orange)"
            unavailableReason={risk === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Predicted risk over time"
            min={0}
            max={1}
            emptyReason="Waiting for live readings from Module 1."
            series={[
              { label: "Live risk (Module 1, every 2s)", color: "var(--viz-orange)", values: riskLive },
              { label: "Risk as last seen by Module 3 (every ~2min)", color: "var(--viz-yellow)", values: m3RiskLive },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">What this is:</strong> Module 1&apos;s LightGBM
            model, scoring TeaStore right now the same way it scored the offline Alibaba trace
            in training — combining real signals (CPU/memory utilization, replica count, probed
            request latency) into a single 0-1 &quot;how likely is an SLA violation soon&quot;
            estimate. TeaStore is a different app on a different cluster than the model was
            trained on, so treat the plumbing (real inputs -&gt; trained model -&gt; live score)
            as what&apos;s being demonstrated, not a re-validation of Module 1&apos;s Alibaba
            accuracy numbers (those are on the Results page).
          </p>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Two lines, two poll rates:</strong> this page
            fetches Module 1 directly every 2 seconds (orange). Module 3&apos;s own control loop
            fetches Module 1 <em>independently</em>, on its own ~2-minute cycle, and only that
            value (yellow) ever reaches its PI controller. A spike that shows up briefly in
            orange and fades before Module 3&apos;s next poll never reaches the threshold
            calculation at all — that&apos;s why the threshold (right) can stay put even after
            you&apos;ve seen risk cross 0.10 here. Watch the yellow line, not the orange one, to
            predict what the threshold will do next.
          </p>
        </div>

        <div className="space-y-3">
          <Speedometer
            label="Risk Module 3 is reacting to"
            value={m3RiskValue}
            min={0}
            max={1}
            tone="var(--viz-yellow)"
            unavailableReason={m3RiskValue === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Risk as last seen by Module 3, over time"
            min={0}
            max={1}
            emptyReason="Waiting for live readings from Module 3."
            series={[{ label: "Risk seen by Module 3 (~2min polls)", color: "var(--viz-yellow)", values: m3RiskLive }]}
          />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">This is the input, the gauge below is the
            output:</strong> this is Module 1&apos;s risk score, but only as of Module 3&apos;s
            own last ~2-minute poll — not the faster 2-second reading shown in the Module 1
            block. It&apos;s the only risk value the PI controller below ever actually sees.
            Compare its line to the threshold line below: while this stays under 0.10, the
            threshold keeps climbing; the moment this line crosses above 0.10, expect the
            threshold to start coming back down on its next cycle.
          </p>

          <Speedometer
            label="Alert threshold (Module 3)"
            value={threshold}
            min={MODULE3_THRESHOLD_BOUNDS[0]}
            max={MODULE3_THRESHOLD_BOUNDS[1]}
            tone="var(--viz-yellow)"
            unavailableReason={threshold === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Alert threshold over time"
            min={MODULE3_THRESHOLD_BOUNDS[0]}
            max={MODULE3_THRESHOLD_BOUNDS[1]}
            emptyReason="Waiting for live readings from Module 3."
            series={[{ label: "Live threshold", color: "var(--viz-yellow)", values: thresholdLive }]}
          />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">What this is:</strong> a proportional-integral
            (PI) controller — the same one validated offline on the Results page — nudging this
            threshold every ~2-minute cycle to keep the risk value it observes (the gauge and
            chart above) near a target of 0.10. When observed risk sits below target it raises
            the threshold, making the system more tolerant before it would alert; when risk
            sits above target it lowers it, making the system stricter. How far it&apos;s
            allowed to move in a single step isn&apos;t fixed — it narrows automatically when
            Module 1&apos;s recent predictions have been less reliable (adaptive conformal
            inference) or when the threshold itself has been reversing direction a lot
            (oscillation widening), both to avoid overreacting to noise. &quot;Alert&quot; means
            this cycle&apos;s risk exceeded the threshold — bounded to [
            {MODULE3_THRESHOLD_BOUNDS[0]}, {MODULE3_THRESHOLD_BOUNDS[1]}], the same bounds shown
            on the speedometer above.
          </p>
          <ThresholdPinNote threshold={threshold} bounds={MODULE3_THRESHOLD_BOUNDS} />
        </div>
      </section>

      <div className="space-y-1 border-t pt-6">
        <h2 className="text-lg font-semibold text-foreground">What the replica count leads to, and a separate concern</h2>
        <p className="max-w-3xl text-xs text-muted-foreground">
          The Actuator (left) is the outcome of the two charts above. Module 2 (right) answers a
          different question entirely — it doesn&apos;t affect how many replicas exist.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Speedometer
            label="Replicas (Actuator)"
            value={replicas}
            min={ACTUATOR_REPLICA_BOUNDS[0]}
            max={ACTUATOR_REPLICA_BOUNDS[1]}
            formatValue={(v) => v.toFixed(0)}
            tone="var(--viz-magenta)"
            unavailableReason={replicas === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Replica count over time"
            min={ACTUATOR_REPLICA_BOUNDS[0]}
            max={ACTUATOR_REPLICA_BOUNDS[1]}
            integerTicks
            emptyReason="Waiting for live readings from the Actuator."
            series={[{ label: "Live replica count", color: "var(--viz-magenta)", values: replicasLive }]}
          />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">What this is and how it decides:</strong>{" "}
            The real replica count of the <code className="rounded bg-muted px-0.5">teastore-webui</code>{" "}
            Deployment, read from and written to the Kubernetes API directly — not a simulation.
            Every cycle the Actuator compares Module 1&apos;s risk score against Module 3&apos;s
            threshold (both above): risk above threshold scales up by one replica, risk below
            half the threshold scales down by one, otherwise it holds — bounded to [
            {ACTUATOR_REPLICA_BOUNDS[0]}, {ACTUATOR_REPLICA_BOUNDS[1]}] and rate-limited by a
            cooldown so it can&apos;t thrash every cycle. Only Module 1 and Module 3 feed this
            decision — Module 2&apos;s bandit (right) plays no part in the replica{" "}
            <em>count</em>.
          </p>
        </div>

        <div className="space-y-3">
          <Speedometer
            label="Best node quality (Module 2)"
            value={module2Value}
            min={0}
            max={1}
            tone="var(--viz-aqua)"
            unavailableReason={module2Value === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Co-scheduling bandit's per-node quality estimate over time"
            min={0}
            max={1}
            autoFitY
            emptyReason="Waiting for live readings from Module 2."
            series={module2Series}
          />
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">What this decides:</strong> not replica{" "}
            <em>count</em> (that&apos;s the Actuator, left) but <em>which node</em> a pod lands
            on, decided only at the moment a pod actually needs placing. It&apos;s a Kubernetes
            scheduler extender running a discounted-Thompson-Sampling bandit with one posterior
            quality estimate (0-1) per real node —{" "}
            {module2Nodes ? Object.keys(module2Nodes).join(" and ") : "each node"} on this
            2-node kind cluster. The chart above is now zoomed to where the two lines actually
            sit (see the range in its top-right corner) rather than the full 0-1 scale, with
            each line&apos;s current value labeled directly at its right edge — at full scale
            both nodes cluster too close together to tell apart. The speedometer is simply{" "}
            <em>whichever line is highest right now</em>.
          </p>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">Why it moves slowly, and why that&apos;s
            expected:</strong> it only updates on an actual scheduling event — far rarer than
            the Actuator&apos;s cycle — and each additional observation moves the posterior mean
            by a shrinking amount as its pull count grows. Separately, Module 3 only{" "}
            <em>reads</em> this bandit&apos;s state for display; its threshold decision
            doesn&apos;t feed a reward back into it (a disclosed scope limit of this live
            wiring, not a bug) — so nothing above ever pushes these lines. Both nodes sitting
            close together is itself a real reading: they&apos;ve been performing similarly, so
            the bandit hasn&apos;t found a reason to prefer one.
          </p>
          {module2Nodes ? (
            <p className="text-xs text-muted-foreground">
              Per-node posterior mean right now:{" "}
              {Object.entries(module2Nodes)
                .map(([node, v]) => `${node} ${pct(v)}${module2Pulls?.[node] !== undefined ? ` (${module2Pulls[node]} placements)` : ""}`)
                .join(", ")}
              {module2Updates !== null ? ` — ${module2Updates} reward updates applied so far.` : null}
            </p>
          ) : null}
        </div>
      </section>

      <div className="space-y-2 border-t pt-6">
        <h2 className="text-lg font-semibold text-foreground">Real Kubernetes cluster state</h2>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Everything above is a module&apos;s own output — a computed score, threshold, or
          decision. These two are not: they&apos;re read straight off the Kubernetes metrics
          API by Module 1&apos;s live controller (as % of each pod&apos;s configured resource
          limit, averaged across whichever <code className="rounded bg-muted px-0.5">
          teastore-webui</code> pods are up right now), the same raw ground truth Module 1&apos;s
          risk score is partly computed <em>from</em> — shown here directly, unprocessed.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Speedometer
            label="CPU utilization (Kubernetes, real)"
            value={cpuValue}
            min={0}
            max={100}
            formatValue={(v) => `${v.toFixed(1)}%`}
            tone="var(--viz-blue)"
            unavailableReason={cpuValue === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="CPU utilization over time"
            unit="%"
            min={0}
            max={100}
            emptyReason="Waiting for live readings from the Kubernetes metrics API."
            series={[{ label: "CPU % of pod limit", color: "var(--viz-blue)", values: cpuLive }]}
          />
        </div>

        <div className="space-y-3">
          <Speedometer
            label="Memory utilization (Kubernetes, real)"
            value={memoryValue}
            min={0}
            max={100}
            formatValue={(v) => `${v.toFixed(1)}%`}
            tone="var(--viz-yellow)"
            unavailableReason={memoryValue === null ? "no live reading" : undefined}
          />
          <MultiLineChart
            label="Memory utilization over time"
            unit="%"
            min={0}
            max={100}
            emptyReason="Waiting for live readings from the Kubernetes metrics API."
            series={[{ label: "Memory % of pod limit", color: "var(--viz-yellow)", values: memoryLive }]}
          />
          <p className="text-xs text-muted-foreground">
            Both are expressed as a percentage of each pod&apos;s configured resource{" "}
            <em>limit</em> (from the Deployment spec), not host-level usage — the same basis
            Module 1&apos;s trained features use, so these numbers are directly comparable to
            what fed the model, just before any fusion or scoring happens to them.
          </p>
        </div>
      </section>
    </div>
  );
}
