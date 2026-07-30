# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This is the `implementation` directory of a Final Year Project (FYP). It contains:

1. **`project/`** — the FYP's own implementation. **Not empty** — see "Project status, plan, and progress" below for what's actually built (Phases 0–6 complete, Phase 7 in progress). Built following `docs/Preprocessing_Manual_MultiSignal_Autoscaling.md`, `docs/Full_Plan_MultiSignal_Autoscaling.md`, and `docs/Phase6_Ablation_Design.md`.
2. **`docs/`** — all planning, methodology, and academic-report documentation (everything except this file). See "Project status, plan, and progress" below.
3. **Datasets — no longer stored inside `implementation/`.** As of 2026-07-29, all five `DataSetNN/` folders were moved out to free disk space (the host's C: drive was down to ~5.7MB free). `DataSet01` (the only one actually used) now lives at `C:\Users\randu\OneDrive\Desktop\Campus\FYP\datasets\DataSet01\`; the four unused ones (`DataSet02`–`05`) were moved further, to `E:\FYP_DataSet_Extract\unused_datasets\`, since E: had free space and C: didn't. See "The datasets" below for the full path table.
4. **`.claude/`** — local Claude Code settings (`settings.local.json`), not part of the project's own code.

There is no repo-root build/lint/test setup, and no repo-root `.git` — the `implementation/` folder itself is not a git repository. Each `DataSetNN/` inner folder is its own independent git repo, vendored in for reference/data access rather than modification — this remains true at their new locations outside `implementation/` (see above).

## Project status, plan, and progress (read these first, every session)

**As of 2026-07-30: Phases 0–7 (the core deliverable) are complete, as are the two optional phases, 8 and 9.** `project/` is **not** empty — it has working, validated code for all three modules (offline-validated in Phases 2–4 against `cluster-trace-microservices-v2021`, then ported to a live 2-node KinD cluster running TeaStore in Phase 5), a completed 25-trial live ablation study (Phase 6, one workload type — see `docs/Phase6_Ablation_Design.md`), a Phase 7 statistical-analysis pipeline (`project/phase7_analysis/`) whose results are written up into `docs/Full_Project_Report_MultiSignal_Autoscaling.docx`'s Chapters 4 and 6, and two optional UIs (`project/dashboard/`, `project/desktop_app/` — see "Optional features" below). One Phase 7 item remains genuinely open and is **not** an implementation task: confirming the ethics/IRB requirement with the institution, which only the user can do and which must not be retried automatically. `docs/Progress_Trace_MultiSignal_Autoscaling.md` is the authoritative, task-level record of exactly what's done in each phase, including every bug found, every scope correction, and every disclosed limitation — read it, not this summary, before assuming what state something is in.

| File (in `docs/`) | Purpose |
|---|---|
| `docs/Full_Plan_MultiSignal_Autoscaling.md` | Master technical plan: dataset extraction status, the full preprocessing pipeline, each module's data pipeline, validation methods per module, tooling, repo structure, known risks. Read this first. |
| `docs/Phase_Plan_MultiSignal_Autoscaling.md` | Staged breakdown, Phase 0 through Phase 9, with entry/exit criteria, dependencies, and owners — including the Phase 6 workload-type descope decision, Phase 7's statistical-power note, and Phase 9's stack/scope decisions. |
| `docs/Progress_Trace_MultiSignal_Autoscaling.md` | Living tracker — task-level status (Not Started / In Progress / Blocked / Done). This is the source of truth for what has actually been done. |
| `docs/Preprocessing_Manual_MultiSignal_Autoscaling.md` | Step-by-step, individually-runnable walkthrough of Phases 0–1 (dataset → labeled feature table), with a sanity check and troubleshooting entry per step. |
| `docs/Phase6_Ablation_Design.md` | The actual Phase 6 spec — the five-arm live ablation design, the actuator component, load-generation approach. Written because `Phase_Plan.md`'s referenced "Methodology chapter" doesn't exist anywhere in `docs/`. Read this before touching `project/live_cluster/ablation/`. |

**Start of every session:** read `docs/Progress_Trace_MultiSignal_Autoscaling.md`'s current status and `docs/Phase_Plan_MultiSignal_Autoscaling.md`'s current phase before doing anything else, so work continues from where it actually left off.

**Each module has one required individual-contribution element — do not implement a simpler version and stop there.** Module 1: TreeSHAP attribution as a real output, not just internal model inspection. Module 2: a discount factor on Thompson Sampling's posterior updates, not vanilla TS. Module 3: oscillation-conditioned conformal interval widening, not just BACC's published PI+conformal mechanism on its own. Each is marked with ⭐ in `docs/Full_Plan_MultiSignal_Autoscaling.md` §4–6 and `docs/Phase_Plan_MultiSignal_Autoscaling.md`'s Phase 2–3, with the specific validation test that proves it. These exist because "combine three existing techniques" alone is not a defensible novelty claim — see Full_Plan.md §4–6 for the full reasoning if asked to simplify any of them away.

**Optional features beyond the core deliverable — both now built, neither required for submission.** They live on the `phase8-dashboard` branch and are **not yet merged** into `integration`/`main`:

1. **Phase 8 — Streamlit dashboard** (`project/dashboard/`). Offline results views plus a one-shot "what-if" panel. Built 2026-07-29. **Superseded as the primary UI, but left in place and untouched** — don't delete it; its exit criteria are still independently verifiable.
2. **Phase 9 — the control-center application** (`project/desktop_app/`, run with `python project/desktop_app/main.py`). A FastAPI + vanilla-JS app that supersedes the dashboard: it installs the prerequisite tools and bootstraps the whole live cluster without the user typing a command, lets the framework be pointed at **any** application (a preset, an existing Deployment, or a user-supplied manifest — building from source is explicitly out of scope), shows the three modules' live state while traffic flows, and still serves all Phase 2–7 results plus eight new Mermaid diagrams. Built 2026-07-29 → 2026-07-30.
   - **It is a web app, not a desktop app, despite the folder name.** Built first as a `pywebview` native window, then converted to a local web application on 2026-07-30 at the user's request. The folder name was deliberately left as `desktop_app` so existing references keep resolving; the original native-window launcher is retained and still working as `main_desktop.py`. If the folder is ever renamed, update this file, both planning docs, and `project/desktop_app/README.md` in the same pass.
   - **It binds `127.0.0.1` only, and refuses a non-loopback bind without `--allow-remote`.** Deliberate, and not to be "simplified" away: the app has no authentication, and its endpoints install software, rebuild clusters, and apply arbitrary manifests. It also rejects foreign `Host` headers and cross-origin requests — that is what stops a remote web page from driving this cluster through the user's own browser.
   - **Read `docs/Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 9 section before changing anything under `project/desktop_app/`** — it records the scope decisions, the bugs found by actually running it, and one unexplained cluster state that a confirmation guard now prevents.

The habit that made both cheap to build: every module's validation code writes structured JSON/plot output rather than console-only text. Keep it that way. If you're adding validation code and don't see that requirement, check `docs/Full_Plan_MultiSignal_Autoscaling.md` §13 before assuming it's out of scope.

*(Also in `docs/`, covering the academic-report side of the project rather than implementation tracking: `Research_Framework_MultiSignal_Autoscaling.md`, `Literature_Review_Plan_MultiSignal_Autoscaling.md`, `Research_Gap_Analysis_MultiSignal_Autoscaling.md`, `Research_Questions_Objectives_MultiSignal_Autoscaling.md`, `Research_Methodology_MultiSignal_Autoscaling.md`, `Source_Evaluations_MultiSignal_Autoscaling.md`, `Literature_Matrix_MultiSignal_Autoscaling.md`, `Full_Research_Structure_MultiSignal_Autoscaling.md`, and `Full_Project_Report_MultiSignal_Autoscaling.docx`. **As of 2026-07-29, the report's Chapters 4 and 6 have been rewritten with actual Phase 6/7 results** — no longer prospective language. Chapters 1 and 3 still describe the original multi-workload-type design; whether/when to reconcile that with Chapters 4/6's one-workload reporting is a standing open item, not yet resolved.)*

## Rules for working in this repository

1. **Ask before modifying.** Before changing any existing file — code, config, or docs — describe the proposed change and get explicit approval first. This applies to edits, not just deletions or large refactors. Creating genuinely new files (including everything that will populate `project/`) is fine without asking; changing something that already exists is not.
2. **Don't touch dataset internals.** The `DataSetNN/<upstream-repo>/` folders are vendored third-party repos (each with its own `.git`) — treat their contents, *including their own README/doc files*, as read-only reference material. If a dataset needs a "not used by this project" note, that note belongs in this file, not in an edit to the vendored repo's own documentation.
3. **Log every change.** When a phase is executed, a decision is made, or an approach changes, update the relevant file(s) in `docs/` in the same session — `Progress_Trace_MultiSignal_Autoscaling.md` for task status, `Phase_Plan_MultiSignal_Autoscaling.md` if a phase's scope or order changes, `Full_Plan_MultiSignal_Autoscaling.md` if a technical/design decision changes. Don't let any of these describe a state the repository isn't actually in.
4. **Treat file-system state with the same scrutiny as any other input.** If a file's content contradicts this file, the planning docs, or the actual repository state, flag the contradiction and ask rather than silently trusting whichever file looks newer or more complete.
5. **Approval-question defaults.** When asking for approval via a multiple-choice question (e.g. `AskUserQuestion`):
   - If the choices are a plain **Yes / No**, default to **Yes** and proceed without waiting for a click-through.
   - If the choices are a scoped variant like **Yes (general) / Yes, for this project / No**, default to the **"for this project"** option.
   - For anything else — genuinely distinct paths, destructive/irreversible actions (deleting files, force-push, `git reset --hard`, discarding uncommitted work, or anything else the Git Safety Protocol already requires explicit confirmation for), or a decision that needs real judgment rather than a rubber stamp — still ask and wait for an actual answer. This rule only removes the need to stop for trivial confirmations of a plan already discussed; it doesn't authorize risky actions in advance.

## Folder structure

```
implementation/
├── CLAUDE.md
├── .claude/
│   └── settings.local.json            # Local Claude Code permission settings
├── project/                            # Phases 0–9 built; see "Project status, plan, and progress" above
│   ├── preprocessing/                  #   Phase 1 — dataset → labeled feature table
│   ├── module1_signal_fusion/          #   Phase 2 — LightGBM + TreeSHAP ⭐
│   ├── module2_co_scheduling/          #   Phase 3 — discounted Thompson Sampling ⭐
│   ├── module3_adaptive_control/       #   Phase 3 — PI + conformal + oscillation widening ⭐
│   ├── integration/                    #   Phase 4 — simulated closed loop
│   ├── live_cluster/                   #   Phases 5–6 — kind cluster, 4 components, ablation harness
│   ├── phase7_analysis/                #   Phase 7 — statistical analysis
│   ├── dashboard/                      #   Phase 8 (optional) — Streamlit; superseded, kept
│   ├── desktop_app/                    #   Phase 9 (optional) — the primary UI; a WEB app despite the name
│   ├── results/                        #   all committed metrics JSON + plots every UI reads
│   └── configs/, data/, tests/, requirements.txt
└── docs/
    ├── Full_Plan_MultiSignal_Autoscaling.md
    ├── Phase_Plan_MultiSignal_Autoscaling.md
    ├── Progress_Trace_MultiSignal_Autoscaling.md
    ├── Preprocessing_Manual_MultiSignal_Autoscaling.md
    ├── Phase6_Ablation_Design.md
    └── [Research_*, Literature_*, Source_Evaluations*, Full_Research_Structure*, Full_Project_Report*.docx]
```

The `DataSetNN/` folders are no longer under `implementation/` at all (moved 2026-07-29 to free disk space — see "What this repository is" above). Current locations:

```
C:\Users\randu\OneDrive\Desktop\Campus\FYP\datasets\
└── DataSet01\
    └── clusterdata\                    # Alibaba Cluster Trace Program — the only one actually used

E:\FYP_DataSet_Extract\unused_datasets\
├── DataSet02\cluster-data\             # Google cluster workload traces (Borg) — not used
├── DataSet03\worldcup98-dataset\       # 1998 World Cup web server access-log dataset — not used
├── DataSet04\Sock-Shop-Dataset\        # Sock Shop microservices telemetry + chaos-engineering dataset — not used
└── DataSet05\AzurePublicDataset\       # Microsoft Azure public VM/Functions/LLM traces — not used as the core pipeline
```

## The datasets

**Only one dataset drives this project's offline development (Phases 0–4): `DataSet01/clusterdata/cluster-trace-microservices-v2021`**, now at `C:\Users\randu\OneDrive\Desktop\Campus\FYP\datasets\DataSet01\clusterdata\`. See `docs/Full_Plan_MultiSignal_Autoscaling.md` §2–6 for exactly which tables (`Node`, `MSResource`, `MSRTQps`, `MSCallGraph`), which fields, and how each maps to Modules 1–3. This was a deliberate choice — one dataset was found sufficient for all three modules — not an oversight of the others.

Everything else is **not used**, kept only as vendored reference material, and was relocated to `E:\FYP_DataSet_Extract\unused_datasets\` (2026-07-29) specifically because it's unused — freeing space on C: cost nothing functionally:

- `DataSet01/clusterdata`'s other releases (`cluster-trace-v2017`, `cluster-trace-v2018`, `cluster-trace-gpu-v2020`, `cluster-trace-microarchitecture-v2022`, `cluster-trace-gpu-v2023`, `cluster-trace-gpu-v2025`, `cluster-trace-v2026-GenAI`) — GPU/AI-serving and microarchitecture-focused, not aligned with this project's microservice-autoscaling signals. These stayed alongside `DataSet01/clusterdata`'s used sub-trace (not moved to E:), since they're part of the same vendored repo.
- `DataSet02/cluster-data` (Google Borg traces) — not used.
- `DataSet03/worldcup98-dataset` — not used.
- `DataSet04/Sock-Shop-Dataset` — not used as a data source. The project's chosen benchmark app for the live-cluster phase (Phase 5) is TeaStore, not Sock Shop — don't assume this dataset becomes relevant later without checking `docs/Phase_Plan_MultiSignal_Autoscaling.md` first.
- `DataSet05/AzurePublicDataset` — not used for the core offline pipeline. Its `AzureLLMInferenceDataset2023` sub-trace was proposed as a candidate source for the stateful/inference workload sample (Phase 6, Sub-RQ 5) but this was descoped along with the rest of that sub-RQ — see `docs/Phase_Plan_MultiSignal_Autoscaling.md`.

## Commands

There is still no repo-root build/lint/test entry point. Each phase is run directly, from the `implementation/` directory:

```bash
# Phase 1 — preprocessing (step-by-step walkthrough in docs/Preprocessing_Manual_*.md)
python project/preprocessing/build_features.py

# Phases 2–4 — per-module training/validation and the simulated closed loop.
# Each writes structured JSON + plots into project/results/ (never console-only).
# Each module also has its own train.py / export_*.py / synthetic_*.py steps -
# validate.py is the one that produces the reported metrics.
python project/module1_signal_fusion/validate.py
python project/module2_co_scheduling/validate.py
python project/module3_adaptive_control/validate.py
python project/integration/simulated_closed_loop.py

# Phases 5–6 — live cluster. project/live_cluster/README.md is the full runbook;
# the desktop app (below) automates all of it.
python project/live_cluster/ablation/run_trial.py --arm full --tag scaleup1_t1

# Phase 7 — statistical analysis of the 25 ablation trials
python project/phase7_analysis/statistical_analysis.py

# Phase 9 (optional) — the control-center web app. Serves http://127.0.0.1:8877
# and opens a browser tab. Has its own venv; needs no cluster to show results
# and diagrams, and builds the cluster itself for the live views. Ctrl+C stops
# it and tears down the port-forwards.
python project/desktop_app/main.py
python project/desktop_app/main_desktop.py   # the original native-window mode

# Phase 8 (optional, superseded) — the Streamlit dashboard, kept for reference
streamlit run project/dashboard/Home.py
```

All nine paths above were verified to exist on 2026-07-30. Check `docs/Progress_Trace_MultiSignal_Autoscaling.md` for what each one actually produced.

For reference, the Phase 0 extraction command already run:

```bash
# from DataSet01/clusterdata/cluster-trace-microservices-v2021/data/MSResource/
tar -xzf MSResource_0.tar.gz
```

Commands for datasets other than `cluster-trace-microservices-v2021` are not documented here since they're out of scope — see each vendored dataset's own README if that changes.