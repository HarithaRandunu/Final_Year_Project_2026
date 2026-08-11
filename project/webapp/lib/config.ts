import path from "node:path";

// process.cwd() is project/webapp when run via `next dev`/`next start` from
// this directory (see package.json's scripts) - not __dirname, since Next's
// bundler moves compiled server code around and __dirname is not reliable
// across its build output.
export const WEBAPP_DIR = process.cwd();
export const PROJECT_DIR = path.resolve(WEBAPP_DIR, "..");
export const IMPLEMENTATION_DIR = path.resolve(PROJECT_DIR, "..");

export const RESULTS_DIR = path.join(PROJECT_DIR, "results");
export const RESULTS_V2_DIR = path.join(PROJECT_DIR, "results_v2");
export const LIVE_CLUSTER_DIR = path.join(PROJECT_DIR, "live_cluster");
export const DATA_PROCESSED_DIR = path.join(PROJECT_DIR, "data", "processed");

export const TARGET_DEPLOYMENT = "teastore-webui";

// Mirrors project/live_cluster/module3_controller/app.py's THRESHOLD_BOUNDS -
// a module-level constant never included in that component's own /state
// JSON, so duplicated here. Keep in sync if the live-cluster component ever
// changes it.
export const MODULE3_THRESHOLD_BOUNDS: [number, number] = [0.01, 0.9];

// Two separate constants, not one - these must NOT be merged back together.
// LIVE_ACTUATOR_REPLICA_BOUNDS mirrors actuator/app.py's live MAX_REPLICAS
// (walked 3 -> 5 -> 4 -> 3 -> 4, all 2026-08-10, on user request for the
// live webapp demo - see that file's own comment) and drives the Live Run
// page's gauge/chart.
// REFERENCE_ACTUATOR_REPLICA_BOUNDS is the completed results_v2 ablation
// study's actual, unchanged ceiling (3) and drives the TeaStore page's
// chart of a recorded historical trial - that chart must reflect what the
// study really used, not whatever the live demo's ceiling currently is, or
// it would misrepresent real historical data if the live value is ever
// changed again.
export const LIVE_ACTUATOR_REPLICA_BOUNDS: [number, number] = [1, 4];
export const REFERENCE_ACTUATOR_REPLICA_BOUNDS: [number, number] = [1, 3];

export interface PortForwardTarget {
  service: string;
  localPort: number;
  remotePort: number;
}

// Fixed local ports for kubectl port-forwards (Phase 6). Chosen to avoid the
// live components' own cluster-side ports (8000/8091/8092).
export const PORT_FORWARDS: Record<"module1" | "module3" | "actuator", PortForwardTarget> = {
  module1: { service: "service/module1-controller", localPort: 18000, remotePort: 8000 },
  module3: { service: "service/module3-controller", localPort: 18091, remotePort: 8091 },
  actuator: { service: "service/actuator", localPort: 18092, remotePort: 8092 },
};
