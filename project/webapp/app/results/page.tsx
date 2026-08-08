import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Module1Section } from "@/components/results/module1-section";
import { Module2Section } from "@/components/results/module2-section";
import { Module3Section } from "@/components/results/module3-section";
import { IntegrationSection } from "@/components/results/integration-section";
import { AblationStudyPanel } from "@/components/results/ablation-study-panel";
import { InfoNote } from "@/components/empty-state";

export default function ResultsPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Training &amp; Test Results</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every number on this page is read directly from the JSON/CSV files each module&apos;s
          own validation script wrote under <code className="rounded bg-muted px-1 py-0.5 text-xs">project/results/</code>{" "}
          and <code className="rounded bg-muted px-1 py-0.5 text-xs">project/results_v2/</code> —
          nothing here is recomputed by this app, and disclosed findings (where a result did
          not go the way the hypothesis expected) are reported alongside the passes, not
          smoothed over.
        </p>
      </div>

      <Tabs defaultValue="training">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="training">Training Results</TabsTrigger>
          <TabsTrigger value="ablation">Ablation Study Results</TabsTrigger>
        </TabsList>

        <TabsContent value="training" className="mt-6 space-y-6">
          <InfoNote>
            Each module was validated offline against the{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">cluster-trace-microservices-v2021</code>{" "}
            dataset before ever running on a live cluster: a held-out split for the headline
            numbers, a walk-forward or repeated-synthetic setup for the individual novelty
            element specifically, and a generalization check against a second, disjoint slice
            of the trace. &quot;Pass criteria&quot; below are the exact thresholds each
            module&apos;s own <code className="rounded bg-muted px-1 py-0.5 text-xs">validate.py</code>{" "}
            checks against — met or not, reported as-is.
          </InfoNote>
          <Module1Section />
          <Module2Section />
          <Module3Section />
          <IntegrationSection />
        </TabsContent>

        <TabsContent value="ablation" className="mt-6 space-y-6">
          <InfoNote>
            Two independent 25-trial live ablation studies, each run on a real 2-node
            Kubernetes cluster running TeaStore under a replayed workload, five arms x five
            repeats: a plain Kubernetes HPA baseline, each module running alone, and the full
            framework. The two studies used different replica ceilings (2 vs. 3) and ran on
            different infrastructure months apart, so they are shown side by side rather than
            merged into one dataset — treat them as two separate pieces of evidence, not a
            single larger sample.
          </InfoNote>
          <Tabs defaultValue="v1">
            <TabsList>
              <TabsTrigger value="v1">Original study (ceiling 2)</TabsTrigger>
              <TabsTrigger value="v2">Follow-up study (ceiling 3)</TabsTrigger>
            </TabsList>
            <TabsContent value="v1" className="mt-4">
              <AblationStudyPanel study="v1" />
            </TabsContent>
            <TabsContent value="v2" className="mt-4">
              <AblationStudyPanel study="v2" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </section>
  );
}
