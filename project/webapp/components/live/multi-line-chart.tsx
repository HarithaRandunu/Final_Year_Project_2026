"use client";

import { useId, useRef, useState } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

const WIDTH = 600;
const HEIGHT = 168;
const PAD_LEFT = 40;
const PAD_RIGHT = 46;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const PLOT_LEFT = PAD_LEFT;
const PLOT_RIGHT = WIDTH - PAD_RIGHT;
const PLOT_TOP = PAD_TOP;
const PLOT_BOTTOM = HEIGHT - PAD_BOTTOM;

// Time-axis zoom tuning: never let a zoomed window shrink below 15s of real
// time (an empty or near-empty window is both useless and a div-by-zero
// risk), and each zoom step scales the visible window by this factor so
// repeated clicks/scrolls feel proportional rather than linear.
const MIN_WINDOW_SECONDS = 15;
const ZOOM_STEP = 0.6;

export interface TimeSeriesPoint {
  /** Seconds elapsed since this series' own start - not a poll index. */
  t: number;
  v: number | null;
}

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

/** Rounds a raw step (range / targetCount) to a "nice" 1/2/5 x 10^n value. */
function niceStep(range: number, targetCount: number): number {
  if (range <= 0) return 1;
  const rough = range / targetCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step = 10;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  return step * mag;
}

function decimalsForStep(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

/**
 * Evenly spaced gridline/tick values between min and max - the "sub axis"
 * dashed lines (e.g. 0.1, 0.2, 0.3 across a 0-1 chart) alongside the solid
 * min/max-bounding axis. `integerTicks` forces a whole-number step, for
 * charts like replica count where fractional ticks would be meaningless.
 */
function niceTicks(min: number, max: number, targetCount: number, integerTicks: boolean): number[] {
  let step = niceStep(max - min, targetCount);
  if (integerTicks) step = Math.max(1, Math.round(step));
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}

type Point = { t: number; v: number };

function usablePoints(values: TimeSeriesPoint[]): Point[] {
  // typeof-guards rather than `!== null`: a missing/undefined reading must
  // be excluded the same way a null one is - a loose null-only check would
  // let `v: undefined` slip through as "usable" and crash formatValue().
  return values.filter((p): p is Point => typeof p.v === "number" && Number.isFinite(p.v));
}

function toPoints(values: TimeSeriesPoint[], viewMin: number, viewMax: number, min: number, max: number): string {
  const usable = usablePoints(values);
  if (usable.length < 2) return "";
  const span = viewMax - viewMin || 1;
  return usable
    .map(({ t, v }) => {
      const x = PLOT_LEFT + ((t - viewMin) / span) * (PLOT_RIGHT - PLOT_LEFT);
      const norm = (v - min) / (max - min || 1);
      const y = PLOT_BOTTOM - Math.min(1, Math.max(0, norm)) * (PLOT_BOTTOM - PLOT_TOP);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * When series sit close together (e.g. two co-scheduling nodes both around
 * 0.78), plotting them against the full prop-supplied [min, max] makes them
 * visually indistinguishable - the whole point of the data collapses into
 * one apparent line. Zooms the y-domain to where the *currently visible*
 * data actually lives (respecting a time-axis zoom, if any), padded, but
 * never wider than the caller's own [hardMin, hardMax] bounds. Returns the
 * original bounds unchanged if there's no visible data yet, or if the data
 * already spans most of the range (nothing to gain by zooming).
 */
function autoFitDomain(series: NamedSeries[], hardMin: number, hardMax: number, viewMin: number, viewMax: number): [number, number] {
  const values = series.flatMap((s) =>
    usablePoints(s.values)
      .filter((p) => p.t >= viewMin && p.t <= viewMax)
      .map((p) => p.v),
  );
  if (values.length === 0) return [hardMin, hardMax];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const hardRange = hardMax - hardMin;
  if (dataMax - dataMin > hardRange * 0.6) return [hardMin, hardMax]; // already spread out - zooming wouldn't help
  const pad = Math.max((dataMax - dataMin) * 0.35, hardRange * 0.03);
  const lo = Math.max(hardMin, dataMin - pad);
  const hi = Math.min(hardMax, dataMax + pad);
  return hi - lo > 1e-9 ? [lo, hi] : [hardMin, hardMax];
}

interface EndLabel {
  key: string;
  color: string;
  y: number;
  text: string;
}

/** Direct value labels at the right edge of each line - the dataviz-recommended
 * way to keep series distinguishable when their colors alone aren't enough
 * (lines overlapping, or a reader who can't rely on color). Nudges labels
 * apart vertically when two lines are close enough that their labels would
 * otherwise collide. Uses each series' last point *within the visible time
 * window*, not necessarily its true last point overall, so the label stays
 * meaningful (and on-screen) when the user has zoomed into an earlier span. */
function computeEndLabels(
  series: NamedSeries[],
  viewMin: number,
  viewMax: number,
  yOf: (v: number) => number,
  formatValue: (v: number) => string,
): EndLabel[] {
  const raw = series
    .map((s) => {
      const usable = usablePoints(s.values).filter((p) => p.t >= viewMin && p.t <= viewMax);
      const last = usable.at(-1);
      if (!last) return null;
      return { key: s.label, color: s.color, y: yOf(last.v), text: formatValue(last.v) };
    })
    .filter((x): x is EndLabel => x !== null)
    .sort((a, b) => a.y - b.y);

  const MIN_GAP = 11;
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].y - raw[i - 1].y < MIN_GAP) raw[i].y = raw[i - 1].y + MIN_GAP;
  }
  const overflow = raw.length > 0 ? raw.at(-1)!.y - (PLOT_BOTTOM - 2) : 0;
  if (overflow > 0) raw.forEach((r) => { r.y -= overflow; });
  return raw;
}

export interface NamedSeries {
  label: string;
  color: string;
  values: TimeSeriesPoint[];
}

/**
 * Plots an arbitrary number of named lines against real elapsed time since
 * whichever series has run longest (never a poll index, never a
 * fixed-length sliding window - a run's own history is never discarded).
 * Used both for the Live page's own readings (one series each for risk/
 * threshold/replicas, or several for Module 2's per-node quality) and for
 * the TeaStore page's recorded reference trial (a single, already-finished
 * trial's own traces, no live component involved at all).
 *
 * The time axis is user-zoomable: the +/- buttons and mouse-wheel scroll
 * over the plot both narrow or widen the visible time window around a
 * center point (the wheel anchors on the cursor's position; the buttons
 * anchor on the window's current center). Zooming never discards or
 * re-fetches data - it only changes which already-loaded span is drawn, so
 * it works identically on a still-growing live chart and a static finished
 * trial. The y-axis (value range) is not user-zoomable, but when `autoFitY`
 * is set it automatically re-fits to whatever's visible in the current time
 * window, so zooming into a busy period also zooms the value scale to it.
 */
export function MultiLineChart({
  label,
  unit,
  series,
  min,
  max,
  emptyReason,
  integerTicks = false,
  autoFitY = false,
  formatValue,
}: Readonly<{
  label: string;
  unit?: string;
  series: NamedSeries[];
  min: number;
  max: number;
  emptyReason?: string;
  /** Forces whole-number y-axis ticks, e.g. for a replica-count chart. */
  integerTicks?: boolean;
  /** Zooms the y-axis to where the data actually sits - see autoFitDomain(). */
  autoFitY?: boolean;
  formatValue?: (v: number) => string;
}>) {
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const maxT = Math.max(1, ...series.map((s) => s.values.at(-1)?.t ?? 0));
  // History has a safety-cap (see live-history.ts's MAX_POINTS) that drops
  // the oldest points once a run has been live long enough - `startedAt`
  // itself never moves, so without this the "fully zoomed out" view would
  // keep assuming data starts at t=0 long after those early points are
  // gone, wasting most of the plot on empty space. Using each series' own
  // *current* first point keeps the axis matching what's actually stored.
  const seriesStarts = series.map((s) => s.values[0]?.t).filter((t): t is number => t !== undefined);
  const minT = seriesStarts.length > 0 ? Math.min(...seriesStarts) : 0;
  const hasAnyData = series.some((s) => usablePoints(s.values).length >= 2);

  // null = fully zoomed out (showing the whole [minT, maxT] currently-stored history).
  const [zoomWindow, setZoomWindow] = useState<[number, number] | null>(null);
  const [viewMin, viewMax] = zoomWindow ?? [minT, maxT];
  const isTimeZoomed = zoomWindow !== null;

  function clampWindow(center: number, width: number): [number, number] {
    const w = Math.min(maxT - minT, Math.max(MIN_WINDOW_SECONDS, width));
    let lo = center - w / 2;
    let hi = center + w / 2;
    if (lo < minT) { hi -= lo - minT; lo = minT; }
    if (hi > maxT) { lo -= hi - maxT; hi = maxT; }
    return [Math.max(minT, lo), Math.min(maxT, hi)];
  }

  function zoomIn(anchor?: number) {
    if (maxT - minT <= MIN_WINDOW_SECONDS) return;
    const center = anchor ?? (viewMin + viewMax) / 2;
    const width = (viewMax - viewMin) * ZOOM_STEP;
    setZoomWindow(clampWindow(center, width));
  }

  function zoomOut(anchor?: number) {
    if (!isTimeZoomed) return;
    const center = anchor ?? (viewMin + viewMax) / 2;
    const width = (viewMax - viewMin) / ZOOM_STEP;
    if (width >= maxT - minT) {
      setZoomWindow(null);
    } else {
      setZoomWindow(clampWindow(center, width));
    }
  }

  function resetZoom() {
    setZoomWindow(null);
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    if (!hasAnyData || maxT - minT <= MIN_WINDOW_SECONDS) return;
    const svg = svgRef.current;
    if (!svg || e.deltaY === 0) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    if (loc.x < PLOT_LEFT || loc.x > PLOT_RIGHT) return; // only hijack scroll when the cursor is over the plot itself
    e.preventDefault();
    const anchor = viewMin + ((loc.x - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT)) * (viewMax - viewMin);
    if (e.deltaY < 0) zoomIn(anchor);
    else zoomOut(anchor);
  }

  const canZoomIn = hasAnyData && maxT - minT > MIN_WINDOW_SECONDS && viewMax - viewMin > MIN_WINDOW_SECONDS + 1e-6;
  const canZoomOut = isTimeZoomed;

  const [domainMin, domainMax] = autoFitY ? autoFitDomain(series, min, max, viewMin, viewMax) : [min, max];
  const yAutoFitted = autoFitY && (domainMin !== min || domainMax !== max);

  const yTicks = niceTicks(domainMin, domainMax, 8, integerTicks);
  const yDecimals = decimalsForStep(yTicks.length > 1 ? yTicks[1] - yTicks[0] : domainMax - domainMin);
  const fmt = formatValue ?? ((v: number) => `${v.toFixed(yDecimals)}${unit ?? ""}`);
  const yOf = (v: number) => {
    const norm = (v - domainMin) / (domainMax - domainMin || 1);
    return PLOT_BOTTOM - Math.min(1, Math.max(0, norm)) * (PLOT_BOTTOM - PLOT_TOP);
  };

  const xTickCount = 5;
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => viewMin + ((viewMax - viewMin) * i) / xTickCount);
  const xOf = (t: number) => PLOT_LEFT + ((viewMax - viewMin) > 0 ? (t - viewMin) / (viewMax - viewMin) : 0) * (PLOT_RIGHT - PLOT_LEFT);

  const showEndLabels = hasAnyData && series.length >= 2 && series.length <= 4;
  const endLabels = showEndLabels ? computeEndLabels(series, viewMin, viewMax, yOf, fmt) : [];

  const zoomBtnClass =
    "rounded border p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <figure className="space-y-2 rounded-lg border bg-card p-4">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span>
            {yAutoFitted
              ? `${fmt(domainMin)} – ${fmt(domainMax)} (zoomed in from ${min}${unit ?? ""}–${max}${unit ?? ""})`
              : `${min}${unit ?? ""} – ${max}${unit ?? ""}`}
          </span>
          <div className="flex items-center gap-0.5" role="group" aria-label="Zoom time axis">
            <button type="button" title="Zoom out" aria-label="Zoom out" className={zoomBtnClass} disabled={!canZoomOut} onClick={() => zoomOut()}>
              <ZoomOut className="size-3" />
            </button>
            <button type="button" title="Reset zoom (show full history)" aria-label="Reset zoom" className={zoomBtnClass} disabled={!isTimeZoomed} onClick={resetZoom}>
              <RotateCcw className="size-3" />
            </button>
            <button type="button" title="Zoom in" aria-label="Zoom in" className={zoomBtnClass} disabled={!canZoomIn} onClick={() => zoomIn()}>
              <ZoomIn className="size-3" />
            </button>
          </div>
        </div>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        onWheel={handleWheel}
        aria-label={`${label}: ${series.map((s) => s.label).join(", ")}, scaled ${fmt(domainMin)} to ${fmt(domainMax)}${yAutoFitted ? " (zoomed)" : ""}, showing ${formatElapsed(viewMin)} to ${formatElapsed(viewMax)} of ${formatElapsed(maxT - minT)} elapsed`}
        className="h-auto w-full touch-pan-y text-foreground"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} />
          </clipPath>
        </defs>

        {/* sub-axis gridlines: dashed, recessive - the data lines carry the eye, not the grid */}
        {yTicks.map((tick) => (
          <line
            key={`y-${tick}`}
            x1={PLOT_LEFT}
            x2={PLOT_RIGHT}
            y1={yOf(tick)}
            y2={yOf(tick)}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
            strokeDasharray="2,3"
          />
        ))}
        {xTicks.map((tick) => (
          <line
            key={`x-${tick.toFixed(3)}`}
            x1={xOf(tick)}
            x2={xOf(tick)}
            y1={PLOT_TOP}
            y2={PLOT_BOTTOM}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeWidth={1}
            strokeDasharray="2,3"
          />
        ))}

        {/* solid bounding axes */}
        <line x1={PLOT_LEFT} x2={PLOT_LEFT} y1={PLOT_TOP} y2={PLOT_BOTTOM} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
        <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />

        {yTicks.map((tick) => (
          <text key={`yl-${tick}`} x={PLOT_LEFT - 4} y={yOf(tick) + 3} textAnchor="end" fontSize={9} className="fill-muted-foreground">
            {tick.toFixed(yDecimals)}
          </text>
        ))}
        {xTicks.map((tick, i) => {
          let anchor: "start" | "middle" | "end" = "middle";
          if (i === 0) anchor = "start";
          else if (i === xTickCount) anchor = "end";
          return (
            <text key={`xl-${tick.toFixed(3)}`} x={xOf(tick)} y={HEIGHT - 6} textAnchor={anchor} fontSize={9} className="fill-muted-foreground">
              {formatElapsed(tick)}
            </text>
          );
        })}

        <g clipPath={`url(#${clipId})`}>
          {series.map((s) => {
            const points = toPoints(s.values, viewMin, viewMax, domainMin, domainMax);
            return points ? <polyline key={s.label} points={points} fill="none" stroke={s.color} strokeWidth={2} /> : null;
          })}
        </g>

        {endLabels.map((l) => (
          <text key={`end-${l.key}`} x={PLOT_RIGHT + 4} y={l.y + 3} textAnchor="start" fontSize={9} fontWeight={600} fill={l.color}>
            {l.text}
          </text>
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        {hasAnyData ? (
          <div className="flex flex-wrap items-center gap-4">
            {series.map((s) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <span>{emptyReason ?? "Waiting for live readings."}</span>
        )}
        {isTimeZoomed ? (
          <span>
            Showing {formatElapsed(viewMin)}–{formatElapsed(viewMax)} of {formatElapsed(maxT - minT)}
          </span>
        ) : null}
      </div>
    </figure>
  );
}
