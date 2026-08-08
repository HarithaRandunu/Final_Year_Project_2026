import { PORT_FORWARDS } from "@/lib/config";

// Response shapes mirror project/live_cluster/{module1_controller,
// module3_controller,actuator}/app.py's do_GET handlers exactly - see each
// file's Handler.do_GET for the source of truth. Fields this app doesn't
// display are still typed so nothing here silently drifts from what the
// live components actually return.

export interface Module1RiskResponse {
  predicted_risk: number | null;
  last_bucket: Record<string, number> | null;
  error: string | null;
}

export interface Module2BanditState {
  gamma: number;
  alpha: Record<string, number>;
  beta: Record<string, number>;
  pulls: Record<string, number>;
  posterior_mean: Record<string, number>;
  reward_updates_applied: number;
}

export interface Module3StateResponse {
  mode: string;
  control_signal: number | null;
  predicted_risk: number | null;
  violation_now: number | null;
  score_vs_previous_forecast: number | null;
  conformal_width: number | null;
  covered: boolean | null;
  reversal_count: number;
  widening_multiplier: number;
  aci_alpha: number;
  threshold: number;
  alert: boolean;
  cycles: number;
  module2_bandit_state: Module2BanditState | null;
  error: string | null;
}

export interface ActuatorStateResponse {
  arm: string;
  signal: number | null;
  threshold: number | null;
  replicas: number;
  decision: "hold" | "scale_up" | "scale_down";
  cooling_down: boolean;
  cycles: number;
  last_updated: number;
}

async function fetchJson<T>(url: string, timeoutMs = 2500): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface ComponentFetch<T> {
  reachable: boolean;
  data: T | null;
  error: string | null;
}

async function fetchComponent<T>(url: string): Promise<ComponentFetch<T>> {
  try {
    const data = await fetchJson<T>(url);
    return { reachable: true, data, error: null };
  } catch (err) {
    return { reachable: false, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchLiveState(): Promise<{
  module1: ComponentFetch<Module1RiskResponse>;
  module3: ComponentFetch<Module3StateResponse>;
  actuator: ComponentFetch<ActuatorStateResponse>;
}> {
  const [module1, module3, actuator] = await Promise.all([
    fetchComponent<Module1RiskResponse>(`http://127.0.0.1:${PORT_FORWARDS.module1.localPort}/risk`),
    fetchComponent<Module3StateResponse>(`http://127.0.0.1:${PORT_FORWARDS.module3.localPort}/state`),
    fetchComponent<ActuatorStateResponse>(`http://127.0.0.1:${PORT_FORWARDS.actuator.localPort}/state`),
  ]);
  return { module1, module3, actuator };
}
