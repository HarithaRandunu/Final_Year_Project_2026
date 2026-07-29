// Phase 6 capacity probe (docs/Phase6_Ablation_Design.md Section 5, step 1).
// Not an ablation trial - just three short, fixed-RPS steps against
// teastore-webui at its current replica count, to observe CPU utilization
// and p99 latency and pick a target RPS range the actuator's band rule
// actually has room to react within (neither always-idle nor
// always-saturated). Kept deliberately short (~2.25 min total) so a bad
// guess costs a few minutes, not an hour. Starting more conservatively
// than the first Phase 6 attempt's probe did - maxReplicas is now 2, not
// 3, per Phase 5's third rebuild (see Full_Plan.md Section 11), so the
// worst-case peak (2+2 replicas instead of 3+3) is already much safer,
// but there's no reason to re-test the higher end that caused problems
// before.
import http from 'k6/http';

export const options = {
  scenarios: {
    probe: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 15,
      maxVUs: 40,
      stages: [
        { target: 8, duration: '45s' },
        { target: 16, duration: '45s' },
        { target: 24, duration: '45s' },
      ],
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || 'http://teastore-webui:8080/tools.descartes.teastore.webui/';

export default function () {
  http.get(TARGET_URL);
}
