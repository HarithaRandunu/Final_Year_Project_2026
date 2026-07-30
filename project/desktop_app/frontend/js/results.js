// Results page (Milestone 1): Training Results + Ablation Results, ported
// from project/dashboard/pages/1_Training_Results.py and 2_Ablation_Results.py.
// No computation happens here - every number/chart comes from the backend's
// /api/results/* endpoints, which just re-serve the same results/**/*.json
// files those Streamlit pages read.

const resultsState = { training: null, ablation: null, loaded: false, loadError: null };

function fmtNum(v, d = 3) {
  return v === null || v === undefined ? "—" : Number(v).toFixed(d);
}

function imgUrl(moduleKey, filename) {
  return `/api/results/image/${moduleKey}/${filename}`;
}

async function loadResultsPage() {
  if (!resultsState.loaded) {
    // Only the visible subpage gets a placeholder. renderAblation() shows its
    // own when the user opens that tab; seeding one here would leave a spinner
    // parked in a hidden subpage that nothing ever clears.
    showSpinner("training-content", "Reading results from disk…");
    try {
      resultsState.training = await fetch("/api/results/training").then((r) => r.json());
    } catch (err) {
      resultsState.loadError = err.message;
    }
    try {
      const r = await fetch("/api/results/ablation");
      resultsState.ablation = r.ok ? await r.json() : null;
    } catch {
      resultsState.ablation = null;
    }
    resultsState.loaded = true;
  }
  switchResultsSubpage("training");
  switchTrainingTab("integration");
}

function switchResultsSubpage(name) {
  document.querySelectorAll("#page-results .subnav-btn").forEach((b) => b.classList.toggle("active", b.dataset.subpage === name));
  document.querySelectorAll("#page-results .subpage").forEach((p) => p.classList.toggle("active", p.id === `results-${name}`));
  if (name === "ablation") renderAblation();
}

function switchTrainingTab(name) {
  document.querySelectorAll("#results-training .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  const el = document.getElementById("training-content");
  const data = resultsState.training;
  if (!data) {
    el.innerHTML = resultsState.loadError
      ? `<p class="warn">Could not read results: ${resultsState.loadError}</p>`
      : spinnerHTML("Reading results from disk…");
    return;
  }
  const renderers = { integration: renderIntegrationTab, module1: renderModule1Tab, module2: renderModule2Tab, module3: renderModule3Tab };
  el.innerHTML = renderers[name](data[name]);
  wireImageSpinners(el);
}

/** Exported research plots are PNGs read off disk; on a cold file cache they
 *  take long enough to leave visible empty boxes. Each figure gets a spinner
 *  that clears on load, so the page never looks broken mid-load. */
function wireImageSpinners(root) {
  root.querySelectorAll("figure.img-figure").forEach((fig) => {
    const img = fig.querySelector("img");
    const overlay = fig.querySelector(".spinner-wrap");
    if (!img || !overlay) return;
    const done = () => overlay.remove();
    if (img.complete) done();
    else {
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", () => {
        overlay.innerHTML = '<span class="warn">Plot not generated yet</span>';
      }, { once: true });
    }
  });
}

function statCard(label, value) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;
}

function imageGrid(moduleKey, filenames, captions) {
  if (!filenames || filenames.length === 0) return "";
  return `<div class="image-grid">${filenames
    .map(
      (f, i) => `<figure class="img-figure" style="position:relative;min-height:180px">
        ${spinnerHTML("Loading plot…", "overlay")}
        <img src="${imgUrl(moduleKey, f)}" alt="${captions[i] || f}">
        <figcaption>${captions[i] || f}</figcaption></figure>`
    )
    .join("")}</div>`;
}

/** Wraps a table so it scrolls inside itself on a narrow window instead of
 *  making the whole page scroll sideways. */
function tableWrap(inner) {
  return `<div class="table-wrap">${inner}</div>`;
}

function renderIntegrationTab(d) {
  if (!d) return `<p class="warn">No results found at results/integration/metrics.json</p>`;
  const checks = d.coherence_checks;
  const rows = Object.entries(checks)
    .filter(([, v]) => typeof v === "boolean")
    .map(([k, v]) => `<tr><td>${k}</td><td>${v ? "✅" : "❌"}</td></tr>`)
    .join("");
  const s = d.summary_stats;
  return `
    <p>Phase 4 wires all three already-validated modules together and checks the result for mutual
    consistency - the project's own solution as one system, not three modules validated in isolation.</p>
    ${STATUS_KEY_HTML}
    <h3>Coherence checks</h3>
    <p>Overall: ${criterionBlock("integration", "all_checks_passed", checks.all_checks_passed)}</p>
    ${tableWrap(`<table class="data-table"><thead><tr><th>Check</th><th>Passed</th></tr></thead><tbody>${rows}</tbody></table>`)}
    <h3>Summary</h3>
    <div class="stat-grid">
      ${statCard("Buckets covered", s.n_buckets)}
      ${statCard("Placement rounds", s.n_placement_rounds)}
      ${statCard("Alerts raised (M3)", s.n_alerts)}
      ${statCard("Mean predicted_risk (M1)", fmtNum(s.mean_predicted_risk, 4))}
      ${statCard("Mean placement reward (M2)", fmtNum(s.mean_placement_reward, 4))}
      ${statCard("Final threshold (M3)", fmtNum(s.final_threshold))}
    </div>
    ${d.has_overview_image ? imageGrid("integration", ["closed_loop_overview.png"], ["Closed-loop overview: predicted_risk, placement, threshold trajectory"]) : ""}
    <p class="caption">This is Phase 4's simulated integration, not the live 25-trial ablation (Phase 6) - see
    the Ablation Results tab for the live study, where the <b>full</b> arm is this same combined system measured
    against baseline/HPA and each module in isolation.</p>
  `;
}

function renderModule1Tab(d) {
  if (!d) return `<p class="warn">No results found at results/module1/primary/metrics.json</p>`;
  const wf = d.walk_forward, lt = d.lead_time_comparison;
  const shap = d.shap_sanity_check;
  const shapRows = shap
    ? shap.per_signal
        .map(
          (r) => `<tr><td>${r.signal}</td><td>${fmtNum(r.baseline_risk, 4)}</td><td>${fmtNum(r.perturbed_risk, 4)}</td>
          <td>${statusIcon(r.correctly_attributed, "module1", "shap_sanity_check_all_pass")}</td>
          <td>${statusIcon(r.pass, "module1", "shap_sanity_check_all_pass")}</td></tr>`
        )
        .join("")
    : "";
  return `
    ${STATUS_KEY_HTML}
    <h3>General model quality</h3>
    <div class="stat-grid">
      ${statCard("Walk-forward mean AUC-PR (fused)", `${fmtNum(wf.mean_fused_auc_pr)} <span class="delta">vs. baseline ${fmtNum(wf.mean_baseline_auc_pr)}</span>`)}
      ${statCard("Walk-forward mean AUC-ROC (fused)", `${fmtNum(wf.mean_fused_auc_roc)} <span class="delta">vs. baseline ${fmtNum(wf.mean_baseline_auc_roc)}</span>`)}
      ${statCard("Lead time (fused vs. CPU-only)", `${fmtNum(lt.mean_fused_lead_time, 2)} buckets <span class="delta">baseline ${fmtNum(lt.mean_baseline_lead_time, 2)}</span>`)}
    </div>
    ${criterionBlock("module1", "lead_time_positive_and_beats_baseline", d.pass_criteria.lead_time_positive_and_beats_baseline, "Lead time beats the CPU-only baseline")}
    <h3>⭐ Individual contribution &mdash; TreeSHAP attribution</h3>
    ${criterionBlock("module1", "shap_sanity_check_majority_pass", d.pass_criteria.shap_sanity_check_majority_pass, "Majority of tested signals correctly attributed")}
    ${criterionBlock("module1", "shap_sanity_check_all_pass", d.pass_criteria.shap_sanity_check_all_pass, "All tested signals correctly attributed (stricter bar)")}
    ${shap ? tableWrap(`<table class="data-table"><thead><tr><th>Signal</th><th>Baseline risk</th><th>Perturbed risk</th>
      <th>Correctly attributed</th><th>Status</th></tr></thead><tbody>${shapRows}</tbody></table>`) : ""}
    <h3>Plots</h3>
    ${imageGrid("module1", d.images, ["Calibration", "SHAP summary", "Walk-forward AUC-PR"])}
  `;
}

function renderModule2Tab(d) {
  if (!d) return `<p class="warn">No results found at results/module2/metrics.json</p>`;
  const regret = d.regret_validation.final_cumulative_regret;
  const dv = d.discounted_vs_vanilla_ablation;
  const synth = d.synthetic_rank_inversion;
  return `
    ${STATUS_KEY_HTML}
    <h3>General bandit quality &mdash; cumulative regret</h3>
    <div class="stat-grid">
      ${statCard("Combined system (final regret)", fmtNum(regret.combined_system, 2))}
      ${statCard("Random policy", fmtNum(regret.random, 2))}
      ${statCard("Heuristic-only", fmtNum(regret.heuristic_only, 2))}
    </div>
    ${criterionBlock("module2", "combined_beats_random_and_heuristic_regret", d.pass_criteria.combined_beats_random_and_heuristic_regret, "Combined system beats both random and heuristic-only")}
    <h3>⭐ Individual contribution &mdash; discounted vs. vanilla Thompson Sampling</h3>
    <div class="stat-grid">
      ${statCard("Discounted TS, real non-stationary window", fmtNum(dv.discounted_mean_reward_in_window))}
      ${statCard("Vanilla TS, same window", fmtNum(dv.vanilla_mean_reward_in_window))}
    </div>
    ${criterionBlock("module2", "discounted_beats_vanilla_on_shift_window", d.pass_criteria.discounted_beats_vanilla_on_shift_window, "Discounted beats vanilla on the real shift window")}
    ${synth ? `
      <h3>Synthetic rank-inversion stress test</h3>
      <p class="caption">Built to isolate the exact condition the real window turned out not to contain:
      node quality ranks genuinely reshuffling mid-run. This is the evidence the starred contribution rests on.</p>
      <div class="stat-grid">
        ${statCard("Win rate, recovery window", `${(synth.recovery_window.win_rate_discounted * 100).toFixed(0)}%`)}
        ${statCard("Discounted mean reward", fmtNum(synth.recovery_window.discounted_mean))}
        ${statCard("Vanilla mean reward", fmtNum(synth.recovery_window.vanilla_mean))}
        ${statCard("Wilcoxon p-value", synth.recovery_window.wilcoxon_pvalue_one_sided_greater.toExponential(1))}
      </div>
      ${criterionBlock("module2", "discounted_beats_vanilla_recovery_window", synth.pass_criteria.discounted_beats_vanilla_recovery_window, "Discounted beats vanilla in the recovery window")}` : ""}
    <h3>Plots</h3>
    ${imageGrid("module2", d.images, ["Regret vs. oracle", "Discounted vs. vanilla", "Node-preference convergence", "Synthetic rank-inversion"])}
  `;
}

function renderModule3Tab(d) {
  if (!d) return `<p class="warn">No results found at results/module3/metrics.json</p>`;
  const cov = d.coverage_check;
  const tw = d.three_way_comparison;
  const synth = d.synthetic_multi_burst;
  return `
    ${STATUS_KEY_HTML}
    <h3>General calibration quality &mdash; conformal coverage</h3>
    <div class="stat-grid">
      ${statCard("Empirical coverage", `${(cov.empirical_coverage * 100).toFixed(1)}% <span class="delta">target ${(cov.target_coverage * 100).toFixed(0)}%</span>`)}
    </div>
    ${criterionBlock("module3", "coverage_close_to_target", d.pass_criteria.coverage_close_to_target, "Empirical coverage close to target")}
    <h3>⭐ Individual contribution &mdash; oscillation-conditioned widening</h3>
    <div class="stat-grid">
      ${statCard("Fixed &mdash; reversals", tw.fixed.instability_reversals)}
      ${statCard("PI+conformal &mdash; reversals", tw.pi_conformal.instability_reversals)}
      ${statCard("Full design &mdash; reversals", tw.full.instability_reversals)}
    </div>
    ${criterionBlock("module3", "full_beats_pi_conformal_instability", d.pass_criteria.full_beats_pi_conformal_instability, "Full design beats PI+conformal on reversal count (real data)")}
    <p class="caption">Deviation std does still drop monotonically with widening strength on the real data
    (full ${fmtNum(tw.full.deviation_std)} vs. PI-only ${fmtNum(tw.pi_conformal.deviation_std)}) &mdash; the
    effect is present, it is the discrete reversal <em>count</em> that can't resolve it at this sample size.</p>
    ${synth ? `
      <h3>Synthetic multi-burst stress test</h3>
      <p class="caption">Gives the reversal-count metric enough events to resolve what the 210-row real
      segment could not.</p>
      <div class="stat-grid">
        ${statCard("PI+conformal &mdash; mean reversals", fmtNum(synth.reversal_count.pi_conformal_mean, 2))}
        ${statCard("Full design &mdash; mean reversals", fmtNum(synth.reversal_count.full_mean, 2))}
        ${statCard("Wilcoxon p-value", synth.reversal_count.wilcoxon_pvalue_one_sided_greater.toExponential(1))}
        ${statCard("Full never worse", `${(synth.reversal_count.full_never_worse_rate * 100).toFixed(0)}% of repeats`)}
      </div>
      ${criterionBlock("module3", "full_beats_pi_conformal_instability_synthetic", synth.pass_criteria.full_beats_pi_conformal_instability_synthetic, "Full design beats PI+conformal on reversal count (stress test)")}` : ""}
    <h3>Plots</h3>
    ${imageGrid("module3", d.images, ["Step response", "Three-way comparison", "Sensitivity check", "Synthetic multi-burst"])}
  `;
}

async function renderAblation() {
  const el = document.getElementById("ablation-content");
  if (!resultsState.loaded) {
    showSpinner(el, "Reading Phase 7 analysis…");
    return;
  }
  const data = resultsState.ablation;
  if (!data) {
    el.innerHTML = `<p class="warn">No Phase 7 results found. Run
      <code>python project/phase7_analysis/statistical_analysis.py</code> first.</p>`;
    return;
  }
  const meta = data.metadata;
  const omnibusRows = Object.entries(data.omnibus_tests)
    .map(
      ([metric, res]) => `<tr><td>${data.metric_labels[metric][0]}</td><td>${res.statistic.toFixed(3)}</td>
      <td>${res.pvalue.toFixed(4)}</td><td>${res["significant_at_0.05"] ? "✅" : "—"}</td></tr>`
    )
    .join("");
  const sigRows = data.significant_pairwise
    .map(
      (p) => `<tr><td>${p.metric}</td><td>${p.arm_a}</td><td>${p.arm_b}</td><td>${p.mean_a}</td><td>${p.mean_b}</td>
      <td>${p.pvalue_adjusted}</td><td>${p.effect_size}</td></tr>`
    )
    .join("");

  el.innerHTML = `
    <p class="info"><b>${meta.n_trials_total} trials</b>
    (${Object.entries(meta.n_trials_per_arm).map(([k, v]) => `${k}=${v}`).join(", ")}),
    one workload type (${meta.workload_type}). ${meta.power_caveat}</p>

    <h3>Omnibus tests (Kruskal-Wallis across 5 arms)</h3>
    ${tableWrap(`<table class="data-table"><thead><tr><th>Metric</th><th>H-statistic</th><th>p-value</th>
    <th>Significant (p&lt;0.05)</th></tr></thead><tbody>${omnibusRows}</tbody></table>`)}

    <h3>Metric distributions by arm</h3>
    <div id="ablation-charts" class="chart-grid"></div>

    <h3>Significant pairwise comparisons (Benjamini-Hochberg-corrected, p&lt;0.05)</h3>
    ${
      sigRows
        ? tableWrap(`<table class="data-table"><thead><tr><th>Metric</th><th>Arm A</th><th>Arm B</th><th>Mean A</th>
           <th>Mean B</th><th>p (adjusted)</th><th>Effect size</th></tr></thead><tbody>${sigRows}</tbody></table>`)
        : `<p>None survive correction &mdash; expected given the n=5/arm power constraint above.</p>`
    }

    <h3>Ablation decomposition (delta from baseline)</h3>
    <select id="decomp-metric"></select>
    <div id="decomp-table"></div>

    <details><summary>Raw trial-level data (${data.trial_level_data.length} rows)</summary>
      <div class="table-scroll">${renderRawTable(data.trial_level_data)}</div>
    </details>
  `;

  for (const metric of Object.keys(data.metric_labels)) {
    const chartDiv = document.createElement("div");
    chartDiv.className = "chart-cell";
    // Spinner sits over the cell's reserved height, so the grid doesn't
    // reflow (and the page doesn't jump) as each chart arrives.
    chartDiv.innerHTML = spinnerHTML("Building chart…", "overlay");
    document.getElementById("ablation-charts").appendChild(chartDiv);
    fetch(`/api/results/ablation/chart/${metric}`)
      .then((r) => r.json())
      .then((fig) => {
        chartDiv.innerHTML = "";
        themeFigure(fig);
        Plotly.newPlot(chartDiv, fig.data, fig.layout, PLOT_CONFIG);
      })
      .catch((err) => {
        chartDiv.innerHTML = `<p class="warn" style="padding:14px">Chart failed: ${err.message}</p>`;
      });
  }

  const select = document.getElementById("decomp-metric");
  select.innerHTML = Object.entries(data.metric_labels).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  const renderDecomp = () => {
    const metric = select.value;
    const decomp = data.ablation_decomposition[metric];
    const rows = data.arm_order
      .map((a) => {
        const delta = decomp.delta_from_baseline[a];
        const mean = delta + decomp.baseline_mean;
        return `<tr><td>${data.arm_labels[a]}</td><td>${mean.toFixed(3)}</td><td>${delta.toFixed(3)}</td></tr>`;
      })
      .join("");
    document.getElementById("decomp-table").innerHTML = `
      ${tableWrap(`<table class="data-table"><thead><tr><th>Arm</th><th>Mean</th><th>Delta from baseline</th></tr></thead>
      <tbody>${rows}</tbody></table>`)}
      ${
        decomp.full_beats_all_single_modules
          ? `<p><span class="pass">✅ Met</span> &mdash; the <b>full</b> arm beats every single-module arm on this metric.</p>`
          : `<p><span class="partial">⚠️ Not met on this metric</span> &mdash; which is the project's own
             reported claim, not an oversight.</p>
             <div class="status-note">
               <b>Why:</b> at least one single-module arm has a better mean than <b>full</b> on
               <code>${data.metric_labels[metric][0].toLowerCase()}</code>.
               <span class="resolution"><b>Where it ended up:</b> the claim carried into the report is the
               narrower, supportable one &mdash; <b>full</b> is the <em>cheapest</em> arm (918 pod-seconds,
               beating all three single-module arms, BH-adjusted p=0.014) <em>while also</em> fixing
               <b>m3_only</b>'s specific over-provisioning failure mode (2.2% vs. 57.8%, BH-adjusted
               p=0.024, effect size 1.00). "Full wins everything" would be a stronger claim than this data
               supports, so it was deliberately not made.</span>
             </div>`
      }
    `;
  };
  select.addEventListener("change", renderDecomp);
  renderDecomp();
}

function renderRawTable(rows) {
  if (!rows.length) return "<p>No rows.</p>";
  const cols = Object.keys(rows[0]);
  const head = cols.map((c) => `<th>${c}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${r[c]}</td>`).join("")}</tr>`).join("");
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

document.querySelectorAll("#page-results .subnav-btn").forEach((b) => b.addEventListener("click", () => switchResultsSubpage(b.dataset.subpage)));
document.querySelectorAll("#results-training .tab-btn").forEach((b) => b.addEventListener("click", () => switchTrainingTab(b.dataset.tab)));
