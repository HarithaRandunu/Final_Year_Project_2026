import path from "node:path";
import { readCsv, readJson, type CsvRow } from "@/lib/data";
import { RESULTS_DIR, RESULTS_V2_DIR } from "@/lib/config";
import type { Arm } from "@/lib/colors";

// ---------------------------------------------------------------------------
// Module 1 - Signal Fusion & Risk Scoring
// ---------------------------------------------------------------------------

export interface Module1WalkForwardFold {
  fold: number;
  train_size: number;
  test_size: number;
  fused_auc_roc: number | null;
  fused_auc_pr: number | null;
  baseline_auc_roc: number | null;
  baseline_auc_pr: number | null;
}

export interface Module1ShapSignalCheck {
  signal: string;
  family_perturbed: string[];
  baseline_risk: number;
  perturbed_risk: number;
  risk_increased: boolean;
  family_shap_baseline: number;
  family_shap_perturbed: number;
  family_rank_by_shap: number;
  dominant_feature_overall: string;
  correctly_attributed: boolean;
  pass: boolean;
}

export interface Module1Metrics {
  tag: string;
  holdout: {
    fused_auc_roc: number;
    fused_auc_pr: number;
    fused_brier: number;
    baseline_auc_roc: number;
    baseline_auc_pr: number;
    baseline_brier: number;
    note: string;
  };
  walk_forward: {
    folds: Module1WalkForwardFold[];
    mean_fused_auc_roc: number;
    mean_fused_auc_pr: number;
    mean_baseline_auc_roc: number;
    mean_baseline_auc_pr: number;
  };
  lead_time_comparison: {
    target_alert_rate: number;
    fused_threshold: number;
    baseline_threshold: number;
    n_episodes: number;
    mean_fused_lead_time: number;
    mean_baseline_lead_time: number;
    fused_beats_baseline: boolean;
  };
  generalization_check: {
    tag: string;
    n_train: number;
    n_test: number;
    auc_roc: number;
    auc_pr: number;
    brier_score: number;
  };
  shap_sanity_check: {
    per_signal: Module1ShapSignalCheck[];
    n_tested: number;
    n_pass: number;
    all_pass: boolean;
  };
  pass_criteria: {
    fused_beats_cpu_baseline_auc_pr_holdout: boolean;
    fused_beats_cpu_baseline_auc_pr_walkforward: boolean;
    lead_time_positive_and_beats_baseline: boolean;
    shap_sanity_check_all_pass: boolean;
    shap_sanity_check_majority_pass: boolean;
  };
}

export function loadModule1(): Module1Metrics | null {
  return readJson<Module1Metrics>(path.join(RESULTS_DIR, "module1", "primary", "metrics.json"));
}

// ---------------------------------------------------------------------------
// Module 2 - Co-Scheduling / Discounted Thompson Sampling
// ---------------------------------------------------------------------------

export interface Module2Metrics {
  n_static_batch_init_events: number;
  n_churn_events_total: number;
  n_usable_events: number;
  regret_validation: {
    n_rounds: number;
    final_cumulative_regret: { combined_system: number; random: number; heuristic_only: number };
    mean_reward: {
      combined_system: number;
      random: number;
      heuristic_only: number;
      oracle: number;
    };
  };
  discounted_vs_vanilla_ablation: {
    sub_window_buckets: number[];
    n_rounds_in_window: number;
    discounted_mean_reward_in_window: number;
    vanilla_mean_reward_in_window: number;
    discounted_mean_reward_full: number;
    vanilla_mean_reward_full: number;
    discounted_beats_vanilla_in_window: boolean;
  };
  convergence_check: {
    rolling_window: number;
    entropy_at_first_full_window: number;
    final_rolling_entropy: number;
    max_possible_entropy: number;
    entropy_at_shift_start: number;
    converges: boolean;
  };
  pass_criteria: {
    combined_beats_random_and_heuristic_regret: boolean;
    discounted_beats_vanilla_on_shift_window: boolean;
  };
}

export interface Module2RankInversion {
  gamma_discounted: number;
  gamma_vanilla: number;
  n_arms: number;
  rounds_per_phase: number;
  recovery_window_rounds: number;
  n_repeats: number;
  phase1_means: number[];
  phase2_means: number[];
  recovery_window: {
    discounted_mean: number;
    vanilla_mean: number;
    win_rate_discounted: number;
    mean_diff: number;
    wilcoxon_statistic: number;
    wilcoxon_pvalue_one_sided_greater: number;
  };
  post_inversion_full_phase: {
    discounted_mean: number;
    vanilla_mean: number;
    win_rate_discounted: number;
    mean_diff: number;
    wilcoxon_statistic: number;
    wilcoxon_pvalue_one_sided_greater: number;
  };
  pass_criteria: {
    discounted_beats_vanilla_recovery_window: boolean;
    discounted_beats_vanilla_full_post_inversion: boolean;
  };
}

export function loadModule2(): Module2Metrics | null {
  return readJson<Module2Metrics>(path.join(RESULTS_DIR, "module2", "metrics.json"));
}

export function loadModule2RankInversion(): Module2RankInversion | null {
  return readJson<Module2RankInversion>(
    path.join(RESULTS_DIR, "module2", "synthetic_rank_inversion.json"),
  );
}

// ---------------------------------------------------------------------------
// Module 3 - Adaptive Control / PI + Conformal + Oscillation Widening
// ---------------------------------------------------------------------------

export interface Module3ArmComparison {
  instability_reversals: number;
  deviation_std: number;
  over_provisioning_timeshare: number;
  under_provisioning_timeshare: number;
}

export interface Module3Metrics {
  tag: string;
  n_holdout_rows: number;
  n_holdout_violations: number;
  n_bursty_rows: number;
  n_bursty_violations: number;
  isolated_pi_test: { responds_to_step: boolean; bounded: boolean; final_value: number };
  coverage_check: {
    target_coverage: number;
    empirical_coverage: number;
    n_points: number;
    close_to_target: boolean;
  };
  step_response_test: {
    pre_step_value: number;
    final_value: number;
    overshoot: number;
    settling_time_steps: number;
    bounded: boolean;
  };
  three_way_comparison: {
    fixed: Module3ArmComparison;
    pi_conformal: Module3ArmComparison;
    full: Module3ArmComparison;
  };
  sensitivity_check: {
    correlation_reversal_count_vs_widened_width: number;
    max_reversal_count: number;
    widened_width_at_max_reversal: number;
    widened_width_before_max_reversal: number;
    widens_after_reversal_spike: boolean;
  };
  pass_criteria: {
    pi_responds_and_bounded: boolean;
    coverage_close_to_target: boolean;
    step_response_bounded: boolean;
    full_beats_pi_conformal_instability: boolean;
    widens_after_reversal_spike: boolean;
  };
  deviation_dampening_effect: {
    full_deviation_lower_than_pi_conformal: boolean;
    full_deviation_std: number;
    pi_conformal_deviation_std: number;
  };
}

export interface Module3MultiBurst {
  n_bursts_per_repeat: number;
  n_repeats: number;
  avg_rows_per_repeat: number;
  reversal_count: {
    pi_conformal_mean: number;
    full_mean: number;
    full_strictly_lower_rate: number;
    tie_rate: number;
    full_strictly_higher_rate: number;
    full_never_worse_rate: number;
    mean_diff_pi_minus_full: number;
    wilcoxon_statistic: number;
    wilcoxon_pvalue_one_sided_greater: number;
  };
  deviation_std: {
    pi_conformal_mean: number;
    full_mean: number;
    full_lower_rate: number;
    mean_diff_pi_minus_full: number;
    wilcoxon_statistic: number;
    wilcoxon_pvalue_one_sided_greater: number;
  };
  pass_criteria: {
    full_beats_pi_conformal_instability_synthetic: boolean;
    full_beats_pi_conformal_deviation_synthetic: boolean;
  };
}

export function loadModule3(): Module3Metrics | null {
  return readJson<Module3Metrics>(path.join(RESULTS_DIR, "module3", "metrics.json"));
}

export function loadModule3MultiBurst(): Module3MultiBurst | null {
  return readJson<Module3MultiBurst>(path.join(RESULTS_DIR, "module3", "synthetic_multi_burst.json"));
}

// ---------------------------------------------------------------------------
// Integration - Simulated Closed Loop
// ---------------------------------------------------------------------------

export interface IntegrationMetrics {
  tag: string;
  coherence_checks: {
    decision_log_rows: number;
    decision_log_covers_full_trace: boolean;
    decision_log_no_nans: boolean;
    decision_log_risk_in_bounds: boolean;
    placement_log_rows: number;
    placement_log_context_matched: boolean;
    placement_log_rewards_in_bounds: boolean;
    trajectory_rows: number;
    trajectory_covers_full_trace: boolean;
    trajectory_no_nans: boolean;
    trajectory_threshold_bounded: boolean;
    m1_m3_predicted_risk_consistent: boolean;
    trajectory_alert_flag_consistent: boolean;
    all_checks_passed: boolean;
  };
  summary_stats: {
    n_buckets: number;
    n_placement_rounds: number;
    n_alerts: number;
    mean_predicted_risk: number;
    mean_placement_reward: number;
    final_threshold: number;
  };
}

export function loadIntegration(): IntegrationMetrics | null {
  return readJson<IntegrationMetrics>(path.join(RESULTS_DIR, "integration", "metrics.json"));
}

// ---------------------------------------------------------------------------
// Phase 7 - Ablation study statistical analysis (both results/ and results_v2/)
// ---------------------------------------------------------------------------

export type AblationMetricKey =
  | "sla_violation_count"
  | "p99_latency_ms"
  | "cost_proxy_pod_seconds"
  | "instability_reversals"
  | "deviation_std"
  | "over_provisioning_timeshare"
  | "under_provisioning_timeshare";

export const ABLATION_METRIC_LABELS: Record<AblationMetricKey, string> = {
  sla_violation_count: "SLA violations (count)",
  p99_latency_ms: "P99 latency (ms)",
  cost_proxy_pod_seconds: "Cost proxy (pod-seconds)",
  instability_reversals: "Instability reversals (count)",
  deviation_std: "Deviation std. dev.",
  over_provisioning_timeshare: "Over-provisioning time share",
  under_provisioning_timeshare: "Under-provisioning time share",
};

export const ABLATION_METRIC_EXPLANATIONS: Record<AblationMetricKey, string> = {
  sla_violation_count:
    "How many times the app breached its latency target during the trial. Lower is better.",
  p99_latency_ms:
    "The worst-case (99th percentile) response time recorded during the trial, in milliseconds. Lower is better.",
  cost_proxy_pod_seconds:
    "Total replica-seconds run during the trial (replica count x seconds each ran) - a stand-in for compute cost. Lower is better.",
  instability_reversals:
    "How many times the scheduler reversed a scale-up into a scale-down (or vice versa) in quick succession - a sign of a jittery controller. Lower is better.",
  deviation_std:
    "How much the replica count swung around its own trend line - a second, complementary way to measure jitter. Lower is better.",
  over_provisioning_timeshare:
    "Fraction of the trial spent running more replicas than the load actually needed. Lower is better.",
  under_provisioning_timeshare:
    "Fraction of the trial spent running fewer replicas than the load needed (the direct cause of SLA violations). Lower is better.",
};

export interface OmnibusTest {
  metric: string;
  test: string;
  statistic: number;
  pvalue: number;
  "significant_at_0.05": boolean;
  arm_means: Record<Arm, number>;
  arm_medians: Record<Arm, number>;
}

export interface PairwiseComparison {
  arm_a: Arm;
  arm_b: Arm;
  mean_a: number;
  mean_b: number;
  u_statistic: number;
  pvalue_raw: number;
  effect_size_rank_biserial: number;
  pvalue_bh_adjusted: number;
  "significant_bh_0.05": boolean;
}

export interface AblationDecomposition {
  metric: string;
  baseline_mean: number;
  delta_from_baseline: Record<Arm, number>;
  full_mean: number;
  single_module_means: Record<"m1_only" | "m2_only" | "m3_only", number>;
  full_beats_all_single_modules: boolean;
}

export interface StatisticalAnalysis {
  metadata: {
    n_trials_total: number;
    n_trials_per_arm: Record<Arm, number>;
    arms: Arm[];
    workload_type: string;
    power_caveat: string;
  };
  omnibus_tests: Record<AblationMetricKey, OmnibusTest>;
  pairwise_comparisons: Record<AblationMetricKey, PairwiseComparison[]>;
  ablation_decomposition: Record<AblationMetricKey, AblationDecomposition>;
}

export type AblationStudy = "v1" | "v2";

export function loadStatisticalAnalysis(study: AblationStudy): StatisticalAnalysis | null {
  const dir = study === "v1" ? RESULTS_DIR : RESULTS_V2_DIR;
  return readJson<StatisticalAnalysis>(path.join(dir, "phase7", "statistical_analysis.json"));
}

export function loadTrialLevelData(study: AblationStudy): CsvRow[] | null {
  const dir = study === "v1" ? RESULTS_DIR : RESULTS_V2_DIR;
  return readCsv(path.join(dir, "phase7", "trial_level_data.csv"));
}

export const ABLATION_STUDY_LABELS: Record<AblationStudy, string> = {
  v1: "Original study (replica ceiling 2)",
  v2: "Follow-up study (replica ceiling 3)",
};

// ---------------------------------------------------------------------------
// Live Run page - one recorded trial used as the "recorded reference" trace
// (see docs/WebApp_Plan_MultiSignal_Autoscaling.md's "why baseline and full
// can't run live, simultaneously" section: this app can only ever show one
// side of the comparison live, so the other side is a real recorded trial,
// not a live second cluster).
// ---------------------------------------------------------------------------

// A full-arm trial from the primary study (replica ceiling 2), picked
// because it has real (non-null) risk/threshold values across its full
// 30-bucket trajectory - see docs/WebApp_Progress_Trace_MultiSignal_Autoscaling.md's
// Phase 6 section for how it was selected.
const REFERENCE_TRIAL_DIR = "2026-07-28T20-41-11_full_scaleup2_t2";

export interface ReferenceTrial {
  run_id: string;
  arm: string;
  run_tag: string;
  replica_trajectory: { t: string; replicas: number }[];
  module1_predicted_risk_trace: (number | null)[];
  module3_threshold_trace: (number | null)[];
  sla_violation_count: number;
  p99_latency_ms: number;
  cost_proxy_pod_seconds: number;
}

export function loadReferenceTrial(): ReferenceTrial | null {
  return readJson<ReferenceTrial>(
    path.join(RESULTS_DIR, "ablation", REFERENCE_TRIAL_DIR, "metrics.json"),
  );
}

export interface TimePoint {
  /** Seconds elapsed since this trial's own first recorded bucket. */
  t: number;
  v: number | null;
}

export interface ReferenceTimeSeries {
  risk: TimePoint[];
  threshold: TimePoint[];
  replicas: TimePoint[];
}

/**
 * Pairs the trial's risk/threshold/replica arrays (parallel, one entry per
 * bucket) with real elapsed time computed from `replica_trajectory`'s own
 * per-bucket timestamps - so this trial's line and the live line can share
 * one "seconds since each one's own start" axis, even though they're two
 * different runs recorded on two different days.
 */
export function getReferenceTimeSeries(trial: ReferenceTrial): ReferenceTimeSeries {
  const buckets = trial.replica_trajectory;
  const startMs = buckets.length > 0 ? new Date(buckets[0].t).getTime() : 0;
  const elapsedAt = (i: number) => (new Date(buckets[i].t).getTime() - startMs) / 1000;

  return {
    risk: buckets.map((_, i) => ({ t: elapsedAt(i), v: trial.module1_predicted_risk_trace[i] ?? null })),
    threshold: buckets.map((_, i) => ({ t: elapsedAt(i), v: trial.module3_threshold_trace[i] ?? null })),
    replicas: buckets.map((b, i) => ({ t: elapsedAt(i), v: b.replicas })),
  };
}

/**
 * Builds a URL for `app/api/results/image/[...segments]/route.ts` from a
 * path relative to `project/results/` (or `results_v2/` when `study` is
 * "v2") - e.g. `resultImageUrl("module1/primary/calibration.png")`.
 */
export function resultImageUrl(relativePath: string, study: AblationStudy = "v1"): string {
  const root = study === "v1" ? "results" : "results_v2";
  return `/api/results/image/${root}/${relativePath}`;
}
