import { StatusBadge, type StatusKind } from "@/components/status-badge";

function componentStatus(reachable: boolean, hasComponentError: boolean): StatusKind {
  if (!reachable) return "unreachable";
  if (hasComponentError) return "elevated";
  return "healthy";
}

/** The three reachability tiles at the top of the Live Run page. */
export function ComponentStatusTiles({
  module1,
  module3,
  actuator,
}: Readonly<{
  module1: { reachable: boolean; hasError: boolean };
  module3: { reachable: boolean; hasError: boolean };
  actuator: { reachable: boolean; hasError: boolean };
}>) {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Module 1</p>
          <p className="text-xs text-muted-foreground">Signal fusion &amp; risk scoring</p>
        </div>
        <StatusBadge status={componentStatus(module1.reachable, module1.hasError)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Module 3 (+ Module 2)</p>
          <p className="text-xs text-muted-foreground">
            Adaptive control &amp; co-scheduling — Module 2&apos;s own status arrives embedded
            in Module 3&apos;s response, so both share one reachability check.
          </p>
        </div>
        <StatusBadge status={componentStatus(module3.reachable, module3.hasError)} />
      </div>
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Actuator</p>
          <p className="text-xs text-muted-foreground">Scale up / down execution</p>
        </div>
        <StatusBadge status={componentStatus(actuator.reachable, actuator.hasError)} />
      </div>
    </section>
  );
}
