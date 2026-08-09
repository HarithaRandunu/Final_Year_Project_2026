# WebApp Progress Trace
## `project/webapp/` — the Node.js results/reporting web app

*Living tracker for the phased rebuild described in `WebApp_Plan_MultiSignal_Autoscaling.md`.
Update Status/Notes as each phase lands. Statuses: **Not Started / In Progress / Blocked / Done**.
Each phase is meant to be checked by the user in a browser before the next one starts — the
"how to check" column is written for that purpose, not for a re-reader of this file only.*

---

## Background — why this document exists

`project/desktop_app/` (Python/FastAPI) was deleted by the user on 2026-08-07. Rather than
rebuild it as-is, the user asked for a from-scratch Next.js/TypeScript rebuild with a formal phase-by-phase
plan and tracker (this document), so each phase can be checked before the next begins. See
`docs/Progress_Trace_MultiSignal_Autoscaling.md`'s Phase 9 section for the full history of the
now-deleted app, up through its final live-comparison-view addition on 2026-08-07 — this document
picks up from there.

---

## Phase 1 — Foundation & scaffold

**Correction mid-phase: wrong stack, then fixed.** The first pass built a plain Node.js +
Express + vanilla-JS app (server on port 8878, static `public/index.html` with a hand-rolled
nav-switch). The user's original instruction — "so it is good if we can choose next project
for this instead of python" — was a request for **Next.js**, misread at the time as "the
next project we build." Caught immediately when the user asked "why didnt you build this
from nextjs project. i told you." Re-scaffolded on Next.js 14 (App Router) before any
content phase began, so only Phase 1 itself needed redoing — Phases 2–7 were still pending
and unaffected.

| Task | Status | Notes |
|---|---|---|
| ~~Express server, static frontend~~ (superseded) | Removed | `server/`, `public/index.html`, `public/css/style.css`, `public/js/{app,ui}.js` deleted; `public/vendor/` and `public/diagrams/` kept (framework-agnostic static assets). |
| Next.js App Router project (`app/`, `next.config.js`, `package.json`) | Done | `npm run dev` → `next dev -p 8878`; `npm run build`/`npm start` for a production-style run, both pinned to `-H 127.0.0.1`. |
| `lib/config.js` — paths, port-forward config, bound constants | Done | Same constants as the Express version (`MODULE3_THRESHOLD_BOUNDS=[0.01,0.9]`, `ACTUATOR_REPLICA_BOUNDS=[1,3]`), rewritten as ES module exports; `WEBAPP_DIR` now derived from `process.cwd()` rather than `__dirname`, since Next's bundler relocates compiled server code and `__dirname` isn't reliable across its build output. |
| `lib/colors.js`, `lib/data.js` | Done | Same content as the Express version's `colors.js`/`data.js`, ported to ES module `export` syntax. |
| `app/layout.js` + `components/NavBar.jsx` + `components/ThemeToggle.jsx` | Done | Root layout shared across all routes; nav uses real `<Link>`s to 5 file-system routes (`/`, `/overview`, `/results`, `/conclusion`, `/live`) with `usePathname()` for active-state highlighting — replaces the old single-page `data-page` toggle. Theme applied via an inline pre-hydration script (`app/layout.js`) to avoid a flash of the wrong theme, then `ThemeToggle` (client component) manages the `localStorage` persisted toggle afterward. |
| `app/globals.css` | Done | Same design tokens/light-dark palette as the Express version's `style.css`, carried over unchanged. |
| 5 page routes with placeholder content | Done | `app/page.js` (Research Overview), `app/overview/page.js`, `app/results/page.js`, `app/conclusion/page.js`, `app/live/page.js`. |
| Vendored `plotly.min.js` / `mermaid.min.js`, 8 `.mmd` diagrams | Done (carried over) | Already recovered via `git show HEAD:project/desktop_app/frontend/...` before the stack correction — untouched by the redo, still served from `public/vendor/` and `public/diagrams/`. |
| `npm install` | Done | `next`, `react`, `react-dom` (21 top-level packages after npm's hoisting/dedup). |
| Verification | Done | `next dev` started cleanly; curled all 5 routes plus the two vendor assets and a diagram file. **First verification round gave false 404s on all 5 routes** — root-caused to a leftover Express process from the deleted first pass, still bound to `127.0.0.1:8878` and intercepting requests ahead of the Next.js process (confirmed via `Get-NetTCPConnection` + `Get-CimInstance Win32_Process`: `node server/index.js` was still alive under PID 26440). That process had survived the Phase-1-original "confirmed stopped" check because that check's filter (`CommandLine -like '*webapp*'`) didn't match a relative invocation (`server/index.js` contains no `webapp` substring) — a real gap in how that check was written, not a fluke. Killed the stray process; all 5 routes then returned 200 with correct server-rendered content (`curl` confirmed `<h1>Research Overview</h1>` and the active nav link's `class="nav-btn active"` on `/`). `node --check` passed on the two plain-JS `lib/` files (Node 24 auto-detects ES module syntax in `.js` files with no `"type"` field, so `export` didn't need a rewrite); it **can't** parse `.jsx` (`ERR_UNKNOWN_FILE_EXTENSION`), so `NavBar.jsx`/`ThemeToggle.jsx` were validated instead by the working `next dev` run actually rendering their output correctly — a stronger check than a syntax-only pass. All dev-server processes confirmed killed and port 8878 confirmed free (`Get-NetTCPConnection` empty) before moving on. |

**Lesson for future process-cleanup checks in this app:** match on the full command line
substring that's actually present (`server/index.js`, `next dev`, `start-server.js`), not on
the project folder name — a relative-path invocation from within the right `cwd` won't
contain it.

**What to check yourself:** run `npm run dev` from `project/webapp/`, open
`http://127.0.0.1:8878/`, click through all 5 nav links (each should show its placeholder
text, no console errors, and the active link should highlight), and try the theme toggle
(🌙/☀️ button, top right). If port 8878 seems unresponsive or shows something unexpected,
check for a stray process on that port first (`Get-NetTCPConnection -LocalPort 8878`)
before assuming the app itself is broken — see the note above.

### Correction #2 — hand-written Next.js was not what was asked for

The Next.js rebuild above was still hand-written file-by-file (plain `.js`/`.jsx`, plain
CSS, a manually coded nav bar) rather than started from the official scaffolding tool.
The user asked explicitly for: (1) dark theme, (2) TypeScript (`.ts`/`.tsx`), (3)
**reinitializing via the actual `create-next-app` command line** so the project gets
real default settings rather than a hand-approximation of them, (4) Tailwind CSS (which
is create-next-app's own default), and (5) a suitable component library. None of that
can be retrofitted cleanly onto a hand-written scaffold, so the whole `project/webapp/`
directory was deleted and rebuilt from the CLI rather than patched in place.

| Task | Status | Notes |
|---|---|---|
| Back up framework-agnostic assets before wiping | Done | Copied `public/vendor/{plotly,mermaid}.min.js` and `public/diagrams/*.mmd` to the session scratchpad first — the only pieces worth carrying through a full wipe, since everything else was being replaced anyway. |
| `rm -rf project/webapp`, reinitialize via CLI | Done | `npx create-next-app@latest webapp --ts --tailwind --eslint --app --import-alias "@/*" --use-npm --disable-git --yes` from `project/`. `--disable-git` used since `implementation/` is already a git repo (confirmed via `git status`/`git show HEAD:...` working throughout this session) — a nested repo inside `project/webapp/` would conflict with it. Produced `app/`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, Tailwind v4 wired in, plus an auto-generated `AGENTS.md`/`CLAUDE.md` pair (Next's own "breaking-changes-may-exist" agent note, re-written by `next dev` itself — left in place, harmless, not a project-instruction file). |
| Clean default placeholder assets | Done | Removed `public/{file,globe,next,vercel,window}.svg`; restored the backed-up `vendor/`/`diagrams/` into the fresh `public/`. |
| shadcn/ui initialized | Done | `npx shadcn@latest init -d -f` (defaults preset: `base-nova`, neutral base color, `lucide-react` icons, CSS-variable theming, `@/` aliases) — first attempt with a guessed `-b neutral` flag failed (`-b` is the *component-base-library* selector — `radix`/`base`/`aria` — not the color; fixed by reading `shadcn init --help` instead of guessing a second time). Also pulled in `next-themes` automatically as part of the preset. |
| shadcn components added | Done | `npx shadcn@latest add card badge table tabs separator navigation-menu sonner skeleton` — the set the later content phases are expected to need (results tables, status badges, tabbed training/ablation views, toast notifications for the Live Run page). Copied into `components/ui/*.tsx` as source, not an npm dependency — freely editable later. |
| `lib/{config,colors,data}.ts` | Done | Same content/constants as the (now-deleted) `.js` versions, rewritten with real types: `Arm` union type, `Record<Arm, string>` for colors/labels, `PortForwardTarget` interface, `readJson<T>`/`readCsv` generics. |
| `components/theme-provider.tsx`, `components/theme-toggle.tsx` | Done | `next-themes`' `ThemeProvider` with `attribute="class" defaultTheme="dark" enableSystem={false}` in `app/layout.tsx` — confirmed via the raw server response that the pre-hydration script hard-codes `"dark"` as the stored-preference fallback, so first paint is dark with no flash regardless of OS theme. Toggle button initially used the common `useState`+`useEffect(() => setMounted(true))` "avoid hydration mismatch" pattern; ESLint's `react-hooks/set-state-in-effect` rule (part of `eslint-config-next`) flagged it as a real anti-pattern (setState synchronously inside an effect risking cascading renders) — fixed by switching to a CSS-only icon swap (`dark:scale-0`/`dark:scale-100` on stacked Sun/Moon icons) that needs no client state at all. |
| `components/nav-bar.tsx` | Done | Rebuilt on shadcn's `Button`/`buttonVariants` (`variant: pathname === href ? "default" : "ghost"`) instead of a hand-rolled `<button>`/CSS-class toggle — matches "suitable library for components" rather than reimplementing button styling. |
| `app/layout.tsx` + 5 `page.tsx` placeholders | Done | Root layout now composes `ThemeProvider` → `NavBar` → `<main>` → footer → shadcn `Toaster`; each page placeholder uses a `Card`/`CardContent` instead of a raw `<div>`. |
| ESLint config fix | Done | First `npm run lint` produced **21,111 problems** — all from ESLint parsing the vendored `public/vendor/plotly.min.js`/`mermaid.min.js` (multi-megabyte, single-line minified files) as project source. Root-caused immediately from the error locations (line 3803, column numbers in the hundreds of thousands — impossible for hand-written code). Fixed by adding `public/vendor/**` to `eslint.config.mjs`'s `globalIgnores`, the same treatment `.next/**`/`node_modules` already get. |
| Verification | Done | `npx tsc --noEmit` clean (0 errors). `npm run lint` clean after both fixes (vendor-ignore + theme-toggle rewrite) — went from 1 real error (`no-this-alias`/`no-unused-expressions` noise from vendor files, then the genuine `set-state-in-effect` error) down to 0. `npm run dev` → curled all 5 routes (200), confirmed both `lucide-sun`/`lucide-moon` icons present in the toggle button's rendered HTML. **`npm run build` (production build) succeeded** — all 5 routes prerendered as static content (`○ (Static)`), which the Express and first-Next.js-pass phases never actually confirmed. Killed all dev-server/build-worker node processes and confirmed `Get-NetTCPConnection -LocalPort 8878` had no `Listen` entry left (a few `TimeWait`/`FinWait2` remnants are just normal OS socket teardown, not a live listener) before considering the phase closed. |

**What to check yourself (supersedes the Correction #1 instructions above):** run `npm run
dev` from `project/webapp/`, open `http://127.0.0.1:8878/` — it should load in **dark
theme by default** — click through all 5 nav links (shadcn `Button` styling, active link
highlighted solid), and click the sun/moon icon top-right to confirm it switches to light
and back. Everything should look like a real shadcn/ui app (rounded cards, consistent
spacing/typography), not the plain hand-styled version from Correction #1.

**Phase 1 status: Done (redone twice — first for the Python→Next.js stack correction,
then for the hand-written→official-CLI-scaffold + TypeScript + Tailwind + shadcn/ui +
dark-theme correction).**

### Follow-up fix — Times New Roman and undersized text

The user reported body text rendering in a serif font (reading as Times New Roman) and
generally too small. Root cause, found in `app/globals.css`: the `@theme inline` block
shadcn generated had `--font-sans: var(--font-sans)` — a **self-referential** custom
property. That never resolves to any real value, so the `font-sans` Tailwind utility
(applied to `<html>`) produced an invalid `font-family` declaration, and the browser
fell back to its default UA stylesheet font — `serif`, i.e. Times New Roman on Windows —
for the entire page. The Geist font was being loaded correctly by `next/font` in
`app/layout.tsx` the whole time; it just was never wired to anything that used it.

Fixed by pointing `--font-sans` at the actual loaded-font variable:
`--font-sans: var(--font-geist-sans)`. Verified in the compiled CSS output that the
chain now resolves: `--font-geist-sans: "Geist", "Geist Fallback"` → `--font-sans:
var(--font-geist-sans)`. Also bumped `html`'s `font-size` from the 16px browser default
to `18px` in the same `@layer base` rule — since Tailwind's utilities are rem-based,
this scales body text, headings, and spacing together site-wide rather than needing
every component's text size tuned individually.

**A second bug caught while making this exact fix:** the first attempt at the
explanatory CSS comment above the `font-size: 18px` rule contained the literal
sequence `text-*/spacing` — and `*/` closes a CSS comment regardless of surrounding
context, so everything after it (`spacing utility with it...`) was parsed as real CSS
and broke the build (`CssSyntaxError: Unknown word "utility"`, `next dev` returned a
500 until fixed). This is the same class of mistake as the `data.js` JSDoc bug from
Phase 1's first correction (a literal `*/` inside a code/prose example prematurely
closing a comment) — worth remembering as a recurring failure mode in this codebase
whenever a comment's example text might contain `*/`.

Verified: `next dev`'s already-running process (the user's own, left untouched rather
than restarted) picked up both fixes via HMR; `curl` against it returned 200 after the
syntax fix, and the compiled CSS chunk was fetched directly to confirm both the
`--font-sans`/`--font-geist-sans` chain and the `18px` base size actually shipped, not
just that the page loaded. `tsc --noEmit` and `npm run lint` both stayed clean.

### Shared infrastructure pass — loading and status handling

Before starting Phase 2, the user asked for the cross-cutting pieces every later phase
will lean on: loading indicators (so it's never ambiguous whether something is still
working or has finished-but-empty — the exact confusion they hit in the old
desktop_app) and a status/badge vocabulary (pass/partial/disclosed for research
findings, healthy/elevated/unreachable for live data), plus a general "what else did we
skip" audit.

| Task | Status | Notes |
|---|---|---|
| Removed unused `components/ui/navigation-menu.tsx` | Done | Added in Phase 1's shadcn pass on the assumption it might be needed for the nav bar; the nav bar was actually built on `Button`/`buttonVariants` instead, so this was dead code from day one - confirmed via a repo-wide grep for the import before deleting. |
| Added `alert` and `tooltip` shadcn components | Done | `npx shadcn@latest add alert tooltip -y`. Alert backs the new `EmptyState`/`InfoNote` components below; Tooltip is for the "explain every stat" captions Phase 4/6 will need (per the user's earlier instruction that every number should carry a plain-language explanation). |
| `TooltipProvider` wired into `app/layout.tsx` | Done | shadcn's own instructions after `add tooltip` said to wrap the app in it. First attempt used a `delayDuration` prop (the Radix convention) - this project's shadcn preset is built on **Base UI**, not Radix, whose `Tooltip.Provider` takes `delay` instead; caught by `tsc --noEmit` (`Property 'delayDuration' does not exist`) before it ever reached the browser. |
| `components/status-badge.tsx` | Done | `StatusKind` union (`pass`/`partial`/`disclosed`/`healthy`/`elevated`/`critical`/`unreachable`/`neutral`), each with a fixed icon + reserved color (never reused as a data-series color) + label, ported in spirit from the deleted desktop_app's `criteria.js` vocabulary. Icon-plus-label always, never color-alone. |
| `components/loading-state.tsx` | Done | Three pieces: `LoadingState` (spinner + label, for client-side polling with no fixed content shape - e.g. Phase 6's live cluster poll), `CardSkeleton` (skeleton stat-card grid), `TableSkeleton` (skeleton data table) - all built on the already-installed shadcn `Skeleton` primitive. |
| `components/empty-state.tsx` | Done | `EmptyState` (missing-data warning, e.g. an ablation arm that never produced a given file) and `InfoNote` (softer context note) - both on shadcn's `Alert`. Mirrors the old app's "not applicable vs. not yet generated are different situations, say which" principle. |
| `app/loading.tsx` | Done | Next.js's own route-loading convention - automatically shown while a page (or async work inside it) is still resolving server-side. Doesn't do much yet since Phase 2/3 content is static, but matters from Phase 4 onward once pages read files or poll a live cluster. |
| `app/error.tsx` | Done | Root error boundary (must be a Client Component per Next.js's own requirement). Explains that a render failure here almost always means a missing/malformed results file, not a mutation of anything on disk - keeps the read-only framing even in the failure case. Has a "Try again" button wired to Next's `reset()`. |
| `app/not-found.tsx` | Done | Branded 404 instead of the framework default. First attempt used `<Button asChild><Link .../></Button>` (the Radix `asChild` pattern) - wrong for the same Base UI reason as the `TooltipProvider` mistake above; fixed by using `buttonVariants({variant:"outline"})` as a className on the `<Link>` directly, the same proven pattern `nav-bar.tsx` already used successfully in Phase 1. |
| Verification | Done | `tsc --noEmit` clean (after fixing both Base-UI-vs-Radix mistakes above), `npm run lint` clean, curled all 5 real routes (200) plus a nonexistent path (404, confirmed the custom not-found page's actual text - "Page not found"/"Back to Research Overview" - rendered, not the framework default). Did **not** run a full `npm run build` this pass, since the user's own `next dev` was actively running against the same `.next/` directory at the time and a concurrent build risked cache conflicts with their live session - a clean production build was already confirmed once in the Correction #2 pass above, and nothing architecturally new (no new routes/data fetching) was added here that would change build behavior. |

**What to check yourself:** with `next dev` running, visit any URL that doesn't exist
(e.g. `http://127.0.0.1:8878/nope`) and confirm you see a branded "Page not found" card
with a button back to Research Overview, not a blank/default Next.js error screen. The
loading/status/empty-state components themselves aren't visible anywhere yet - they're
plumbing for Phase 4 (Training/Ablation Results) and Phase 6 (Live Run) to actually use.

---

## Phase 2 — Research Overview page

| Task | Status | Notes |
|---|---|---|
| `components/mermaid-diagram.tsx` | Done | Client component rendering the vendored `mermaid.min.js` (loaded globally via `next/script` `strategy="afterInteractive"` in `app/layout.tsx`) using the modern Promise-based `mermaid.render(id, text)` API. Polls for `window.mermaid` (up to 5s) rather than assuming the script has landed by first effect run; re-renders on theme change (`resolvedTheme` from `next-themes`) so each diagram's own palette matches light/dark; shows `LoadingState` while rendering and `EmptyState` on failure - the first real use of both shared components built in the infra pass. `securityLevel: "strict"` set since diagram source is our own static content, not user input. |
| Content: problem statement, aim/objectives, literature gap, three novelty elements, why-not-deep-RL, methodology summary | Done | Sourced directly from `docs/G54_Promex_Final_Report_v2.docx` Ch.1 (§1.2 background/three weaknesses, §1.3 aim/objectives), Ch.2 §2.7 (four gap statements), Ch.3 (§3.2/3.3/3.4 novelty justification per module, §3.5 deep-RL rejection reasoning) - read directly via `python-docx` this session, not recalled from memory. Every technical term (SLA, autoscaling, scheduler, trailing indicator, node) gets an inline plain-language explanation on first use, per the user's standing "short words should be explained properly" instruction from earlier in the session. Each of the three novelty cards carries a `NoveltyBadge` (shadcn `Badge` + lucide `Sparkles` icon, "Individual novelty contribution") rather than blending in with ordinary description text. |
| Research-design Mermaid flowchart | Done | One flowchart: three weaknesses → gap → aim → three modules → offline validation → live ablation study → statistical analysis → findings. Plain-text node labels only (no HTML), consistent with `securityLevel: "strict"`. |
| Verification | Done | `tsc --noEmit` clean, `npm run lint` clean. Curled the live dev server (still the user's own session): `/` returns 200 and server-rendered HTML contains the expected section text ("Research Overview", "Individual novelty contribution", "Why not deep reinforcement…") and the mermaid script reference. The diagram's actual client-side SVG render could **not** be visually confirmed - no browser automation is available in this environment, and curl only sees the server-rendered "Rendering diagram…" loading state, not what happens after `mermaid.render()` runs in-browser. |

**What to check yourself:** open `http://127.0.0.1:8878/` and confirm the Mermaid
flowchart at the bottom of the page actually renders as a diagram (not stuck on
"Rendering diagram…" or showing "Diagram unavailable") - this is the one part of this
phase that could only be verified up to the server-rendered HTML, not the actual client
render.

**Phase 2 status: Done.**

---

## Phase 3 — Project Overview page

| Task | Status | Notes |
|---|---|---|
| `lib/diagrams.ts` — `readDiagram(name)` | Done | Server-side helper reading `public/diagrams/<name>.mmd` off disk (via `WEBAPP_DIR` from `lib/config.ts`), returning raw Mermaid source for `<MermaidDiagram chart={...} />`. Since `app/overview/page.tsx` is a Server Component, this runs server-side with no client fetch needed - the diagram text is embedded straight into the server-rendered payload. |
| Architecture, modules, tech stack, dataset explanation | Done | Sourced from `docs/G54_Promex_Final_Report_v2.docx` Ch.5 (§5.2 top-level architecture, §5.3-5.5 per-module design, §5.6 data preparation, §5.7 evaluation design) and Ch.6 (§6.2 hardware/software, §6.3 data prep numbers) - read directly via `python-docx`, not recalled. Includes the real numbers (360 intervals, 306 container instances, ~39k calls/interval, 538ms derived violation threshold, 15.9GB usable RAM) rather than paraphrasing them away. |
| Team contribution cards (from Appendix A) | Done | One card per member (Diwyanjalee E.A.D.S.N. 214060C / Module 1, Bandara K.G.R.U. 214030K / Module 2, Malalpola M.L.H.R. 214129X / Module 3), each with Responsibility / What they learned / A difficulty handled honestly - condensed from each member's full Appendix A statement (read in full via `python-docx`, not just the truncated preview from earlier exploration) into plainer language while keeping the real specifics (e.g. Bandara's 371-candidate/87-event count, Malalpola's 14.04→7.64 reversal-count result). |
| 6 of 8 diagrams wired in (not 8) | Done | Deliberate deviation from the plan's "reuse all 8": diagrams 06 (`plugin_app_flow`) and 07 (`setup_automation_flow`) describe the deleted desktop_app's own UI features (switching target applications, winget-driven tool installation) - they document a UI tool that no longer exists, not the research framework's architecture or methodology, so including them on a *Project Overview* page would misrepresent what the project is. This matches the precedent already set and user-approved when desktop_app itself was narrowed earlier this session ("6 of the current 8 diagrams... drop the two that describe removed features"). The 6 used: 01 (system architecture), 02/03/04 (per-module pipelines, one embedded inside each module's own card rather than grouped separately), 05 (live control loop, sequence diagram), 08 (the five ablation-arm configurations). |
| Verification | Done | `tsc --noEmit` clean, `npm run lint` clean. Curled the live dev server: `/overview` returns 200 (not 500, which confirms `readDiagram()` successfully read all 6 `.mmd` files rather than throwing on a bad path) and contains all expected section headings plus all three team members' names. Counted exactly 6 "Rendering diagram…" occurrences in the server-rendered HTML, confirming all 6 `MermaidDiagram` instances mounted. As with Phase 2, the actual client-side SVG rendering could not be visually confirmed - no browser automation available. |

**What to check yourself:** open `http://127.0.0.1:8878/overview` and confirm all 6
diagrams actually render as diagrams (architecture, the three module pipelines, the live
control loop sequence diagram, and the five ablation arms) - same caveat as Phase 2,
this is the one thing only a real browser can confirm. Also worth a skim: the three
team-contribution cards, to confirm the condensed wording still reads accurately against
what you know of each member's actual work.

**Phase 3 status: Done.**

### Follow-up fix — diagrams read as too compact

The user reported the rendered diagrams felt cramped rather than easy to read. Two
changes to `components/mermaid-diagram.tsx`: (1) Mermaid's own defaults pack nodes
tightly at a small font size - bumped `fontSize` to 18 and `flowchart.nodeSpacing`/
`rankSpacing`/`padding` (70/80/20) and the equivalent `sequence` options, so the
diagram's own intrinsic layout has more breathing room, not just a bigger frame around
the same cramped drawing. (2) Mermaid sets an inline `max-width`/`height` style on the
SVG it returns, which normally beats plain CSS rules - added `!`-prefixed (i.e.
`!important`) Tailwind utilities (`[&_svg]:!w-full [&_svg]:!h-auto [&_svg]:!max-w-none`)
so the diagram actually stretches to fill the card's real width instead of sitting at
Mermaid's small default pixel size, with a `min-w-[640px]` floor so the smallest
diagrams don't shrink illegibly small on a narrow viewport (they scroll horizontally
past that floor instead, via the existing `overflow-x-auto` wrapper).

Verified: `tsc --noEmit` and `npm run lint` both clean, `/` and `/overview` both still
return 200. The actual visual effect (bigger, less-cramped diagrams) could not be
confirmed without a browser - same standing limitation as every other diagram check
this phase.

### Follow-up fix #2 — the diagrams themselves were the problem, not their sizing

The spacing/font fix above didn't address what the user actually meant: the 6 diagrams
carried over from the deleted desktop_app (`public/diagrams/*.mmd`) were written as
*developer reference* diagrams - port numbers (`:8000 /risk`), HTTP verbs
(`PATCH replicas`), config-flag names (`KEDA: ON`, `gamma on alpha/beta`) - which is the
wrong register entirely for a plain-language Project Overview page aimed at a general
reader, no amount of resizing fixes that. Per the explicit instruction ("remove them and
reconstruct them more user friendly simply and understandably"):

| Task | Status | Notes |
|---|---|---|
| Removed `public/diagrams/*.mmd` (all 6 remaining ones) and `lib/diagrams.ts` | Done | Confirmed via grep first that nothing else in the codebase referenced either - they were only ever used by `app/overview/page.tsx`. |
| 6 new diagrams written inline in `app/overview/page.tsx` | Done | `ARCHITECTURE_DIAGRAM`, `MODULE1_DIAGRAM`, `MODULE2_DIAGRAM`, `MODULE3_DIAGRAM`, `LIVE_LOOP_DIAGRAM`, `ABLATION_DIAGRAM` - same pattern already used for the Research Overview page's own `RESEARCH_DESIGN_DIAGRAM` constant (inline template strings, not files). Every node is now a plain-English sentence fragment ("Which machine should a new copy start on?", "Widen the margin further if it's been jumpy lately") with zero ports, protocols, or config-flag names. Content still technically accurate - same three modules, same information flow, same five ablation arms - just described the way the rest of this page's prose already does. |
| Verification | Done | `tsc --noEmit` clean, `npm run lint` clean, grepped the whole `app/`/`components/`/`lib/` tree for any remaining reference to the deleted files (none), curled `/overview` (200) and counted 6 "Rendering diagram…" occurrences in the server-rendered HTML (all 6 diagram slots still mount). As with every other diagram check, the actual rendered appearance needs a real browser to confirm. |

**What to check yourself:** open `http://127.0.0.1:8878/overview` and read each
diagram's node text directly - it should be understandable without needing to already
know what a scheduler extender or a port number means, unlike the previous version.

### Follow-up fix #3 — Mermaid itself was the problem; retired it entirely

Plain-language node text (fix #2) didn't solve it either: the user reported the
diagrams still read as "plain text" and some lines crossed that didn't need to.
Loaded the `artifact-diagramming` skill for guidance before touching anything further,
which confirmed the actual fix: Mermaid's automatic graph layout (the `dagre` algorithm
it uses under the hood) doesn't guarantee crossing-free edges even for small graphs, and
its default theme genuinely does render fairly bare/plain. The skill's own conclusion
for diagrams this small - hand-placed coordinates in inline SVG - is strictly better
than fighting an auto-layout algorithm, and needs no new dependency. Retired Mermaid
from the app entirely rather than patching it further.

| Task | Status | Notes |
|---|---|---|
| `components/diagram-figure.tsx` | Done | Shared primitives: `DiagramFigure` (figure/figcaption wrapper, `viewBox`-scaled `<svg>` with `role="img"` + `aria-label`, per the skill's structural guidance), `DiagramNode` (rounded rect + centered multi-line text via `<tspan>`), `DiagramArrow` (orthogonal right-angle connector with an arrowhead marker and an auto-positioned or explicitly-placed label), `ArrowheadDefs`. Everything themed via `currentColor` and Tailwind's `fill-card`/`stroke-current`/`fill-muted-foreground` tokens - no theme-detection JS needed at all, unlike the Mermaid version, since CSS custom properties already flip with the `dark` class. |
| `components/architecture-diagram.tsx` | Done | The one diagram that's a genuine graph (parallel inputs into Module 3, a feedback loop back to the application) got the hand-placed SVG treatment. Coordinates chosen specifically to be crossing-free: App/Module 1/Module 2 in a left column, Module 3/Actuator to the right at App's own vertical level, and the single feedback arrow (Actuator back to the application) routed as one loop well below everything else (dipping to y=450, under Module 2's lowest edge at y=420) so it can never touch the forward arrows. Verified directly in the server-rendered HTML (this is a Server Component now, no client JS - the actual `<path d="M 860 290 L 860 450 L 100 450 L 100 290">` and all five node/arrow labels are visible in the raw HTML `curl` returns, a strictly stronger check than anything possible with the old Mermaid version, which only ever showed a loading placeholder to `curl`). |
| `components/step-flow.tsx` | Done | For the five genuinely-linear sequences (Module 1/2/3 pipelines, the live control loop, and the Research Overview page's research-design flow) - numbered circle + title + description, connected by plain Tailwind flex layout (arrow icons between steps, wrapping to vertical on narrow screens). Structurally cannot produce a crossing, since there's no line-routing involved at all. |
| Ablation "diagram" replaced with a card grid | Done | The five ablation arms were never actually a graph (no real edges between them) - forcing them into a flowchart was the wrong representation to begin with. Now a plain 5-card grid (`1 of 5` … `5 of 5`, full framework highlighted), matching how modules/team members are already presented elsewhere on the same page. |
| Removed entirely | Done | `components/mermaid-diagram.tsx`, `public/vendor/mermaid.min.js`, `public/vendor/plotly.min.js` (the latter unused by anything yet - Phase 4's charts will pick a proper React charting library rather than reusing this old vendored file, decided fresh when that phase starts), the `next/script` tag loading it in `app/layout.tsx`, and both Mermaid-based diagram constants in `app/page.tsx` (Research Overview) and `app/overview/page.tsx` (Project Overview). Confirmed via grep that nothing else referenced any of them first. |
| Verification | Done | `tsc --noEmit` clean, `npm run lint` clean. Curled both `/` and `/overview` (200) and, since these are now server-rendered SVG rather than client-only Mermaid output, could verify actual content for the first time: all expected node labels present with correct counts, and the feedback-loop arrow's path coordinates confirmed exactly as designed (`M 860 290 L 860 450 L 100 450 L 100 290`) - not just "a diagram element exists" but "the specific crossing-avoidance routing actually rendered." |

**What changed for you to check:** every diagram is now boxes with borders and readable
labels (not bare text), and the architecture diagram's connections should read cleanly
left-to-right with the one feedback loop visibly routed underneath everything else,
never crossing another line. This is also the first diagram check this session where a
real browser isn't strictly required to confirm correctness - the SVG structure itself
was verified directly - though seeing it rendered is still worth doing.

### Follow-up fix #4 — text invisible in dark mode, label overlapping a box, Kubernetes missing

The user sent a screenshot of the architecture diagram in dark mode: every box's title
text was unreadable (dark-on-dark), the "speed & load" label was visibly cut off behind
the Module 1 box, and — a real content gap, not just a styling one — Kubernetes itself
was entirely absent from the diagram despite being the platform that actually carries
out scaling/placement and hosts the scheduler Module 2 plugs into.

**Root causes, both in `components/diagram-figure.tsx`:**
1. `DiagramNode`'s `<text>` element had no `fill` set at all. SVG's initial fill value is
   plain black, not `currentColor` - so node titles rendered as black text regardless of
   theme. It only looked "okay" in light mode by coincidence (black text is legible on a
   light card background); dark mode has a dark card background, so the same black text
   became invisible. Fixed by adding `className="fill-foreground"` explicitly - SVG fill
   never inherits from CSS `color` on its own, it has to be set directly.
2. `DiagramArrow`'s label was auto-positioned at the midpoint of the connector's *last*
   segment with its width guessed from character count - fine in principle, but several
   of those last segments (e.g. the ~40-unit gap right before entering Module 1's left
   edge) were far shorter than the label text needed, so the label overflowed into the
   node itself and got visually clipped, since `DiagramNode` boxes are drawn after
   arrows (correct z-order otherwise - line ends should tuck under a box's edge, not sit
   on top of it). Fixed by removing auto-placement entirely: `DiagramArrow` now requires
   an explicit `labelAt` coordinate, hand-picked by the caller to sit in genuinely open
   space between boxes - not derived from the line geometry at all.

**Content gap:** rebuilt `components/architecture-diagram.tsx` from 5 nodes to 6,
adding **Kubernetes** as a wide bar underneath everything (the "foundation" every other
component sits on/talks through), with two of its own connections: the Actuator hands
its decision to Kubernetes (not directly to the app - Kubernetes is what actually
creates/removes replicas), and Kubernetes' own scheduler is what calls out to Module 2
for node-scoring help. All coordinates re-planned by hand from scratch (viewBox now `0 0
1100 700`) to keep all seven connections crossing-free, verified the same way as before
- by reading the actual rendered `<path>` `d` attributes back out of the server-rendered
HTML, not by eye. The prose paragraph above the diagram was also rewritten to walk
through all six components in the same order the diagram shows them, so the "diagram and
its explanation should both cover every component" instruction is satisfied by both, not
just the picture.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled `/overview` (200), counted
6 `fill-foreground` occurrences (one per node, confirming the fill fix applied
everywhere), confirmed all of Kubernetes' label text and all three of its connection
paths' exact coordinates (`M 985 330 L 985 635 L 900 635`, `M 400 590 L 400 550 L 110
550 L 110 330`, `M 450 590 L 450 510`) rendered precisely as designed - the
Kubernetes-to-app path's horizontal run sits at y=550, still safely below Module 2's
bottom edge at y=510, so the added components don't reopen the crossing problem the
previous fix solved.

### Follow-up fix #5 — connector labels reading as crossed-through by their own lines

The user's next screenshot (light mode this time, since fix #4 was dark-mode-specific)
showed "speed & load", "risk + reason", and "machine health" each with a visible bar
slicing through the middle of the text, and "asks which node is best" overlapping
"scales the app" near the bottom. Root cause: several `labelAt` coordinates picked
during fix #4 were centered exactly *on* their own connector's vertical segment (e.g.
`speed & load` at `x=260`, the same x as the line it labels), so the line rendered
underneath the letters and read as cutting through them; separately, the K8s→Module 2
connector is only 80 units tall, too short for its 24-character label to sit centered
on it without spilling into the K8s→App label directly below.

Two independent fixes, both in `components/diagram-figure.tsx` /
`components/architecture-diagram.tsx`:

1. Added a text halo to every label: `paintOrder="stroke"` with a 5px `var(--card)`
   stroke behind the fill, so any label that ends up near a line or box edge stays
   legible regardless - a safety net, not the primary fix.
2. Re-picked every label's position to sit *beside* its line rather than centered on
   top of it, using a new `labelAnchor` prop (`"start"` where the label now grows
   outward from a point just clear of the line) instead of the default centered
   anchor. The K8s→Module 2 label was moved off its own (too-short) connector
   entirely, into the open strip between Module 2's bottom edge and Kubernetes' top
   edge, clear of the K8s→App label beside it.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled `/overview` and read
every `<text>` element's exact `x`/`y`/`text-anchor`/`paint-order` attributes back out
of the rendered HTML to confirm all seven labels landed at their planned, non-crossing
positions.

### Follow-up fix #6 — theme was pure grayscale; light mode read as too bright

The user's next piece of feedback was broader than the diagram: "you do not need to
use only dark and white... just plain dark and white... worse when in light theme,
only so bright." Checking `app/globals.css` confirmed this was literally true, not
just a subjective impression - every token (`--background`, `--foreground`,
`--primary`, `--accent`, `--chart-1..5`, etc.) was `oklch(... 0 0)`, i.e. exactly zero
chroma, inherited unchanged from shadcn's `neutral` base-color preset. Light mode's
`--background`/`--card` were both pure white (`oklch(1 0 0)`), with near-black text at
close to maximum contrast and no color anywhere to soften it - which is what read as
"so bright." Because `--primary` (near-black in light mode, near-white in dark mode)
drives the active nav link, default buttons, novelty badges, and every `StepFlow`
step-number circle (`bg-primary`/`text-primary-foreground`, confirmed in
`components/step-flow.tsx`), the flatness was visible on essentially every page, not
just the architecture diagram.

Fixed in `app/globals.css` (both `:root` and `.dark`):

- `--primary`/`--ring`/`--sidebar-primary` now carry real hue - the same blue used as
  the "baseline" ablation-arm color in `lib/colors.ts` - instead of near-black/near-white.
  This alone recolors nav active-state, default buttons, and every step-number badge
  app-wide with no per-component edits needed.
- `--accent`/`--accent-foreground` given a light blue tint instead of pure gray.
- `--chart-1` through `--chart-5` set to the same five categorical hues/order already
  used for the ablation arms (blue/orange/aqua/yellow/magenta) - one consistent color
  language for later results charts (Phase 4) instead of a separate grayscale ramp.
- Light-mode `--background` dropped from pure white to a step below `--card`
  (`oklch(0.973 0 0)` vs `oklch(0.995 0 0)`) so cards visibly lift off the page instead
  of the flat white-on-white that made the whole page read as glare.
- Added five new `--viz-*` tokens (light + dark variants of the same categorical
  palette) specifically for hand-authored SVG diagrams, which can only reach colors
  through CSS custom properties (`currentColor` alone can't carry five distinct hues).

Then recolored the architecture diagram itself: `DiagramNode` gained a `tone` prop
(replacing the old boolean `accent`) that tints a node's fill (16% opacity) and border
with one of the five `--viz-*` colors, while node text stays in plain foreground ink
always (per the dataviz skill's rule that text carries meaning through ink tokens, an
identity color through the mark, never both at once). Assigned tones deliberately
mirror the ablation-arm mapping already established elsewhere in the app: Module 1
orange, Module 2 aqua, Module 3 yellow (the same three colors that will represent each
module's own contribution in the Phase 4 results charts), the Actuator magenta (the
"full framework" arm color, since it's where all three modules' signals converge into
one action), and Kubernetes blue ("baseline", the underlying platform everything else
sits on). The App node itself was left neutral/uncolored - it's the external subject
being scaled, not a framework component - so the diagram visually separates "the
framework" (colored) from "the thing it's acting on" (plain). Connector lines were
deliberately left neutral (`currentColor`) rather than colored, to keep the color
emphasis on component identity rather than adding visual noise to the routing.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled all five routes (`/`,
`/overview`, `/results`, `/conclusion`, `/live`) - all still 200 after the global
token rewrite. Curled `/overview` and read the six `<rect>` elements' `style`
attributes back out of the rendered HTML to confirm each node picked up its intended
`--viz-*` token (App plain `fill-card`, Module 1 `--viz-orange`, Module 2
`--viz-aqua`, Module 3 `--viz-yellow`, Actuator `--viz-magenta`, Kubernetes
`--viz-blue`).

### Follow-up fix #7 — flat single-color background, light mode still reading as bright white

Fix #6 gave the page a step of separation between `--background` and `--card`, but
left both as flat, single, zero/near-zero-chroma fills - the user's next note asked
for the background itself to use "gradient style to add some color variants" (kept
subtle, black staying the dominant tone in dark mode) and for light mode specifically
to move off bright white onto "white cream color or some smooth color."

Fixed in `app/globals.css`:
- Light `--background` changed from neutral gray (`oklch(0.973 0 0)`) to a warm cream
  (`oklch(0.974 0.007 85)` - same lightness, small chroma at a yellow/warm hue) and
  `--card` to a barely-tinted near-white (`oklch(0.995 0.004 85)`), so cards still
  read lighter than the page without either one being a flat, chroma-free white.
- Dark `--background` moved from pure neutral black (`oklch(0.145 0 0)`) to a very
  low-lightness blue-black (`oklch(0.16 0.012 258)`) and `--card` to a matching
  slightly-lifted tone (`oklch(0.218 0.014 258)`) - lightness stays low on purpose so
  black remains the dominant tone, per the user's "priority black," with only a faint
  color undertone rather than a lightened background.
- Added two new tokens per theme, `--bg-glow-1`/`--bg-glow-2` (a cool blue and a
  warm cream/violet respectively), and changed the `body` rule in the base layer from
  a flat `@apply bg-background` to `background-color: var(--background)` plus two
  fixed-position radial gradients built from those tokens (`background-attachment:
  fixed` so the wash reads as one continuous backdrop rather than repeating per
  scroll height). Both glows are low-alpha (30–55%) and low-chroma so the page still
  reads as a background, not a poster - it adds gradient color variation without
  competing with foreground content or card surfaces, which remain flat and opaque.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled the compiled CSS chunk
directly (`/_next/static/chunks/...css`) and confirmed both `radial-gradient(...circle
at...)` rules and both light/dark `--bg-glow-1` values compiled in; re-curled all five
routes to confirm all still 200 after the change.

### Follow-up fix #8 — background gradient only came from one corner/angle

The user's next note: the two-corner gradient from fix #7 was still just "one angle" -
asked for other angles and other suitable color variants too, not just the one
blue/gold pairing.

Fixed in `app/globals.css`: added two more corner glows, `--bg-glow-3` (aqua, bottom-
right) and `--bg-glow-4` (violet, top-left), alongside the existing blue (top-right)
and gold (bottom-left) - four different radial-gradient origins/directions instead of
two, each a different hue. Aqua and violet were chosen deliberately: aqua matches
the app's existing categorical family (`--viz-aqua`, Module 2's color elsewhere), and
violet is a hue the app doesn't otherwise assign meaning to (unlike magenta, already
"the full-framework arm" in the diagram/chart palette), so it adds variety without
implying a data meaning it doesn't have. Same low-alpha/low-chroma treatment as the
first two glows in both themes, so the background still reads as an ambient wash, not
a poster. Updated the `body` rule's `background-image` to layer all four
`radial-gradient()`s together.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled the compiled CSS chunk
and confirmed all four `radial-gradient(...circle at...)` rules compiled in at their
four distinct corner positions; re-curled all five routes to confirm all still 200.

### Follow-up fix #9 — every glow needs its own color, positions don't need to be symmetric, and light mode shouldn't use a gradient at all

Three more refinements from the user in one message: (1) give every glow angle a
genuinely distinct color rather than reusing hues, (2) the corner positions don't
need to be symmetric/mirrored - free to rearrange, and (3) light mode specifically
should drop the gradient approach entirely and use "another way" instead.

Fixed in `app/globals.css`:
- **Light mode now has no gradient at all.** The `--bg-glow-*` tokens and their
  radial-gradients were removed from `:root` and the base `body` rule entirely - light
  mode is back to a single flat `background-color: var(--background)` (the warm cream
  from fix #7). Reasoning noted inline in the CSS: colored glows that sit unobtrusively
  against a near-black dark background show up as visible, uneven blotches against a
  light one, so "another way" for light mode is just committing to the flat smooth
  cream rather than forcing the same gradient technique into a context it doesn't
  suit. Left a comment warning not to reintroduce a light-mode gradient without
  checking first, so this doesn't get "fixed" back by accident later.
- **Dark mode's gradient moved from the base `body` rule to a `.dark body` override**
  (light mode's `body` rule no longer needs to guard against it), expanded from four
  glows to **six, each a different hue** (blue, orange, aqua, gold, magenta/pink,
  violet - spread around the hue wheel instead of reusing any), and repositioned at
  uneven sizes (680px–1100px circles) and asymmetric coordinates instead of the
  previous four mirrored corners - e.g. `6% 24%`, `70% 118%`, `-8% 64%`, `112% 58%`,
  none of which sit at an exact corner, so it reads more like a natural, uneven wash
  than a repeated pattern.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled the compiled CSS chunk
and confirmed exactly six `radial-gradient(...circle at...)` rules (up from four),
confirmed the base (light) `body` rule now compiles to a plain `background-color:
var(--background)` with no `background-image`, and confirmed the six-gradient
declaration is scoped under `.dark body`. Re-curled all five routes to confirm all
still 200.

---

## Phase 4 — Training & Test Results page

| Task | Status | Notes |
|---|---|---|
| Training Results tab (Module 1/2/3 + Integration) | Done | |
| Ablation/Test Results tab, both studies side by side | Done | |
| Image allowlist route | Done | |

**Phase 4 status: Done.**

Built `lib/results.ts` (typed loaders for every JSON/CSV file this page reads - Module
1/2/3 `metrics.json`, Module 2's `synthetic_rank_inversion.json`, Module 3's
`synthetic_multi_burst.json`, Integration's `metrics.json`, and both studies'
`phase7/statistical_analysis.json` + `trial_level_data.csv`), a path-traversal-safe
image route (`app/api/results/image/[...segments]/route.ts`, allowlisted to exactly
`results/` and `results_v2/`, `.png`-only), and five presentational components under
`components/results/` (`arm-bar-chart.tsx` - a plain HTML/CSS horizontal bar chart, no
client JS, colored via the theme-aware `--viz-*` tokens from the background-gradient
work above so "orange" means Module 1 everywhere in the app; `stat-tile.tsx`;
`result-figure.tsx`; and one section component per module plus
`ablation-study-panel.tsx`). `app/results/page.tsx` assembles all of it under a
Training/Ablation top-level `Tabs`, with a nested `Tabs` inside Ablation to switch
between the two studies.

Every disclosed (non-passing) finding from the underlying JSON is stated in plain
language rather than omitted or softened - e.g. Module 1's fused score not beating the
baseline's lead time on this trace, Module 2's real-trace regret test not clearly
favoring the combined system (87 usable events is a small sample), Module 3's
three-way comparison tying on instability reversals on the one real held-out trace.
Each module's section also surfaces its own individual novelty element's *dedicated*
synthetic stress-test validation next to the real-trace result, since that's where the
actual statistically-significant evidence lives (Module 2: Wilcoxon p ≈ 8.9e-16 for
discounted beating vanilla in the recovery window; Module 3: p ≈ 9.8e-6 for fewer
oscillation reversals, 96% of runs never worse).

Verified: `tsc --noEmit` and `npm run lint` both clean (two `react/no-unescaped-entities`
errors and one misplaced `eslint-disable` fixed along the way). Curled `/results` and
confirmed real numbers from the source JSON appear correctly formatted in the rendered
HTML (walk-forward AUC-PR, the 14.04→7.64 reversal-count reduction, the locale-formatted
"1,776" cost-proxy baseline, etc.), confirmed both the outer Training/Ablation tabs and
the inner v1/v2 study tabs render their full content into the server HTML even though
inactive by default (Base UI's `Tabs.Panel` keeps content mounted rather than
stripping it), and directly exercised the image route: a valid PNG request returns a
real 500x500 image (`Content-Type: image/png`), a `../../../package.json` traversal
attempt, a non-`.png` extension, and an unlisted root segment all correctly return 404.
Re-curled all five top-level routes to confirm nothing else regressed.

**How to check in the browser:** open `/results`. Training tab: four module cards, each
with pass/disclosed status badges, stat tiles, at least one data table, and 2+ embedded
plots. Ablation tab: switch between "Original study" and "Follow-up study" and confirm
the numbers actually change; check the per-metric bar charts render with each arm's own
color; expand the raw trial-data table at the bottom of either study.

---

## Phase 5 — Final Conclusion page

| Task | Status | Notes |
|---|---|---|
| Findings from both studies | Done | |
| Disclosed limitations, future work | Done | |

**Phase 5 status: Done.**

Sourced directly from `docs/G54_Promex_Final_Report_v2.docx` Chapter 7 §7.7–7.9 and
Chapter 8, extracted paragraph-by-paragraph via `python-docx` in this session (not
recalled from memory or from the earlier-session summary) so every figure is quoted
from the actual report text rather than reconstructed. Cross-checked the headline
percentages against the underlying JSON before writing anything: the report's "Control
only" arm is `m3_only` and "Integrated" is `full` in `project/results(_v2)/phase7/
statistical_analysis.json`'s `omnibus_tests.over_provisioning_timeshare.arm_means` -
confirmed exact matches (primary study: m3_only 0.5777.. -> 57.8%, full 0.0222.. ->
2.2%, baseline cost 1776 -> full cost 918; follow-up study: m3_only 0.8720.. -> 87.2%,
full 0.1407.. -> 14.1%, baseline cost 2736 -> full cost 1062), so the two data sources
(report prose and raw stats JSON) agree rather than one being trusted blindly.

Built `components/conclusion/headline-comparison.tsx` (a before/after card per study:
over-provisioning percentage and cost, Control-only to Integrated) and
`app/conclusion/page.tsx`, with six sections in report order: the central result (both
studies' headline comparisons side by side, plus the "why this isn't from any one
component" framing from §7.9/8.2), what didn't go as expected (four disclosed
findings, each with a `StatusBadge status="disclosed"` - the fused score not warning
earlier, placement not beating its own heuristic on this trace, the reversal guard
showing no gain on the real bursty segment, and the follow-up's TeaStore
registry-client defect), the six numbered limitations from §8.3, seven further-work
items from §8.4, a three-card "how this differs from related work" summary from §7.9,
and a closing "Concluding remarks" card quoting §8.5 nearly verbatim.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled `/conclusion` and
confirmed every headline figure (57.8%, 2.2%, 87.2%, 14.1%, both cost figures, the
48% and 61% cost-reduction figures) rendered correctly - the only grep miss was a false
alarm from React's SSR hydration comment markers (`48<!-- -->%`) splitting a text
node, confirmed harmless by checking the surrounding HTML directly. Confirmed the
disclosed-findings and limitations text rendered. Re-curled all five routes to confirm
nothing else regressed.

**How to check in the browser:** open `/conclusion`. Confirm the two headline cards
show different numbers per study (57.8%→2.2% vs. 87.2%→14.1%), that all four
"what didn't go as expected" cards carry a disclosed-finding badge, and that the page
reads as a single coherent closing argument rather than a disconnected stat dump.

### Follow-up fix — stray symbols from an unsupported font glyph

The user reported "§" symbols appearing throughout the app right after Phase 4/5
landed. A targeted grep found only one literal `§` (in the Conclusion page's Chapter
7 citation), which didn't match "everywhere" - so a broader scan for other
rarely-used Unicode blocks (math operators, arrows, Greek letters) across every
`.tsx` file turned up the real cause: `≈` (approx-equal, used three times in the
Results page's Module 2/3 sections for p-value callouts), `→` (used twice in the
Conclusion page's closing badges), and `γ` (Greek gamma, used twice in Module 2's
description for the discount-factor formula) - none in Geist's loaded `latin` font
subset, so each fell back to a missing-glyph box that reads like a generic symbol
across two of the newest pages, matching "everywhere" much better than the single
`§` alone.

Fixed by replacing all four with plain ASCII: `§7.7–7.9` → "sections 7.7–7.9",
`≈` → "is about", `→` → "to", `γ` → "gamma" (both as a word, e.g. "gamma = 0.9").
Then ran a full scan of every `.tsx` file in `app/` and `components/` for any
character outside a small confirmed-safe set (curly quotes, em/en dash, ellipsis -
all in use since Phase 2/3 without complaint) and found nothing else.

Verified: `tsc --noEmit` and `npm run lint` both clean. Curled `/results` and
`/conclusion` and confirmed zero remaining `§`/`≈` occurrences and that "gamma = 0.9"
/ "gamma = 1" render as plain text. Re-curled all five routes to confirm no
regression.

---

## Phase 6 — Live Run page

| Task | Status | Notes |
|---|---|---|
| `lib/port-forwards.ts` (kubectl port-forward manager) | Done | Renamed from the plan's `server/portForwards.js` - no separate Express server in this stack, it's a plain module used by the Route Handler below. |
| `/api/live/state`, `/api/live/reference` Route Handlers | Done | |
| Gauges, status tiles, comparison charts | Done | |

**Phase 6 status: Done.**

Read each live component's exact response shape directly from
`project/live_cluster/{module1_controller,module3_controller,actuator}/app.py`'s
`Handler.do_GET` (not assumed/recalled) before writing any types: Module 1's `/risk`
returns `{predicted_risk, last_bucket, error}`; Module 3's `/state` returns
`{mode, control_signal, predicted_risk, violation_now, score_vs_previous_forecast,
conformal_width, covered, reversal_count, widening_multiplier, aci_alpha, threshold,
alert, cycles, module2_bandit_state, error}` (Module 2's own state arrives embedded
inside Module 3's, exactly as the plan doc said - no separate port-forward needed for
it); the Actuator's `/state` returns `{arm, signal, threshold, replicas, decision,
cooling_down, cycles, last_updated}`. Confirmed each Service's exact name/namespace
(`module1-controller`/`module3-controller`/`actuator`, all `default` namespace) against
the real `deployment.yaml` manifests, matching `lib/config.ts`'s existing
`PORT_FORWARDS` unchanged.

Built `lib/port-forwards.ts` (a module-scope singleton managing three `kubectl
port-forward` child processes - lazily started on the first `/api/live/state` request
rather than at server boot, watched via stdout/"Forwarding from" for "running",
stderr for the real kubectl error text, and a 5-second restart backoff on exit so a
down cluster gets retried without spawning a runaway process storm), `lib/live.ts`
(typed fetchers with a 2.5s timeout per component, each failure isolated so one
unreachable component doesn't block the other two), and
`app/api/live/{state,reference}/route.ts`. `lib/results.ts` gained
`loadReferenceTrial()`, reading one real trial
(`results/ablation/2026-07-28T20-41-11_full_scaleup2_t2/metrics.json`, the full arm,
primary study) picked specifically because its `module1_predicted_risk_trace` and
`module3_threshold_trace` have real (mostly non-null) values across all 30 buckets,
unlike some other trials.

Frontend: `components/live/bounded-gauge.tsx` (a value-on-a-track gauge for risk,
threshold, and replica count, each against its own real bound -
`MODULE3_THRESHOLD_BOUNDS`/`ACTUATOR_REPLICA_BOUNDS` from `lib/config.ts`, not an
arbitrary chart axis), `components/live/spark-compare-chart.tsx` (hand-authored SVG,
two overlaid lines - the recorded reference trial, dashed/muted, against this
session's own live readings so far, solid/colored), and
`components/live/live-dashboard.tsx` (`"use client"` - the only client component
built so far in this app, since polling is unavoidably client-side state). Polls
`/api/live/state` every 8s, degrades to a "No cluster detected" card with each
forward's real status when nothing answers, and never offers to install or start
anything - matching the non-goal carried over from the deleted desktop_app's own
narrowing.

**Verified against the actual (currently offline) cluster, not simulated:** confirmed
via `kubectl config current-context` (`kind-fyp-autoscaling`) and `kubectl get nodes`
that a real context is configured but the cluster itself isn't running right now -
exactly the condition this page's empty state needs to handle, so verification here is
the real thing, not a mock. Tested `spawn("kubectl", ...)` directly in Node first to
confirm it resolves and runs on this Windows machine, then polled `/api/live/state`
three times in a row: first showed `forwards` status `crashed` with kubectl's actual
stderr text (`Unable to connect to the server: dial tcp 127.0.0.1:61982:
connectex: No connection could be made...`), then after the 5s backoff window flipped
back to `starting` on the next poll - confirming the retry loop runs correctly rather
than getting stuck. Checked `Get-CimInstance Win32_Process -Filter "Name='kubectl.exe'"`
before and after this cycle and found no leftover processes, confirming each failed
port-forward attempt exits cleanly rather than leaking. Confirmed `/api/live/reference`
returns the real trial JSON (30-point `replica_trajectory`/threshold/risk traces).
`tsc --noEmit` and `npm run lint` both clean. Re-curled all five top-level routes to
confirm nothing else regressed.

**How to check in the browser:** open `/live` with no cluster running - should show
"No cluster detected" with all three components marked unreachable, plus the three
gauges showing "no live reading" and the two charts showing only the dashed reference
line. To see it fully live, start the cluster per
`project/live_cluster/README.md` and refresh; gauges and the solid live line should
populate within a few 8-second polls.

### Follow-up verification — tested against the real live cluster on the Hetzner VM

The user pointed out that a genuine live-cluster test can't happen on this Windows
machine (no cluster runs here) - it needs to run on the actual server. Confirmed via
`hcloud server list` that `fyp-results-v2` (5.223.49.63) was already running, and via
`ssh fyp-hetzner "kubectl get pods -A"` that its `fyp-autoscaling` kind cluster was
healthy with Module 1/2/3 and TeaStore all `Running` (the Actuator deployment existed
but was scaled to `0/0` - quiescent between studies, as expected).

Set up and ran the real test:
1. Installed Node.js 22 LTS on the VM (none was present - this VM was provisioned for
   the Python-based ablation study and `desktop_app`, not this Next.js rebuild).
2. Transferred `project/webapp/`'s source to `/root/implementation/project/webapp/`
   via `tar | ssh ... tar x` (not `git` - confirmed `/root/implementation` on the VM
   isn't a git checkout, and `project/webapp/` isn't committed locally either, so a
   direct file transfer was the only option; excluded `node_modules`/`.next`/`.git`
   deliberately, since `npm install` needs to resolve Linux-native binaries -
   Tailwind v4's `lightningcss` in particular ships platform-specific binaries, so
   copying the Windows-installed `node_modules` over would have been silently
   broken).
3. `npm install` on the VM (602 packages, 0 vulnerabilities, Linux binaries this
   time).
4. `kubectl scale deployment actuator --replicas=1` so all three live components
   (not just two) would be reachable for the test.
5. Started the dev server. **First attempt bound to all interfaces**
   (`next dev -p 8878`'s default) - caught immediately by checking the startup log's
   own "Network: http://5.223.49.63:8878" line, which would have made a read-only but
   still-internal reporting app briefly reachable from the public internet. Killed it
   and restarted with `-H 127.0.0.1` to match this app's own stated loopback-only
   design goal (see the top of this document's "Phase 9"/binding note carried over
   from the deleted desktop_app), verified via the corrected log line
   ("Network: http://127.0.0.1:8878").

**Result: fully live, real data confirmed end-to-end.** `curl`ing
`http://127.0.0.1:8878/api/live/state` *on the VM itself* returned
`"clusterReachable": true` with genuine data from all three components - Module 1's
real predicted risk and full `last_bucket` signal vector (live CPU/memory/latency
readings), Module 3's real adaptive threshold and, critically, a correctly-populated
`module2_bandit_state` (real gamma/alpha/beta/posterior_mean per node - confirming
Module 2's live co-scheduling state arrives embedded exactly as
`module3_controller/app.py`'s source predicted), and the Actuator's real arm/replica
count/decision. Every field matched the TypeScript types in `lib/live.ts` with zero
mismatches. Polling twice ~15s apart showed the replica count had genuinely changed
between an earlier and later check (3 -> 2, a real scale-down the actuator took on its
own), confirming this is live cluster activity, not a cached or static response.

**Bug found and fixed by this real test** (not reachable from the offline-cluster
verification alone): the `forwards` status stayed `"starting"` forever even once data
was flowing correctly. Root cause, found by checking `ps aux` on the VM: two
port-forwards (module1's and module3's) were already running from a leftover Aug-06
session (predating this webapp entirely), so this app's own `kubectl port-forward`
attempts for those two never got to print "Forwarding from" (or failed to bind since
the port was already taken) - the existing tunnels happened to work anyway, but
`lib/port-forwards.ts`'s stdout-based status tracking had no way to know that. Fixed
by adding `reportForwardHealthy()`, called from `/api/live/state` whenever a component
fetch actually succeeds - a direct, stronger signal than parsing kubectl's own stdout,
robust to a forward that was already up before this process started managing them.
Re-synced and re-tested on the VM: all three now correctly report `"running"`.

Left running on the VM after this verification: the dev server (loopback-bound) and
the Actuator at 1 replica (scaled up from 0 specifically for this test). Flagged to
the user in the same turn as this fix, since leaving things running on a billed
server is their call, not a default to make silently.

### Follow-up fix — missing Module 2 chart, missing Actuator chart, risk chart's y-axis wrong

Having seen the real `/live` page over the SSH tunnel above, the user asked for four
things: a Module 2 chart/speedometer (there wasn't one - only Module 1/3/Actuator had
gauges), a chart for the Actuator's own replica count (the gauge existed, the chart
didn't), a fix for the risk chart's y-axis (it was scaling to the reference trial's
own small observed range - about 0 to 0.1 - instead of the fixed 0-to-1 probability
range risk actually lives in), and real analog speedometers (an arc with a smoothly
animated needle) in place of the flat horizontal-bar gauges, polling every 2s instead
of 8s.

Built `components/live/speedometer.tsx` (a half-circle SVG dial - filled arc plus a
needle, both driven by CSS `transition` on `stroke-dashoffset`/`transform` so a new
reading eases into place over ~0.7s instead of jumping, matching "smooth like a real
speedometer") and replaced the old flat `components/live/bounded-gauge.tsx` with it
everywhere (deleted the now-unused file). While wiring up Module 2, found
`components/live/multi-line-chart.tsx` already existed, unused, from earlier in this
session - built for exactly this case (an arbitrary number of live-only series with no
fixed reference, since Module 2's node set isn't known ahead of time) - so used it
rather than building a second, worse version: Module 2 now gets a speedometer showing
the bandit's best-node posterior mean, and a `MultiLineChart` plotting *every* node's
own posterior mean over time (not just the best one), each node its own color, plus a
plain-text line underneath with the exact per-node percentages and the running
`reward_updates_applied` count. The Actuator gained a matching replica-count-over-time
chart using `referenceTrial.replica_trajectory` (loaded since Phase 6 but never
actually charted). Fixed the risk chart's bounds from a dynamically-computed max back
to the fixed, correct `min={0} max={1}` (risk is a probability, not a value scaled to
whatever one reference trial happened to reach). `POLL_MS` dropped from 8000 to 2000,
`HISTORY_LENGTH` raised from 40 to 60 (a 2-minute rolling window at the faster
cadence). Reorganized the whole gauge/chart area from two separate rows (all gauges,
then all charts) into four paired columns (each metric's speedometer directly above
its own chart), per the user's explicit request for that pairing.

Verified: `tsc --noEmit` and `npm run lint` both clean locally. Re-synced
`lib/`, `app/`, and `components/` to the VM (`tar | ssh ... tar x`), confirmed the
stale `bounded-gauge.tsx` was actually removed there too (tar only adds/overwrites,
it doesn't delete files no longer present in the source - had to `rm` it explicitly),
restarted the dev server, and re-curled `/api/live/state` on the VM: `module3_state`'s
`module2_bandit_state.posterior_mean` came back with both real cluster nodes
(`fyp-autoscaling-control-plane` 0.77, `fyp-autoscaling-worker` 0.77), confirming the
new Module 2 chart has real multi-node data to plot, not just a placeholder. All three
`forwards` statuses came back `"running"` immediately this time (the earlier fix from
the previous verification pass held). `/live` still returns 200.

### Follow-up fix — charts reset on page reload, fixed-window time axis, new TeaStore page

After actually watching the deployed page over the SSH tunnel, the user asked for three
more things: (1) the live charts shouldn't reset to empty every time the page reloads -
they should show everything "since the application began to run"; (2) the chart x-axis
shouldn't be a fixed-length scrolling window, it should represent real elapsed time with
the run's own start as zero; (3) a new top-level "TeaStore" tab explaining what TeaStore
actually is and exactly how it connects into this project, since the user had never had
that explained despite it being the app every result on this site is about.

**Root cause of the reset:** all four history arrays (`riskHistory`,
`thresholdHistory`, etc.) lived in `components/live/live-dashboard.tsx`'s own React
`useState` - client-side memory, gone the instant the tab reloads. There was never a
server-side record of what had already been observed.

**Fixed by moving data collection to the server**, decoupled from any browser tab:
- `lib/live-history.ts` (new) - a module-scope singleton, same lazy-start pattern as
  `lib/port-forwards.ts`. The first `/api/live/state` request calls
  `ensureLiveHistoryPolling()`, which starts its own internal `setInterval` (every 2s)
  that fetches all three live components directly and appends `{t, risk, threshold,
  replicas, module2}` to an in-memory array - independent of whether anyone is
  currently viewing `/live`. Its first successful point's timestamp becomes
  `startedAt`, permanently, for the life of the server process. Capped at 5000 points
  (~2.8 hours at 2s) as a memory safety net only, explicitly not a sliding window -
  the doc comment says so directly, to stop a future edit from "fixing" this back into
  a fixed-window truncation by accident.
- `/api/live/state` now also returns `history: { startedAt, points }` alongside the
  existing current-snapshot fields, so a freshly-loaded tab receives the *entire*
  history in its very first response - nothing is lost between server restarts of the
  browser, only between restarts of the Next.js server process itself (which is the
  correct boundary: "the application" that shouldn't restart is the polling backend,
  not any one viewer's tab).
- `components/live/live-dashboard.tsx` had its four local `useState` history arrays
  and manual accumulation logic deleted entirely - it now just derives elapsed-time
  series directly from `state.history` on every poll response, with no client-side
  memory of its own to lose.

**Fixed the time axis** by reworking both chart components
(`components/live/spark-compare-chart.tsx`, `components/live/multi-line-chart.tsx`)
to plot `{t: elapsedSeconds, v}` points instead of an index-spaced plain-value array.
`t=0` is each series' own start (the live side's `history.startedAt`; the recorded
reference trial's own first bucket timestamp, computed by a new
`getReferenceTimeSeries()` in `lib/results.ts` from `replica_trajectory`'s real
per-bucket ISO timestamps). The chart's x-axis scale is `max(last live t, last
reference t)`, recomputed fresh every render - never a fixed span - so accumulating
more history simply means more points get plotted across the same width, exactly the
"not bound to a fixed time period" behaviour asked for, rather than a scrolling window
that would discard old points.

**Built the TeaStore page** (`app/teastore/page.tsx`, new nav entry between "Project
Overview" and "Training & Test Results"), grounded entirely in the real source, not
general recollection: read `project/live_cluster/teastore/teastore.yaml` directly for
the seven `descartesresearch/teastore-*` services actually deployed; confirmed
`teastore-webui` is the sole scaling target by grepping `TARGET_DEPLOYMENT` in both
`module1_controller/app.py` and `actuator/app.py` independently (not assumed from one
file); read `module1_controller/app.py`'s `probe_latency_ms()` and
`loadgen/ablation_trial.js` to confirm Module 1's active HTTP probe and k6's load
generator hit the exact same URL; read `loadgen/generate_replay_stages.py` in full for
the real traffic-curve derivation (the case-study service's real `call_count` curve,
360 buckets/12h at 0.5% sampling, block-averaged to 30 stages, min-max normalized,
rescaled to a realistic single-pod req/s range, compressed into a ~15-minute trial);
and reused the exact five-arm table from `docs/Phase6_Ablation_Design.md` §2 rather
than re-deriving or paraphrasing it. Sections: what TeaStore is and its seven services,
how Promex connects to it (a `StepFlow` request-path chain plus three explainer
cards), where the traffic pattern comes from (a second `StepFlow`), the five-arm table,
a primary-vs-follow-up study comparison, and the TeaStore registry-client bug
(cross-referencing the Conclusion page, explicitly framed as "not a Promex defect").
Caught and fixed a `Würzburg`/`ü` character during the same non-ASCII sweep that
caught `§`/`≈`/`γ` earlier this session - replaced with the ASCII transliteration
"Wuerzburg" rather than risk the same missing-glyph problem.

**A genuine discovery mid-verification, not a bug:** curling `/api/live/state` on this
Windows machine unexpectedly returned `clusterReachable: true` and a 404 on the new
`/teastore` route, which looked like local vs. VM confusion. Checked
`Get-NetTCPConnection -LocalPort 8878` and found the *user's own* `ssh -L
8878:127.0.0.1:8878 fyp-hetzner` tunnel from earlier in the session still held that
port - every "local" curl during this fix was silently being routed through it to the
VM's own (still-outdated, pre-fix) webapp. Not a bug in this app; just a reminder that
port 8878 on this machine can mean either target depending on what else is running.
Switched to verifying entirely through `ssh fyp-hetzner "curl ..."` instead, which
talks to the VM's own loopback directly and can't be confused with the tunnel.

Verified: `tsc --noEmit` and `npm run lint` both clean. Deployed to the VM (stopped
the old server, re-synced `lib/`/`app/`/`components/`, confirmed the new
`app/teastore/page.tsx` and `lib/live-history.ts` landed, restarted). Curled
`/teastore` on the VM (200, all major section headings present). Curled
`/api/live/state` twice, ~24s apart: `history.startedAt` was identical both times
(1786163334682) while `history.points` grew from 8 to 20 entries in between with no
client request in between either check - direct proof the poller runs on its own
timer, not on-demand, and that a page reload would see the same `startedAt` and the
full accumulated history rather than an empty chart. Re-curled all six routes
(`/`, `/overview`, `/teastore`, `/results`, `/conclusion`, `/live`) on the VM - all 200.

### Follow-up fix — explain the pinned threshold, move the reference trial to TeaStore, explain Module 2's speedometer/chart relationship

Three more things after watching the updated page: (1) the alert threshold speedometer
reads a fixed 0.90 and never moves - is that a bug; (2) move the "recorded reference
trial" comparison off the Live charts entirely and onto the new TeaStore page instead,
with an explanation of what it shows; (3) the relationship between Module 2's "Best
node quality" speedometer and its per-node chart wasn't clear.

**The threshold question had a real, traceable answer, not a guess.** Read
`module3_controller/app.py`'s `PIController.step()` directly: `error = measured_value
- setpoint` where `measured_value` is Module 1's live `predicted_risk` and
`setpoint = 0.10`. Live risk has been running at roughly 0.005-0.05 this whole
session - consistently below 0.10 - so `error` is consistently negative, which the
controller reads as "raise the threshold." It's been doing exactly that every ~120s
cycle since this control loop started, until it hit `MODULE3_THRESHOLD_BOUNDS`'s own
configured ceiling (0.9) and got clamped there - confirmed against the live
`/api/live/state` response (`threshold: 0.9`, `cycles: 1010` - roughly 33.7 hours of
uninterrupted running). Genuinely pinned at its real limit, not stuck or broken; it
would move again the moment live risk crossed above 0.10. Built
`components/live/threshold-pin-note.tsx` to surface this explanation directly on the
page whenever the threshold is sitting at either bound (ceiling or floor case, worded
differently), rather than leaving a future viewer to wonder the same thing.

**Moved the reference trial.** Removed the two-line (recorded vs. live) comparison
style entirely - deleted `components/live/spark-compare-chart.tsx` and consolidated
everything onto `components/live/multi-line-chart.tsx` (which already handled an
arbitrary number of named single-color lines against elapsed time; a live-only chart
is just that component called with one series). The Live Run page's four charts are
now live-only. `app/teastore/page.tsx` gained a new "A recorded reference trial,
charted" section instead - three `MultiLineChart`s (risk/threshold/replicas) built
from the same `getReferenceTimeSeries()` data the Live page used to overlay, plus a
"what this shows" paragraph that explicitly connects back to the threshold-pinning
explanation above: this trial's own threshold rose from 0.1 toward ~0.43 over its
15-minute run for the *same* reason the live one sits at 0.9 - it just didn't run long
enough to reach the ceiling. Replicas stayed flat at 1 all trial (zero SLA violations)
since risk never got close to even that rising threshold.

**Explained the Module 2 relationship** with a dedicated paragraph in
`live-dashboard.tsx`'s Module 2 block: the bandit tracks one independent quality
estimate per node; the chart plots every node's own line; the speedometer is nothing
more than *whichever line is currently highest* - the current best choice, not a
separate measurement. Noted explicitly that with two closely-matched nodes, which one
is "best" can flip between polls without the speedometer's number moving much, and
that flip is only visible in the chart.

**Incidentally reduced complexity while doing this rework**, per two IDE warnings that
came back on the initial edit (cognitive complexity 19/15, a nested ternary): extracted
`components/live/no-cluster-card.tsx` and `components/live/component-status-tiles.tsx`
out of the main dashboard component, and `ThresholdPinNote` (above) absorbed what would
otherwise have been a nested ternary in JSX. `live-dashboard.tsx` is meaningfully
smaller and flatter as a result, not just functionally changed.

Verified: `tsc --noEmit` and `npm run lint` both clean, plus a repeat of the earlier
non-ASCII character sweep across every changed file (clean - no repeat of the
`§`/`≈`/`γ` class of bug). Deployed to the VM (stopped the old server, removed the
now-deleted `spark-compare-chart.tsx` there too, re-synced, restarted). Confirmed via
curl: `/teastore` now contains "A recorded reference trial, charted" and "What this
shows"; `/live` no longer contains "Recorded reference trial" anywhere; the Module 2
relationship paragraph is present on `/live`. Confirmed live `threshold` is still
`0.9` via the API directly (the `ThresholdPinNote` itself is client-fetched after
hydration, so it correctly does not appear in a plain `curl` of the server-rendered
HTML - expected, not a gap in verification, and re-confirmed the underlying condition
it depends on is true). All six routes re-checked at 200 on the VM.

### Follow-up fix — chart axes/gridlines, Module 1 and Actuator explanations, and real (non-module) Kubernetes ground-truth gauges

Four more asks after the previous round: (1) every Live chart needs real x/y axes plus
dashed sub-gridlines (e.g. 0.1, 0.2, 0.3 ticks), not a bare polyline; (2) the risk chart
(Module 1) and replica chart (Actuator) needed the same kind of "what this is" paragraph
already added to Module 2 and Module 3's blocks; (3) confirmation that the threshold
number is genuinely Module 3's live output, not something else; (4) Module 2's
speedometer/chart still read as "fixed," its relationship to the constantly-changing
Actuator chart was unclear, and the user wanted the *actual* Kubernetes ground truth
(not just module-computed numbers) surfaced somewhere on the page.

**Confirmed (3) directly against the live API before answering anything else**: curled
`module3-controller`'s `/state` on the VM and got back real, moving values (`cycles`
in the 1000s, `control_signal`/`predicted_risk` matching Module 1's own live reading,
`threshold: 0.9`) - this is the actual PI-controller output described in the previous
fix, not a placeholder or cached value; it reads as constant only because it is
genuinely pinned at its configured ceiling (see the previous entry).

**Axes and gridlines**, `components/live/multi-line-chart.tsx`: added a `niceTicks()`
helper (1/2/5 x 10^n step rounding, same idea as d3's tick algorithm, hand-rolled since
no charting library is used anywhere in this app) producing ~8-10 evenly spaced y-axis
ticks - for every 0-1 chart this lands exactly on 0.1 steps, matching what was asked
for. Added a matching 5-tick x-axis in elapsed time. Both draw as low-opacity dashed
lines (`stroke-dasharray="2,3"`, ~12% opacity) behind the data, plus two slightly more
visible solid axis lines (left + bottom) - dashviz's "recessive grid" rule: the grid
orients, the data line is still what the eye follows. Added an `integerTicks` prop for
the replica chart (1-3 range), where fractional tick values would be meaningless -
without it, whole-number ranges produce ticks like 1.2/1.4 that don't correspond to any
real replica count.

**Root-caused why Module 2 "looks fixed" instead of re-explaining the same speedometer
mechanics again.** Read `module3_controller/app.py`'s docstring and `actuator/app.py`
in full: the Actuator's scaling decision (`read_signal_and_threshold()`) only ever
compares Module 1's risk to Module 3's threshold - Module 2's bandit state is not
consulted anywhere in that decision. Module 3 polls Module 2's extender each cycle
purely to *report* it alongside its own state (the module docstring says this
explicitly: "not... feeding its threshold decision back into Module 2's reward
function... disclosed, not hidden"). Separately, curled the live state directly and
confirmed the two node names are the real Kubernetes node names from this kind cluster
- `fyp-autoscaling-control-plane` and `fyp-autoscaling-worker` - exactly what the user
named, and **both already were present as separate lines** in the existing chart code
(`module2NodeSeries()` builds one series per key in `posterior_mean`, generically, not
hardcoded to a node count) - the confusion was that on a 0-1 scale, two posterior means
sitting at ~0.77-0.78 with 91-139 pulls each move by ~0.001-0.002 per update, which
reads as visually flat. Rewrote both Module 2 paragraphs in `live-dashboard.tsx` to
state plainly: what it decides (which node a pod lands on at actual scheduling time,
not replica count), why it moves slowly (rare scheduling events + shrinking
per-update posterior movement as pull count grows + the one-way reporting relationship
just described), and added live pull counts per node to the on-page per-node summary
line so the "how many placements so far" claim is independently checkable, not just
asserted.

**Added a genuinely new "Real Kubernetes cluster state" section**, answering the
literal request for gauges on "the actual thresholds and other stuff we target in
Kubernetes in real": traced `module1_controller/app.py`'s own docstring, which already
disclosed that `cpu_utilization`/`memory_utilization`/`active_instances` in its
`last_bucket` are "REAL - read from the Kubernetes metrics API" (as % of each pod's
configured resource *limit*) - genuine ground truth already being fetched every cycle
but never displayed anywhere on the Live page. Extended `lib/live-history.ts`'s
`LiveHistoryPoint` with `cpuUtilization`/`memoryUtilization` fields sourced from that
same `last_bucket`, and added a new labeled section below the four module blocks with
its own speedometer+chart pair for each, explicitly captioned as unprocessed cluster
state rather than a module's computed output - contrasted directly against Module 1's
risk score, which is computed *from* these same two numbers plus other signals.

Verified: `tsc --noEmit` and `npm run lint` both clean (including three IDE warnings
from the first draft - two nested ternaries in the new tick/label logic, one
array-index React key - all fixed by extracting an explicit `let step` branch and
keying on tick values instead of index). Non-ASCII sweep of all three changed files
clean. Deployed to the VM (synced `lib/`, `components/`, `app/`; the running dev server
had to be restarted since it doesn't hot-reload across an SSH-triggered file sync).
Confirmed via curl on the VM: `/live` returns 200; `/api/live/state`'s `history.points`
now carry non-null `cpuUtilization`/`memoryUtilization` after a few poll cycles; the
rendered `/live` HTML contains "Real Kubernetes cluster state", "Why it moves so
little", and both new "What this is" paragraphs; 92 dashed gridlines render across the
page's charts; `/teastore` (which reuses the same `MultiLineChart` component) still
returns 200 and still contains its own reference-trial section, confirming the shared
component's signature change didn't break its other caller.

### Follow-up fix — Module 2's overlapping lines, dashboard layout, and a real Module 1/Module 3 polling-rate mismatch

Two more issues after watching the previous round live: (1) Module 2's two node lines sit
so close together (~0.76-0.78) that they read as one line, and the surrounding layout
(which block sits next to which) needed reconsidering now that some blocks had grown much
longer than others; (2) the user saw the "Risk score (Module 1)" reading cross 0.10 while
the threshold stayed at 0.90 - contradicting the earlier "it'll move once risk crosses
0.10" explanation - and asked for the actual live risk to be shown if what's displayed
wasn't it.

**(2) turned out to be a real, previously-undisclosed nuance, not a wrong claim - traced
to source before writing anything.** `module3_controller/app.py` polls Module 1 on its
own `POLL_SECONDS=120` cadence, completely independent of this webapp's 2-second polling
of the same Module 1 endpoint. The "Risk score (Module 1)" gauge was always genuinely
live (2s-fresh) - the problem was that Module 3's PI controller never sees that fast
stream at all; it only ever acts on whatever value it captured at its own last ~2-minute
poll. Confirmed the actual live gap directly: `risk` (this app's 2s reading) was
`0.2475`, while `module3.data.predicted_risk` (Module 3's own last-seen value, exposed in
its `/state` response) was `0.0343` at the same instant - a real, currently-live
demonstration of exactly the mismatch the user noticed. Added `m3Risk` to
`LiveHistoryPoint` (`lib/live-history.ts`), sourced from `state.module3.data?.predicted_risk`,
and plotted it as a second line on the risk chart alongside the existing fast reading, so
both are visible together with an explicit "Two lines, two poll rates" paragraph
explaining which one actually drives the threshold. Reworded `threshold-pin-note.tsx` to
stop saying "the moment live risk climbs above 0.10" (imprecise) and say Module 3's own
next poll instead.

**(1) Zoomed the Module 2 chart's y-axis to where the data actually sits, plus direct
end-of-line labels**, `components/live/multi-line-chart.tsx`: added `autoFitDomain()`,
which computes a padded domain from the series' actual min/max and only engages when the
data spans less than 60% of the caller's hard bounds (so a chart that's already using
most of its range is left alone, un-zoomed) - the figcaption and aria-label say
"(zoomed in from 0-1)" whenever it's active, so the axis change is disclosed, not silent.
Added `computeEndLabels()`: a small value label at the right edge of each line (colored
to match), with simple vertical-collision avoidance so two close labels don't overlap
each other either - the dataviz skill's "selective direct labels" guidance for exactly
this case (color alone isn't enough to tell two close lines apart). Only renders for
2-4 series, per the same skill's guidance on when direct labels help vs. clutter.

**A real bug surfaced by this same change, not by the zoom logic itself**: the VM's dev
server threw `Cannot read properties of undefined (reading 'toFixed')` inside the new
label-formatting code. Root cause: `usablePoints()`'s filter used `p.v !== null`, which
is true for `v: undefined` too (`undefined !== null`), so a point with a genuinely
missing reading could slip through as "usable" and reach `.toFixed()` on `undefined`.
Fixed by switching the filter to `typeof p.v === "number" && Number.isFinite(p.v)` -
correctly excludes both `null` and `undefined`, and NaN besides. This is the kind of gap
a `null`-only check quietly leaves in JS; worth remembering for any future filter here.

**Reworked the block layout** (the part the user explicitly flagged as needing
reconsideration, excluding the "Real Kubernetes cluster state" section which they said
to leave alone): grouped by causal relationship instead of the previous arbitrary
2x2 grid. Row 1, under a new "What decides the replica count" heading: Risk (Module 1)
and Threshold (Module 3) side by side - the two inputs to the scaling decision, now
cross-referencing each other directly in their prose ("both charted to the left/above").
Row 2, under "What the replica count leads to, and a separate concern": Replicas
(Actuator) - the outcome of row 1 - next to Module 2, explicitly introduced as answering
a different question (node placement, not replica count) rather than being just another
tile in a grid. Trimmed Module 2's explanation from three paragraphs to two, folding the
"what it decides" and "how it differs from the Actuator" content together now that its
neighbor changed from Module 1 to the Actuator directly.

Verified: `tsc --noEmit` and `npm run lint` clean after the fix (and after the
`usablePoints` bug fix specifically - confirmed by re-running both, not just assuming the
one-line change was safe). Non-ASCII sweep clean (one pre-existing `…` in unrelated,
untouched code flagged by the sweep script's narrower allowlist - not a new issue, not
part of this change). Deployed to the VM twice - once before discovering the runtime
bug (caught it from the VM's own dev server log, not a local check, since it only
surfaced with real multi-point live history data), once after the fix, confirmed via a
clean `tail` of the server log post-fix (compiled, serving 200s, no further browser-
reported errors) and a live API check showing real `m3Risk`/`risk` divergence
(0.0343 vs 0.2475) proving the two-line explanation reflects an actually-observable
condition, not a hypothetical. `/teastore` re-confirmed still 200 with its own content
intact, since it shares `MultiLineChart`.

### Follow-up fix — StepFlow diagrams overflowing off the right edge of the page

Screenshot from the user: Project Overview's Module 1 card showed a 6-step process chain
(`StepFlow`) that ran off the right edge of the viewport - the "6 Use it live" card was
half-cut, with no scrollbar to reach the rest of it.

**Root cause**: `components/step-flow.tsx`'s row (`flex md:flex-row`) had no wrap
behavior and each step card carried `md:min-w-[180px]`. With 5-6 steps at ~180px+gap
each, total row width regularly exceeds the content column's actual width on real
viewport sizes, and the row simply overflowed its container with nothing to catch it -
no wrap, no scroll affordance.

**Fix**: added `md:flex-wrap` to the row. Each card+arrow pair is already grouped as one
flex item (`<div key={step.title}>` wrapping both), so wrapping happens at natural
step boundaries - a step never splits mid-card, it just drops to the next line as a
whole unit, the same way the component already stacks vertically below the `md`
breakpoint. Chose wrap over a horizontal-scroll container (the pattern already used for
the architecture diagram and result tables, both of which are genuinely non-reflowable
content) because a step list has no such constraint - reflowing it is strictly more
readable than making a reader scroll sideways through numbered steps.

**Checked for the same class of bug elsewhere** rather than only fixing the one
screenshotted instance: `StepFlow` is a single shared component used in 8 places across
`app/page.tsx`, `app/overview/page.tsx` (4x), and `app/teastore/page.tsx` (2x) - fixing
the component fixes all 8 call sites at once, not just Module 1's. Grepped the rest of
the codebase for the same `min-w-[...]` + unwrapped-flex-row pattern and found no other
occurrence; every other wide layout (badge/tag rows, the nav bar, result tables, the
architecture diagram) already uses either `flex-wrap` or a deliberate
`overflow-x-auto` scroll container, so this was an isolated gap, not a systemic one.

Verified: `tsc --noEmit` and `npm run lint` clean. Deployed to the VM; confirmed via curl
that `/overview`'s rendered HTML now carries `md:flex-wrap` on all 8 `StepFlow`
instances site-wide (not just Module 1's), and the page still returns 200 with a clean
server log.

### Follow-up fix — missing "what this is" explanation on the Alert threshold (Module 3) block

Risk (Module 1), Replicas (Actuator), and Best node quality (Module 2) each had a
persistent "What this is" paragraph; Module 3's block only had `ThresholdPinNote`, which
is conditional - it renders nothing at all once the threshold is genuinely moving
somewhere in the middle of its range, so the block could show no explanation whatsoever.
Added a persistent paragraph covering what the PI controller is, its 0.10 target, which
way it moves the threshold and why, the two mechanisms that change its step size
(adaptive conformal inference narrowing when Module 1 has been less accurate;
oscillation widening when the threshold itself has been reversing direction), and what
"alert" means - `ThresholdPinNote` still renders underneath it for the bound-specific
case. Verified: `tsc`/lint clean, deployed to the VM, confirmed via curl that `/live`'s
rendered HTML now contains the new paragraph.

### New page — Knowledge (what each module remembers, and where it lives in the code)

User asked, separately from any bug report: does this system have a "knowledge base," given
the MAPE-K framing used throughout `docs/` to describe the architecture (Monitor-Analyze-
Plan-Execute-**Knowledge**)? Answered first in chat (no single shared component - each
module maintains its own private state, and shares only specific pieces with the others),
then asked to build it as a real page rather than leave it as a chat answer, then to draw
it as a 2D diagram rather than a 3D scene (recommended against 3D explicitly: it would need
a new dependency this app has deliberately avoided everywhere else, and a 3-node structure
this small is genuinely easier to read flat than orbited), then to add a literal code-level
mapping on top of the diagram.

Built `app/knowledge/page.tsx` + `components/knowledge-diagram.tsx` (hand-authored inline
SVG, same primitives as `architecture-diagram.tsx` - no new library). Traced every claim to
source before writing it: Module 1's rolling history (`module1_controller/app.py:165`,
`self.history: deque[dict] = deque(maxlen=HISTORY_LEN)`), Module 2's per-node Beta beliefs
(`module2_extender/app.py:73-102`, the `ThompsonSamplingBandit` class - confirmed via a live
`/state` curl showing real `alpha`/`beta`/`pulls` values, not just reading the class
definition), Module 3's integral term/score history/threshold trajectory
(`module3_controller/app.py:81/106/153`). Caught and fixed one real off-by-one before
publishing (`self.integral = 0.0` is line 81, not 82 as first written) by re-reading the
exact line after drafting the content rather than trusting the earlier read from memory.

Added a "Mapped to the code, line by line" table (one row per piece of knowledge, `Module |
What it maintains | Where in the code`) directly answering "tell me where the knowledge base
is in the code" literally, on top of the diagram rather than replacing it. Verified:
`tsc`/lint clean, non-ASCII sweep clean, deployed to the VM, confirmed via curl that the
rendered page contains the table heading and both cited line numbers, and that all other
routes still return 200 (nav bar was a shared-file edit).

### New page — Data Pipeline (the Alibaba trace through to three trained, validated modules)

User asked for a full walkthrough: the dataset, how each module's data is actually prepared,
how each is trained, and how each is validated - "with diagram" and "use some codes from
the codebase to prove." Built as `app/data-pipeline/page.tsx`, with a new
`components/pipeline-diagram.tsx` (a fifth hand-authored SVG diagram, same pattern as the
other four) and a new small `components/code-snippet.tsx` (plain `<pre>`/`<code>`, no
syntax-highlighting library - same "no new dependency for something this small" principle
as everywhere else).

Every fact was traced to source, not recalled from memory, including re-reading files
already read earlier in the session in case line numbers had drifted:
`preprocessing/build_features.py` for the latency-signal/label/split code (confirmed the
label is self-referential and forward-shifted, and the split is strictly time-ordered -
`time_based_split()`, no shuffle); `module2_co_scheduling/bandit.py` for the discounted
posterior update; `module3_adaptive_control/{pi_controller,conformal}.py` for the
reversal-count/widening functions (the *original* module files, not the live-cluster copies
this time, since this page is specifically about offline training/validation).

**One real correction made to the diagram's own scope while building it**: the initial plan
included a Module 2 -> Module 3 arrow (bandit state), copied by habit from the Knowledge
page's diagram. Checked `module3_adaptive_control/validate.py` directly before drawing it -
its `run_arm()` only calls `load_holdout_residual_stream()` (Module 1's output), no Module 2
dependency anywhere in offline validation. That link is live-cluster-only (Phase 5+,
reporting only, not fed into training). Removed it before the diagram was ever shown,
rather than drawing a connection that doesn't exist in the pipeline this page is actually
about.

Reported every module's validation honestly, including the failing criteria alongside the
passing ones (`StatusBadge status="pass"` vs `"disclosed"`, matching the exact convention
already used in `components/results/module3-section.tsx` - checked that file first rather
than inventing new status semantics): Module 1's lead-time comparison did not beat its
baseline on real data; Module 2's discounted-vs-vanilla comparison lost on the real trace's
one non-stationary window; Module 3's real-data three-way comparison tied at 4 reversals
each. Each is paired with its synthetic-addendum test, which passed with real reported
numbers (Wilcoxon p-values, win rates) pulled directly from
`results/module2/synthetic_rank_inversion.json` and `results/module3/synthetic_multi_burst.json`,
not approximated.

**A second real bug caught during writing, this time a font-glyph issue, not a logic one**:
Unicode superscript minus digits, a Unicode multiplication sign instead of a plain `x`, and
a Unicode approximately-equals sign instead of `~=` all made it into the first draft's
real-number citations (e.g. writing a p-value as "9x10 to the -16").
These are exactly the class of character already known this session to fall outside Geist's
loaded glyph subset (the `§`/`≈`/`→`/`γ` bug from earlier in this project). Caught by the
same non-ASCII sweep script used every time since - re-ran it, found 3 more hits than the
first pass (the sweep only catches what's actually still in the file, so this really was a
second, separate slip, not a re-detection of the same one) - replaced with plain ASCII
("Wilcoxon p under 0.0001", "CPU x memory-headroom").

Added `/data-pipeline` to the nav bar, between Knowledge and TeaStore. Verified: `tsc`/lint
clean, non-ASCII sweep clean across all six touched files, local render test confirmed the
diagram SVG, all `CodeSnippet` source labels, and the Phase 4 section text all present,
deployed to the VM, confirmed via curl, and re-checked all eight routes return 200 (a second
shared-file edit, same nav bar).

---

## Phase 7 — Polish & cross-cutting

| Task | Status | Notes |
|---|---|---|
| Nav/theme consistency pass | Not Started | |
| `project/webapp/README.md` | Not Started | |
| `CLAUDE.md` updated (Phase 9 description, folder structure, commands) | Not Started | |
| Final verification pass | Not Started | |

**Phase 7 status: Not Started.**
