import type { LucideIcon } from "lucide-react";
import { CheckCircle2, AlertTriangle, XCircle, CircleSlash, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The status vocabulary used across Training/Ablation Results (Phase 4) and
 * Live Run (Phase 6). Ported from the deleted desktop_app's criteria.js:
 * pass/partial/disclosed describe a *closed* research finding (never a
 * pending/broken state - Phase 7 is finished), healthy/elevated/unreachable
 * describe *live* component reachability, critical is reserved for genuine
 * errors, neutral is an inert fallback.
 */
export type StatusKind =
  | "pass"
  | "partial"
  | "disclosed"
  | "healthy"
  | "elevated"
  | "critical"
  | "unreachable"
  | "neutral";

interface StatusMeta {
  icon: LucideIcon;
  label: string;
  className: string;
}

const STATUS_META: Record<StatusKind, StatusMeta> = {
  pass: {
    icon: CheckCircle2,
    label: "Met",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  partial: {
    icon: AlertTriangle,
    label: "Partially met",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  disclosed: {
    icon: Info,
    label: "Disclosed finding",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  healthy: {
    icon: CheckCircle2,
    label: "Healthy",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  elevated: {
    icon: AlertTriangle,
    label: "Elevated",
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  critical: {
    icon: XCircle,
    label: "Critical",
    className: "bg-destructive/10 text-destructive",
  },
  unreachable: {
    icon: CircleSlash,
    label: "Unreachable",
    className: "bg-muted text-muted-foreground",
  },
  neutral: {
    icon: Info,
    label: "Info",
    className: "bg-muted text-muted-foreground",
  },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKind;
  /** Overrides the default label text (e.g. "3 of 4 signals" instead of "Partially met"). */
  label?: string;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label ?? meta.label}
    </span>
  );
}
