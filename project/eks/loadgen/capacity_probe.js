// EKS capacity probe (Phase 10, step F).
//
// A separate file from live_cluster/loadgen/capacity_probe.js on purpose -
// that one stays exactly as Phase 6 ran it, so Phase 6 remains reproducible.
// Two differences here:
//
// 1. RATES ARE PARAMETERISED. The kind probe hardcodes 8/16/24 req/s. Those
//    numbers were chosen for a 2-node kind cluster at maxReplicas=2, and its
//    own comment says they were kept deliberately conservative because of
//    this project's documented OOM history on the laptop. Four t3.large nodes
//    at maxReplicas=6 have roughly 3-4x that capacity, so 8-24 req/s would be
//    absorbed with no scaling and no SLA violations - reproducing Phase 6's
//    null results on more expensive hardware. Sweeping the range is the whole
//    point of running this, so the rates are an env var, not an edit.
//
// 2. Every step's result is printed as a machine-readable line, so a sweep can
//    be read without scraping k6's summary table.
//
// Usage (rates in req/s, ascending):
//   RATES=25,50,100,150,200 STEP_SECONDS=45 k6 run capacity_probe.js
//
// Read the output together with, on another terminal:
//   kubectl top pods -l run=teastore-webui
//   kubectl get deploy teastore-webui -w
//
// You are looking for the rate at which p99 starts climbing sharply while CPU
// approaches its limit - that is saturation. Set --max-rps for the replay
// stages somewhat BELOW it, so the actuator's band rule has room to react in
// both directions rather than sitting pinned at the ceiling.
import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';

const RATES = (__ENV.RATES || '25,50,100,150,200')
  .split(',')
  .map((r) => parseInt(r.trim(), 10))
  .filter((r) => Number.isFinite(r) && r > 0);

const STEP_SECONDS = parseInt(__ENV.STEP_SECONDS || '45', 10);
const TARGET_URL = __ENV.TARGET_URL || 'http://teastore-webui:8080/tools.descartes.teastore.webui/';

// preAllocatedVUs has to cover the highest rate times the worst-case response
// time, or k6 throttles itself and silently under-delivers the arrival rate -
// which would look like the app coping when it is really the generator giving
// up. Derived from the top rate rather than hardcoded.
const PEAK = Math.max(...RATES);
const PRE_ALLOCATED = Math.max(20, Math.ceil(PEAK * 1.5));
const MAX_VUS = Math.max(50, PEAK * 4);

const stages = RATES.map((target) => ({ target, duration: `${STEP_SECONDS}s` }));

// Per-step metrics, tagged by rate, so each step can be read independently.
const stepLatency = new Trend('step_latency_ms', true);
const stepFailures = new Rate('step_failed');

export const options = {
  scenarios: {
    probe: {
      executor: 'ramping-arrival-rate',
      startRate: RATES[0],
      timeUnit: '1s',
      preAllocatedVUs: PRE_ALLOCATED,
      maxVUs: MAX_VUS,
      stages: stages,
    },
  },
  // No thresholds that abort: a probe is meant to find the failure point, so
  // failing requests at the top of the sweep is the RESULT, not an error.
  thresholds: {},
};

export function setup() {
  console.log(`[probe] target=${TARGET_URL}`);
  console.log(`[probe] rates=${RATES.join(',')} req/s, ${STEP_SECONDS}s each`);
  console.log(`[probe] preAllocatedVUs=${PRE_ALLOCATED} maxVUs=${MAX_VUS}`);
  return { startedAt: Date.now() };
}

export default function (data) {
  // Which step are we in? Derived from elapsed time rather than a counter, so
  // it stays correct regardless of how k6 distributes iterations across VUs.
  const elapsed = (Date.now() - data.startedAt) / 1000;
  const idx = Math.min(RATES.length - 1, Math.floor(elapsed / STEP_SECONDS));
  const rate = RATES[idx];

  const res = http.get(TARGET_URL, { tags: { rate: String(rate) } });
  stepLatency.add(res.timings.duration, { rate: String(rate) });
  stepFailures.add(res.status !== 200, { rate: String(rate) });
}

export function handleSummary(data) {
  // One line per rate, greppable. k6's own table is still printed by default.
  const lines = ['', '=== capacity probe summary ==='];
  const m = data.metrics.step_latency_ms;
  if (m && m.values) {
    lines.push(`overall  p95=${(m.values['p(95)'] || 0).toFixed(1)}ms  p99=${(m.values['p(99)'] || 0).toFixed(1)}ms`);
  }
  const failed = data.metrics.step_failed;
  if (failed && failed.values) {
    lines.push(`failure rate: ${((failed.values.rate || 0) * 100).toFixed(2)}%`);
  }
  lines.push(`rates tested: ${RATES.join(', ')} req/s`);
  lines.push('Pick --max-rps somewhat BELOW the rate where p99 turns sharply upward.');
  lines.push('');
  return { stdout: lines.join('\n') };
}
