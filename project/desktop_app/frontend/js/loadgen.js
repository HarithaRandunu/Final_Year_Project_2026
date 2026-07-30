// Load generator controls (Milestone 5). Lives on the Live Monitoring page
// on purpose: the whole point is watching Module 1's risk, Module 3's
// threshold and the replica count react to traffic you are generating.

let loadgenTimer = null;

async function loadgenRefresh() {
  let s;
  try {
    s = await fetch("/api/loadgen/status").then((r) => r.json());
  } catch {
    return; // transient; the next tick retries
  }

  const running = s.running;
  const btn = document.getElementById("lg-toggle");
  btn.textContent = running ? "Stop load" : "Start load";
  btn.classList.toggle("btn-danger", running);
  document.getElementById("lg-min").disabled = running;
  document.getElementById("lg-max").disabled = running;

  const fmt = (v, suffix = "") => (v === null || v === undefined ? "—" : `${v}${suffix}`);
  document.getElementById("lg-stats").innerHTML = running || s.sent > 0
    ? `<div class="stat-grid">
        <div class="stat-card"><div class="stat-label">Requests sent</div><div class="stat-value">${s.sent}<span class="delta">${s.failed} failed</span></div></div>
        <div class="stat-card"><div class="stat-label">Achieved rate</div><div class="stat-value">${fmt(s.achieved_rps, " req/s")}<span class="delta">target ${s.min_rps}-${s.max_rps}</span></div></div>
        <div class="stat-card"><div class="stat-label">Client latency p50</div><div class="stat-value">${fmt(s.latency_p50_ms, " ms")}</div></div>
        <div class="stat-card"><div class="stat-label">Client latency p95</div><div class="stat-value">${fmt(s.latency_p95_ms, " ms")}</div></div>
        <div class="stat-card"><div class="stat-label">Elapsed</div><div class="stat-value">${s.elapsed_s}s</div></div>
       </div>
       ${s.last_error ? `<p class="caption fail">Last error: ${s.last_error.slice(0, 160)}</p>` : ""}
       <p class="caption">Hitting <code>${s.url || "—"}</code> (target: ${s.target?.name || "unknown"}).
       These latencies are measured by this client; Module 1's p95/p99 above come from its own in-cluster probing, so the two won't match exactly.</p>`
    : `<p class="caption">Not running. Target: <code>${s.target?.name || "unknown"}</code>.</p>`;
}

async function loadgenToggle() {
  const btn = document.getElementById("lg-toggle");
  btn.disabled = true;
  try {
    const status = await fetch("/api/loadgen/status").then((r) => r.json());
    if (status.running) {
      await fetch("/api/loadgen/stop", { method: "POST" });
    } else {
      const min_rps = Number(document.getElementById("lg-min").value);
      const max_rps = Number(document.getElementById("lg-max").value);
      const resp = await fetch("/api/loadgen/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ min_rps, max_rps }),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        document.getElementById("lg-stats").innerHTML = `<p class="fail">Could not start: ${detail.slice(0, 200)}</p>`;
      }
    }
  } catch (err) {
    document.getElementById("lg-stats").innerHTML = `<p class="fail">Load generator error: ${err.message}</p>`;
  } finally {
    btn.disabled = false;
    await loadgenRefresh();
  }
}

function loadgenInit() {
  document.getElementById("lg-toggle").onclick = loadgenToggle;
  const sync = () => {
    const min = document.getElementById("lg-min");
    const max = document.getElementById("lg-max");
    if (Number(max.value) < Number(min.value)) max.value = min.value;
    document.getElementById("lg-min-val").textContent = min.value;
    document.getElementById("lg-max-val").textContent = max.value;
  };
  document.getElementById("lg-min").oninput = sync;
  document.getElementById("lg-max").oninput = sync;
  sync();
  loadgenRefresh();
  if (loadgenTimer === null) loadgenTimer = setInterval(loadgenRefresh, 3000);
}
