import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoNote } from "@/components/empty-state";
import { KnowledgeDiagram } from "@/components/knowledge-diagram";

const MODULE_KNOWLEDGE = [
  {
    module: "Module 1 — Signal Fusion",
    tone: "text-[var(--viz-orange)]",
    maintains: [
      {
        title: "The trained model itself",
        detail:
          "Everything the 150-tree LightGBM ensemble learned from the training rows, frozen at training time. This is its long-term knowledge: it doesn't change between predictions.",
        code: "module1_signal_fusion/artifacts/model_primary.joblib",
        codeDetail: "trained by train.py, loaded via joblib.load(MODEL_PATH) at live_cluster/module1_controller/app.py:285",
      },
      {
        title: "A short rolling history",
        detail:
          "The live controller keeps the last ~40 buckets in memory (a deque, not a database) purely so it can compute \"how much has this changed over the last 1/2/4 buckets\" for every new prediction. Private to Module 1 — nothing else reads it directly.",
        code: "live_cluster/module1_controller/app.py:165",
        codeDetail: "self.history: deque[dict] = deque(maxlen=HISTORY_LEN), inside class RiskController",
      },
    ],
  },
  {
    module: "Module 2 — Co-Scheduling",
    tone: "text-[var(--viz-aqua)]",
    maintains: [
      {
        title: "A belief per node, as a Beta distribution",
        detail:
          "For every real node in the cluster, an (alpha, beta) pair representing how good Module 2 currently believes that node is. This is the clearest example of a real knowledge base in this system — a Thompson Sampling bandit's whole purpose is to maintain exactly this.",
        code: "live_cluster/module2_extender/app.py:73-102",
        codeDetail: "class ThompsonSamplingBandit — state held in self.alpha, self.beta, self.pulls (dicts keyed by node name, lines 79-81)",
      },
      {
        title: "Discounted, not permanent",
        detail:
          "Every update multiplies older evidence down before adding the new observation, so this belief deliberately forgets stale placements over time rather than accumulating forever — it tracks a drifting cluster, not a fixed one.",
        code: "live_cluster/module2_extender/app.py:96-97",
        codeDetail: "self.alpha[nodeid] = 1.0 + self.gamma * (self.alpha[nodeid] - 1.0) + reward (and the matching beta update)",
      },
    ],
  },
  {
    module: "Module 3 — Adaptive Control",
    tone: "text-[var(--viz-yellow)]",
    maintains: [
      {
        title: "The PI controller's integral term",
        detail:
          "A running total of past error (observed risk minus the 0.10 target) — its memory of how long and how badly things have been off-target, not just the current instant.",
        code: "live_cluster/module3_controller/app.py:81",
        codeDetail: "self.integral = 0.0, inside class PIController",
      },
      {
        title: "A rolling window of nonconformity scores",
        detail:
          "Adaptive Conformal Inference keeps recent prediction-vs-outcome scores to calibrate how wide the safety margin should be right now.",
        code: "live_cluster/module3_controller/app.py:106",
        codeDetail: "self.scores: list[float] = [], inside class AdaptiveConformalInference",
      },
      {
        title: "Its own threshold trajectory",
        detail:
          "The history of its own past threshold values — checked for direction reversals, which is what the oscillation-widening novelty (see Final Conclusion) reacts to. This is Module 3 remembering its own recent behavior, not just its input's reliability.",
        code: "live_cluster/module3_controller/app.py:153",
        codeDetail: "self.trajectory: list[float] = [INITIAL_THRESHOLD], inside class ControlLoop",
      },
    ],
  },
];

export default function KnowledgePage() {
  return (
    <section className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Knowledge — what each module remembers</h1>
        <p className="max-w-3xl text-muted-foreground">
          The three modules are often described as operating inside a MAPE-K loop
          (Monitor–Analyze–Plan–Execute–<strong className="text-foreground">Knowledge</strong>) — a
          standard pattern for self-adaptive systems. This page is the honest answer to
          &quot;so where&apos;s the Knowledge part&quot;: there is no single shared knowledge-base
          component anywhere in this system. Instead, each module maintains its own private
          state, and shares only specific, narrow pieces of it with the others — every table
          row below points at the exact file and line where that state actually lives.
        </p>
      </div>

      <InfoNote>
        &quot;Knowledge&quot; here is a theoretical framing used to describe the architecture, not a
        literal database or service in the codebase — nothing in <code className="rounded bg-muted px-1 py-0.5 text-xs">project/</code>{" "}
        is named or built as one. What plays that role in practice is distributed: each
        module&apos;s own state, exposed through its own read-only endpoint (live) or exported
        file (offline), and read by whichever other module needs it.
      </InfoNote>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Shared vs. private, at a glance</h2>
        <p className="max-w-3xl text-muted-foreground">
          Every arrow below runs one direction — nothing is fed back upstream. Module 3
          reads Module 2&apos;s bandit state purely to report it alongside its own; it never
          writes to it (a disclosed scope limit, not an oversight — see the Live Run page).
        </p>
        <KnowledgeDiagram />
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Mapped to the code, line by line</h2>
        <p className="max-w-3xl text-muted-foreground">
          Every path below is relative to <code className="rounded bg-muted px-1 py-0.5 text-xs">project/</code>.
        </p>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Module</TableHead>
                  <TableHead className="w-56">What it maintains</TableHead>
                  <TableHead>Where in the code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODULE_KNOWLEDGE.flatMap((m) =>
                  m.maintains.map((item, i) => (
                    <TableRow key={`${m.module}-${item.title}`}>
                      {i === 0 ? (
                        <TableCell rowSpan={m.maintains.length} className={`align-top font-medium whitespace-normal ${m.tone}`}>
                          {m.module}
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-normal align-top text-foreground">{item.title}</TableCell>
                      <TableCell className="whitespace-normal align-top">
                        <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.code}</code>
                        <p className="mt-1 text-xs text-muted-foreground">{item.codeDetail}</p>
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Each module&apos;s own knowledge, in detail</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {MODULE_KNOWLEDGE.map((m) => (
            <Card key={m.module}>
              <CardHeader>
                <CardTitle className={`text-base ${m.tone}`}>{m.module}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                {m.maintains.map((item) => (
                  <div key={item.title}>
                    <p className="font-medium text-foreground">{item.title}</p>
                    <p>{item.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </section>
  );
}
