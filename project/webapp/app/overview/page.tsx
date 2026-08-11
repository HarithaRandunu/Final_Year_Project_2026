import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArchitectureDiagram } from "@/components/architecture-diagram";
import { StepFlow } from "@/components/step-flow";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraduationCap } from "lucide-react";

type SpecRow = { label: string; value: string };

const MODULE1_SPEC: SpecRow[] = [
  { label: "Technique", value: "LightGBM gradient-boosted classifier, 150 trees (learning_rate=0.05, num_leaves=7, max_depth=4, min_child_samples=5, class_weight=balanced)" },
  { label: "Inputs", value: "A 37-column feature table: 10 raw signal columns (p95/p99 latency, call count, HTTP + provider-RPC call rate/response time, CPU, memory, active instances) plus 24 rolling 1/2/4-bucket delta columns, per 2-minute bucket" },
  { label: "Output", value: "predicted_risk - a probability (0-1) that the next 2-minute bucket breaches the service's own observed p99 threshold - plus a per-prediction TreeSHAP attribution across the 4 perturbation-tested signal families" },
  { label: "Key parameters", value: "decision_threshold=0.5, walk_forward_n_splits=5, lead_time_target_alert_rate=0.15 (configs/module1_default.json)" },
  { label: "Individual novelty", value: "TreeSHAP attribution exposed as a real, consumed output for every prediction - not just an internal diagnostic used while building the model" },
  { label: "Code - offline", value: "module1_signal_fusion/{train.py, validate.py, export_full_trace.py, export_walkforward_oos.py}" },
  { label: "Code - live", value: "live_cluster/module1_controller/app.py" },
  { label: "Live API", value: "Port 8000 - GET /risk, GET /metrics, GET /healthz. Probes the live app 8 times per 2-minute bucket (every 15s), publishing a fresh predicted_risk roughly every 2 minutes." },
];

const MODULE2_SPEC: SpecRow[] = [
  { label: "Technique", value: "Beta-Bernoulli Thompson Sampling bandit with a discounted posterior update (gamma < 1)" },
  { label: "Inputs", value: "Up to 6 candidate nodes per decision, each with live CPU/memory headroom; reward is the chosen node's observed CPU/memory headroom over the following 5-minute window" },
  { label: "Output", value: "Live: a priority score per candidate node returned to Kubernetes' own scheduler, which picks the highest. Offline: the simulated chosen node id, for regret measurement." },
  { label: "Key parameters", value: "discount_gamma=0.9, n_candidates=6, reward_window_minutes=5, node_max_cpu/mem_for_candidate=0.9, warmup_rounds=5 (heuristic fallback while cold) (configs/module2_default.json)" },
  { label: "Individual novelty", value: "The discount factor itself - gamma=0.9 decays accumulated belief toward the uninformative prior before each update, vs. vanilla Thompson Sampling's gamma=1.0 (never forgets)" },
  { label: "Code - offline", value: "module2_co_scheduling/{bandit.py, simulate.py, validate.py}" },
  { label: "Code - live", value: "live_cluster/module2_extender/app.py - a real Kubernetes scheduler-extender webhook, not a standalone service Kubernetes has to be told to trust in any special way" },
  { label: "Live API", value: "Port 8090 - POST /filter, POST /prioritize (the two calls Kubernetes' own scheduler makes to a real extender), GET /state, GET /healthz. Rewards polled and the posterior updated every 15s." },
];

const MODULE3_SPEC: SpecRow[] = [
  { label: "Technique", value: "PI controller (kp=0.6, ki=0.15, setpoint=0.10) wrapped in Adaptive Conformal Inference (alpha_target=0.10, gamma=0.05, score_window=20), plus a reversal-count-conditioned widening multiplier" },
  { label: "Inputs", value: "Module 1's predicted_risk and the matching actual_outcome - offline, its own held-out residual stream; live, Module 1's /risk output plus the observed outcome" },
  { label: "Output", value: "An adaptive alert threshold, bounded to [0.01, 0.9] (threshold_bounds)" },
  { label: "Key parameters", value: "base_max_step=0.05, width_sensitivity=3.0, alpha_bounds=[0.02, 0.5], oscillation_window=8, oscillation_k=4.0 (configs/module3_default.json)" },
  { label: "Individual novelty", value: "rolling_reversal_count() over the threshold's own recent trajectory multiplies the conformal interval width before it bounds the controller's next move - the reversal guard" },
  { label: "Code - offline", value: "module3_adaptive_control/{pi_controller.py, conformal.py, common.py, validate.py}" },
  { label: "Code - live", value: "live_cluster/module3_controller/app.py" },
  { label: "Live API", value: "Port 8091 - GET /state, GET /metrics, GET /healthz. Polls Module 1's /risk every 120s and recomputes the threshold on each poll." },
];

const ACTUATOR_SPEC: SpecRow[] = [
  { label: "Role", value: "The 4th live component - not one of the 3 modules, but the only one that actually changes anything. Reads Module 1's predicted_risk and Module 3's current threshold, applies a symmetric band rule (signal > threshold: +1 replica; signal < threshold x 0.5: -1 replica; else hold), and calls the Kubernetes API's scale subresource directly." },
  { label: "Bounds", value: "Replica count bounded to [1, 3] (the same minReplicas/maxReplicas range every ablation arm shares, including the standard-autoscaler baseline)" },
  { label: "Code", value: "live_cluster/actuator/app.py" },
  { label: "Live API", value: "Port 8092 - GET /state, GET /healthz. Acts every 30s." },
];

const SYSTEM_INVENTORY = [
  { component: "Module 1 controller", port: "8000", endpoints: "/risk, /metrics, /healthz", cycle: "~15s probe / ~2min output", reads: "Live app response times, resource metrics", writesActs: "Nothing - read-only observer" },
  { component: "Module 2 extender", port: "8090", endpoints: "/filter, /prioritize, /state, /healthz", cycle: "15s reward poll", reads: "Candidate node CPU/memory, placement outcomes", writesActs: "A priority score returned to Kubernetes' own scheduler" },
  { component: "Module 3 controller", port: "8091", endpoints: "/state, /metrics, /healthz", cycle: "120s", reads: "Module 1's /risk", writesActs: "Its own adaptive threshold (read by the actuator)" },
  { component: "Actuator", port: "8092", endpoints: "/state, /healthz", cycle: "30s", reads: "Module 1's /risk, Module 3's /state", writesActs: "Kubernetes' scale subresource (replica count)" },
  { component: "Kubernetes (unmodified)", port: "-", endpoints: "standard Kubernetes API", cycle: "continuous", reads: "The actuator's scale calls, the extender's filter/prioritize scores", writesActs: "Actually creates, removes, and binds replicas" },
];

const ABLATION_ARMS = [
  {
    name: "Baseline",
    detail: "What Kubernetes does by default — the standard autoscaler alone.",
  },
  {
    name: "+ Module 1 only",
    detail: "The standard autoscaler, but triggered by Module 1's risk score instead of raw CPU.",
  },
  {
    name: "+ Module 2 only",
    detail: "Standard trigger, but new copies are placed by Module 2's learned policy.",
  },
  {
    name: "+ Module 3 only",
    detail: "Standard trigger and placement, but the alert threshold adapts via Module 3.",
  },
  {
    name: "Full framework",
    detail: "All three modules working together — Promex as designed.",
  },
];

const TEAM = [
  {
    name: "Diwyanjalee E.A.D.S.N.",
    id: "214060C",
    module: "Module 1 — Signal Fusion",
    responsibility:
      "Built the component that turns raw measurements into a single risk estimate, plus the attribution mechanism that reports which measurement is responsible for each estimate. Prepared the labelled dataset from the production trace — reconciling four tables recorded at different granularities, computing response-time percentiles from individual call records rather than pre-averaged summaries, and building the forward-shifted label so the model predicts the future rather than recognising the present.",
    learned:
      "How easy it is to build a model that looks good and is useless: an early version paired each interval with a violation in that same interval, and scored excellently only because it was recognising a condition already present, not predicting one about to arrive. Shifting the label forward by one interval dropped the apparent performance and made the model worth deploying.",
    difficulty:
      "Violations are rare across the twelve-hour window, so a single train/test split gave wildly unstable precision-recall figures, and two of five walk-forward folds had no positive cases to score at all. Addressed by reporting the walk-forward mean as the primary estimate, stating plainly how many folds contributed, and testing on a second, unrelated service.",
  },
  {
    name: "Bandara K.G.R.U.",
    id: "214030K",
    module: "Module 2 — Co-Scheduling",
    responsibility:
      "Built the placement policy that chooses which node each new replica occupies, the simulator it was developed against, and its deployment to the cluster as a Kubernetes scheduler extender. Extracted genuine placement events from the trace, built the node-state simulator from recorded utilisation trajectories, and implemented discounted Thompson Sampling with a resource-headroom heuristic as its cold-start behaviour.",
    learned:
      "That an algorithm can be implemented correctly and still not be demonstrably useful — and that telling those two situations apart means looking at the state the run ends in, not just its headline performance. The policy didn't beat its own warm-up heuristic on the real trace; the reason turned out to be that across 371 candidate nodes there were only 87 usable placement events, too few for any bandit method to learn from.",
    difficulty:
      "The discount factor — this module's own novelty contribution — couldn't be evaluated at all on trace data where node quality never reorders. Addressed by building a controlled test that reverses the quality ranking of six options midway through and measures recovery across fifty repetitions: the discounted policy won every repetition in the recovery window.",
  },
  {
    name: "Malalpola M.L.H.R.",
    id: "214129X",
    module: "Module 3 — Adaptive Control",
    responsibility:
      "Built the adaptive control component that adjusts the alert threshold driving scaling, and the guard that restrains it when it becomes unstable — the PI controller, adaptive conformal inference wired to Module 1's residual stream, and the reversal-driven widening of the permitted adjustment band. Also built the actuator, without which none of the three modules would ever change a replica count.",
    learned:
      "The most valuable lesson came from a defect, not a success. The controller passed every one of its own component tests, but when all three modules first ran together over the full trace, the threshold rose during the calm opening, fell during the bursty middle, and then failed to recover. The cause was a missing anti-windup provision — invisible to component tests because a single step change never asks a controller to reverse twice.",
    difficulty:
      "On the real bursty segment, the reversal guard — this module's own novelty contribution — produced no visible reduction in reversal count, because that segment contains only four reversals in total: too few for any difference to show. Addressed with a repeated synthetic test (fifty runs of fifteen bursts each), where the mean reversal count fell from 14.04 to 7.64.",
  },
];

function SpecTable({ rows }: { rows: SpecRow[] }) {
  return (
    <Table>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="w-40 align-top font-medium text-foreground">{row.label}</TableCell>
            <TableCell className="whitespace-normal align-top text-muted-foreground">{row.value}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function ProjectOverviewPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Project Overview</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          How Promex is actually put together: the architecture that connects its three
          modules, what each one does technically, the tools it&apos;s built with, the data
          that trained it, and who on the team built which part.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">System architecture</h2>
        <p className="max-w-3xl text-muted-foreground">
          Six components, all working together. All three modules run as ordinary
          containers inside the same Kubernetes cluster as the application being scaled —
          nothing about Promex requires replacing Kubernetes itself.{" "}
          <strong>Module 1</strong> probes the application and reads platform metrics, then
          produces a predicted risk score. <strong>Module 2</strong> plugs into{" "}
          <strong>Kubernetes&apos;</strong> own scheduler — the built-in component that
          decides where every pod lands — through its official &ldquo;extender&rdquo;
          interface (a webhook Kubernetes calls when it wants help scoring candidate
          machines), so placement decisions still go through the real scheduler, not a
          replacement for it. <strong>Module 3</strong> reads Module 1&apos;s risk score and
          Module 2&apos;s current beliefs about each node, and outputs an adaptive alert
          threshold. The <strong>actuator</strong> reads that threshold and Module
          1&apos;s risk score and decides whether to scale up, down, or hold. It doesn&apos;t
          change anything directly — it hands that decision to{" "}
          <strong>Kubernetes</strong> itself, the platform underneath everything, which is
          what actually creates or removes replicas and binds them to a machine — the exact
          same mechanism the standard autoscaler already uses, so nothing about how
          Kubernetes scales things has to change for Promex to work.
        </p>
        <ArchitectureDiagram />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">The three modules, in detail</h2>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Module 1 — Signal Fusion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                A gradient-boosted classifier (LightGBM) trained to answer one question: will
                this service breach its latency target during the <em>next</em> interval? Its
                inputs are three families of measurement — inbound load, processor/memory
                utilisation, and latency percentiles — plus how fast each has been changing.
                TreeSHAP, an attribution technique, then explains every single prediction by
                ranking which measurement family drove it, and that ranking is passed on to
                Module 2 and Module 3 as a real, used output.
              </p>
              <StepFlow
                steps={[
                  { title: "Real traffic data", description: "from a production system" },
                  { title: "Clean it up", description: "into one simple table" },
                  { title: "Train a model", description: "to spot warning signs early" },
                  { title: "Explain why", description: "for every single prediction" },
                  { title: "Check it works", description: "on data it has never seen" },
                  { title: "Use it live", description: "a fresh risk score every couple of minutes" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Module 2 — Co-Scheduling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Each candidate node is treated as an option with an uncertain, evolving belief
                about how good it is — a beta distribution updated after every placement,
                using an algorithm called Thompson Sampling. Selection draws one random sample
                per node from its current belief and picks the highest, which naturally
                balances trying under-explored nodes against favouring known-good ones. Before
                each update, older evidence is discounted (multiplied down) so the policy keeps
                following node conditions as they drift, rather than treating a machine&apos;s
                quality as fixed forever.
              </p>
              <StepFlow
                steps={[
                  { title: "Real placement examples", description: "from the production trace" },
                  { title: "Practice", description: "on a simulated version of the cluster" },
                  { title: "Learn", description: "which machines tend to work out well" },
                  { title: "Keep adapting", description: "as machines get busier or quieter" },
                  { title: "Use it live", description: "pick a machine for every new copy" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Module 3 — Adaptive Control</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                A proportional-integral (PI) controller — a well-understood feedback-control
                technique — continuously nudges the alert threshold based on the gap between
                Module 1&apos;s risk score and its target. How far it&apos;s allowed to move at
                each step is set by adaptive conformal inference, which tracks how accurate
                Module 1&apos;s recent predictions have actually been and widens the safe
                margin when they&apos;ve been less reliable. On top of that, this module counts
                how often the controller has recently reversed direction and widens the margin
                further when it has — catching instability that comes from the control loop
                itself, not just from noisy input.
              </p>
              <StepFlow
                steps={[
                  { title: "Check recent accuracy", description: "how good has the risk model been lately?" },
                  { title: "Set a safety margin", description: "based on that accuracy" },
                  { title: "Widen it further", description: "if the controller has been jumpy lately" },
                  { title: "Adjust the threshold", description: "safely, within that margin" },
                ]}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Complete technical reference</h2>
          <p className="max-w-3xl text-muted-foreground">
            The section above explains each module&apos;s process in plain language. This section
            is the systematic version: every module&apos;s exact technique, inputs, outputs, real
            configuration values, individual novelty element, and code locations - offline and
            live - followed by the full system as one inventory: every live component, its port,
            its endpoints, how often it acts, and what it reads and writes.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Module 1 — Signal Fusion</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SpecTable rows={MODULE1_SPEC} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Module 2 — Co-Scheduling</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SpecTable rows={MODULE2_SPEC} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Module 3 — Adaptive Control</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SpecTable rows={MODULE3_SPEC} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The actuator</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <SpecTable rows={ACTUATOR_SPEC} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">The full system, as one inventory</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every live component in one table - the systematic answer to &ldquo;what actually
            runs, where, and how often.&rdquo; Kubernetes itself is included as the last row since
            it&apos;s the component that actually acts on every decision above it.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Port</TableHead>
                  <TableHead>Endpoints</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Reads</TableHead>
                  <TableHead>Writes / acts on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SYSTEM_INVENTORY.map((row) => (
                  <TableRow key={row.component}>
                    <TableCell className="font-medium text-foreground">{row.component}</TableCell>
                    <TableCell className="font-mono text-xs">{row.port}</TableCell>
                    <TableCell className="font-mono text-xs">{row.endpoints}</TableCell>
                    <TableCell>{row.cycle}</TableCell>
                    <TableCell>{row.reads}</TableCell>
                    <TableCell>{row.writesActs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every arrow in this table runs one direction - nothing is fed back upstream. See{" "}
            <strong>Knowledge</strong> for what state each component holds in memory between
            cycles, and <strong>Data Pipeline</strong> for the offline training and validation
            code behind each module&apos;s live counterpart above.
          </p>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">How it runs live</h2>
        <p className="max-w-3xl text-muted-foreground">
          Once deployed, the three modules and the actuator run as a closed loop, each on its
          own cycle, continuously probing the application and the Kubernetes API rather than
          running once and stopping.
        </p>
        <StepFlow
          steps={[
            { title: "Check the app", description: "current speed and load" },
            { title: "Estimate risk", description: "Module 1 scores the next few minutes" },
            { title: "Set sensitivity", description: "Module 3 decides how cautious to be" },
            { title: "Act", description: "the Actuator adds or removes copies, if needed" },
          ]}
          loop="This whole cycle repeats continuously, roughly every couple of minutes, for as long as the framework is running."
        />
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Tested against five configurations
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          The live study didn&apos;t just compare Promex to the standard autoscaler — it also
          tested each module running <em>alone</em>, so the contribution of each part could be
          measured separately, not just the effect of turning everything on at once.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ABLATION_ARMS.map((arm, i) => (
            <Card key={arm.name} className={i === ABLATION_ARMS.length - 1 ? "border-primary" : undefined}>
              <CardHeader>
                <Badge variant="secondary" className="w-fit text-xs">
                  {i + 1} of 5
                </Badge>
                <CardTitle className="text-sm">{arm.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{arm.detail}</CardContent>
            </Card>
          ))}
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each of the five was run five times under an identical traffic pattern — 25 trials
          in total. See <strong>Training &amp; Test Results</strong> for the full numbers.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Tech stack</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Offline development</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Python throughout. LightGBM for gradient-boosted classification, a
              tree-attribution library for the per-decision SHAP rankings, and a
              scientific-computing library for the statistical procedures behind Phase 7&apos;s
              analysis. The bandit policy and the PI controller are written directly against
              plain numerical code rather than a framework, since both are short enough not to
              need one.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live cluster</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A two-node Kubernetes cluster built with Kubernetes-in-Docker (kind) — one
              control-plane node, one worker. Each module is packaged as its own container
              image and deployed as an ordinary workload. The reference application under test
              is <strong>TeaStore</strong>, a realistic multi-service e-commerce benchmark;
              traffic is generated from inside the cluster with <strong>k6</strong>.
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">The dataset</h2>
        <p className="max-w-3xl text-muted-foreground">
          All three modules were first validated offline against{" "}
          <strong>cluster-trace-microservices-v2021</strong>, a twelve-hour production trace
          published by Alibaba covering real microservice traffic, node utilisation, and call
          records. Four raw tables — per-node utilisation, per-container utilisation,
          per-service request rates/response times, and individual call records — were
          aggregated onto a common two-minute grid and joined into one labelled table covering
          all 360 intervals of the full twelve hours. The primary service studied runs 306
          container instances and receives on the order of thirty-nine thousand sampled calls
          per interval — enough traffic for stable percentile estimates. Its violation
          threshold (538&nbsp;ms) was derived from its own observed response-time distribution
          rather than an externally imposed number, since the trace carries no stated SLA.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-6" />
          <h2 className="text-2xl font-semibold tracking-tight">Individual contributions</h2>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Promex was built by a three-person team, one module per person. Each card below is
          drawn from that member&apos;s own account of their work — what they were responsible
          for, what they learned, and the difficulty they had to handle honestly rather than
          smooth over.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          {TEAM.map((member) => (
            <Card key={member.id}>
              <CardHeader>
                <CardTitle className="text-base">{member.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{member.id}</p>
                <Badge variant="secondary" className="w-fit">
                  {member.module}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">Responsibility</p>
                  <p>{member.responsibility}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">What they learned</p>
                  <p>{member.learned}</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">A difficulty, handled honestly</p>
                  <p>{member.difficulty}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
