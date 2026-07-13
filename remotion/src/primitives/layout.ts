// Layout system — the interpreter-level fix for "no layout system" (ENGINE-DEFECTS.md, root cause
// A). Every layer's authored `position:{x,y}` (raw 0..1 normalized coords, already clamped into
// [0,1] by `validateSceneSpec`) is resolved through here BEFORE it reaches a primitive, so an
// agent's guessed decimal (x=0.34, y=0.301) lands on a clean, hero-demo-like rhythm instead of an
// arbitrary pixel. Pure functions of (position, width, height) — no frame/time dependence, so this
// is trivially unit-testable and has zero runtime cost beyond a few arithmetic ops per layer.
//
// Three passes, in order:
//   1. SAFE AREA — clamp the resolved anchor into a margin band so nothing hugs the frame edge.
//   2. BASELINE GRID — quantize y to the nearest row of a gentle 1/24-height grid so multiple
//      elements sharing an anchor share vertical rhythm instead of arbitrary decimals.
//   3. (x is left alone beyond safe-area clamping — an authored x=0.34 must still read as "left of
//      center", per the design spec's explicit "don't force everything back to 0.5.")
//
// Optical centering (bounding-box vs caps-height) is a separate, per-primitive concern (baseline
// nudge on the rendered text element itself) — see Text.tsx/Counter.tsx/TextOnPath.tsx — because
// it depends on font metrics (em-relative), not on the layout position. This module only resolves
// *where the anchor point sits*, not how the element sits relative to that anchor.

export interface ResolvedPosition {
  x: number;
  y: number;
}

/** Safe-area margin, as a fraction of the frame's width/height, on every side. Matches the
 * "≈6% margins" called out in ENGINE-DEFECTS.md — comfortably inside broadcast/social safe-title
 * conventions without eating so much of the frame that centered content looks cramped. */
export const SAFE_MARGIN = 0.06;

/** 9:16 portrait carries extra top/bottom exclusion beyond the base safe margin — the design brief
 * calls out keeping captions/lower elements out of the bottom ~10% (mobile UI chrome / captions
 * strip) and the top ~8% (status bar / camera notch region conventions). These are the ABSOLUTE
 * floor/ceiling for portrait; the regular SAFE_MARGIN alone (6%) would let a caption sit at 94%,
 * inside that reserved zone. */
const PORTRAIT_TOP_EXCLUSION = 0.08;
const PORTRAIT_BOTTOM_EXCLUSION = 0.1;

/** Baseline grid density — quantizes y to the nearest 1/24 of frame height, per the design brief's
 * "gentle baseline grid". 24 rows gives ~30px steps on a 1080p-tall 16:9 frame and ~80px steps on a
 * 1920-tall 9:16 frame — fine enough to feel like intentional rhythm, coarse enough that it never
 * reads as a hard snap-to-grid artifact. */
const BASELINE_GRID_ROWS = 24;

/**
 * Clamps a single normalized axis value into `[margin, 1 - margin]`. Pure clamp — never remaps
 * toward 0.5 (an authored 0.34 that's already outside the exclusion band comes back untouched), so
 * authored intent ("left of center") survives; this ONLY rescues values that would otherwise sit in
 * the forbidden edge band.
 */
function clampToSafeArea(value: number, marginLow: number, marginHigh: number): number {
  const lo = marginLow;
  const hi = 1 - marginHigh;
  if (lo >= hi) return 0.5; // degenerate margins (shouldn't happen with real aspect ratios) — fail safe to center
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Quantizes `value` (already safe-area-clamped) to the nearest row of a `BASELINE_GRID_ROWS`-row
 * grid spanning the FULL 0..1 axis, then re-clamps into the safe band — quantizing can otherwise
 * push a value that was exactly on the safe-area boundary back out past it (e.g. clamped to 0.94,
 * nearest grid line is 0.958). Snapping to the full-frame grid (not a grid rebased to the safe
 * band) is what gives multiple layers across different beats/positions shared rhythm — two authors
 * putting text near y=0.5 and y=0.52 both collapse onto the same row.
 */
function snapToBaselineGrid(value: number, marginLow: number, marginHigh: number): number {
  const snapped = Math.round(value * BASELINE_GRID_ROWS) / BASELINE_GRID_ROWS;
  return clampToSafeArea(snapped, marginLow, marginHigh);
}

/**
 * Resolves an authored `position:{x,y}` (normalized 0..1, already range-clamped by
 * `validateSceneSpec`) into its final on-screen anchor: safe-area clamp on both axes (portrait
 * frames — taller than wide — get extra top/bottom exclusion for caption-band/status-bar
 * conventions), then baseline-grid quantization on y only (x is left at full resolution beyond the
 * safe-area clamp, so horizontal authored intent like "slightly left of center" is preserved
 * exactly rather than rounded to a coarse column grid).
 *
 * Takes `width`/`height` (not `meta.aspect`) so it composes directly with the same dimensions every
 * primitive/layer already carries (`dimsForAspect` output) — no separate aspect-string plumbing
 * needed through `BeatContent`/`BeatLayer`. Portrait is detected structurally (`height > width`)
 * rather than re-deriving it from an aspect enum.
 *
 * TASK 5 UPGRADE — `snap` (mirrors `Layer.position.snap` in `src/gen/sceneSpec.ts`, default `true`)
 * lets an authored layer opt OUT of the baseline-grid quantization entirely (e.g. a layer whose
 * `animate.position` tween needs to land on an exact authored coordinate every frame, not have each
 * tweened point independently re-snapped to the nearest grid row, which would turn a smooth tween
 * into a visible staircase). The safe-area clamp is NEVER skipped — `snap:false` only opts out of
 * the grid rhythm, not out of the "never hug the frame edge" guarantee.
 */
export function resolveLayoutPosition(
  position: { x: number; y: number },
  width: number,
  height: number,
  snap = true
): ResolvedPosition {
  const isPortrait = height > width;
  const topMargin = isPortrait ? Math.max(SAFE_MARGIN, PORTRAIT_TOP_EXCLUSION) : SAFE_MARGIN;
  const bottomMargin = isPortrait ? Math.max(SAFE_MARGIN, PORTRAIT_BOTTOM_EXCLUSION) : SAFE_MARGIN;

  const x = clampToSafeArea(position.x, SAFE_MARGIN, SAFE_MARGIN);
  const y = snap ? snapToBaselineGrid(position.y, topMargin, bottomMargin) : clampToSafeArea(position.y, topMargin, bottomMargin);

  return { x, y };
}
