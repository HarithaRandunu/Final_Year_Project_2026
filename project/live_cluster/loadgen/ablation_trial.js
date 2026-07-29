// Phase 6 ablation trial load generator (docs/Phase6_Ablation_Design.md
// Section 4). Unlike capacity_probe.js's hardcoded fixed steps, this
// reads its stage list from the STAGES_JSON env var (built per-run by
// run_trial.py from generate_replay_stages.py's block-averaged replay
// curve) so the same script serves every arm/trial without editing.
import http from 'k6/http';

const stages = JSON.parse(__ENV.STAGES_JSON);

export const options = {
  scenarios: {
    replay: {
      executor: 'ramping-arrival-rate',
      startRate: stages[0].target,
      timeUnit: '1s',
      preAllocatedVUs: 20,
      maxVUs: 50,
      stages: stages,
    },
  },
};

const TARGET_URL = __ENV.TARGET_URL || 'http://teastore-webui:8080/tools.descartes.teastore.webui/';

export default function () {
  http.get(TARGET_URL);
}
