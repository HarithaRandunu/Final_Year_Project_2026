// "How It Works" page (Milestone 2): renders the .mmd Mermaid sources in
// frontend/diagrams/ - all new diagrams, none of this existed anywhere in
// the project before. mermaid.min.js is vendored (no CDN, works offline).

const DIAGRAMS = [
  { file: "01_system_architecture.mmd", title: "System architecture",
    description: "All 4 live components + the target app + kube-scheduler + the Kubernetes API, showing which ones poll, PATCH, or webhook which." },
  { file: "02_module1_pipeline.mmd", title: "Module 1 pipeline (Signal Fusion)",
    description: "From the Alibaba trace through feature engineering, LightGBM + TreeSHAP training, offline validation, and the live controller's honest real-signal substitutions." },
  { file: "03_module2_pipeline.mmd", title: "Module 2 pipeline (Co-Scheduling)",
    description: "From real placement events through the discounted Thompson Sampling bandit loop, offline validation, and the live scheduler-extender." },
  { file: "04_module3_pipeline.mmd", title: "Module 3 pipeline (Adaptive Control)",
    description: "From Module 1's residual stream through Adaptive Conformal Inference, the PI controller, and oscillation-conditioned widening, to the live polling loop." },
  { file: "05_live_control_loop.mmd", title: "Live integration control loop",
    description: "The actual runtime cycle: what polls what, how often, and what triggers a scaling action - the one diagram that most directly explains what this app is watching." },
  { file: "06_plugin_app_flow.mmd", title: "Plug in a different app",
    description: "The three ways to point the system at a new target app, and how they converge on the same reconfigure step." },
  { file: "07_setup_automation_flow.mmd", title: "Setup automation",
    description: "Tool detection, permission-gated winget installs, Docker Desktop's manual-fallback step, and the one-click cluster bootstrap." },
  { file: "08_ablation_arm_config.mmd", title: "Ablation arm configuration",
    description: "The live 5-arm study's exact configuration (run_trial.py's ARM_CONFIGS) - which of KEDA / the actuator / the scheduler-extender is active per arm." },
];

let mermaidInitialized = false;
let mermaidCache = {};

function initMermaidOnce() {
  if (mermaidInitialized) return;
  const isLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  mermaid.initialize({ startOnLoad: false, theme: isLight ? "default" : "dark", securityLevel: "strict" });
  mermaidInitialized = true;
}

async function loadDiagramsPage() {
  initMermaidOnce();
  const list = document.getElementById("diagram-list");
  list.innerHTML = DIAGRAMS.map(
    (d, i) => `<button class="subnav-btn diagram-btn${i === 0 ? " active" : ""}" data-index="${i}">${d.title}</button>`
  ).join("");
  list.querySelectorAll(".diagram-btn").forEach((btn) =>
    btn.addEventListener("click", () => selectDiagram(Number(btn.dataset.index)))
  );
  await selectDiagram(0);
}

async function selectDiagram(index) {
  document.querySelectorAll("#diagram-list .diagram-btn").forEach((b, i) => b.classList.toggle("active", i === index));
  const d = DIAGRAMS[index];
  const descEl = document.getElementById("diagram-description");
  const svgEl = document.getElementById("diagram-svg");
  descEl.textContent = d.description;
  svgEl.innerHTML = spinnerHTML("Rendering diagram…");

  try {
    if (!mermaidCache[d.file]) {
      mermaidCache[d.file] = await fetch(`/diagrams/${d.file}`).then((r) => r.text());
    }
    const { svg } = await mermaid.render(`mmd-${index}`, mermaidCache[d.file]);
    svgEl.innerHTML = svg;
  } catch (err) {
    svgEl.innerHTML = `<p class="fail">Diagram failed to render: ${err.message || err}</p>`;
  }
}
