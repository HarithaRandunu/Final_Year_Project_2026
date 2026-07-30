// Live monitoring (Milestone 4). Polls /api/monitoring/state and appends to
// rolling Plotly traces. Every value is read from a live component's own
// endpoint - nothing here is simulated.
//
// Charts follow one-axis-per-chart (never a dual y-axis): series are only
// combined when they genuinely share a unit (risk vs threshold are both 0-1,
// p95 vs p99 are both ms, CPU vs memory are both %). Anything else gets its
// own small multiple.

const MON_COLORS = {
  risk: "#2a78d6",      // slot 1, blue
  threshold: "#eb6834", // slot 2, orange
  replicas: "#1baf7a",  // slot 3, aqua
  p95: "#eda100",       // slot 4, yellow
  p99: "#e87ba4",       // slot 5, magenta
  cpu: "#2a78d6",
  memory: "#eb6834",
};

const MON_WINDOW = 200; // samples retained per trace
const MON_INTERVAL_MS = 3000;

const monState = {
  timer: null,
  running: false,
  t: [],
  risk: [],
  threshold: [],
  replicasReady: [],
  replicasDesired: [],
  p95: [],
  p99: [],
  cpu: [],
  memory: [],
  initialized: false,
};

function monBaseLayout(title, yTitle, extra = {}) {
  const t = chartTheme(); // shared with the ablation charts - see js/ui.js
  return {
    title: { text: title, font: { size: 13, color: t.textStrong } },
    margin: { t: 40, b: 40, l: 56, r: 16 },
    // 220 was too short to read a trend once two charts share a row: the plot
    // area left after the title, legend and axis labels was under 120px.
    height: 300,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: t.text, size: 11 },
    xaxis: { showgrid: false, type: "date" },
    yaxis: { title: { text: yTitle }, gridcolor: t.grid, zeroline: false },
    showlegend: true,
    legend: { orientation: "h", y: -0.2, font: { size: 10 } },
    ...extra,
  };
}

const MON_PLOT_CFG = PLOT_CONFIG; // { displayModeBar: false, responsive: true }

function monInitCharts() {
  Plotly.newPlot(
    "mon-chart-risk",
    [
      { x: [], y: [], name: "M1 predicted_risk", mode: "lines", line: { color: MON_COLORS.risk, width: 2 } },
      { x: [], y: [], name: "M3 threshold", mode: "lines", line: { color: MON_COLORS.threshold, width: 2, dash: "dot" } },
    ],
    monBaseLayout("Risk signal vs. adaptive threshold", "0-1"),
    MON_PLOT_CFG
  );

  Plotly.newPlot(
    "mon-chart-replicas",
    [
      // Step interpolation ("hv"): a replica count changes instantaneously at
      // the moment Kubernetes acts on it, so a sloped line between samples
      // would draw fractional pods that never existed.
      { x: [], y: [], name: "Ready pods", mode: "lines", line: { color: MON_COLORS.replicas, width: 2, shape: "hv" } },
      { x: [], y: [], name: "Desired", mode: "lines", line: { color: MON_COLORS.threshold, width: 2, shape: "hv", dash: "dot" } },
    ],
    monBaseLayout("Target app replicas (live from Kubernetes)", "pods", {
      yaxis: { title: { text: "pods" }, dtick: 1, rangemode: "tozero" },
    }),
    MON_PLOT_CFG
  );

  Plotly.newPlot(
    "mon-chart-latency",
    [
      { x: [], y: [], name: "p95", mode: "lines", line: { color: MON_COLORS.p95, width: 2 } },
      { x: [], y: [], name: "p99", mode: "lines", line: { color: MON_COLORS.p99, width: 2 } },
    ],
    // rangemode tozero: with no traffic both series are 0, and Plotly's
    // default autorange then draws a symmetric axis down to -1 ms. A negative
    // latency axis is meaningless.
    monBaseLayout("Probe latency", "ms", { yaxis: { title: { text: "ms" }, rangemode: "tozero" } }),
    MON_PLOT_CFG
  );

  Plotly.newPlot(
    "mon-chart-resources",
    [
      { x: [], y: [], name: "CPU", mode: "lines", line: { color: MON_COLORS.cpu, width: 2 } },
      { x: [], y: [], name: "Memory", mode: "lines", line: { color: MON_COLORS.memory, width: 2 } },
    ],
    // Both series are a percentage of the pod's own limit, so the axis is
    // pinned to 0-100 rather than autoranged: it is what makes "memory is
    // nearly at its limit" visible at a glance instead of looking like a
    // flat line that happens to sit near the top of a rescaled axis.
    monBaseLayout("Resource utilization (% of pod limit)", "%", {
      yaxis: { title: { text: "%" }, range: [0, 100] },
    }),
    MON_PLOT_CFG
  );

  Plotly.newPlot(
    "mon-chart-nodes",
    [{
      x: [], y: [], type: "bar",
      marker: { color: MON_COLORS.replicas },
      // Value labels are drawn above each bar, in ink - not in the bar color.
      cliponaxis: false,
      textfont: { color: chartTheme().textStrong },
    }],
    monBaseLayout("Module 2 - posterior mean per node", "posterior mean", {
      showlegend: false,
      xaxis: { showgrid: false },
      yaxis: { title: { text: "posterior mean" }, range: [0, 1] },
    }),
    MON_PLOT_CFG
  );

  monState.initialized = true;
}

function monPush(arr, value) {
  arr.push(value === undefined ? null : value);
  if (arr.length > MON_WINDOW) arr.shift();
}

function monTile(label, value, sub = "") {
  return `<div class="stat-card"><div class="stat-label">${label}</div>
    <div class="stat-value">${value}${sub ? `<span class="delta">${sub}</span>` : ""}</div></div>`;
}

function monFmt(v, digits = 3, suffix = "") {
  return v === null || v === undefined ? "—" : `${Number(v).toFixed(digits)}${suffix}`;
}

function monRenderTiles(s) {
  const m1 = s.module1, m2 = s.module2, m3 = s.module3, act = s.actuator;
  const alertBadge = m3.alert === true ? '<span class="fail">ALERT</span>' : m3.alert === false ? '<span class="pass">normal</span>' : "—";

  document.getElementById("mon-tiles").innerHTML = [
    monTile("M1 predicted_risk", monFmt(m1.predicted_risk, 4), m1.available ? "" : "module 1 unreachable"),
    monTile("M3 threshold", monFmt(m3.threshold, 4), m3.mode ? `mode: ${m3.mode}` : ""),
    monTile("M3 state", alertBadge, m3.cycles != null ? `${m3.cycles} cycles` : ""),
    // Live from the Kubernetes API. Module 1's own active_instances is shown
    // as the sub-line because it is a feature of its 120s bucket and can lag
    // the cluster by up to two minutes - seeing both makes that visible
    // instead of making the app look wrong.
    monTile(
      "Replicas (live)",
      s.target ? `${s.target.replicas_ready ?? "—"} / ${s.target.replicas_desired ?? "—"}` : "—",
      m1.active_instances != null ? `M1's bucket: ${m1.active_instances}` : "ready / desired"
    ),
    monTile("p99 latency", monFmt(m1.p99_latency_ms, 0, " ms"), monFmt(m1.p95_latency_ms, 0, " ms p95")),
    monTile("M2 reward updates", m2.reward_updates_applied ?? "—", m2.gamma != null ? `gamma ${m2.gamma}` : ""),
  ].join("");

  const rows = [
    ["Module 1 (signal fusion)", m1],
    ["Module 2 (co-scheduling)", m2],
    ["Module 3 (adaptive control)", m3],
    ["Actuator", act],
  ].map(([label, c]) => {
    const pf = s.port_forwards[label.startsWith("Module 1") ? "module1" : label.startsWith("Module 2") ? "module2" : label.startsWith("Module 3") ? "module3" : "actuator"];
    let status;
    let detail;
    if (c.available) {
      status = '<span class="pass">✅ live</span>';
      detail = "";
    } else if (c.scaled_to_zero) {
      // Deliberately not styled as an error: the actuator only runs during
      // the ablation arms that use it (m1_only / m3_only / full).
      status = '<span class="caption">⏸ scaled to 0</span>';
      detail = "Not running by design - only the m1_only / m3_only / full arms use the actuator.";
    } else {
      status = '<span class="fail">❌ unreachable</span>';
      detail = (c.error || "").slice(0, 120);
    }
    // The watchdog's own state, not just up/down: a forward that is retrying
    // with a growing backoff looks identical to a permanently dead one
    // otherwise, and the difference decides whether waiting will help.
    let fwd;
    if (pf.process_alive) {
      fwd = `<span class="pass">up</span> <span class="caption">(:${pf.local_port})</span>`;
    } else if (pf.retry_in_s > 0) {
      fwd = `<span class="partial">retrying in ${Math.ceil(pf.retry_in_s)}s</span> <span class="caption">(:${pf.local_port})</span>`;
    } else {
      fwd = `<span class="fail">down</span> <span class="caption">(:${pf.local_port})</span>`;
    }
    if (!detail && pf.last_error) detail = pf.last_error.slice(0, 120);
    return `<tr><td>${label}</td><td>${status}</td><td>${fwd}</td><td class="caption">${detail}</td></tr>`;
  }).join("");

  // When nothing at all is reachable the useful message is not four identical
  // connection errors, it is "the cluster probably isn't up" plus where to fix
  // it - the same reasoning as the Home page's readiness view.
  const anyLive = [s.module1, s.module2, s.module3].some((c) => c.available);
  const banner = anyLive
    ? ""
    : `<div class="status-note"><b>None of the three modules is answering.</b>
       <span class="resolution">Usually this means the cluster isn't running (or Docker Desktop is still
       starting), rather than a fault in the modules themselves. The Home page's status panel says which,
       and the Setup page can rebuild what's missing.</span></div>`;

  document.getElementById("mon-components").innerHTML = banner +
    `<div class="table-wrap"><table class="data-table"><thead><tr><th>Component</th><th>Endpoint</th>
     <th>Port-forward</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function monRenderCharts(s) {
  const t = monState.t;
  Plotly.update("mon-chart-risk", { x: [t, t], y: [monState.risk, monState.threshold] });
  Plotly.update("mon-chart-replicas", { x: [t, t], y: [monState.replicasReady, monState.replicasDesired] });
  Plotly.update("mon-chart-latency", { x: [t, t], y: [monState.p95, monState.p99] });
  Plotly.update("mon-chart-resources", { x: [t, t], y: [monState.cpu, monState.memory] });

  const nodes = s.module2.nodes || [];
  Plotly.update("mon-chart-nodes", {
    x: [nodes.map((n) => n.node.replace(/^fyp-autoscaling-/, ""))],
    y: [nodes.map((n) => n.posterior_mean)],
    text: [nodes.map((n) => `${n.posterior_mean.toFixed(2)} (${n.pulls} pulls)`)],
    textposition: [nodes.map(() => "outside")],
  });
}

async function monTick() {
  let s;
  try {
    const resp = await fetch("/api/monitoring/state");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    s = await resp.json();
  } catch (err) {
    document.getElementById("mon-error").textContent = `Poll failed: ${err.message} (retrying)`;
    return;
  }
  document.getElementById("mon-error").textContent = "";

  monState.t.push(new Date(s.timestamp));
  if (monState.t.length > MON_WINDOW) monState.t.shift();
  monPush(monState.risk, s.module1.predicted_risk);
  monPush(monState.threshold, s.module3.threshold);
  monPush(monState.replicasReady, s.target?.replicas_ready);
  monPush(monState.replicasDesired, s.target?.replicas_desired);
  monPush(monState.p95, s.module1.p95_latency_ms);
  monPush(monState.p99, s.module1.p99_latency_ms);
  monPush(monState.cpu, s.module1.cpu_utilization);
  monPush(monState.memory, s.module1.memory_utilization);

  monRenderTiles(s);
  monRenderCharts(s);
}

async function monStart() {
  const btn = document.getElementById("mon-toggle");
  // Starting means spawning five kubectl port-forwards and waiting for them to
  // accept connections - several seconds of real work, so the button says so.
  const restoreBtn = buttonBusy(btn, "Connecting…");
  showSpinner("mon-tiles", "Opening tunnels to the live components…");
  try {
    await fetch("/api/monitoring/start", { method: "POST" });
    if (!monState.initialized) monInitCharts();
    monState.running = true;
    document.getElementById("mon-hint").style.display = "block";
    await monTick();
    monState.timer = setInterval(monTick, MON_INTERVAL_MS);
  } catch (err) {
    document.getElementById("mon-error").textContent = `Could not start monitoring: ${err.message}`;
    document.getElementById("mon-tiles").innerHTML = "";
  } finally {
    restoreBtn();
    btn.textContent = monState.running ? "Stop monitoring" : "Start monitoring";
    btn.classList.toggle("btn-danger", monState.running);
  }
}

async function monStop() {
  const btn = document.getElementById("mon-toggle");
  clearInterval(monState.timer);
  monState.timer = null;
  monState.running = false;
  btn.textContent = "Start monitoring";
  btn.classList.remove("btn-danger");
  try {
    await fetch("/api/monitoring/stop", { method: "POST" });
  } catch {
    /* stopping is best-effort - the window-close handler also tears forwards down */
  }
}

async function loadMonitoringPage() {
  document.getElementById("mon-toggle").onclick = () => (monState.running ? monStop() : monStart());
  loadgenInit();

  // Adopt whatever the backend is already doing. In a browser the page and the
  // server have separate lifetimes: reloading the tab, or opening a second one,
  // gives a fresh frontend attached to a backend that may already be polling.
  // Without this the button would read "Start monitoring" while five
  // port-forwards were live, and pressing it would show a "starting" spinner
  // for something already started.
  try {
    const { running } = await fetch("/api/monitoring/running").then((r) => r.json());
    if (running && !monState.running) {
      if (!monState.initialized) monInitCharts();
      monState.running = true;
      const btn = document.getElementById("mon-toggle");
      btn.textContent = "Stop monitoring";
      btn.classList.add("btn-danger");
      document.getElementById("mon-hint").style.display = "block";
      await monTick();
      monState.timer = setInterval(monTick, MON_INTERVAL_MS);
    }
  } catch {
    /* not fatal - the button still works, it just starts from "Start" */
  }
}
