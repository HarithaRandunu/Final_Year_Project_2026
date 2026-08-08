# WebApp Plan
## A Next.js results/reporting web app for the Multi-Signal, Co-Scheduling Autoscaling Framework with Adaptive Control

*Companion document to `Full_Plan_MultiSignal_Autoscaling.md` and `Phase_Plan_MultiSignal_Autoscaling.md`, scoped narrowly to `project/webapp/` — the replacement for the deleted `project/desktop_app/` (former Phase 9). Read `WebApp_Progress_Trace_MultiSignal_Autoscaling.md` alongside this file for what's actually been built.*

---

## Why this exists

`project/desktop_app/` (FastAPI + vanilla JS) was deleted by the user on 2026-08-07 after
being iterated on twice in one session (narrowed to read-only, then had a live-comparison
view added back). Rather than resurrect it as-is, the user asked for a full from-scratch
rebuild — explicitly **not in Python** — structured as a formal phase-by-phase plan with a
progress tracker, so each phase can be checked in the browser before the next one starts.

This app's job is unchanged in spirit from the old one: read already-committed results and
report files off disk and present them clearly. It computes nothing new. Its scope is wider
in content than the old app's narrowed form, covering five sections end to end:

1. Research Overview — the academic framing (problem, RQs, gap, novelty, methodology).
2. Project Overview — the system itself (architecture, modules, tech stack, dataset, team).
3. Training & Test Results — offline module validation + both live 25-trial ablation studies.
4. Final Conclusion — headline findings, disclosed limitations, future work.
5. Live Run — a live cluster comparison view (framework live vs. a recorded baseline trial).

## Stack

**Next.js (App Router) + React + TypeScript + Tailwind CSS v4 + shadcn/ui, no separate
backend server.** Corrected twice in Phase 1:
1. First pass used plain Node/Express + vanilla JS — a misreading of "build this as a
   Next.js project" as "build the next project we do." Re-scaffolded on Next.js.
2. Second pass hand-wrote the Next.js project file-by-file (JS, plain CSS, hand-rolled
   nav) instead of using the official scaffolding tool. The user asked for the real
   `create-next-app` CLI flow with its actual defaults (TypeScript, Tailwind), plus
   shadcn/ui for components and a dark-first theme — none of which a hand-written
   scaffold reproduces faithfully. **Deleted the whole directory and reinitialized from
   the CLI**, then layered shadcn/ui on top, rather than patching the hand-written
   version piecemeal.

Both corrections landed before any content phase began, so only Phase 1 needed redoing
each time — Phases 2–7 were untouched.

- Scaffolded via `npx create-next-app@latest webapp --ts --tailwind --eslint --app
  --import-alias "@/*" --use-npm --disable-git` (git disabled since `implementation/` is
  already one repo — a nested repo would conflict), then `npx shadcn@latest init -d -f`
  (defaults preset) and `npx shadcn@latest add card badge table tabs separator
  navigation-menu sonner skeleton` for the component set the later phases need.
- TypeScript throughout (`.ts`/`.tsx`), not JavaScript — `lib/{config,colors,data}.ts`
  carry real types (e.g. `Arm`, `PortForwardTarget`), page/component files are `.tsx`.
- **Dark theme by default**, via `next-themes`: `app/layout.tsx` wraps the tree in a
  `ThemeProvider` (`components/theme-provider.tsx`) with `attribute="class"
  defaultTheme="dark" enableSystem={false}`. The pre-hydration script `next-themes`
  injects into `<head>` sets `class="dark"` on `<html>` before first paint, so there is
  no flash of a light theme — confirmed by inspecting the raw server response, which
  includes that inline script verbatim. A manual toggle (`components/theme-toggle.tsx`)
  is still available (sun/moon icon button, top right) for switching to light; it uses a
  CSS-only icon swap (`dark:scale-0`/`dark:scale-100`) rather than a `useEffect`-driven
  "mounted" flag, since that common pattern trips React's
  `react-hooks/set-state-in-effect` lint rule (`eslint-config-next`'s own rule set) —
  caught and fixed during Phase 1 verification, not left as a suppressed warning.
- shadcn/ui components (`components/ui/*.tsx`) are copied into the repo, not an npm
  dependency — the standard shadcn model, meaning later phases can freely edit any of
  them (e.g. the ablation results table) without fighting a package boundary.
- File-system routing under `app/` gives each of the 5 sections a real URL (`/`,
  `/overview`, `/results`, `/conclusion`, `/live`) sharing one root layout
  (`app/layout.tsx`) with the nav bar (`components/nav-bar.tsx`, built from shadcn's
  `Button`/`buttonVariants` rather than a hand-rolled nav) and theme toggle.
- `next dev` (Next 16, Turbopack by default) **is** the "save file, refresh browser"
  workflow the phase-by-phase approach needs — hot reload on save, no manual restart.
- Server Components and Route Handlers (`app/api/.../route.ts`, added from Phase 4
  onward) run in the Node.js runtime by default, so `lib/data.ts`'s `fs`-based readers
  work with no client/server split to design around.
- `child_process` (Phase 6 only) replaces Python's `subprocess` for `kubectl
  port-forward` management, called from a Route Handler — same watchdog/backoff shape
  as the deleted app's `port_forwards.py`.
- CSV parsing (`trial_level_data.csv`) is hand-rolled in `lib/data.ts::readCsv` — the
  data is a flat numeric table, not worth a dependency.
- Diagrams: **not** Mermaid (tried, then retired — see the progress tracker's Phase 3
  follow-up fixes). Mermaid's auto-layout doesn't guarantee crossing-free edges even for
  small graphs, and its default theme reads as plain. Replaced with hand-authored inline
  SVG (`components/diagram-figure.tsx`'s `DiagramFigure`/`DiagramNode`/`DiagramArrow`
  primitives, per the `artifact-diagramming` skill's guidance) for the one genuine graph
  (`components/architecture-diagram.tsx`), and a plain Tailwind step-chain component
  (`components/step-flow.tsx`) for every linear sequence — both themed via `currentColor`
  and our own design tokens, no client-side JS or theme-detection needed. The vendored
  `mermaid.min.js`/`plotly.min.js` (recovered from the deleted desktop_app) were removed
  entirely once nothing referenced them; Phase 4's charts will pick a proper React
  charting library fresh rather than reusing the old vendored Plotly file.
- Runs at `http://127.0.0.1:8878` via `npm run dev` (dev) or `npm run build && npm start`
  (production-style), both pinned to `-p 8878 -H 127.0.0.1` in `package.json`'s scripts —
  deliberately different from the old desktop_app's 8877. A full production build
  (`npm run build`) was verified to succeed with all 5 routes statically prerendered.

## Shared components (built before Phase 2, used by every later phase)

- `components/status-badge.tsx` — `<StatusBadge status="pass|partial|disclosed|healthy|elevated|critical|unreachable|neutral" />`. Icon + reserved color + label, never color-alone — use this for every pass/fail/health indicator rather than a bare colored `<span>`.
- `components/loading-state.tsx` — `<LoadingState />` (spinner+label for open-ended client polling), `<CardSkeleton />`, `<TableSkeleton />` (content-shaped skeletons for known layouts). Use one of these for anything that fetches — never leave a blank gap while data is in flight, which is exactly what confused the user in the old desktop_app.
- `components/empty-state.tsx` — `<EmptyState reason="..." />` for genuinely-missing data (say *why*: not-applicable vs. not-yet-generated are different), `<InfoNote>` for softer context notes.
- `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` — Next.js route-level conventions (auto route-loading fallback, error boundary, branded 404).

**Stack gotcha worth remembering:** this shadcn preset (`base-nova`) is built on **Base
UI** (`@base-ui/react`), not Radix — despite Radix being what most shadcn tutorials
assume. Concretely: no `asChild` prop (use `render` per Base UI's docs, or just apply
`buttonVariants({...})` as a className to whatever element you actually need, as
`nav-bar.tsx` and `not-found.tsx` do); `Tooltip.Provider` takes `delay`, not
`delayDuration`. Both mistakes were caught by `tsc --noEmit` before reaching the
browser — always run it after adding a new shadcn component.

## Content sourcing — where every section's material comes from

| Section | Primary sources |
|---|---|
| Research Overview | `docs/G54_Promex_Final_Report_v2.docx` Ch.1–3 (abstract, problem, RQs, gap, novelty); `docs/Full_Plan_MultiSignal_Autoscaling.md` §4–6 (the three ⭐ novelty elements) |
| Project Overview | Report Ch.5–6 (architecture, methodology); Appendix A (three-member team, one module each — see below); 6 plain-language diagrams written inline for this page (not the recovered developer-reference `.mmd` files, which were removed as too technical — see progress tracker) |
| Training Results | `project/results/{integration,module1/primary,module2,module3}/metrics.json` + companion JSON/PNGs |
| Ablation/Test Results | `project/results/phase7/{statistical_analysis.json,trial_level_data.csv}` and the same under `project/results_v2/phase7/`; `docs/Results_v2_Study_Report_MultiSignal_Autoscaling.md` for the follow-up study's narrative |
| Final Conclusion | Report Ch.7 §7.7/§7.8 (findings from both studies), Ch.8 (limitations, future work) |
| Live Run | `project/live_cluster/{module1_controller,module3_controller,actuator}/app.py`'s real `/state`/`/risk` APIs; one recorded baseline trial from `project/results/ablation/` as the reference trace |

**Team (from Appendix A, one module each):**
- Diwyanjalee E.A.D.S.N. (214060C) — Module 1: signal fusion, risk scoring, SHAP attribution.
- Bandara K.G.R.U. (214030K) — Module 2: co-scheduling/placement, discounted Thompson Sampling.
- Malalpola M.L.H.R. (214129X) — Module 3: adaptive control, PI + conformal + oscillation guard.

**Arm color/label/order convention** (`lib/colors.ts`, ported verbatim from the deleted
app's `colors.py`): `baseline` #2a78d6, `m1_only` #eb6834, `m2_only` #1baf7a, `m3_only`
#eda100, `full` #e87ba4.

## Phases

Each phase is implemented, syntax/endpoint-verified, and then **paused for the user to
check in a browser** before the next phase begins — see the progress tracker for what to
click through at each stage.

1. **Foundation & scaffold** — Next.js + TypeScript + Tailwind project via
   `create-next-app`, shadcn/ui initialized, root layout with nav bar and dark-default
   theme toggle, all 5 sections as real routes with placeholder content, vendored
   chart/diagram libs in place.
2. **Research Overview page** — problem, RQs, gap, novelty, methodology; one step-flow
   flowchart of the research design.
3. **Project Overview page** — architecture, modules, tech stack, dataset, team
   contribution cards, 6 of the 8 recovered diagrams (built as: dropped 06/07, which
   describe the deleted desktop_app's own UI features rather than the research
   framework — same precedent as that app's own earlier narrowing).
4. **Training & Test Results page** — training tab (Module 1/2/3 + Integration) and
   ablation tab (both studies side by side, dataset toggle).
5. **Final Conclusion page** — findings, limitations, future work.
6. **Live Run page** — live-vs-recorded-reference gauges, status tiles, charts.
7. **Polish & cross-cutting** — nav/theme consistency, README, CLAUDE.md updates, final
   verification pass.

## Why baseline and full can't run live, simultaneously (carried over from the prior design)

Confirmed via `project/live_cluster/ablation/run_trial.py`'s `ARM_CONFIGS`/
`configure_arm()`/`set_scheduler_mode()`: every arm shares the same `teastore-webui`
Deployment, and the cluster can only be in one kube-scheduler mode (default vs. the
project's extender) at a time. So the Live Run page shows **live** data for whichever arm
is actually deployed (intended: `full`, for the demo) against a **recorded** baseline
trajectory from the completed 25-trial study — the same controlled comparison the report's
Chapter 7 already validated statistically, just visualized live rather than rebuilt as two
simultaneous live stacks.

## Non-goals (carried over from the desktop_app narrowing decision)

No tool installation, no cluster bootstrap, no target-app switching, no write/PATCH
endpoints against a live cluster. The Live Run page only ever reads (`GET` + `kubectl
port-forward`), and degrades to a clear "no cluster detected" state rather than offering
to set one up.
