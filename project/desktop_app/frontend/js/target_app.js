// Target-app plug-in page (Milestone 6). Three entry paths converging on one
// reconfigure job - see frontend/diagrams/06_plugin_app_flow.mmd for the flow
// this page implements. Reuses setup.js's pollJob/renderJobLog: the switch is
// a multi-step background job like the cluster bootstrap, for the same reason
// (kubectl rollouts take minutes and the UI must show progress, not freeze).

let taDeployments = [];

function taEscape(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function taRenderCurrent() {
  const el = document.getElementById("ta-current");
  // This call re-reads module1-controller's env from the cluster before
  // answering (see routers/target_app.py), so it is a kubectl round-trip.
  showSpinner(el, "Reading the current target from the cluster…", "inline");
  let t;
  try {
    t = await fetch("/api/target/current").then((r) => r.json());
  } catch (err) {
    el.innerHTML = `<p class="fail">Could not read the current target: ${taEscape(err.message)}</p>`;
    return;
  }
  const rows = [
    ["Application", t.name],
    ["Deployment", `${t.deployment} (namespace ${t.namespace})`],
    ["Pod label selector", t.label_selector],
    ["Module 1's probe URL", t.probe_url_in_cluster],
    ["Load-generator target", `${t.service}:${t.service_port}${t.probe_path}`],
  ];
  el.innerHTML = `<table class="data-table kv-table"><tbody>${rows
    .map(([k, v]) => `<tr><td>${k}</td><td><code>${taEscape(v)}</code></td></tr>`)
    .join("")}</tbody></table>
    <p class="caption">${taEscape(t.description || "")}</p>`;
}

async function taRenderPresets() {
  const el = document.getElementById("ta-presets");
  let presets;
  try {
    presets = await fetch("/api/target/presets").then((r) => r.json());
  } catch (err) {
    el.innerHTML = `<p class="fail">Could not load presets: ${taEscape(err.message)}</p>`;
    return;
  }
  el.innerHTML = presets
    .map(
      (p) => `<div class="tool-row">
        <span><strong>${taEscape(p.name)}</strong><br><span class="caption">${taEscape(p.description)}</span></span>
        <button class="btn-install" data-preset="${taEscape(p.key)}">Use this</button>
      </div>`
    )
    .join("");
  el.querySelectorAll("[data-preset]").forEach((btn) =>
    btn.addEventListener("click", () => taSwitchPreset(btn.dataset.preset, btn))
  );
}

async function taRefreshDeployments() {
  const select = document.getElementById("ta-deployment");
  select.innerHTML = `<option value="">Loading…</option>`;
  document.getElementById("ta-derived").innerHTML = spinnerHTML("Listing Deployments and their Services…", "inline");
  let payload;
  try {
    payload = await fetch("/api/target/deployments").then((r) => r.json());
  } catch (err) {
    select.innerHTML = `<option value="">Could not load</option>`;
    document.getElementById("ta-derived").innerHTML =
      `<span class="fail">Could not list Deployments: ${taEscape(err.message)}</span>`;
    return;
  }
  if (payload.error) {
    select.innerHTML = `<option value="">Cluster unreachable</option>`;
    document.getElementById("ta-derived").innerHTML =
      `<span class="fail">kubectl could not reach the cluster: ${taEscape(payload.error)}</span>
       <br>Run the cluster bootstrap on the Setup page first.`;
    return;
  }

  taDeployments = payload.deployments;
  const apps = taDeployments.filter((d) => !d.is_framework_component);
  const framework = taDeployments.filter((d) => d.is_framework_component);
  const opt = (d, i) =>
    `<option value="${taDeployments.indexOf(d)}">${taEscape(d.name)} — ${d.ready_replicas}/${d.replicas ?? "?"} ready${
      d.namespace === "default" ? "" : ` (ns: ${taEscape(d.namespace)})`
    }</option>`;

  select.innerHTML =
    (apps.length ? `<optgroup label="Applications">${apps.map(opt).join("")}</optgroup>` : "") +
    // Shown but sectioned off: pointing Module 1 at one of our own components
    // is legal and occasionally useful, but doing it by accident creates a
    // confusing self-referential loop.
    (framework.length
      ? `<optgroup label="Framework components (not usually a target)">${framework.map(opt).join("")}</optgroup>`
      : "");
  if (!taDeployments.length) {
    select.innerHTML = `<option value="">No Deployments found</option>`;
  }
  taOnDeploymentChange();
}

function taSelectedDeployment() {
  const raw = document.getElementById("ta-deployment").value;
  return raw === "" ? null : taDeployments[Number(raw)];
}

function taOnDeploymentChange() {
  const dep = taSelectedDeployment();
  const svcSelect = document.getElementById("ta-service");
  const derived = document.getElementById("ta-derived");
  if (!dep) {
    svcSelect.innerHTML = "";
    derived.textContent = "";
    return;
  }
  svcSelect.innerHTML = dep.services
    .map((s, i) => `<option value="${i}">${taEscape(s.service)}:${s.port}${s.name ? ` (${taEscape(s.name)})` : ""}</option>`)
    .join("");
  if (!dep.services.length) {
    // A real blocker, not a warning: Module 1 probes the app over HTTP and the
    // load generator drives traffic through a port-forward, and both need a
    // Service in front of the pods.
    svcSelect.innerHTML = `<option value="">No Service routes to this Deployment</option>`;
  }
  taUpdateDerived();
}

function taUpdateDerived() {
  const dep = taSelectedDeployment();
  const derived = document.getElementById("ta-derived");
  if (!dep) {
    derived.textContent = "";
    return;
  }
  const svc = dep.services[Number(document.getElementById("ta-service").value)];
  let path = document.getElementById("ta-probe-path").value || "/";
  if (!path.startsWith("/")) path = `/${path}`;

  if (!svc) {
    derived.innerHTML = `<span class="fail">This Deployment has no Service in front of it.</span>
      Module 1 probes the target over HTTP and the load generator tunnels to it, so a Service is required.
      Add one (or pick a different Deployment) before switching.`;
    return;
  }
  const host = dep.namespace === "default" ? svc.service : `${svc.service}.${dep.namespace}.svc.cluster.local`;
  const warn = dep.is_framework_component
    ? `<br><span class="warn">⚠️ That is one of the framework's own components. Module 1 would end up monitoring the framework rather than an application.</span>`
    : "";
  derived.innerHTML = `Module 1 will use <code>PROBE_URL=http://${taEscape(host)}:${svc.port}${taEscape(path)}</code>
    and <code>TARGET_LABEL_SELECTOR=${taEscape(dep.label_selector)}</code>.${warn}`;
}

function taSetBusy(busy) {
  ["ta-switch", "ta-refresh", "ta-apply-manifest"].forEach((id) => {
    document.getElementById(id).disabled = busy;
  });
  document.querySelectorAll("#ta-presets .btn-install").forEach((b) => (b.disabled = busy));
}

async function taRunJob(url, body, busyBtn, busyLabel) {
  const restoreBtn = busyBtn ? buttonBusy(busyBtn, busyLabel) : () => {};
  taSetBusy(true);
  document.getElementById("ta-log").innerHTML = spinnerHTML("Starting…", "inline");
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      document.getElementById("ta-log").innerHTML = `<p class="fail">Rejected: ${taEscape(detail.slice(0, 400))}</p>`;
      return null;
    }
    const { job_id } = await resp.json();
    return await pollJob(job_id, renderJobLog.bind(null, "ta-log"));
  } catch (err) {
    document.getElementById("ta-log").innerHTML = `<p class="fail">Could not start: ${taEscape(err.message)}</p>`;
    return null;
  } finally {
    // Restore the button's own label/state before re-enabling the group, so a
    // busy spinner can never be left frozen on a button that is clickable.
    restoreBtn();
    taSetBusy(false);
    await taRenderCurrent();
  }
}

async function taSwitchPreset(key, btn) {
  taConfirmSwitch(
    `The framework will be set to the <code>${taEscape(key)}</code> preset's configuration.`,
    () => taRunJob(
      "/api/target/switch-preset",
      { preset: key, min_replicas: 1, max_replicas: 2 },
      btn,
      "Switching…"
    )
  );
}

/** Requires a second, explicit click before anything is reconfigured.
 *
 *  Switching target is not a read-only action: it rewrites two Deployments'
 *  env vars and restarts them, which resets Module 1's rolling history and
 *  leaves the live view blank for one 120-second bucket. It also silently
 *  invalidates whatever the user was watching. During this app's own
 *  development the cluster was found pointed at a Deployment nobody had
 *  knowingly chosen - the dropdown's first entry, with the default "/" probe
 *  path - so a single stray click or scripted event is enough to do it. The
 *  confirmation both prevents that and states the consequence.
 */
function taConfirmSwitch(summary, onConfirm) {
  const log = document.getElementById("ta-log");
  log.innerHTML = `
    <div class="status-note">
      <b>Confirm the switch.</b> ${summary}
      <span class="resolution">This rewrites <code>module1-controller</code>'s and
      <code>actuator</code>'s environment and restarts both. Module 1 starts a fresh
      120-second bucket, so the Live Monitoring charts will be empty for about two
      minutes afterwards.</span>
    </div>
    <button id="ta-confirm" class="btn-install">Yes, switch target</button>
    <button id="ta-cancel" class="btn-install btn-danger">Cancel</button>`;
  document.getElementById("ta-confirm").addEventListener("click", onConfirm);
  document.getElementById("ta-cancel").addEventListener("click", () => {
    log.innerHTML = `<p class="caption">Cancelled &mdash; nothing was changed.</p>`;
  });
}

async function taSwitch() {
  const dep = taSelectedDeployment();
  const log = document.getElementById("ta-log");
  if (!dep) {
    log.innerHTML = `<p class="fail">Pick a Deployment first.</p>`;
    return;
  }
  const svc = dep.services[Number(document.getElementById("ta-service").value)];
  if (!svc) {
    log.innerHTML = `<p class="fail">This Deployment has no Service in front of it, so the framework cannot probe it.</p>`;
    return;
  }
  const min = Number(document.getElementById("ta-min-replicas").value);
  const max = Number(document.getElementById("ta-max-replicas").value);
  if (max < min) {
    log.innerHTML = `<p class="fail">Max replicas must be at least the minimum.</p>`;
    return;
  }
  const probePath = document.getElementById("ta-probe-path").value || "/";
  taConfirmSwitch(
    `The framework will monitor and scale <code>${taEscape(dep.name)}</code>
     (namespace <code>${taEscape(dep.namespace)}</code>), probing
     <code>http://${taEscape(svc.service)}:${svc.port}${taEscape(probePath)}</code>,
     between ${min} and ${max} replicas.`,
    async () => {
      const job = await taRunJob(
        "/api/target/switch",
        {
          namespace: dep.namespace,
          deployment: dep.name,
          label_selector: dep.label_selector,
          service: svc.service,
          service_port: svc.port,
          probe_path: probePath,
          min_replicas: min,
          max_replicas: max,
        },
        document.getElementById("ta-switch"),
        "Switching…"
      );
      if (job && job.status === "success") await taRefreshDeployments();
    }
  );
}

async function taApplyManifest() {
  const path = document.getElementById("ta-manifest-path").value.trim();
  if (!path) {
    document.getElementById("ta-log").innerHTML = `<p class="fail">Enter the path to a YAML file or a folder of them.</p>`;
    return;
  }
  const job = await taRunJob("/api/target/apply-manifest", { path }, document.getElementById("ta-apply-manifest"), "Applying...");
  if (job && job.status === "success") {
    await taRefreshDeployments();
    document.getElementById("ta-log").innerHTML +=
      `<p class="info">Applied. Switch to the &ldquo;App already in the cluster&rdquo; tab to pick which Deployment the framework should monitor.</p>`;
  }
}

function loadTargetAppPage() {
  document.querySelectorAll("#ta-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#ta-tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      ["preset", "existing", "manifest"].forEach((t) =>
        document.getElementById(`ta-tab-${t}`).classList.remove("active")
      );
      btn.classList.add("active");
      document.getElementById(`ta-tab-${btn.dataset.taTab}`).classList.add("active");
    });
  });

  document.getElementById("ta-deployment").addEventListener("change", taOnDeploymentChange);
  document.getElementById("ta-service").addEventListener("change", taUpdateDerived);
  document.getElementById("ta-probe-path").addEventListener("input", taUpdateDerived);
  document.getElementById("ta-refresh").addEventListener("click", taRefreshDeployments);
  document.getElementById("ta-switch").addEventListener("click", taSwitch);
  document.getElementById("ta-apply-manifest").addEventListener("click", taApplyManifest);
  document.getElementById("ta-use-example").addEventListener("click", () => {
    // A relative path is resolved by the backend against desktop_app/ itself
    // (not the process's working directory), so this works however the app
    // was launched and the user never has to type a full path.
    document.getElementById("ta-manifest-path").value = "examples/demo-app.yaml";
  });

  taRenderCurrent();
  taRenderPresets();
  taRefreshDeployments();
}
