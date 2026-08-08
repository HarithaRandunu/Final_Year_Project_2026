/**
 * Shared wrapper for hand-authored inline SVG diagrams. No auto-layout
 * library involved on purpose - for diagrams this small, hand-placed
 * coordinates are both simpler and strictly better than fighting a
 * force-directed/dagre layout for crossing-free edges. Themed entirely via
 * `currentColor` + our own design tokens, so no client-side JS or theme
 * polling is needed (unlike the Mermaid-based version this replaced).
 */
export function DiagramFigure({
  viewBox,
  ariaLabel,
  caption,
  children,
  minWidth = 640,
}: Readonly<{
  viewBox: string;
  ariaLabel: string;
  caption: string;
  children: React.ReactNode;
  minWidth?: number;
}>) {
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card p-6">
        <svg
          viewBox={viewBox}
          role="img"
          aria-label={ariaLabel}
          className="mx-auto h-auto text-foreground"
          style={{ width: "100%", minWidth }}
        >
          {children}
        </svg>
      </div>
      <figcaption className="text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

/** One of the five categorical diagram accent tones defined in globals.css (`--viz-*`). */
export type DiagramTone = "blue" | "orange" | "aqua" | "yellow" | "magenta";

const TONE_VAR: Record<DiagramTone, string> = {
  blue: "var(--viz-blue)",
  orange: "var(--viz-orange)",
  aqua: "var(--viz-aqua)",
  yellow: "var(--viz-yellow)",
  magenta: "var(--viz-magenta)",
};

/**
 * A rounded box with one or two lines of centered text - the basic node used
 * across diagrams. `tone` gives a component its own identity color (a
 * tinted fill + matching border) instead of every box reading as the same
 * flat neutral card - text itself always stays in the plain foreground ink,
 * never the tone color, so it reads equally well in light and dark.
 */
export function DiagramNode({
  x,
  y,
  w,
  h,
  lines,
  tone,
}: Readonly<{
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  tone?: DiagramTone;
}>) {
  const cx = x + w / 2;
  const lineHeight = 20;
  const startY = y + h / 2 - ((lines.length - 1) * lineHeight) / 2 + 5;
  const toneVar = tone ? TONE_VAR[tone] : undefined;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={12}
        className={toneVar ? undefined : "fill-card stroke-current"}
        style={toneVar ? { fill: toneVar, fillOpacity: 0.16, stroke: toneVar } : undefined}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={startY}
        textAnchor="middle"
        fontSize={14.5}
        fontWeight={600}
        className="fill-foreground"
      >
        {lines.map((line, i) => (
          <tspan key={line} x={cx} dy={i === 0 ? 0 : lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/**
 * An orthogonal (right-angle) connector between two or more points, with an
 * arrowhead. `labelAt` is required and always hand-placed by the caller in
 * open space (never auto-derived from the line's own midpoint) - a label
 * sized to fit a short segment next to a box is exactly what produced the
 * clipped, overlapping text in the first hand-drawn version of this diagram.
 */
export function DiagramArrow({
  points,
  label,
  labelAt,
  labelAnchor = "middle",
}: Readonly<{
  points: [number, number][];
  label?: string;
  labelAt?: [number, number];
  /** Which edge of the label sits at `labelAt` - use "start"/"end" to pull a
   * label off to one side of its line instead of straddling it. */
  labelAnchor?: "start" | "middle" | "end";
}>) {
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        markerEnd="url(#diagram-arrowhead)"
      />
      {label && labelAt ? (
        <text
          x={labelAt[0]}
          y={labelAt[1]}
          textAnchor={labelAnchor}
          fontSize={12}
          paintOrder="stroke"
          stroke="var(--card)"
          strokeWidth={5}
          strokeLinejoin="round"
          className="fill-muted-foreground"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

/** The single arrowhead marker definition every DiagramArrow references. */
export function ArrowheadDefs() {
  return (
    <defs>
      <marker
        id="diagram-arrowhead"
        markerWidth={9}
        markerHeight={9}
        refX={7}
        refY={4}
        orient="auto"
      >
        <path d="M0,0 L8,4 L0,8 Z" fill="currentColor" />
      </marker>
    </defs>
  );
}
