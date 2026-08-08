import Link from "next/link";
import { InfoNote } from "@/components/empty-state";
import { LiveDashboard } from "@/components/live/live-dashboard";

export default function LivePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Live Run</h1>
        <p className="max-w-3xl text-muted-foreground">
          Reads a real Kubernetes cluster you&apos;ve started yourself, through{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">kubectl port-forward</code> to
          each component&apos;s own read-only status endpoint — this page never installs a
          cluster, never bootstraps anything, and never sends a write of any kind. Every chart
          below is this session&apos;s own live readings only.
        </p>
      </div>

      <InfoNote>
        Looking for how this compares to a completed run? Live and recorded data are shown
        separately on purpose — every arm in this project shares one{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">teastore-webui</code> deployment,
        and the cluster can only be in one kube-scheduler mode at a time, so this page can only
        ever show whichever arm is actually deployed right now. The{" "}
        <Link href="/teastore" className="underline underline-offset-2">
          TeaStore page
        </Link>{" "}
        has one full recorded trial from the completed 25-trial study, charted the same way, so
        you can look at each independently rather than one overlaid on the other.
      </InfoNote>

      <LiveDashboard />
    </section>
  );
}
