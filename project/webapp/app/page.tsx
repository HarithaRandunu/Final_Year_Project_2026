import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StepFlow } from "@/components/step-flow";
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
            <CardContent className="text-sm text-muted-foreground">
              The risk model doesn&apos;t just output &ldquo;risk is elevated&rdquo; — using a
              technique called TreeSHAP, it also reports <em>which</em> measurement (backlog,
              processor usage, or latency) is driving that score for every single prediction,
              as a real output the placement module and a human operator can both act on —
              not just an internal diagnostic used during model-building.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <CardTitle className="text-base">
                Module 2 — a discount factor for drifting node conditions
              </CardTitle>
              <NoveltyBadge />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Placement uses Thompson Sampling, a well-understood way to learn which option
              (here, which machine) tends to work out best. Standard Thompson Sampling assumes
              each option&apos;s quality never changes — but cluster nodes get busier and
              quieter over time. This project adds a <em>discount factor</em> that makes recent
              evidence count for more than old evidence, so the policy keeps up as conditions
              drift, instead of using the technique exactly as published.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <CardTitle className="text-base">
                Module 3 — widening its safety margin when it&apos;s been unstable
              </CardTitle>
              <NoveltyBadge />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              The control loop that adjusts the alert threshold already uses a published
              combination of a PI (proportional-integral) controller and conformal prediction
              (a way of calibrating how much to trust the model right now). This project adds
              one more input: it counts how often the controller has recently reversed
              direction, and widens its own safety margin in proportion — so the permitted
              step shrinks precisely when the loop has been oscillating, not only when the
              model&apos;s predictions have been inaccurate.
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

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Methodology at a glance</h2>
        <p className="max-w-3xl text-muted-foreground">
          Each module was first validated offline against a twelve-hour production trace from
          Alibaba&apos;s cluster dataset, then ported onto a real two-node Kubernetes cluster
          running the TeaStore benchmark application for a live 25-trial ablation study — five
          repeats each of the standard autoscaler, each module running alone, and the full
          combined framework. Results were compared using{" "}
          <strong>Kruskal-Wallis</strong> and <strong>Mann-Whitney</strong> tests — a way of
          checking whether groups of results genuinely differ that doesn&apos;t assume the
          data forms a bell-curve shape, which matters with only five trials per group — with
          a correction applied for running many comparisons at once. See{" "}
          <strong>Training &amp; Test Results</strong> for the full numbers and{" "}
          <strong>Live Run</strong> for a live demonstration.
        </p>
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
      </section>
    </div>
  );
}
