import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";

/** Shown on the Live Run page whenever none of the three components answer. */
export function NoClusterCard({
  forwards,
}: Readonly<{ forwards: Record<string, { status: string; lastError: string | null }> }>) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle>No cluster detected</CardTitle>
        <CardDescription>
          None of the three live components (Module 1, Module 3, the Actuator) answered
          through their kubectl port-forwards. This page never installs, bootstraps, or
          switches anything — it only reads. Start the cluster and the live components
          per <code className="rounded bg-muted px-1 py-0.5 text-xs">project/live_cluster/README.md</code>, then this page
          will pick them up automatically on its next poll.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["module1", "module3", "actuator"] as const).map((name) => (
            <div key={name} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
              <span className="capitalize text-foreground">{name}</span>
              <StatusBadge status="unreachable" label={forwards[name]?.status ?? "stopped"} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
