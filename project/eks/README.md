# Phase 10 — AWS EKS deployment

Deploys the full framework to Amazon EKS and drives synthetic load at it, to
get metrics from real infrastructure rather than a 2-node laptop cluster.

**Nothing here has been run.** These files were written offline; every claim
about EKS behaviour is marked **[verify]** and must be confirmed on first use.

## Before you start: two things that decide whether this is worth it

**1. Module 2 needs a second scheduler, and that is the go/no-go.**
Module 2 is a scheduler *extender*. On kind it is wired in by overwriting
`kube-scheduler`'s static-pod manifest inside the control-plane container.
**EKS's control plane is managed — that is impossible there.** The fix is
`module2_scheduler/`: run the `kube-scheduler` binary as an in-cluster
Deployment with our own config, and select it per workload with
`spec.schedulerName`. `module2_extender/app.py` needs no changes.

If step 4 below fails, stop. The honest outcome is a Phase 10 scoped to
Modules 1+3 with that stated — not Module 2 quietly missing.

**2. The load rates from Phase 6 are too low for this cluster.**
Phase 6 validated 8–24 req/s against 2 kind nodes at `maxReplicas=2`, kept
deliberately conservative because of the laptop's OOM history. Four `t3.large`
nodes at `maxReplicas=6` have roughly 3–4× that capacity. Pushing 8–24 req/s at
them means no scaling, no SLA violations, and the same inconclusive results as
Phase 6 — on hardware you are paying for. **Step 6 exists to prevent that.**

## Cost

| Item | Rate |
|---|---|
| EKS control plane | **$0.10/hr — bills while the cluster exists, idle or not** |
| 4 × t3.large spot | ~$0.10/hr |
| ECR | ~500 MB free, then $0.10/GB-month |

**~$0.20/hr while up.** The risk is not the run, it is a forgotten cluster at
~$2.40/day. Set the budget alarm in step 1 *before* creating anything, and run
`teardown.ps1` at the end of **every** session.

The cluster only needs to exist for steps 4–7. Steps 2–3 and all editing are
offline.

## Steps

### 1. Account and guardrails — no cluster yet

```powershell
aws configure                     # key, secret, region, output=json
aws sts get-caller-identity       # must print your account
```

Install [`eksctl`](https://eksctl.io/installation/), then **set a budget alarm
before anything else**: AWS Console → Billing → Budgets → Create budget →
Cost budget → $20/month → email alert at 80%. This is the one step that turns a
forgotten cluster from a bill into an email.

### 2. Fill in `cluster.yaml` — offline

Three placeholders: `<REGION>`, `<AZ_A>`/`<AZ_B>`, `<K8S_VERSION>`.

```powershell
aws ec2 describe-availability-zones --region <REGION> --query "AvailabilityZones[].ZoneName" --output text
```

Use the same `<K8S_VERSION>` in `module2_scheduler/deployment.yaml`'s
`kube-scheduler` image tag — a mismatch there is a step-4 failure.

### 3. Images to ECR — offline except the push

```powershell
python ecr_push.py --dry-run          # check what it will do
python ecr_push.py --write-manifests  # build, push, repoint the deployment.yamls
```

`--write-manifests` **modifies** the four `live_cluster/*/deployment.yaml`
files (image URI + `imagePullPolicy: Always`). Review the diff before
committing; `imagePullPolicy: IfNotPresent` is correct for kind and wrong for
EKS, where it would pin nodes to a stale cached image.

### 4. Cluster up, and prove teardown works

```powershell
eksctl create cluster -f cluster.yaml      # 15-20 min
kubectl get nodes                          # expect 4 Ready
```

**Then immediately run `.\teardown.ps1` and recreate.** Proving the teardown
path works while you have nothing to lose is cheaper than discovering it is
broken later.

### 5. Deploy the second scheduler — THE GO/NO-GO

```powershell
cd module2_scheduler
kubectl create configmap module2-scheduler-config -n kube-system --from-file=scheduler-config.yaml=.\scheduler-config.yaml
kubectl apply -f deployment.yaml
kubectl -n kube-system rollout status deployment/module2-scheduler
```

Then deploy the framework (metrics-server, KEDA, TeaStore, the four
components) exactly as `live_cluster/README.md` Part B does, minus the
scheduler-swap step — that is what this replaces.

**Verify all four of these before going further:**

```powershell
# 1. our scheduler is running and did NOT take over the whole cluster
kubectl -n kube-system logs deploy/module2-scheduler | Select-String "Successfully bound"

# 2. the target app is using it
kubectl patch deploy teastore-webui -p '{\"spec\":{\"template\":{\"spec\":{\"schedulerName\":\"module2-scheduler\"}}}}'
kubectl rollout status deploy/teastore-webui

# 3. the extender is actually being called - this is the real check
kubectl logs deploy/module2-extender | Select-String "filter|prioritize"

# 4. pods still schedule when it is NOT selected
kubectl get pods -o custom-columns=NAME:.metadata.name,SCHEDULER:.spec.schedulerName
```

Check 3 matters most: `ignorable: true` in the config means scheduling still
succeeds if the extender is unreachable, so **a silently dead extender looks
exactly like a working Module 2 arm.** Only the log proves it.

### 6. Find the real saturation point — do not skip

```powershell
cd loadgen
kubectl create configmap eks-capacity-probe-script --from-file=capacity_probe.js=.\capacity_probe.js
kubectl apply -f capacity-probe-job.yaml
kubectl logs -f job/eks-capacity-probe
```

Watch alongside: `kubectl top pods -l run=teastore-webui` and
`kubectl get deploy teastore-webui -w`.

Sweep `RATES` in the Job until p99 turns sharply upward while CPU approaches
its limit. The starting guess (`25,50,100,150,200`) is a **guess**, not a
validated band. Then set `--max-rps` somewhat *below* saturation, so the
actuator's band rule has room to react in both directions instead of sitting
pinned at the ceiling.

### 7. Drive the trial load

Regenerate the replay stages at the range step 6 found, then run
`ablation_trial.js` as it already runs on kind — the shape comes from the
Alibaba trace, only the magnitude changes:

```powershell
python ..\live_cluster\loadgen\generate_replay_stages.py --min-rps <LOW> --max-rps <HIGH> --duration 900
```

### 8. Tear down — every session

```powershell
.\teardown.ps1
```

Verifies the cluster is actually gone and lists leftovers that still bill
(unattached EBS volumes, load balancers).

## Files

| File | What |
|---|---|
| `cluster.yaml` | eksctl config: 4 × t3.large spot, fixed size, one AZ for the nodes |
| `ecr_push.py` | create repos, build, tag, push; optionally repoint the manifests |
| `module2_scheduler/scheduler-config.yaml` | our `KubeSchedulerConfiguration` — read its comments, all four differences from the kind version are load-bearing |
| `module2_scheduler/deployment.yaml` | the scheduler Deployment + ServiceAccount + RBAC |
| `loadgen/capacity_probe.js` | rate-parameterised probe (the kind one hardcodes 8/16/24) |
| `loadgen/capacity-probe-job.yaml` | runs it in-cluster, so load is not measured over your home internet |
| `teardown.ps1` | delete **and verify**, plus a leftovers check |

## Why 4 × t3.large

**4 nodes** — Module 2 is a node-scoring bandit that had 2 candidates live
against 371 in offline validation. Four gives it something to differentiate and
makes an induced rank-inversion meaningful (degrade the favourite, three
alternatives remain), while keeping enough placement events per node for the
posteriors to converge. More nodes would spread the pulls too thin. The node
group is **fixed at 4** (`minSize == maxSize`) because a node set that changes
under the bandit invalidates its posteriors mid-experiment — do not add the
cluster autoscaler.

**t3.large, not t3.medium** — from the real manifests: TeaStore at one replica
each is 7.25 GiB, the framework 0.56 GiB, supporting services ~1.5 GiB, and
five extra `teastore-webui` replicas add 7.5 GiB → **~16.8 GiB at
`maxReplicas=6`**. Four `t3.medium` is 16 GiB raw but only ~12.8 GiB
allocatable after EKS node overhead, so scale-up would stall on Pending pods —
destroying the exact measurement this cluster exists to take.
