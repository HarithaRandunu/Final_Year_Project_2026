// Ported verbatim from the deleted project/desktop_app/backend/colors.py
// (recovered via `git show HEAD:...`), which itself was a self-contained copy
// of project/dashboard/colors.py's arm color/label assignment.

export type Arm = "baseline" | "m1_only" | "m2_only" | "m3_only" | "full";

export const ARM_ORDER: Arm[] = ["baseline", "m1_only", "m2_only", "m3_only", "full"];

export const ARM_COLORS: Record<Arm, string> = {
  baseline: "#2a78d6",
  m1_only: "#eb6834",
  m2_only: "#1baf7a",
  m3_only: "#eda100",
  full: "#e87ba4",
};

export const ARM_LABELS: Record<Arm, string> = {
  baseline: "Baseline (HPA)",
  m1_only: "M1 only (Signal Fusion)",
  m2_only: "M2 only (Co-Scheduling)",
  m3_only: "M3 only (Adaptive Control)",
  full: "Full (M1+M2+M3)",
};

// Axis-tick versions - five full labels along one x-axis force a rotation
// that runs past the bottom of a chart cell. Tables/tooltips use ARM_LABELS.
export const ARM_SHORT: Record<Arm, string> = {
  baseline: "Baseline",
  m1_only: "M1 only",
  m2_only: "M2 only",
  m3_only: "M3 only",
  full: "Full",
};

// Theme-aware CSS var equivalents of ARM_COLORS, for anything rendered in
// the app itself (charts, diagram nodes) rather than exported as a static
// image - resolves to the same hex as ARM_COLORS in light mode and the
// dark-stepped equivalents (app/globals.css's --viz-*) in dark mode.
export const ARM_COLOR_VAR: Record<Arm, string> = {
  baseline: "var(--viz-blue)",
  m1_only: "var(--viz-orange)",
  m2_only: "var(--viz-aqua)",
  m3_only: "var(--viz-yellow)",
  full: "var(--viz-magenta)",
};

export const TEXT_PRIMARY = "#0b0b0b";
export const TEXT_SECONDARY = "#52514e";
export const GRIDLINE = "#e1e0d9";
