import { ArrowRight, ArrowDown, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  title: string;
  description?: string;
}

/**
 * A left-to-right (wrapping to top-to-bottom on narrow screens) chain of
 * numbered steps. Plain flex/CSS, not a graph layout - for a strictly
 * sequential process this is both simpler and structurally guaranteed not
 * to produce crossing lines, which a general-purpose auto-layout diagram
 * tool can't promise for content this small.
 */
export function StepFlow({
  steps,
  loop,
}: Readonly<{ steps: Step[]; loop?: string }>) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
        {steps.map((step, i) => (
          <div key={step.title} className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 rounded-lg border bg-card p-3 md:min-w-[180px]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                {step.description ? (
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                ) : null}
              </div>
            </div>
            {i < steps.length - 1 ? (
              <span className="flex shrink-0 items-center justify-center text-muted-foreground">
                <ArrowRight className="hidden size-4 md:block" />
                <ArrowDown className="size-4 md:hidden" />
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {loop ? (
        <p className={cn("flex items-center gap-1.5 text-xs text-muted-foreground")}>
          <RotateCw className="size-3.5" />
          {loop}
        </p>
      ) : null}
    </div>
  );
}
