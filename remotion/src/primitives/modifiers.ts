import { interpolate, spring } from "remotion";
import type { CameraSpec } from "./Camera";
import { rackBlurFor } from "./Camera";
import { tokenColor, TOKENS } from "./tokens";

// Task 9 — the four composable modifier helpers the interpreter (Generative.tsx) applies AROUND
// any layer's rendered element, on top of whatever that element already does internally. These are
// deliberately generic (pure functions of frame/duration/spec) so they compose with ANY primitive
// without the primitive itself needing to know about Ken Burns / depth-of-field / motion blur /
// lighting sweeps. Fixed composition order (see Generative.tsx's BeatLayer): kenBurns transform ->
// element -> mask clip -> depth-of-field blur -> motion-blur/trail -> lighting-sweep overlay ->
// opacity/position wrapper.

// ---------------------------------------------------------------------------
// Ken Burns — slow push/drift/zoom on an image/video layer. Subtle: scale goes from 1.0 up to
// 1.0 + amount over the full beat, optionally drifting laterally for "drift". Never snaps —
// always a smooth interpolate across [0, durationInFrames].
// ---------------------------------------------------------------------------

export interface KenBurnsSpec {
  move: "push" | "drift" | "zoom" | "none";
  amount: number;
}

function progressOf(frame: number, durationInFrames: number): number {
  return interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Returns a CSS `transform` string for a slow Ken Burns move across the beat's duration, or
 * `undefined` when there's nothing to apply (move "none"/missing or amount <= 0). Subtle by
 * design: scale ranges 1.0 -> 1.0 + amount (amount is clamped 0..0.3 upstream by sceneSpec.ts).
 */
export function applyKenBurns(
  kenBurns: KenBurnsSpec | undefined,
  frame: number,
  durationInFrames: number
): string | undefined {
  if (!kenBurns || kenBurns.move === "none" || kenBurns.amount <= 0) return undefined;
  const t = progressOf(frame, durationInFrames);
  const amount = kenBurns.amount;

  if (kenBurns.move === "zoom") {
    // Zoom: continuous scale-up, origin center — the "punch in" Ken Burns move.
    const scale = interpolate(t, [0, 1], [1, 1 + amount]);
    return `scale(${scale})`;
  }
  if (kenBurns.move === "drift") {
    // Drift: gentle scale-up PLUS a lateral pan so the frame reads as a camera drifting across a
    // still image, not just zooming on the same center point.
    const scale = interpolate(t, [0, 1], [1, 1 + amount * 0.7]);
    const shiftPct = interpolate(t, [0, 1], [-amount * 40, amount * 40]);
    return `scale(${scale}) translateX(${shiftPct}%)`;
  }
  // "push": the classic slow dolly-in, identical curve shape to Camera's push-in but scoped to
  // this one layer (so a still image gets its own Ken Burns independent of the beat camera).
  const scale = interpolate(t, [0, 1], [1, 1 + amount]);
  return `scale(${scale})`;
}

// ---------------------------------------------------------------------------
// Depth of field — foreground stays sharp, background/mid blur progressively more. On a "rack"
// camera move, focus PULLS between planes over the beat (delegates to the existing
// `rackBlurFor` so rack-focus behavior stays in one place); outside of a rack move, depth still
// contributes a constant baseline blur so background layers always read as "behind glass"
// relative to foreground, even absent any camera move.
// ---------------------------------------------------------------------------

/** Baseline (non-rack) blur per depth plane, in px — subtle enough not to read as an error. */
const BASELINE_DEPTH_BLUR: Record<"foreground" | "mid" | "background", number> = {
  foreground: 0,
  mid: 1.5,
  background: 4,
};

/**
 * Resolves the depth-of-field blur (px) for a layer at the given depth. When the beat's camera is
 * a "rack" move, focus pulls between planes over time and this DEFERS to `rackBlurFor` (single
 * source of truth for the rack sweep — this function supersedes the caller needing to invoke both).
 * Otherwise falls back to a small constant per-plane blur so background/mid layers read behind
 * foreground even on a static or non-rack camera.
 */
export function applyDepthOfField(
  depth: "foreground" | "mid" | "background" | undefined,
  camera: CameraSpec,
  frame: number,
  durationInFrames: number,
  rackInvert = false
): number {
  const plane = depth ?? "mid";
  if (camera.move === "rack" && camera.amount > 0) {
    return rackBlurFor(camera, plane, frame, durationInFrames, rackInvert);
  }
  return BASELINE_DEPTH_BLUR[plane];
}

// ---------------------------------------------------------------------------
// Motion blur — when a layer's entrance is still animating fast (high velocity out of its
// spring), return a directional blur amount + a trailing "ghost" offset so the caller can render
// a faint duplicate behind the main element. Velocity is estimated from the spring's local
// derivative (finite difference between frame and frame-1), NOT a full physics sim — cheap and
// good enough for a per-frame render.
// ---------------------------------------------------------------------------

export interface MotionBlurResult {
  /** CSS filter fragment, e.g. "blur(3px)" or "" when velocity is negligible. */
  blurPx: number;
  /** Ghost trail: previous-frame-ish position offset (px) + reduced opacity, in the direction of travel. */
  ghostOffsetX: number;
  ghostOffsetY: number;
  ghostOpacity: number;
}

const NO_MOTION_BLUR: MotionBlurResult = { blurPx: 0, ghostOffsetX: 0, ghostOffsetY: 0, ghostOpacity: 0 };

/**
 * Estimates motion-blur strength for a spring-driven entrance at `frame`, given the same
 * `fps`/`damping` the primitive's own entrance spring uses (defaults match Text/Image/Shape's
 * `{ damping: 15 }`). Returns 0s once the spring has settled (velocity ~0) — motion blur/trail is
 * only visible while the element is actually moving fast, not for its whole lifetime.
 */
export function applyMotionBlur(
  motionBlur: boolean | undefined,
  frame: number,
  fps: number,
  travelPx = 30,
  damping = 15
): MotionBlurResult {
  if (!motionBlur) return NO_MOTION_BLUR;

  const p0 = spring({ frame, fps, config: { damping } });
  const p1 = spring({ frame: frame - 1, fps, config: { damping } });
  const velocity = (p0 - p1) * travelPx; // px/frame, signed

  const speed = Math.abs(velocity);
  if (speed < 0.6) return NO_MOTION_BLUR; // settled — no visible trail

  const blurPx = Math.min(10, speed * 0.6);
  const ghostOpacity = Math.min(0.35, speed * 0.03);
  // Trail points backward along the direction of travel (opposite of velocity sign) — a ghost
  // that lags behind, not leads.
  const dir = velocity >= 0 ? -1 : 1;
  const ghostOffsetX = dir * Math.min(18, speed * 1.2);

  return { blurPx, ghostOffsetX, ghostOffsetY: 0, ghostOpacity };
}

// ---------------------------------------------------------------------------
// Lighting sweep — a specular diagonal light band sweeping across the layer, Apple-product-shot
// style. Returns style props for an overlay `<div>` the caller composites ABOVE the element (soft,
// screen-blend gradient band at `angle` degrees, animated left-to-right at `speed`).
// ---------------------------------------------------------------------------

export interface LightingSweepSpec {
  on: boolean;
  angle: number;
  speed: number;
}

export interface LightingSweepStyle {
  style: React.CSSProperties;
}

/**
 * Resolves the overlay style for a lighting sweep at the given frame. `angle` (deg) sets the
 * gradient's diagonal; `speed` controls how many full sweeps happen per ~4s (so speed=1 is one
 * slow diagonal pass, higher speeds sweep more often) — the band position is `frame`-driven so it
 * animates continuously through the whole layer's lifetime rather than a one-shot reveal.
 * `width` sizes the gradient's background-size in proportion to the frame's own width so the band
 * reads at a consistent physical thickness on both a 1920px 16:9 frame and a 1080px 9:16 frame,
 * rather than a fixed percentage that would look thinner/thicker depending on aspect ratio.
 */
export function applyLightingSweep(
  lightingSweep: LightingSweepSpec | undefined,
  frame: number,
  fps: number,
  width: number
): LightingSweepStyle | undefined {
  if (!lightingSweep || !lightingSweep.on) return undefined;

  const angle = lightingSweep.angle;
  const speed = Math.max(0.05, lightingSweep.speed);
  const cycleFrames = fps * 4; // one full sweep cycle at speed=1 takes ~4s
  const t = (frame / cycleFrames) * speed;
  // Sweep position drifts from -60% to 160% of width so the band fully enters and exits, looping.
  const cyclePos = t - Math.floor(t); // 0..1 sawtooth
  const posPct = interpolate(cyclePos, [0, 1], [-60, 160]);
  // Reference width (1920, the 16:9 baseline) sets the "designed at" size for the 260% background
  // — narrower frames (9:16 at 1080px) scale the background-size down proportionally so the band's
  // physical thickness stays visually consistent rather than looking thinner on a portrait frame.
  const sizePct = 260 * (1920 / Math.max(1, width)) ** 0.35;

  return {
    style: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      backgroundImage: `linear-gradient(${angle}deg, transparent 0%, transparent 46%, rgba(255,255,255,0.26) 50%, transparent 54%, transparent 100%)`,
      backgroundSize: `${sizePct}% ${sizePct}%`,
      backgroundPosition: `${posPct}% 50%`,
      mixBlendMode: "screen",
      opacity: 0.32, // subtle specular pass; higher values wash out the content
    },
  };
}

/** Re-exported so callers don't need to import both `./Camera` and `./modifiers` for token color. */
export { tokenColor, TOKENS };
