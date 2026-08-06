# Hetzner VM — Manual Operations Runbook

Manual fallback for everything normally done together in a Claude Code session
for the `results_v2` live-cluster study VM. Use this if you need to check
progress, access the VM, or manage its lifecycle yourself — no AI assistance
required. Every command below is copy-pasteable into PowerShell or Git Bash.

## Safety warning — read this first

**Never use the Hetzner web console's Ctrl+Alt+Del / "Reset" action.** It maps
to a real power-reset signal on the guest, not a keystroke inside a terminal —
this already caused one unplanned reboot mid-study (2026-08-06). Use SSH or
the `hcloud` CLI for everything below instead. Both are safe: nothing you type
in a normal terminal or SFTP session can reboot or power-cycle the VM.

## Current VM details (update if the VM is ever recreated)

| Item | Value |
|---|---|
| Server name | `fyp-results-v2` |
| Server ID | `159552199` |
| Public IP | `5.223.49.63` |
| Region | `sin` (Singapore) |
| Type | `cpx42` (8 shared vCPU, 16GB RAM, 320GB NVMe) |
| OS | Ubuntu 24.04 x86 |
| SSH private key | `C:\Users\randu\.ssh\id_ed25519_hetzner_fyp` |
| SSH config alias | `fyp-hetzner` (defined in `C:\Users\randu\.ssh\config`) |
| Project path on VM | `/root/implementation` |
| Study log | `/root/run_study.log` |
| Results output | `/root/implementation/project/results_v2/ablation/` |

If the VM is ever deleted and recreated (see "Recreating from a snapshot"
below), the **IP address will change** — update this table and the SSH
config's `HostName` line to match.

## Connecting

**Plain SSH terminal:**
```
ssh fyp-hetzner
```
(This uses the alias in `C:\Users\randu\.ssh\config`. If that file doesn't
exist or the alias is gone, use the full form instead:
`ssh -i C:\Users\randu\.ssh\id_ed25519_hetzner_fyp root@5.223.49.63`)

**VS Code Remote-SSH (full file browser + editor):**
1. Install the "Remote - SSH" extension (Microsoft) if not already installed.
2. `Ctrl+Shift+P` → "Remote-SSH: Connect to Host" → select `fyp-hetzner`.
3. Choose **Linux** when asked for the OS (the VM runs Ubuntu).
4. Once connected: Explorer → "Open Folder" → `/root/implementation`.

**WinSCP (drag-and-drop file transfer, alternative to VS Code):**
New Site → SFTP → Host `5.223.49.63`, user `root`, point at the same private
key file (WinSCP will offer to convert it from OpenSSH format if asked).

## Checking study/trial progress manually

**Live-tail the running study log** (Ctrl+C to stop watching, doesn't affect
the study):
```
ssh fyp-hetzner "tail -f /root/run_study.log"
```

**Quick snapshot — last few log lines + how many trials are valid so far:**
```
ssh fyp-hetzner "tail -5 /root/run_study.log; echo ---; ls /root/implementation/project/results_v2/ablation | wc -l"
```

**List all completed/finished trial lines:**
```
ssh fyp-hetzner "grep -E 'FINISHED arm=|SKIP arm=' /root/run_study.log"
```

**Validate every trial's `metrics.json`** (confirms `aborted: false` and a
non-empty replica trajectory, not just that the file exists):
```
ssh fyp-hetzner "cd /root/implementation/project/results_v2/ablation && for d in */; do f=\"$d/metrics.json\"; if [ -f \"$f\" ]; then python3 -c \"import json;m=json.load(open('$f'));print('$d aborted=',m.get('aborted'),'samples=',len(m.get('replica_trajectory',[])))\"; else echo \"$d NO metrics.json\"; fi; done"
```

**Check for a stuck/dead study process** (should show one `bash` running the
resume script + one `python3 run_trial.py`; if empty, the study has stopped
and needs relaunching):
```
ssh fyp-hetzner "ps aux | grep -E 'run_trial|run_study' | grep -v grep"
```

**Check memory** (the study's own safety net aborts a trial if available
memory drops below 2.5GB; useful when diagnosing a crash):
```
ssh fyp-hetzner "free -h"
```

**Check for an OOM kill** (if a trial died with no clear error, this is
usually why):
```
ssh fyp-hetzner "dmesg -T | grep -i -E 'killed process|out of memory' | tail -20"
```

## If the study needs relaunching

The canonical resume approach used throughout this project: a bash script
that loops over remaining `(arm, trial)` pairs and skips any that already
have a valid `metrics.json`, so it's safe to re-run at any time without
re-doing completed trials or hand-editing a trial list.

```bash
# On the VM, create /root/run_study_resume.sh with contents like:
#!/bin/bash
cd /root/implementation
run_one() {
  local arm=$1 n=$2
  local found
  found=$(python3 -c "
import glob, json
ok = False
for d in glob.glob('project/results_v2/ablation/*_${arm}_v2_t${n}'):
    try:
        m = json.load(open(d + '/metrics.json'))
        if m.get('aborted') is False and len(m.get('replica_trajectory', [])) > 0:
            ok = True
    except Exception:
        pass
print('valid' if ok else 'missing')
")
  if [ "$found" = "valid" ]; then
    echo "=== SKIP arm=$arm trial=$n (already valid) ==="
    return
  fi
  echo "=== $(date -u +%FT%TZ) STARTING arm=$arm trial=$n ==="
  python3 project/live_cluster/ablation/run_trial.py \
    --arm "$arm" --run-tag "v2_t$n" \
    --results-dir /root/implementation/project/results_v2/ablation \
    --min-rps 8 --max-rps 32 --min-free-gb 2.5
  echo "=== $(date -u +%FT%TZ) FINISHED arm=$arm trial=$n (exit $?) ==="
}
for arm in baseline m1_only m2_only m3_only full; do
  for n in 1 2 3 4 5; do
    run_one "$arm" "$n"
  done
done
echo "=== ALL REMAINING TRIALS COMPLETE $(date -u +%FT%TZ) ==="
```

**Launch it fully detached** (survives SSH disconnects, including the link
flakiness this session hit repeatedly — a plain `nohup ... &` was not always
enough; `setsid` was needed):
```
ssh fyp-hetzner "setsid nohup bash /root/run_study_resume.sh >> /root/run_study.log 2>&1 < /dev/null & disown"
```

**Before launching, always confirm no other `run_trial.py` is already
running** (running two at once against the same cluster corrupts both —
this happened twice this session):
```
ssh fyp-hetzner "ps aux | grep run_trial.py | grep -v grep"
```

## Copying results back to your machine

```
scp -r -i C:\Users\randu\.ssh\id_ed25519_hetzner_fyp root@5.223.49.63:/root/implementation/project/results_v2 "c:\Users\randu\OneDrive\Desktop\Campus\FYP\implementation\project\results_v2"
```

## Running the desktop_app demo (Stage 3)

**Start it headless on the VM:**
```
ssh fyp-hetzner "cd /root/implementation && nohup python3 project/desktop_app/main.py --no-browser > /root/desktop_app.log 2>&1 & disown"
```

**Open a tunnel from your own machine, then browse locally:**
```
ssh -L 8877:127.0.0.1:8877 fyp-hetzner
```
Leave that SSH window open, then visit `http://127.0.0.1:8877` in your
browser. Ctrl+C in the SSH window closes the tunnel (doesn't stop the app on
the VM).

**Make it auto-start on boot (systemd), so it's already running after a
snapshot restore next session:**
```
ssh fyp-hetzner "cat > /etc/systemd/system/desktop-app.service << 'EOF'
[Unit]
Description=FYP desktop_app control-center web app
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/root/implementation
ExecStart=/usr/bin/python3 project/desktop_app/main.py --no-browser
Restart=on-failure
RestartSec=5
Environment=HOME=/root
Environment=KUBECONFIG=/root/.kube/config

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now desktop-app.service"
```
Check it started cleanly: `ssh fyp-hetzner "systemctl status desktop-app.service"`

## End-of-session teardown — snapshot + delete (minimizes cost)

**Why not just power it off:** Hetzner bills for reserved vCPU/RAM/disk
regardless of power state — a powered-off server costs the same as a running
one (~€0.1763/hr, ~€30/week for this server type). The only way to actually
stop paying for compute is to delete the server. A snapshot preserves
everything on disk (the cluster, `desktop_app`, all committed data) at a much
lower storage-only rate (a few cents to ~€1/month depending on used disk
space), so you can delete the VM and recreate it later from the snapshot with
everything intact.

**1. Confirm `hcloud` is authenticated** (should already be, from provisioning):
```
hcloud server list
```
If it errors, re-authenticate: `hcloud context create --token-from-env` (with
`HCLOUD_TOKEN` set), or `hcloud context list` / `hcloud context use <name>`
if a context already exists.

**2. Take the snapshot** (do this only after confirming `results_v2/` is
already copied locally — the snapshot is a safety net for redeploying the
demo, not the primary backup of the actual result data):
```
hcloud server create-image --type snapshot --description "fyp-results-v2-post-study" fyp-results-v2
```
This returns an image ID — note it down (also visible via `hcloud image list
--type snapshot`).

**3. Delete the server** (stops billing immediately):
```
hcloud server delete fyp-results-v2
```

## Recreating the VM from a snapshot (next session)

**1. Find the snapshot's image ID** (if not already noted):
```
hcloud image list --type snapshot
```

**2. Create a new server from it** (same type/region as before, using the
same SSH key already uploaded to the Hetzner project):
```
hcloud server create --name fyp-results-v2 --type cpx42 --location sin --image <IMAGE_ID> --ssh-key fyp-results-v2
```

**3. Note the new IP address** from the command's output (or `hcloud server
ip fyp-results-v2`), and update:
   - The "Current VM details" table at the top of this file.
   - `HostName` in `C:\Users\randu\.ssh\config`'s `fyp-hetzner` entry.

**4. Confirm the cluster and desktop_app came back healthy** (a snapshot
restores disk state, but running containers need the container runtime to
reconcile after a fresh boot — this can take a minute or two):
```
ssh fyp-hetzner "docker ps; kubectl get pods -A; systemctl status desktop-app.service"
```
If pods aren't `Running`, check `kind` cluster health first:
```
ssh fyp-hetzner "kind get clusters; kubectl get nodes"
```

**5. Open the tunnel and browse** as described above.

**6. When done demoing, repeat the snapshot + delete steps** to stop billing
again — snapshots stack (each is billed by its own size), so consider
deleting the previous snapshot after confirming the new one is good, via
`hcloud image delete <old-image-id>`.

## Troubleshooting quick reference

- **SSH command returns exit 255 but you're not sure if it actually ran**:
  this VM's link (Singapore-routed) has intermittent drops observed
  throughout this project. Don't assume failure — re-run the same check on a
  fresh connection (`ps aux | grep ...`, or check for the expected output
  file) before concluding anything didn't work.
- **Orphaned `tail -f /root/run_study.log` processes accumulating**: harmless
  but worth cleaning up occasionally — `ssh fyp-hetzner "pkill -f 'tail -f -n 0 /root/run_study.log'"`.
- **A trial crashes with `CalledProcessError` on `kubectl scale` right after a
  reboot**: known cause was a stale `~/.kube/cache/` directory interrupted
  mid-write by the reboot — `ssh fyp-hetzner "rm -rf ~/.kube/cache"` is safe
  (kubectl regenerates it), then validate with a single isolated trial before
  relaunching the full sequence.
- **`module1-controller`/`module3-controller` pods stuck `Pending` with zero
  scheduling events**: check the scheduler pod
  (`kubectl get pods -n kube-system -l component=kube-scheduler`) — if it's
  not `1/1 Ready`, check its logs for RBAC/API errors, which usually means
  its pinned image version drifted from the actual cluster version (this
  happened once — see `Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 6
  section for the full diagnosis and fix already applied to
  `project/live_cluster/backups/kube-scheduler.yaml.orig` and
  `project/live_cluster/module2_extender/kube-scheduler-with-extender.yaml`).
