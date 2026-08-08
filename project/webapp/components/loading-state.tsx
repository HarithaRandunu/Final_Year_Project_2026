import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Inline spinner + label, for client-side async work that isn't tied to a
 * specific content shape (e.g. Phase 6's live-cluster polling). Distinct
 * from CardSkeleton below so a genuinely *loading* state is never visually
 * mistaken for a *finished but empty* one - the exact confusion the user
 * reported with the old desktop_app ("sometime i do not know whether those
 * are loading or not").
 */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-6 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** A grid of skeleton stat cards, shaped like the real stat cards that will replace them. */
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A skeleton shaped like a data table - header row + a handful of body rows. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
