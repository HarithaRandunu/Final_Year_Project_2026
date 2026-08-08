import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { HeadlineComparison } from "@/components/conclusion/headline-comparison";
import { StatusBadge } from "@/components/status-badge";

const DISCLOSED_FINDINGS = [
  {
    title: "The fused score discriminates better, but doesn't warn earlier",
    body:
      "Module 1's fused risk score beats a CPU-only comparator on precision/recall, but on the trace studied it did not raise its alert any earlier than the simpler baseline — see the lead-time comparison on the Results page.",
  },
  {
    title: "Placement didn't beat its own heuristic on the real trace",
    body:
      "The trace offers too few placement events per node for a bandit method to learn from, so Module 2's discounted policy did not outperform its own warm-up heuristic here. A controlled synthetic test built specifically to reorder node quality showed the discounted policy winning every repetition instead — the mechanism works, this trace just doesn't exercise it.",
  },
  {
    title: "The reversal guard showed no measurable gain on the cluster's bursty segment",
    body:
      "That segment contains only four reversals in total — too few to show a difference. A repeated synthetic test with more bursts per run showed the mean reversal count fall by close to half (14.04 to 7.64), which is where the module's real evidence comes from.",
  },
  {
    title: "The follow-up study's latency figures are not comparable with the primary study's",
    body:
      "Investigation traced a roughly ten-times latency increase across every arm in the follow-up study to a defect in TeaStore's own service-registry client, which raises an unhandled exception under the replica churn produced by three front-end replicas — confirmed directly from container logs. This is a property of the reference application, not of anything this project built, and it affects every configuration equally rather than singling one out — which is also why the over-provisioning and cost findings, unlike latency, are unaffected by it.",
  },
];

const LIMITATIONS = [
  "The evaluation covers one workload pattern on one reference application (TeaStore). A second, stateful or inference-shaped workload was intended but was not carried out — the memory ceiling on the primary study's shared workstation made a second application untenable, and no candidate inference trace had a faithful TeaStore counterpart. Generalisation beyond the pattern tested is not claimed.",
  "Five trials per configuration is a small sample. It was enough to establish the over-provisioning and cost findings with perfect or near-perfect rank separation at both replica ceilings tested, but not enough to resolve the measures where differences are smaller (see the ablation study's power caveat on the Results page).",
  "The placement reward for nodes that weren't selected is estimated from their own recorded trajectories rather than observed counterfactually — a reasonable estimate, but an estimate.",
  "The framework assumes its input measurements are timely and correct. Fusing three families of measurement increases the number of inputs that must stay trustworthy, and behaviour under corrupted or delayed input was not tested — an accepted cost of the fusion approach, not an oversight.",
  "A two-node cluster on a single host — shared workstation or dedicated cloud instance alike — cannot reproduce the contention, drift, or multi-tenant interference of a production environment. The findings establish that the mechanisms work and how they interact; they do not establish deployment behaviour at scale.",
  "A defect discovered rather than anticipated: the follow-up study found TeaStore's own service-registry client raises an unhandled exception under three-replica churn. Confirmed from container logs and reported rather than concealed, but it means the follow-up's latency figures aren't comparable with the primary study's — any future work raising the replica ceiling further should expect to hit the same defect until TeaStore's registry client is patched or replaced.",
];

const FUTURE_WORK = [
  "Repeat the comparison across additional workload patterns, including one that is stateful or inference-shaped, to test the generalisation this study couldn't.",
  "Run a deployment over weeks rather than minutes, to test whether the adaptive controller stays stable as workload composition drifts — the property it exists to provide, and one a short study can't verify.",
  "Evaluate the placement policy on a workload whose node quality genuinely reorders, since the module-level results show the discount matters under exactly that condition, which the trace studied doesn't exhibit.",
  "Add a learned controller as a sixth configuration, turning the \"why not deep reinforcement learning\" argument from the Research Overview page into a measured comparison on identical infrastructure.",
  "Repeat the follow-up comparison after patching or replacing TeaStore's registry client (or switching reference application), to recover a clean latency comparison at a higher replica ceiling.",
  "Repeat the follow-up's design across a range of replica ceilings, not just the one higher value tested, to see whether the over-provisioning gap between an informed and an uninformed controller keeps widening, plateaus, or eventually narrows.",
  "Study robustness to corrupted or delayed measurements directly, given that it's the acknowledged cost of fusing several inputs rather than relying on one.",
];

export default function ConclusionPage() {
  return (
    <section className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Final Conclusion</h1>
        <p className="max-w-3xl text-muted-foreground">
          Sourced from the project report&apos;s Chapter 7 (Evaluation and Discussion, sections 7.7–7.9)
          and Chapter 8 (Conclusion) — the headline findings from both live ablation studies,
          what didn&apos;t go as expected, the limitations that bound these claims, and what
          should follow. Stated with the same honesty as the report itself: qualified findings
          are reported alongside the ones that supported the design, not smoothed over.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">The central result</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Adaptive control driven by a raw CPU signal alone (&quot;Control only&quot;) kept the
            service over-provisioned for most of every trial. The same controller, driven
            instead by Module 1&apos;s fused risk score as part of the full framework
            (&quot;Integrated&quot;), cut that dramatically — at the lowest cost of any
            configuration tested, in <em>both</em> independent studies.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <HeadlineComparison
            studyLabel="Primary study — replica ceiling 2"
            fromPct={57.8}
            toPct={2.2}
            costFrom={1776}
            costTo={918}
            costReductionPct={48}
          />
          <HeadlineComparison
            studyLabel="Follow-up study — replica ceiling 3, dedicated cloud host"
            fromPct={87.2}
            toPct={14.1}
            costFrom={2736}
            costTo={1062}
            costReductionPct={61}
          />
        </div>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 text-sm text-foreground">
            This result is not produced by any single component acting alone. It comes from
            the wiring between the three parts: attribution from the risk model reaching the
            placement decision, residuals from that same model calibrating the controller, and
            the controller&apos;s own instability restraining its next move. Both studies used
            the same five-configuration design, the same statistical treatment, and independent
            hardware/traffic settings — the follow-up didn&apos;t just repeat the primary
            study, it reproduced the same pattern with a <em>larger</em> margin once more
            scaling headroom was available, which is stronger evidence than either study alone.
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">What didn&apos;t go as expected</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The evaluation did not confirm every design intention. Each outcome below is
            reported rather than set aside — every qualification narrows the claim, none of
            them withdraw it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {DISCLOSED_FINDINGS.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug">{f.title}</CardTitle>
                  <StatusBadge status="disclosed" className="shrink-0" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Limitations</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Six limitations bound how far these results should be carried.
          </p>
        </div>
        <ol className="space-y-3">
          {LIMITATIONS.map((text, i) => (
            <li key={text.slice(0, 40)} className="flex gap-3 rounded-lg border bg-card p-4">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                {i + 1}
              </span>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Further work</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Directions that follow directly from the limitations above.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FUTURE_WORK.map((text) => (
            <li key={text.slice(0, 40)} className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              {text}
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">How this differs from related work</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">vs. objective-first placement</CardTitle>
              <CardDescription>The closest reviewed system</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Their placement contribution is a binary capacity hint; here the placement
              decision consumes a ranked attribution and scores nodes against it. Their
              stabilisation windows are fixed; here the alert threshold moves within bounds
              derived from live prediction quality.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">vs. calibrated PI control</CardTitle>
              <CardDescription>The narrowest, most honest comparison</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Pairing conformal calibration with PI pacing is <em>not</em> this project&apos;s
              contribution — that idea is theirs. What&apos;s added is a second, independent
              input to the bound: the controller&apos;s own recent reversal count. Their design
              has no view of its own conduct.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">vs. deep-network controllers</CardTitle>
              <CardDescription>A difference of stance, not sophistication</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Those systems place a learned policy in the adaptation role and report benchmark
              gains. This project uses a bounded classical controller and can argue about its
              stability — accepting a lower ceiling on what adaptation might achieve in
              exchange.
            </CardContent>
          </Card>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          None of the three algorithms used here is novel by itself. What&apos;s new is the
          wiring between them — and the central result above is a direct consequence of that
          wiring, not of any single technique in isolation.
        </p>
      </section>

      <Separator />

      <section>
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Concluding remarks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <p>
              Three weaknesses motivated this project: a scaling decision driven by one
              trailing signal, a placement decision made without regard to why a replica was
              requested, and control settings that never move once deployed. Promex answers
              all three by wiring a fused, attributed risk score into both the placement
              decision and the calibration of an adaptive controller, rather than treating
              signal fusion, placement, and control as separate concerns.
            </p>
            <p>
              The comparison on a running cluster shows what that wiring buys in practice:
              fewer agreement violations and lower cost than the platform&apos;s standard
              autoscaler, achieved primarily through the fused signal rather than through any
              single technique in isolation — and a follow-up under a higher replica ceiling
              shows the same advantage persisting, and growing, once the primary study&apos;s
              own memory constraint was lifted.
            </p>
            <p>
              None of the three algorithms used is novel by itself; what this project
              contributes is their combination, and the evidence — gathered under a controlled
              comparison repeated at two different replica ceilings — of what that combination
              is worth.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">57.8% to 2.2% over-provisioning (primary)</Badge>
              <Badge variant="secondary">87.2% to 14.1% over-provisioning (follow-up)</Badge>
              <Badge variant="secondary">48–61% lower cost</Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </section>
  );
}
