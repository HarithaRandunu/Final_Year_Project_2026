import { ARM_COLOR_VAR, ARM_ORDER, ARM_SHORT, type Arm } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * A horizontal bar per arm for a single metric - plain HTML/CSS (no chart
 * library, no client JS needed), since this is a static report rendered
 * server-side. Each bar carries its own arm-name label directly, so no
 * separate legend box is needed (per the dataviz skill's carve-out: a
 * legend adds nothing once every mark already has its own label). Bars are
 * thin (10px) with rounded data-ends, colored via the same theme-aware
 * `--viz-*` tokens the architecture diagram and ablation-arm palette use
 * elsewhere, so "orange" means Module 1 everywhere in this app.
 */
export function ArmBarChart({
  data,
  formatValue = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 }),
  highlightArm,
}: Readonly<{
  data: Partial<Record<Arm, number>>;
  formatValue?: (v: number) => string;
  /** Arm to visually emphasize (e.g. "full") with a bolder label. */
  highlightArm?: Arm;
}>) {
  const arms = ARM_ORDER.filter((arm) => data[arm] !== undefined);
  const maxValue = Math.max(...arms.map((arm) => data[arm] ?? 0), 1e-9);

  return (
    <div className="space-y-2">
      {arms.map((arm) => {
        const value = data[arm] ?? 0;
        const widthPct = Math.max((value / maxValue) * 100, value > 0 ? 2 : 0);
        return (
          <div key={arm} className="flex items-center gap-3">
            <span
              className={cn(
                "w-24 shrink-0 text-right text-xs text-muted-foreground",
                highlightArm === arm && "font-semibold text-foreground",
              )}
            >
              {ARM_SHORT[arm]}
            </span>
            <div className="h-2.5 min-w-0 flex-1 rounded-full bg-muted">
              <div
                className="h-2.5 rounded-full"
                style={{ width: `${widthPct}%`, backgroundColor: ARM_COLOR_VAR[arm] }}
              />
            </div>
            <span className="w-20 shrink-0 text-xs tabular-nums text-foreground">
              {formatValue(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
