# Live Cluster — Step-by-Step Guide (for anyone, every time)

This guide assumes you've never run a command like this before, **and** it's
written to also work as a reference the fifth time you do this. If a step
feels obvious to you, skip ahead — nothing bad happens by reading fast.

Everything below is typed into a **terminal**. In VS Code: menu bar →
`Terminal` → `New Terminal`. Commands are shown for **PowerShell** (the
default terminal on Windows) — copy each block exactly, one at a time, and
press Enter.

---

## What actually gets built here, in plain words

A tiny fake "company" runs on your own laptop:

- **TeaStore** — a real demo web store (login, products, cart) that Docker
  runs for you. This stands in for "the production app we're autoscaling."
- **A mini Kubernetes cluster** (via a tool called **kind** — "Kubernetes
  IN Docker") — a scaled-down, throwaway copy of the kind of cluster real
  companies run apps on. It lives entirely inside Docker on your machine.
- **Your three modules**, each running as its own small program inside
  that cluster, watching TeaStore and making decisions:
  - **Module 1** watches TeaStore's live health signals and predicts risk.
  - **Module 2** decides which cluster node a new copy of TeaStore should
    run on.
  - **Module 3** decides, moment to moment, how alarmed to be about
    Module 1's risk number.
- **The actuator** — the one piece that actually presses the "add/remove a
  copy of TeaStore" button, based on what Modules 1 and 3 say.

None of this touches the internet or any real company — it's a sealed
sandbox on your own computer.

---

## Part A — One-time software install

Do this once per computer. Skip anything you've already installed.

| Tool | What it's for, in plain words | Install | Check it worked |
|---|---|---|---|
| **Docker Desktop** | Runs all the containers. Must be **open and running** (whale icon in the system tray, not showing an error) before anything else. | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) | `docker --version` |
| **kind** | Creates the mini Kubernetes cluster inside Docker. | `choco install kind` (or see [kind.sigs.k8s.io](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)) | `kind --version` |
| **kubectl** | The "remote control" you use to tell the cluster what to do. | `choco install kubernetes-cli` | `kubectl version --client` |
| **helm** | Only needed if you want the KEDA autoscaling option (Part B, Step 5). | `choco install kubernetes-helm` | `helm version` |
| **Python 3.11+** | Runs the small scripts that drive experiments and the dashboard. | [python.org/downloads](https://www.python.org/downloads/) | `python --version` |

If any "check it worked" command prints an error instead of a version
number, that tool isn't installed correctly yet — fix it before moving on.

**You do NOT need:** the raw dataset folders (`DataSet01`–`DataSet05`) —
they're intentionally excluded from the repo (too large) and nothing here
reads them. You also don't need `k6` installed — the load-testing tool runs
*inside* the cluster automatically when needed.

Open a terminal and move into this folder (adjust the path if your clone
is elsewhere):

```powershell
cd "C:\path\to\implementation\project\live_cluster"
```

Every command in Part B assumes you're standing in this folder.

---

## Part B — First-time setup (or after you've torn everything down)

Do these in order, top to bottom. Each step says what it does, then what
to expect if it worked.

### Step 1 — Make sure Docker Desktop is actually running
Open the Docker Desktop app and wait until it says it's running (no
loading spinner). Everything below silently fails in confusing ways if
this is skipped.

### Step 2 — Create the mini cluster
```powershell
kind create cluster --config kind-cluster.yaml
```
This takes 1–2 minutes. **What it did:** built a 2-computer pretend cluster
(one "control-plane" node, one "worker" node) inside Docker.

By default, the control-plane node refuses to run ordinary workloads (it's
supposed to only run cluster management stuff). We need it to act as a
real second machine, so remove that restriction:
```powershell
kubectl taint nodes fyp-autoscaling-control-plane node-role.kubernetes.io/control-plane- --overwrite
```
**Check it worked:**
```powershell
kubectl get nodes
```
You should see two lines, both saying `Ready`.

### Step 3 — Turn on real CPU/memory reporting
kind doesn't report real resource usage out of the box, and both the
autoscalers and Module 1 need it.
```powershell
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json --patch-file=metrics-server-patch.json
kubectl rollout status deployment/metrics-server -n kube-system --timeout=90s
```
**Check it worked:** the last command should print
`deployment "metrics-server" successfully rolled out`. If you want to
double check a minute later: `kubectl top nodes` should print real numbers,
not an error.

### Step 4 — Install KEDA (only if you want the KEDA-based autoscaling arm)
KEDA is one of two ways TeaStore can autoscale on its own (the other is
plain Kubernetes HPA). You need this for the `m2_only` / `full` /
`baseline` experiment arms; you can skip it if you're only ever using HPA.
```powershell
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
kubectl wait --for=condition=available deployment/keda-operator -n keda --timeout=120s
```
**Check it worked:** no error from the `wait` command.

### Step 5 — Deploy the demo app (TeaStore)
```powershell
kubectl apply -f teastore\teastore.yaml
kubectl wait --for=condition=available deployment --all --timeout=180s
```
This can take a couple of minutes the first time (Docker has to download
TeaStore's images). **Check it worked:**
```powershell
kubectl get pods
```
Every pod's `STATUS` column should say `Running`.

### Step 6 — Turn on ONE autoscaling baseline
Pick exactly one — never both at the same time, they'd fight each other:
```powershell
kubectl apply -f teastore\keda-baseline.yaml
```
or
```powershell
kubectl apply -f teastore\hpa-baseline.yaml
```

### Step 7 — Package your three modules into containers
Each module folder has a `Dockerfile` — a recipe for turning that module's
code into a runnable container image.
```powershell
docker build -t actuator:latest .\actuator
docker build -t module1-controller:latest .\module1_controller
docker build -t module2-extender:latest .\module2_extender
docker build -t module3-controller:latest .\module3_controller
```
**Check it worked:** `docker images` should list all four with today's date.

### Step 8 — Copy those containers into the mini-cluster
Building an image only puts it on your own machine's Docker — the cluster
can't see it yet. This step copies each one in:
```powershell
kind load docker-image actuator:latest --name fyp-autoscaling
kind load docker-image module1-controller:latest --name fyp-autoscaling
kind load docker-image module2-extender:latest --name fyp-autoscaling
kind load docker-image module3-controller:latest --name fyp-autoscaling
```

### Step 9 — Deploy your three modules + the actuator
```powershell
kubectl apply -f module1_controller\deployment.yaml
kubectl apply -f module2_extender\deployment.yaml
kubectl apply -f module3_controller\deployment.yaml
kubectl apply -f actuator\deployment.yaml
```
The actuator deploys with **0 copies running on purpose** — it only turns
on during an actual experiment (Part C). The other three should come up
now:
```powershell
kubectl rollout status deployment/module1-controller --timeout=90s
kubectl rollout status deployment/module2-extender --timeout=90s
kubectl rollout status deployment/module3-controller --timeout=90s
```

### Step 10 — The one fiddly step: connect Module 2 to the scheduler
Module 2 decides *where* a new copy of TeaStore should run, but only if
Kubernetes' own scheduler is told to ask Module 2 for its opinion. That
requires a small file with Module 2's exact network address in it — and
that address is different on every fresh cluster, so it must be redone
each time you start from scratch.

The easy way — this finds the real address and fixes the file for you:
```powershell
$ip = kubectl get svc module2-extender -o jsonpath='{.spec.clusterIP}'
(Get-Content module2_extender\scheduler-extender-config.yaml) -replace 'urlPrefix:.*', "urlPrefix: `"http://$ip`:8090`"" | Set-Content module2_extender\scheduler-extender-config.yaml
```

Then hand that file to the cluster's scheduler:
```powershell
docker cp module2_extender\scheduler-extender-config.yaml fyp-autoscaling-control-plane:/etc/kubernetes/scheduler-extender-config.yaml
docker cp module2_extender\kube-scheduler-with-extender.yaml fyp-autoscaling-control-plane:/etc/kubernetes/manifests/kube-scheduler.yaml
```
The scheduler restarts itself automatically within a few seconds.
**Check it worked:**
```powershell
kubectl get pods -n kube-system -l component=kube-scheduler
```
Wait until `STATUS` says `Running`, then:
```powershell
kubectl logs -n kube-system -l component=kube-scheduler | Select-String extender
```
You should see a line mentioning "extenders configured."

> **Skip this step entirely if** you're only going to run experiments
> through `run_all_arms.py` (Part C) — that script performs this exact
> swap automatically for whichever arm needs it. Step 10 is only needed if
> you want Module 2's placement logic active *outside* a scripted trial.

### Step 11 — Confirm everything is actually alive
```powershell
kubectl port-forward service/module1-controller 18000:8000
```
Leave that running, open a **second** terminal window, and:
```powershell
curl http://localhost:18000/risk
```
You should get back a JSON reply with a `predicted_risk` number. Press
`Ctrl+C` in the first window to stop the port-forward when you're done.
Repeat the same idea for Module 3 (`service/module3-controller`, port
`8091`, path `/state`) if you want to check it too.

**You're fully set up.** Everything from here on (Part C, Part D) can be
repeated any number of times without redoing Part B — as long as you don't
delete the cluster (Part E).

---

## Part C — Running an experiment (optional)

This replays a real traffic pattern against TeaStore and measures how
each "arm" (baseline, Module-1-only, Module-2-only, Module-3-only, or all
three together) behaves. From `project\live_cluster\ablation`:

One arm only:
```powershell
python run_trial.py --arm full --run-tag mytrial
```

All five arms back to back (about 75 minutes total at default settings):
```powershell
python run_all_arms.py --run-tag mytrial --n-trials 5
```
`--arm` can be `baseline`, `m1_only`, `m2_only`, `m3_only`, or `full`.
Results are written to `results\ablation\<a folder named after the run>\metrics.json`
— nothing you need to collect by hand.

This script also has its own safety check: if your computer's free memory
gets too low mid-experiment, it stops itself and records why, instead of
crashing your machine.

---

## Part D — Looking at results (no cluster needed at all)

The dashboard only reads result files that are already saved in the repo
— it doesn't need the cluster running, and works even if you skipped
every step above:
```powershell
python -m streamlit run project\dashboard\Home.py
```
This opens in your browser automatically. Press `Ctrl+C` in the terminal
to stop it.

---

## Part E — Coming back after a break / shutting down

**If you're coming back later and want to keep working:** Docker Desktop
needs to be running, and the cluster survives a computer restart as long
as you didn't delete it. Check what's still there:
```powershell
kind get clusters
kubectl get pods -A
```
If `fyp-autoscaling` is listed and pods show `Running`, you can skip
straight to Part C or D — no need to redo Part B.

**If you want to wipe everything and start clean:**
```powershell
kind delete cluster --name fyp-autoscaling
```
This deletes the mini-cluster and everything in it. It does **not** touch
your code, your Docker images, or anything in `results\`. Next time,
start over from Part B, Step 1.

---

## If something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Any `kubectl`/`kind`/`docker` command hangs or errors immediately | Docker Desktop isn't running | Open Docker Desktop, wait for it to fully start, retry |
| A pod's `STATUS` stays `ImagePullBackOff` for `module1-controller`, `module2-extender`, `module3-controller`, or `actuator` | Step 7/8 (build + load) wasn't done, or was done before creating the cluster | Redo Steps 7 and 8, then delete the stuck pod: `kubectl delete pod <name>` (it recreates itself) |
| `kubectl top nodes` says metrics not available | Step 3 hasn't finished yet | Wait ~30s and retry; re-check `kubectl rollout status deployment/metrics-server -n kube-system` |
| Module 2 never gets asked to place anything | Step 10 wasn't done, or the `urlPrefix` IP is stale from a previous cluster | Redo Step 10 — the IP changes every time you recreate the cluster |
| TeaStore pods crash with `OOMKilled` | Not enough memory available to Docker/WSL2 | Lower `maxReplicas`/`maxReplicaCount` in `teastore\hpa-baseline.yaml` / `keda-baseline.yaml`, or increase Docker Desktop's memory allowance |
| A trial in Part C aborts with a memory message | The built-in safety check tripped — genuinely low on RAM | Close other applications, or lower `--min-rps`/`--max-rps` in the command |

---

## Glossary (plain-English)

- **Cluster** — a group of computers (here, 2 pretend ones inside Docker)
  managed as one unit by Kubernetes.
- **Node** — one computer in the cluster.
- **Pod** — one running copy of a program inside the cluster (e.g., one
  running copy of Module 1).
- **Deployment** — a rule saying "keep N copies of this pod running";
  Kubernetes restarts pods automatically if they crash.
- **Service** — a stable network address/name that always points at
  whichever pods are currently running for something (e.g.,
  `module1-controller`), even if the actual pods behind it change.
- **ClusterIP** — the internal IP address a Service gets assigned, only
  reachable from inside the cluster.
- **Scheduler** — the Kubernetes component that decides which node a new
  pod runs on. An "extender" is a plug-in that gets asked for its opinion
  before the scheduler decides — that's Module 2's role here.
- **HPA / KEDA** — two different built-in ways Kubernetes can automatically
  add/remove copies of an app based on load. They're the "off-the-shelf"
  comparison points this project's own modules are measured against.
- **Actuator** — the piece in this project that actually performs a
  scale-up/scale-down, standing in for what HPA/KEDA would otherwise do,
  so Module 1 and Module 3's decisions can be tested directly.
- **Ablation trial/arm** — one experiment run testing a specific
  combination of modules turned on/off, to see what each one contributes.
