import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The report's central result, for one study: how much of each trial the
 * service ran over-provisioned under "Control only" (Module 3 driven by
 * raw CPU utilisation alone) vs. "Integrated" (the full framework, where
 * Module 3 is driven by Module 1's fused risk score instead) - plus the
 * matching cost reduction. A big before/after pair rather than a generic
 * chart, since the whole point is the single number that moved.
 */
export function HeadlineComparison({
  studyLabel,
  fromPct,
  toPct,
  costFrom,
  costTo,
  costReductionPct,
}: Readonly<{
  studyLabel: string;
  fromPct: number;
  toPct: number;
  costFrom: number;
  costTo: number;
  costReductionPct: number;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{studyLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs text-muted-foreground">Time spent over-provisioned, per trial</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums text-foreground">{fromPct}%</p>
              <p className="text-xs text-muted-foreground">Control only (raw CPU signal)</p>
            </div>
            <ArrowRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--viz-aqua)" }}>
                {toPct}%
              </p>
              <p className="text-xs text-muted-foreground">Integrated (fused risk score)</p>
            </div>
          </div>
        </div>
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground">Cost (pod-seconds per trial)</p>
          <p className="mt-1 text-sm text-foreground">
            <span className="tabular-nums">{costFrom.toLocaleString()}</span>
            {" -> "}
            <span className="font-semibold tabular-nums" style={{ color: "var(--viz-aqua)" }}>
              {costTo.toLocaleString()}
            </span>
            <span className="text-muted-foreground"> ({costReductionPct}% lower, vs. the standard autoscaler)</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
