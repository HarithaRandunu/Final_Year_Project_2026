// Nav shell. Each button switches the visible .page section; pages beyond
// "home" are enabled as their milestone lands (see index.html's disabled/title
// attributes tracking the plan's build order). Page-specific init functions
// (e.g. results.js's loadResultsPage) are looked up by page name and run
// once on first visit - lazy-loaded, not fetched until the user asks for them.
const pageInitFns = {
  home: () => loadHomePage(),
  results: () => loadResultsPage(),
  diagrams: () => loadDiagramsPage(),
  setup: () => loadSetupPage(),
  monitoring: () => loadMonitoringPage(),
  "target-app": () => loadTargetAppPage(),
};
const pageLoaded = new Set();

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.disabled) return;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`page-${btn.dataset.page}`).classList.add("active");

    const page = btn.dataset.page;
    if (pageInitFns[page] && !pageLoaded.has(page)) {
      pageLoaded.add(page);
      pageInitFns[page]();
    }
  });
});

// Home page: a single readable answer to "is this thing ready, and if not,
// what do I click?" - deliberately more than a health ping, because the state
// that actually blocks a user is a missing tool or an un-bootstrapped cluster,
// not a dead backend (if the backend were dead, this window would be blank).
const HOME_STAGE_STYLE = {
  ready: { icon: "✅", cls: "pass", text: "Ready" },
  tools_missing: { icon: "⚠️", cls: "partial", text: "Tools missing" },
  no_cluster: { icon: "⚠️", cls: "partial", text: "Cluster not created yet" },
  api_unreachable: { icon: "⚠️", cls: "partial", text: "Cluster API not answering" },
  components_missing: { icon: "⚠️", cls: "partial", text: "Framework not fully deployed" },
};

async function loadHomePage() {
  const el = document.getElementById("home-status");
  showSpinner(el, "Checking tools, cluster and components…");
  let s;
  try {
    s = await fetch("/api/setup/readiness").then((r) => r.json());
  } catch (err) {
    el.innerHTML = `<p class="fail">Could not read system status: ${err.message}</p>`;
    return;
  }

  const stage = HOME_STAGE_STYLE[s.stage] || { icon: "⚠️", cls: "partial", text: s.stage };
  const yes = (ok) => (ok ? '<span class="pass">✅ yes</span>' : '<span class="partial">⚠️ no</span>');
  const missing = s.tools.filter((t) => !t.installed).map((t) => t.tool);

  const componentRows = s.components.length
    ? s.components
        .map((c) => {
          if (!c.deployed) return `<tr><td>${c.name}</td><td><span class="partial">⚠️ not deployed</span></td></tr>`;
          if (c.name === "actuator" && c.desired === 0) {
            return `<tr><td>${c.name}</td><td><span class="caption">⏸ 0 replicas (normal outside an ablation arm)</span></td></tr>`;
          }
          const ok = (c.ready || 0) > 0;
          return `<tr><td>${c.name}</td><td>${ok ? `<span class="pass">✅ ${c.ready}/${c.desired} ready</span>`
            : `<span class="partial">⚠️ ${c.ready || 0}/${c.desired} ready</span>`}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="2" class="caption">Not checked &mdash; the cluster API has to be reachable first.</td></tr>`;

  el.innerHTML = `
    <p style="font-size:16px"><span class="${stage.cls}">${stage.icon} ${stage.text}</span></p>
    <div class="status-note"${s.stage === "ready" ? ' style="border-left-color:#1baf7a"' : ""}>
      <b>Next step:</b> ${s.next_step}
    </div>
    <div class="table-wrap"><table class="data-table kv-table"><tbody>
      <tr><td>Required tools installed</td><td>${yes(s.tools_ready)}${
        missing.length ? ` <span class="caption">missing: ${missing.join(", ")}</span>` : ""
      }</td></tr>
      <tr><td>Cluster created</td><td>${yes(s.cluster_present)}</td></tr>
      <tr><td>Cluster API answering</td><td>${yes(s.api_up)}</td></tr>
    </tbody></table></div>
    <div class="table-wrap"><table class="data-table kv-table"><tbody>${componentRows}</tbody></table></div>
    <button id="home-refresh" class="btn-install">Re-check</button>`;

  document.getElementById("home-refresh").addEventListener("click", loadHomePage);
}

// Home is the page already visible at launch, so its init has to be called
// directly - the nav click handler that drives pageInitFns never fires for it.
pageLoaded.add("home");
loadHomePage();
