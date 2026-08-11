import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StepFlow } from "@/components/step-flow";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sparkles } from "lucide-react";

function NoveltyBadge() {
  return (
    <Badge variant="secondary" className="gap-1">
      <Sparkles className="size-3" />
      Individual novelty contribution
    </Badge>
  );
}

export default function ResearchOverviewPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Research Overview</h1>
        <p className="max-w-3xl text-lg text-muted-foreground">
          Promex is a research framework that helps Kubernetes automatically run the right
          number of copies of an application, on the right machines, without an engineer
          having to keep re-tuning it by hand. This page explains the problem it addresses,
          the gap in existing research it fills, and the <strong>novelty</strong> — the three
          specific ideas this project contributes that go beyond simply combining existing
          techniques.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">The problem</h2>
        <p className="max-w-3xl text-muted-foreground">
          An <strong>SLA (service level agreement)</strong> is just a promise about how fast
          an application should respond. <strong>Autoscaling</strong> is how a platform tries
          to keep that promise without permanently over-paying for spare capacity. Kubernetes
          ships with autoscalers for this, but the published research — and this project&apos;s
          own review of it — identifies three recurring weaknesses.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. It reacts late</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The default trigger is processor usage, but that only climbs <em>after</em>{" "}
              requests have already started queuing and users are already waiting — a{" "}
              <strong>trailing indicator</strong>, not an early warning.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Placement is blind</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Once Kubernetes decides a new copy is needed, its{" "}
              <strong>scheduler</strong> (the part that picks which machine runs it) never
              learns <em>why</em> that copy was requested — so it can&apos;t use that reason to
              pick a better machine.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Settings never move</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Thresholds and timers are fixed when a service is deployed. As real traffic
              patterns drift over time, a setting that was sensible last week becomes too
              slow or too jumpy this week.
            </CardContent>
          </Card>
        </div>
        <p className="max-w-3xl text-muted-foreground">
          Individually each weakness costs either reliability or money. Together they
          compound: a correctly detected need for more capacity can still be wasted by poor
          placement, and a well-placed replica can still arrive too late if nothing is
          adjusting the settings that decide when to act.
        </p>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Aim and objectives</h2>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-muted-foreground">
              <strong className="text-foreground">Aim:</strong> to design, build, and evaluate
              an integrated autoscaling framework for Kubernetes that combines several
              live measurements into one SLA-aware risk score, connects replica placement to
              the reason behind each scaling decision, and adjusts its own control settings as
              workload behaviour changes — then measure the effect against Kubernetes&apos;
              standard autoscaler.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                Build a model that fuses backlog, processor usage, and response-time
                measurements into a single risk score, and expose which measurement is
                responsible for each score it produces.
              </li>
              <li>
                Build a placement mechanism that picks a machine for every new replica using
                both the cause of the scaling decision and live machine conditions.
              </li>
              <li>
                Build a control mechanism that adjusts its own alert threshold within bounds
                set by its own recent prediction error and its own recent instability.
              </li>
              <li>
                Evaluate the three parts separately and combined, against the standard
                autoscaler on a real running cluster, and report what each part contributes.
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">The gap this project fills</h2>
        <p className="max-w-3xl text-muted-foreground">
          The literature review behind this project found plenty of work on each weakness
          individually, but nothing that addresses all three inside one evaluated system:
        </p>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Backlog, processor usage, and response-time percentiles are not combined into one
            validated risk score anywhere in the reviewed work.
          </li>
          <li>
            Placement is not coupled to the cause of a scaling decision — the closest systems
            either leave placement out entirely or pass along an unscored hint.
          </li>
          <li>
            Fixed thresholds, step sizes, and check intervals persist even in the newest
            proactive designs, by their own authors&apos; admission.
          </li>
          <li>
            No system quantifies how much each of these three pieces individually
            contributes once combined — Promex is built specifically to measure that.
          </li>
        </ul>
      </section>

      <Separator />

      <section id="novelty" className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Novelty — what&apos;s genuinely new here
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          &ldquo;Combine three existing techniques&rdquo; is not on its own a strong enough
          claim for a research contribution. Each of the three modules therefore carries one
          specific, individually-evaluated <strong>novelty element</strong> beyond its base
          technique — this is what each module contributes beyond prior published work:
        </p>
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <CardTitle className="text-base">
                Module 1 — per-decision attribution, not just a risk number
              </CardTitle>
              <NoveltyBadge />
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The risk model doesn&apos;t just output &ldquo;risk is elevated&rdquo; — using a
                technique called TreeSHAP (a standard, published attribution method for
                tree-based models; not itself claimed as this project&apos;s novelty), it also
                reports <em>which</em> measurement (backlog, processor usage, or latency) is
                driving that score for every single prediction, as a real output the placement
                module and a human operator can both act on — not just an internal diagnostic
                used during model-building.
              </p>
              <p className="border-t pt-3 text-xs">
                <strong className="text-foreground">Evidence: </strong>
                a sanity check perturbs one signal family at a time in a synthetic input and
                checks whether TreeSHAP correctly names it as the dominant driver. 3 of 4 signal
                families (p99 latency, CPU, provider-RPC call rate) were correctly attributed;
                one (memory) was not — reported as a partial result, not rounded up. Source:{" "}
                <code className="rounded bg-muted px-1 py-0.5">results/module1/primary/shap_sanity_check.json</code>.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <CardTitle className="text-base">
                Module 2 — a discount factor for drifting node conditions
              </CardTitle>
              <NoveltyBadge />
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Placement uses Thompson Sampling, a long-established published way to learn
                which option (here, which machine) tends to work out best. Standard Thompson
                Sampling assumes each option&apos;s quality never changes — but cluster nodes
                get busier and quieter over time. This project adds a <em>discount factor</em>{" "}
                that makes recent evidence count for more than old evidence, so the policy keeps
                up as conditions drift, instead of using the technique exactly as published.
              </p>
              <p className="border-t pt-3 text-xs">
                <strong className="text-foreground">Evidence: </strong>
                the real trace&apos;s one non-stationary window turned out to have every node&apos;s
                quality drift <em>together</em>, not swap rank — a condition discounting isn&apos;t
                built to help with, and it didn&apos;t. So a synthetic test was built that
                specifically reverses which of six nodes is best partway through and reruns it
                50 times: the discounted policy won 100% of repeats in the recovery window
                (mean reward 0.36 vs. 0.18, one-sided Wilcoxon p under 0.0001) and 98% of repeats
                over the full post-inversion phase (0.66 vs. 0.46). Source:{" "}
                <code className="rounded bg-muted px-1 py-0.5">results/module2/synthetic_rank_inversion.json</code>.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <CardTitle className="text-base">
                Module 3 — widening its safety margin when it&apos;s been unstable
              </CardTitle>
              <NoveltyBadge />
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Published design: Liu, Li, Farkiani &amp; Crowley,{" "}
                <em>BACC: Budget-Aware Calibration and Control for Horizontal Autoscaling</em>{" "}
                (arXiv:2606.20575, 2026).
              </p>
              <div>
                <p className="font-medium text-foreground">Published (BACC) — key points:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>PI controller reacts to <strong className="text-foreground">SLA-violation budget burn rate</strong> — violations piling up too fast tightens it, running under budget relaxes it.</li>
                  <li>Conformal inference widens the <strong className="text-foreground">traffic forecast itself</strong> when recent forecasts have been off; a separate formula then picks a replica count from that widened forecast.</li>
                  <li>Per-cycle replica-count change is capped by a <strong className="text-foreground">fixed</strong> limit, always the same size.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground">Module 3 (this project) — key points:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>PI controller reacts to the gap between <strong className="text-foreground">Module 1&apos;s fused risk score</strong> and a target — not a violation budget.</li>
                  <li>Conformal inference (ACI) directly caps <strong className="text-foreground">how far the threshold can move per step</strong>, based on how often recent predictions actually landed inside its own interval.</li>
                  <li>
                    <strong className="text-foreground">The individual novelty — &ldquo;oscillation-conditioned widening&rdquo;:</strong>{" "}
                    that step cap is multiplied further by how many times the threshold has
                    recently reversed direction — so movement shrinks when the loop itself has
                    been oscillating, not only when predictions have been wrong.
                  </li>
                </ul>
              </div>
              <p>
                <strong className="text-foreground">Key difference:</strong> BACC&apos;s only
                sources of caution are budget pace and forecast accuracy — a fixed step cap either
                way. Module 3 adds a third, independent source BACC has no way to see: the control
                loop&apos;s own recent stability.
              </p>
              <p className="border-t pt-3 text-xs">
                <strong className="text-foreground">Evidence: </strong>
                on the real trace&apos;s one genuinely bursty segment, the full design tied its
                PI+conformal-only baseline at 4 reversals each — too few events in that one
                segment to separate them. So a synthetic test repeats 15 induced bursts, 50
                times: the full design&apos;s mean reversal count was 7.64 vs. 14.04 for
                PI+conformal alone, strictly lower in 46% of repeats and never worse in 96% of
                them (one-sided Wilcoxon p under 0.0001). Source:{" "}
                <code className="rounded bg-muted px-1 py-0.5">results/module3/synthetic_multi_burst.json</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">
          Why not deep reinforcement learning?
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          The project began expecting to use deep reinforcement learning (RL) throughout, and
          moved away from it for a different reason in each module — not a single blanket
          objection. For <strong>risk estimation</strong>, the mismatch is structural: nothing
          the model does changes what happens next, and the correct answer is already present
          in the data, which makes it an ordinary supervised-learning problem rather than one
          requiring RL. For <strong>placement</strong>, the mismatch is scale: RL&apos;s
          machinery exists to solve credit assignment over long sequences of actions, but a
          placement decision&apos;s consequences resolve immediately, so a much simpler and far
          more sample-efficient bandit method suffices. For <strong>control</strong>, it was a
          deliberate trade rather than a mismatch: a bounded classical controller supports a
          mathematical stability argument, whereas a learned policy can only be observed to
          behave well after the fact — and the literature reviewed for this project reported
          documented fragility in learned controllers once real conditions drifted from their
          training conditions.
        </p>
      </section>

      <Separator />

      <section className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Evaluation process</h2>
          <p className="max-w-3xl text-muted-foreground">
            Follows Design Science Research&apos;s standard shape for &ldquo;build it, then
            evaluate it&rdquo; systems work: <strong>build</strong> each module,{" "}
            <strong>demonstrate</strong> it on a real running system, then{" "}
            <strong>evaluate</strong> it against a measured baseline. Concretely, that meant two
            separate evaluation stages, run in order — nothing was declared to work on a live
            cluster until it had already passed offline.
          </p>
        </div>

        <StepFlow
          steps={[
            { title: "Three weaknesses", description: "identified in standard Kubernetes autoscaling" },
            { title: "The gap", description: "no existing system unifies all three fixes" },
            { title: "Build Promex", description: "signal fusion + cause-aware placement + adaptive control" },
            { title: "Validate offline", description: "against a real production trace" },
            { title: "Validate live", description: "25-trial ablation study on a real cluster" },
            { title: "Analyse", description: "Kruskal-Wallis + Mann-Whitney, vs. the standard autoscaler" },
          ]}
        />

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">Stage 1 — offline, against a real production trace</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Each module was validated on its own, before any of the three were connected to each
            other or to a cluster, using the 12-hour Alibaba <code className="rounded bg-muted px-1 py-0.5 text-xs">cluster-trace-microservices-v2021</code>{" "}
            trace. Where the real trace couldn&apos;t isolate the exact condition a novelty
            element targets — see the <strong>Evidence</strong> notes above — a matching
            synthetic test was built specifically to isolate it, always reported alongside the
            real-data result rather than in its place.
          </p>
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Module 1:</strong> a strictly time-ordered
              75/25 holdout split (never shuffled — this is a forecasting problem), a
              walk-forward re-validation across the timeline, and a generalization check against
              a second, differently-patterned service.
            </li>
            <li>
              <strong className="text-foreground">Module 2:</strong> real historical placement
              events replayed in chronological order (not a synthetic simulation of the base
              mechanism), with cumulative regret measured against a random policy and a
              CPU x memory-headroom heuristic baseline.
            </li>
            <li>
              <strong className="text-foreground">Module 3:</strong> a synthetic step-response
              test for bounded, non-diverging behavior, plus a conformal coverage check against
              its 90% target (88.9% observed).
            </li>
            <li>
              <strong className="text-foreground">Integration check:</strong> before any of this
              touched a cluster, the three modules&apos; independently-exported logs were
              cross-checked for internal consistency over the full 12-hour trace. This step
              genuinely caught a real bug — Module 3&apos;s controller stuck at its lower bound
              for roughly 230 of 360 buckets — fixed and re-verified before Stage 2 began.
            </li>
          </ul>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Full code-level detail, real numbers, and pass/partial/disclosed status for every
            criterion: see <strong>Training &amp; Test Results</strong> and{" "}
            <strong>Data Pipeline</strong>.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">Stage 2 — live, on a real Kubernetes cluster</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A controlled ablation experiment: five arms, each isolating one module&apos;s
            contribution by changing exactly one of three switches — what signal drives scaling,
            what sets the threshold, and which scheduler is active — while holding the other two
            at their baseline setting.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arm</TableHead>
                  <TableHead>Scaling driven by</TableHead>
                  <TableHead>Threshold source</TableHead>
                  <TableHead>Scheduler</TableHead>
                  <TableHead>What it isolates</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Baseline (HPA)</TableCell>
                  <TableCell>raw CPU utilization</TableCell>
                  <TableCell>fixed 50%</TableCell>
                  <TableCell>default</TableCell>
                  <TableCell>the reference point every other arm is compared against</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">M1 only (Signal Fusion)</TableCell>
                  <TableCell>Module 1&apos;s predicted_risk</TableCell>
                  <TableCell>fixed 0.08 (static)</TableCell>
                  <TableCell>default</TableCell>
                  <TableCell>whether the fused signal beats raw CPU as the trigger, alone</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">M2 only (Co-Scheduling)</TableCell>
                  <TableCell>raw CPU utilization</TableCell>
                  <TableCell>fixed 50%</TableCell>
                  <TableCell>M2 extender</TableCell>
                  <TableCell>Module 2&apos;s placement effect, with scaling held constant</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">M3 only (Adaptive Control)</TableCell>
                  <TableCell>raw CPU error</TableCell>
                  <TableCell>adaptive (M3, ablated to not depend on M1)</TableCell>
                  <TableCell>default</TableCell>
                  <TableCell>adaptive control vs. a fixed threshold, on the same raw signal as baseline</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Full (M1+M2+M3)</TableCell>
                  <TableCell>Module 1&apos;s predicted_risk</TableCell>
                  <TableCell>adaptive (M3, unablated)</TableCell>
                  <TableCell>M2 extender</TableCell>
                  <TableCell>whether combining all three beats each one alone</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Five trials per arm — <strong>25 trials</strong> — against the TeaStore benchmark
            application under one real workload (an Alibaba-trace-derived request replay). The
            original plan called for three workload types; this was descoped to one on
            2026-07-29 before the study ran, disclosed honestly rather than silently: the
            &ldquo;three&rdquo; figure in the original plan was a drafting inconsistency (only
            two were ever concretely named, and the third — an Azure LLM inference trace — was
            already flagged as not finalized before this phase began).
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            This full design was run <strong>twice, independently</strong>: an original study
            (replica ceiling 2, a shared workstation) and a follow-up study (replica ceiling 3,
            on a dedicated cloud VM, run to test whether the original ceiling was itself
            suppressing genuine scaling behavior). Disclosed honestly rather than smoothed over:
            the follow-up study surfaced a genuine bug in TeaStore&apos;s own service-registry
            client that worsens with replica churn, which affects the two studies&apos; latency
            figures&apos; comparability specifically — not the other six metrics. See{" "}
            <strong>Training &amp; Test Results</strong> for both studies side by side, with this
            limitation stated wherever it applies.
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every 30 seconds during every trial, seven metrics are logged: SLA-violation count,
            p99 latency, a cost proxy (polled replica count, summed across the trial), an
            instability count (threshold direction reversals), deviation from an ideal supply
            trajectory, and over-/under-provisioning timeshare.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold tracking-tight">How the 25 trials are analysed</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The same fixed pipeline runs on every metric, decided before the trials were run
            rather than chosen after seeing results:
          </p>
          <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Descriptive statistics first — mean and median per arm.</li>
            <li>
              A <strong>Kruskal-Wallis</strong> omnibus test per metric — checks whether the five
              arms genuinely differ at all, without assuming the data forms a bell-curve shape
              (which matters with only five trials per arm).
            </li>
            <li>
              Where relevant, <strong>two-sided Mann-Whitney U</strong> tests across all ten
              possible arm pairs, each with a <strong>rank-biserial effect size</strong> (not
              just a p-value, so a real-but-small difference isn&apos;t reported the same way as
              a large one).
            </li>
            <li>
              A <strong>Benjamini-Hochberg</strong> correction applied across those ten
              comparisons per metric, since testing ten pairs at once inflates the chance of a
              false positive if left uncorrected.
            </li>
            <li>
              An <strong>ablation decomposition</strong> — each module&apos;s marginal
              contribution, computed by comparing the full framework against each
              &ldquo;module removed&rdquo; arm.
            </li>
          </ol>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A statistical-power limit is disclosed up front rather than glossed over: with five
            trials per arm, the smallest two-sided p-value a single pairwise comparison can ever
            reach is about 0.008, so after correction only large, consistent effects can reach
            significance. Where a result isn&apos;t statistically significant, it&apos;s reported
            as exactly that — not as evidence the effect doesn&apos;t exist.
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            See <strong>Training &amp; Test Results</strong> for the full numbers from both
            studies and <strong>Live Run</strong> for a live demonstration against a recorded
            reference trial.
          </p>
        </div>
      </section>
    </div>
  );
}
