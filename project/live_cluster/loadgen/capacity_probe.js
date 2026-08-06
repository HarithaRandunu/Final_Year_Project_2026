// Phase 6 capacity probe (docs/Phase6_Ablation_Design.md Section 5, step 1).
// Not an ablation trial - just short, fixed-RPS steps against teastore-webui
// at its current replica count, to observe CPU utilization and p99 latency
// and pick a target RPS range the actuator's band rule actually has room to
// react within (neither always-idle nor always-saturated). Kept deliberately
// short so a bad guess costs a few minutes, not an hour.
//
// Re-tuned 2026-07-30 for the results_v2 study (webui maxReplicas 2->3).
// The 8/16/24 steps below were calibrated to a 2-replica ceiling and are
// no longer trusted to find the new saturation point - 3 replicas is more
// compute capacity, so the same load may no longer produce meaningful
// scaling. One higher step (32) added to test whether the ceiling actually
// moved; NOT pushed further than that given this project's own documented
// history at this exact configuration: maxReplicas was originally 3 for
// BOTH teastore-webui and teastore-image simultaneously, 3+3=6 replicas
// caused a real problem on this host, and the ceiling was lowered to 2 as
// the fix (see this file's git history / Full_Plan.md Section 11). This
// study's mitigation is different - teastore-image is now pinned to a
// fixed 1 (see teastore/hpa-baseline.yaml, teastore/keda-baseline.yaml),
// removing the compounding 3+3 case rather than lowering webui's own
// ceiling - but the underlying host memory constraint that caused the
// original incident hasn't changed, so this probe stays conservative.
import http from 'k6/http';

export const options = {
  scenarios: {
    probe: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      stages: [
        { target: 8, duration: '45s' },
        { target: 16, duration: '45s' },
        { target: 24, duration: '45s' },
        { target: 32, duration: '45s' },
      ],
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || 'http://teastore-webui:8080/tools.descartes.teastore.webui/';

export default function () {
  http.get(TARGET_URL);
}
