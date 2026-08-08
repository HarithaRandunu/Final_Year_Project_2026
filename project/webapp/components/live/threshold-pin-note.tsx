/**
 * Explains why the adaptive threshold reads as a fixed number whenever it's
 * sitting at one of its own configured bounds - a real, expected control
 * state (the PI controller saturated), not a bug. Returns null once the
 * threshold is genuinely moving somewhere in the middle of its range.
 */
export function ThresholdPinNote({
  threshold,
  bounds,
}: Readonly<{ threshold: number | null; bounds: [number, number] }>) {
  if (threshold === null) return null;
  const [floor, ceiling] = bounds;
  const atCeiling = threshold >= ceiling - 1e-9;
  const atFloor = threshold <= floor + 1e-9;
  if (!atCeiling && !atFloor) return null;

  return (
    <p className="text-xs text-muted-foreground">
      <strong className="text-foreground">Why this looks fixed at {atCeiling ? ceiling : floor}:</strong>{" "}
      {atCeiling ? (
        <>
          Module 3&apos;s controller moves this threshold to try to keep risk near a target of
          0.10 — every cycle it&apos;s below target, the controller nudges the threshold up;
          every cycle it&apos;s above, the threshold comes back down. But &quot;risk&quot; here
          means specifically the &quot;Risk Module 3 is reacting to&quot; gauge and chart just
          above, not the faster-refreshing one in the Module 1 block — a brief spike there
          that fades before Module 3&apos;s next ~2-minute poll never reaches the controller at
          all. That slower reading has stayed well under 0.10 this whole session, so the
          controller has kept pushing the threshold upward until it hit its own configured
          ceiling ({ceiling}) and is now pinned there — genuinely at its limit, not stuck or
          broken. Watch the gauge above: it will move again the moment that reading comes back
          above 0.10.
        </>
      ) : (
        <>
          The same controller has pushed the threshold down to its configured floor ({floor}),
          which happens when the &quot;Risk Module 3 is reacting to&quot; reading just above has
          been running above its 0.10 target for a while. It will move again once that reading
          drops back under target.
        </>
      )}
    </p>
  );
}
