// Demo-only load generator, split off from ablation_trial.js (2026-08-12) so
// this can be tuned without touching the script the completed, published
// Phase 6 ablation study (results/, results_v2/) used. Same STAGES_JSON
// pattern, but maxVUs/preAllocatedVUs raised: ablation_trial.js's maxVUs=50
// was VU-starved once real latency degraded, capping achieved throughput
// well below the target rate. Target rate here is chosen to match the
// training data's own HTTP_MCR range (~140-157 calls/s, from
// features_primary.parquet) instead of an arbitrary guess.
import http from 'k6/http';

const stages = JSON.parse(__ENV.STAGES_JSON);

export const options = {
  scenarios: {
    replay: {
      executor: 'ramping-arrival-rate',
      startRate: stages[0].target,
      timeUnit: '1s',
      preAllocatedVUs: 80,
      maxVUs: 250,
      stages: stages,
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || 'http://teastore-webui:8080/tools.descartes.teastore.webui/';

export default function () {
  http.get(TARGET_URL);
}
