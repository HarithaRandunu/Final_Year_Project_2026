import { fetchLiveState } from "@/lib/live";

export interface LiveHistoryPoint {
  /** ms since Unix epoch - real wall-clock time, not a poll index. */
  t: number;
  risk: number | null;
  /**
   * The risk value Module 3's own control loop last observed - NOT the same
   * timestamp as `risk` above. Module 3 polls Module 1 on its own ~2-minute
   * cadence (module3_controller/app.py's POLL_SECONDS), independently of
   * this app's 2-second polling, so this can lag `risk` by up to ~2
   * minutes. It's the value that actually drives the threshold's PI step -
   * a spike visible in `risk` that fades before Module 3's next poll never
   * reaches this field, and the threshold never reacts to it.
   */
  m3Risk: number | null;
  threshold: number | null;
  replicas: number | null;
  module2: Record<string, number | null>;
  /**
   * Ground truth, not a module output: read straight from the Kubernetes
   * metrics API by module1_controller/app.py's get_live_resource_signals()
   * (see that file's own docstring) as % of each pod's configured resource
   * limit, averaged across whichever pods are up right now. Module 1's
   * predicted_risk is a *derived* score computed partly from these numbers -
   * these two are the raw cluster state it's derived from.
   */
  cpuUtilization: number | null;
  memoryUtilization: number | null;
}

const POLL_INTERVAL_MS = 2000;
// A safety cap, not a sliding window: history is never truncated to "the
// last N minutes" while the server is up - this cap only exists so a dev
// server left running for days doesn't grow this array without bound. At
// one point per 2s, this is ~2.8 hours of continuous history.
const MAX_POINTS = 5000;

// Module-scope singleton, same pattern as lib/port-forwards.ts: persists
// for the life of this Next.js server process, independent of any one
// browser tab. Its own start time (the first time /live is visited and
// this poller is lazily started) is "t=0" for every chart on the page -
// reloading the browser does NOT reset it, since the history lives here,
// not in React state.
let startedAt: number | null = null;
let points: LiveHistoryPoint[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let polling = false;

async function pollOnce(): Promise<void> {
  if (polling) return; // don't overlap if a fetch is still in flight
  polling = true;
  try {
    const state = await fetchLiveState();
    const t = Date.now();
    startedAt ??= t;
    const bucket = state.module1.data?.last_bucket ?? null;
    points.push({
      t,
      risk: state.module1.data?.predicted_risk ?? null,
      m3Risk: state.module3.data?.predicted_risk ?? null,
      threshold: state.module3.data?.threshold ?? null,
      replicas: state.actuator.data?.replicas ?? null,
      module2: state.module3.data?.module2_bandit_state?.posterior_mean ?? {},
      cpuUtilization: bucket?.cpu_utilization ?? null,
      memoryUtilization: bucket?.memory_utilization ?? null,
    });
    if (points.length > MAX_POINTS) points = points.slice(points.length - MAX_POINTS);
  } finally {
    polling = false;
  }
}

/** Idempotent - safe to call on every /api/live/state request. */
export function ensureLiveHistoryPolling(): void {
  if (pollTimer) return;
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

export function getLiveHistory(): { startedAt: number | null; points: LiveHistoryPoint[] } {
  return { startedAt, points };
}
