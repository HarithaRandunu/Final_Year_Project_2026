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

export const TARGET_DEPLOYMENT = "teastore-webui";

// Mirrors project/live_cluster/module3_controller/app.py's THRESHOLD_BOUNDS and
// actuator/app.py's MIN_REPLICAS/MAX_REPLICAS - module-level constants never
// included in those components' own /state JSON, so duplicated here. Keep in
// sync if the live-cluster components ever change them.
export const MODULE3_THRESHOLD_BOUNDS: [number, number] = [0.01, 0.9];
export const ACTUATOR_REPLICA_BOUNDS: [number, number] = [1, 3];

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
