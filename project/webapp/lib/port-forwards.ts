import { spawn, type ChildProcess } from "node:child_process";
import { PORT_FORWARDS, type PortForwardTarget } from "@/lib/config";

export type ForwardName = keyof typeof PORT_FORWARDS;
export type ForwardStatus = "stopped" | "starting" | "running" | "crashed";

interface ForwardState {
  process: ChildProcess | null;
  status: ForwardStatus;
  lastError: string | null;
  lastStartAttempt: number;
}

const RESTART_BACKOFF_MS = 5000;
const NAMESPACE = "default";

// Module-scope singleton: as long as this Next.js server process keeps
// running (next dev / next start - a single long-lived Node process, not a
// per-request serverless function), these three `kubectl port-forward`
// child processes persist across requests instead of being spawned fresh
// each time. Lazily started on the first /api/live/state request, not at
// server boot, so nothing runs in the background until someone actually
// opens the Live Run page. Read-only: this only ever forwards a port to
// poll each component's own GET /state or /risk - it never sends kubectl
// a write/PATCH of any kind.
const state: Record<ForwardName, ForwardState> = {
  module1: { process: null, status: "stopped", lastError: null, lastStartAttempt: 0 },
  module3: { process: null, status: "stopped", lastError: null, lastStartAttempt: 0 },
  actuator: { process: null, status: "stopped", lastError: null, lastStartAttempt: 0 },
};

function startForward(name: ForwardName, target: PortForwardTarget): void {
  const s = state[name];
  if (s.process) return;
  if (Date.now() - s.lastStartAttempt < RESTART_BACKOFF_MS) return;
  s.lastStartAttempt = Date.now();
  s.status = "starting";
  s.lastError = null;

  let proc: ChildProcess;
  try {
    proc = spawn(
      "kubectl",
      ["port-forward", "-n", NAMESPACE, target.service, `${target.localPort}:${target.remotePort}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    s.status = "crashed";
    s.lastError = err instanceof Error ? err.message : String(err);
    return;
  }

  s.process = proc;

  proc.stdout?.on("data", (chunk: Buffer) => {
    // kubectl prints "Forwarding from 127.0.0.1:PORT -> REMOTE" once the
    // tunnel is actually up - that's the only signal we treat as "running"
    // rather than just "the process started".
    if (chunk.toString().includes("Forwarding from")) {
      s.status = "running";
    }
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    s.lastError = chunk.toString().trim().slice(0, 500);
  });
  proc.on("exit", (code) => {
    s.status = "crashed";
    s.process = null;
    s.lastError = s.lastError ?? `kubectl port-forward exited (code ${code})`;
  });
  proc.on("error", (err) => {
    s.status = "crashed";
    s.process = null;
    s.lastError = err.message; // e.g. ENOENT when kubectl isn't on PATH
  });
}

/** Idempotent - safe to call on every /api/live/state request. */
export function ensurePortForwardsStarted(): void {
  (Object.keys(PORT_FORWARDS) as ForwardName[]).forEach((name) => {
    const s = state[name];
    if (s.status === "stopped" || s.status === "crashed") {
      startForward(name, PORT_FORWARDS[name]);
    }
  });
}

/**
 * Called by the /api/live/state route once it knows whether each component
 * actually answered - a stronger, more direct signal than parsing kubectl's
 * own stdout for "Forwarding from", which can miss a tunnel that was
 * already up before this process started managing forwards (e.g. a
 * leftover port-forward from an earlier manual session already bound to
 * the same local port, so our own spawn never gets to print anything
 * useful even though the port works fine).
 */
export function reportForwardHealthy(name: ForwardName): void {
  state[name].status = "running";
  state[name].lastError = null;
}

export function getForwardStatuses(): Record<ForwardName, { status: ForwardStatus; lastError: string | null }> {
  return {
    module1: { status: state.module1.status, lastError: state.module1.lastError },
    module3: { status: state.module3.status, lastError: state.module3.lastError },
    actuator: { status: state.actuator.status, lastError: state.actuator.lastError },
  };
}
