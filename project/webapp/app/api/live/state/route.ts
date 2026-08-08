import { NextResponse } from "next/server";
import { ensurePortForwardsStarted, getForwardStatuses, reportForwardHealthy } from "@/lib/port-forwards";
import { fetchLiveState } from "@/lib/live";
import { ensureLiveHistoryPolling, getLiveHistory } from "@/lib/live-history";

// Read-only by construction: this route only ever GETs each live
// component's own /risk or /state endpoint through a kubectl port-forward
// it manages - it never issues a PATCH/POST against the cluster, and never
// installs, bootstraps, or reconfigures anything. See lib/port-forwards.ts
// for the forwarding itself.
export async function GET() {
  ensurePortForwardsStarted();
  // Starts (once - idempotent) a poller that keeps recording history on its
  // own 2s timer independent of whether any browser tab is open, so a page
  // reload sees everything since this server started polling, not an empty
  // chart - see lib/live-history.ts.
  ensureLiveHistoryPolling();

  const state = await fetchLiveState();
  // A successful fetch is stronger evidence the tunnel works than kubectl's
  // own stdout, which can miss a forward that was already up before this
  // process started (see reportForwardHealthy's doc comment).
  if (state.module1.reachable) reportForwardHealthy("module1");
  if (state.module3.reachable) reportForwardHealthy("module3");
  if (state.actuator.reachable) reportForwardHealthy("actuator");
  const forwards = getForwardStatuses();
  const clusterReachable = state.module1.reachable || state.module3.reachable || state.actuator.reachable;
  return NextResponse.json({
    clusterReachable,
    forwards,
    ...state,
    fetchedAt: Date.now(),
    history: getLiveHistory(),
  });
}
