// Hold/settle pacing — the interpreter-level fix for "no hold/settle" (ENGINE-DEFECTS.md, root
// cause B). HeroDemo springs a beat's content in over ~15 frames then HOLDS STILL for the
// remaining ~50+ frames of the beat: the eye rests. A generated spec that staggers several
// entrances (delay 8/20/34...) across a 60-frame beat means something is ALWAYS moving and nothing
// ever settles. This module is the single pure choke point that clamps an authored entrance delay
// so the resulting entrance always COMPLETES within the first ~45% of its beat, no matter what
// delay the spec authored — the "hold tail" (remaining ~55%+) is then guaranteed still for
// authored content (ambient glow/grid/particles keep breathing independently, see Generative.tsx).
//
// Deliberately a pure function of (delay, beatDuration) — no frame/spring dependence — so it's
// trivially unit-testable (see src/gen/__tests__/pacing.test.ts) without rendering anything.

/** An entrance must fully complete (spring settle / interpolate finish) by this fraction of the
 * beat's duration. Matches the design brief's "FIRST ~40%" for when entrances complete, with a
 * touch of headroom (45%) for the clamp itself so a delay that lands exactly on the boundary still
 * leaves the spring time to actually finish settling, not just start. */
export const ENTRANCE_COMPLETE_BY_FRACTION = 0.45;

/** Conservative estimate of how many frames a spring/interpolate entrance takes to visually settle
 * once it starts (matches Text/Shape/Image's shared `{damping:15}` spring family — see
 * ENGINE-DEFECTS.md's easing audit — which settles to ~99% by frame ~28-32 at 30fps). Used to back
 * out the LATEST delay that still leaves the entrance time to finish inside the hold-settle
 * window, rather than just clamping the delay to the window boundary itself (which would let the
 * spring START at the boundary and visibly finish mid-hold — still "smearing" into the hold). */
const ASSUMED_ENTRANCE_SETTLE_FRAMES = 30;

/**
 * Resolves the authored entrance `delay` (frames, already range-clamped 0..600 by
 * validateSceneSpec) against a beat's `durationInFrames`, returning the delay actually used to
 * drive the entrance. Guarantees the entrance's settle point (`resolvedDelay +
 * ASSUMED_ENTRANCE_SETTLE_FRAMES`) never lands past `ENTRANCE_COMPLETE_BY_FRACTION` of the beat —
 * so even a spec authoring `delay:34` on a 60-frame beat (which would otherwise settle at frame ~54,
 * 90% through the beat — smearing across the whole thing) gets pulled back to a delay that settles
 * by frame ~27 (45%), leaving a genuine hold for the back half.
 *
 * Never INCREASES a delay (an early, snappy entrance is never held back) and never returns
 * negative — only clamps delays that would push the entrance's completion too late.
 */
export function resolveEntranceTiming(delay: number, beatDurationInFrames: number): number {
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
  const safeDuration = Number.isFinite(beatDurationInFrames) && beatDurationInFrames > 0 ? beatDurationInFrames : 1;

  const latestSettleFrame = safeDuration * ENTRANCE_COMPLETE_BY_FRACTION;
  const latestAllowedDelay = Math.max(0, latestSettleFrame - ASSUMED_ENTRANCE_SETTLE_FRAMES);

  return Math.min(safeDelay, latestAllowedDelay);
}
