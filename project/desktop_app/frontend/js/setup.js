// Setup page (Milestone 3): tool detection, permission-gated winget installs,
// and the one-click cluster bootstrap job. Polls GET /api/jobs/{id} every
// second while a job runs - see backend/orchestrator/jobs.py's docstring for
// why polling was chosen over SSE/websockets for this local single-user app.

const TOOL_LABELS = { docker: "Docker Desktop", kind: "kind", kubectl: "kubectl", helm: "Helm" };

async function loadSetupPage() {
  await refreshToolDetection();
}

async function refreshToolDetection() {
  const el = document.getElementById("tool-status-list");
  // Detection shells out to four `--version` calls; on a cold start (Docker
  // Desktop especially) that is a couple of seconds of blank page otherwise.
  showSpinner(el, "Checking which tools are installed…");
  let tools;
  try {
    tools = await fetch("/api/setup/detect").then((r) => r.json());
  } catch (err) {
    el.innerHTML = `<p class="fail">Could not check for tools: ${err.message}</p>`;
    return;
  }
  el.innerHTML = tools
    .map((t) => {
      const label = TOOL_LABELS[t.tool];
      if (t.installed) {
        return `<div class="tool-row"><span class="pass">✅ ${label}</span><span class="caption">${t.version_line || ""}</span></div>`;
      }
      const note = t.needs_manual_finish_after_install
        ? `<p class="caption">After install completes, ${label} needs a manual first-run step (accept its EULA, wait for it to fully start) before it'll show as detected here.</p>`
        : "";
      return `<div class="tool-row">
        <span class="fail">❌ ${label} not detected</span>
        <button class="btn-install" data-tool="${t.tool}">Install</button>
        ${note}
      </div>`;
    })
    .join("");
  el.querySelectorAll(".btn-install").forEach((btn) =>
    btn.addEventListener("click", () => installTool(btn.dataset.tool, btn))
  );

  const allReady = tools.every((t) => t.installed);
  document.getElementById("bootstrap-section").style.display = allReady ? "block" : "none";
  document.getElementById("bootstrap-gate-note").style.display = allReady ? "none" : "block";
}

async function installTool(tool, btn) {
  buttonBusy(btn, "Installing…"); // no restore: the row is re-rendered below
  try {
    const { job_id } = await fetch(`/api/setup/install/${tool}`, { method: "POST" }).then((r) => r.json());
    await pollJob(job_id, renderJobLog.bind(null, "tool-install-log"));
  } catch (err) {
    document.getElementById("tool-install-log").innerHTML = `<p class="fail">Could not start the install: ${err.message}</p>`;
  }
  await refreshToolDetection();
}

async function runBootstrap() {
  const btn = document.getElementById("btn-bootstrap");
  const restoreBtn = buttonBusy(btn, "Running…");
  try {
    const { job_id } = await fetch("/api/setup/bootstrap", { method: "POST" }).then((r) => r.json());
    const job = await pollJob(job_id, renderJobLog.bind(null, "bootstrap-log"));
    restoreBtn();
    btn.textContent = job.status === "success" ? "Bootstrap complete - run again?" : "Retry bootstrap";
  } catch (err) {
    document.getElementById("bootstrap-log").innerHTML = `<p class="fail">Could not start the bootstrap: ${err.message}</p>`;
    restoreBtn();
    btn.textContent = "Retry bootstrap";
  }
}

function pollJob(jobId, onUpdate) {
  // A long bootstrap job (image builds especially) means many minutes of
  // polling - without retry logic, a single transient fetch failure (a
  // dropped connection, a momentary server hiccup under heavy CPU load from
  // the docker build itself) throws inside tick(), which - since nothing
  // ever caught it - silently killed the whole polling loop and left the
  // button stuck on "Running..." forever with no way to recover. Retrying
  // instead of dying on the first failure is the fix.
  return new Promise((resolve) => {
    let consecutiveFailures = 0;
    const tick = async () => {
      let job;
      try {
        const resp = await fetch(`/api/jobs/${jobId}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        job = await resp.json();
        consecutiveFailures = 0;
      } catch (err) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= 15) {
          resolve({
            status: "failed",
            error: `Lost contact with the app's backend while polling (${err.message}). The job may still be running in the background - check back or restart the app.`,
            steps: [],
          });
          return;
        }
        setTimeout(tick, 1000);
        return;
      }
      onUpdate(job);
      if (job.status === "running" || job.status === "pending") {
        setTimeout(tick, 1000);
      } else {
        resolve(job);
      }
    };
    tick();
  });
}

document.getElementById("btn-bootstrap").addEventListener("click", runBootstrap);

function renderJobLog(elId, job) {
  const el = document.getElementById(elId);
  el.innerHTML = job.steps
    .map((s) => {
      const icon = { pending: "⏸️", running: "⏳", success: "✅", failed: "❌" }[s.status];
      return `<details ${s.status === "running" || s.status === "failed" ? "open" : ""}>
        <summary>${icon} ${s.name}</summary>
        <pre class="job-log">${s.log.join("\n")}</pre>
      </details>`;
    })
    .join("");
  if (job.error) {
    el.innerHTML += `<p class="fail">${job.error}</p>`;
  }
}
