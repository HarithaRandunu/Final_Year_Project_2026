"use client";

const CX = 100;
const CY = 100;
const RADIUS = 78;
const TRACK_WIDTH = 12;
const NEEDLE_LENGTH = 66;
const ARC_LENGTH = Math.PI * RADIUS; // length of a semicircle of this radius

/** left end -> right end of the semicircle, sweeping through the top. */
const TRACK_PATH = `M ${CX - RADIUS} ${CY} A ${RADIUS} ${RADIUS} 0 0 1 ${CX + RADIUS} ${CY}`;

/**
 * An analog-style half-circle gauge: a filled arc plus a needle, both
 * driven by CSS `transition` (not re-drawn per poll) so a new reading
 * eases smoothly into place like a real speedometer rather than jumping.
 * `value === null` shows an empty track and a needle parked at the left
 * (minimum) end, with the reading replaced by `unavailableReason`.
 */
export function Speedometer({
  label,
  value,
  min,
  max,
  formatValue = (v) => v.toFixed(2),
  tone = "var(--viz-blue)",
  unavailableReason,
}: Readonly<{
  label: string;
  value: number | null;
  min: number;
  max: number;
  formatValue?: (v: number) => string;
  tone?: string;
  unavailableReason?: string;
}>) {
  const frac = value === null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const needleDeg = -90 + 180 * frac;
  const dashOffset = ARC_LENGTH * (1 - frac);

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <svg viewBox="0 0 200 118" className="mx-auto block w-full max-w-55" role="img" aria-label={`${label}: ${value === null ? "no live reading" : formatValue(value)}`}>
        <path
          d={TRACK_PATH}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={TRACK_WIDTH}
          strokeLinecap="round"
        />
        <path
          d={TRACK_PATH}
          fill="none"
          stroke={tone}
          strokeWidth={TRACK_WIDTH}
          strokeLinecap="round"
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)" }}
        />
        <g
          style={{
            transform: `rotate(${needleDeg}deg)`,
            transformOrigin: `${CX}px ${CY}px`,
            transition: "transform 0.7s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <line x1={CX} y1={CY} x2={CX} y2={CY - NEEDLE_LENGTH} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        </g>
        <circle cx={CX} cy={CY} r={6} fill="currentColor" />
        <text x={CX - RADIUS} y={CY + 16} textAnchor="start" fontSize={10} className="fill-muted-foreground">
          {formatValue(min)}
        </text>
        <text x={CX + RADIUS} y={CY + 16} textAnchor="end" fontSize={10} className="fill-muted-foreground">
          {formatValue(max)}
        </text>
      </svg>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {value === null ? "—" : formatValue(value)}
        </p>
        {unavailableReason ? <p className="text-xs text-muted-foreground">{unavailableReason}</p> : null}
      </div>
    </div>
  );
}
