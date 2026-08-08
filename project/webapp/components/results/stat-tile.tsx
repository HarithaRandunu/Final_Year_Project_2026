import { cn } from "@/lib/utils";

/** A single labeled number - the basic unit of every stat grid on the Results page. */
export function StatTile({
  label,
  value,
  detail,
  className,
}: Readonly<{ label: string; value: string; detail?: string; className?: string }>) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

export function StatGrid({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>{children}</div>;
}
