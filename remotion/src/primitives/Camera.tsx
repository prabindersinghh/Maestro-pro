import { interpolate } from "remotion";
import type { ReactNode } from "react";

// Real Camera primitive — wraps a beat's entire visual content (background + layers) and applies
// a continuous move across the beat's duration. This replaces Generative.tsx's old inline
// `cameraStyle` helper (kept minimal on purpose until this task). Every beat MUST pass through
// this wrapper — if `camera` is unset the interpreter defaults to a slow push-in (amount ~0.05)
// so the frame is never dead still (binding critique #3).
//
// Moves:
//  - push-in    : scale 1 -> 1+amount, transform-origin center. Slow dolly-in.
//  - pan-left / pan-right : lateral translateX drift, scaled slightly up so edges never show.
//  - rack       : rack-focus — foreground children (data-camera-depth="foreground") stay sharp
//                 while background/mid layers blur *from* sharp *to* blurred (or vice-versa),
//                 crossing over the beat's duration. Implemented as two blur layers the caller
//                 composes via `rackBlurFor(depth, progress, amount)` below, since a single CSS
//                 transform can't selectively blur only some children — see Generative.tsx wiring.
//  - parallax   : background moves slower than foreground; this wrapper nudges the *whole* frame
//                 with a small pan + gentle scale so nested depth layers (already offset by the
//                 interpreter's per-depth translateX in Generative.tsx) read as parallax.
//  - none       : static passthrough (no motion) — only used when explicitly requested.

export interface CameraSpec {
  move: "push-in" | "pan-left" | "pan-right" | "rack" | "parallax" | "none";
  amount: number;
}

/** Default camera applied when a beat specifies none — the frame must never be dead still. */
export const DEFAULT_CAMERA: CameraSpec = { move: "push-in", amount: 0.05 };

function progressOf(frame: number, durationInFrames: number): number {
  return interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Outer transform style for the whole beat frame, given a resolved camera spec. */
export function cameraTransform(camera: CameraSpec, frame: number, durationInFrames: number): React.CSSProperties {
  const move = camera.move;
  const amount = camera.amount;
  if (move === "none" || amount <= 0) return {};
  const t = progressOf(frame, durationInFrames);

  if (move === "push-in") {
    const scale = interpolate(t, [0, 1], [1, 1 + amount]);
    return { transform: `scale(${scale})`, transformOrigin: "50% 50%", willChange: "transform" };
  }
  if (move === "pan-left" || move === "pan-right") {
    const dir = move === "pan-left" ? -1 : 1;
    // slight overscale so the pan never reveals a hard edge of the frame
    const scale = 1 + amount * 0.6;
    const shiftPct = amount * 100 * dir;
    const translate = interpolate(t, [0, 1], [0, shiftPct]);
    return { transform: `scale(${scale}) translateX(${translate}%)`, transformOrigin: "50% 50%", willChange: "transform" };
  }
  if (move === "parallax") {
    // whole-frame gentle drift + push, background/mid layers add their own extra offset
    // (see parallaxOffset below) so depth reads as true parallax, not just a single pan.
    const scale = interpolate(t, [0, 1], [1, 1 + amount * 0.4]);
    const translate = interpolate(t, [0, 1], [amount * 20, -amount * 20]);
    return { transform: `scale(${scale}) translateX(${translate}px)`, transformOrigin: "50% 50%", willChange: "transform" };
  }
  if (move === "rack") {
    // The frame itself holds still for rack-focus (the effect lives in per-depth blur, see
    // rackBlurFor) but we add an extremely subtle push so the shot still breathes.
    const scale = interpolate(t, [0, 1], [1, 1 + amount * 0.15]);
    return { transform: `scale(${scale})`, transformOrigin: "50% 50%", willChange: "transform" };
  }
  return {};
}

/**
 * Extra per-depth translateX (px) for "parallax" camera moves — background moves less than
 * foreground, mid moves in between. Used by Generative.tsx to offset each layer beyond the
 * whole-frame cameraTransform, producing real depth-parallax rather than a single flat pan.
 */
export function parallaxOffset(
  camera: CameraSpec,
  depth: "foreground" | "mid" | "background" | undefined,
  frame: number,
  durationInFrames: number
): number {
  if (camera.move !== "parallax" || camera.amount <= 0) return 0;
  const t = progressOf(frame, durationInFrames);
  const depthFactor = depth === "background" ? 0.3 : depth === "foreground" ? 1.4 : 0.8;
  const px = interpolate(t, [0, 1], [-40, 40]) * camera.amount * 10 * depthFactor;
  return px;
}

/**
 * Rack-focus blur (px) for a given layer depth under a "rack" camera move. Foreground stays
 * sharp throughout; background/mid layers sweep from sharp to blurred (or the reverse on
 * odd-numbered beats via `invert`) across the beat, so focus visibly racks between planes.
 */
export function rackBlurFor(
  camera: CameraSpec,
  depth: "foreground" | "mid" | "background" | undefined,
  frame: number,
  durationInFrames: number,
  invert = false
): number {
  if (camera.move !== "rack" || camera.amount <= 0) return 0;
  const t = progressOf(frame, durationInFrames);
  const sweep = invert ? 1 - t : t;
  const maxBlur = camera.amount * 60; // amount clamped 0..0.3 -> up to ~18px
  if (depth === "foreground") return 0;
  if (depth === "background") return interpolate(sweep, [0, 1], [0, maxBlur]);
  // "mid" racks less dramatically than background
  return interpolate(sweep, [0, 1], [0, maxBlur * 0.5]);
}

export interface CameraProps {
  camera?: CameraSpec;
  frame: number;
  durationInFrames: number;
  children: ReactNode;
}

/**
 * Wraps a beat's full visual content (background + layers) and applies the resolved camera
 * move. The interpreter (Generative.tsx) is responsible for calling this with a *resolved*
 * camera (falling back to DEFAULT_CAMERA when the beat has none) — every beat renders through
 * this wrapper, so no beat is ever dead still.
 */
export const Camera: React.FC<CameraProps> = ({ camera, frame, durationInFrames, children }) => {
  const resolved = camera ?? DEFAULT_CAMERA;
  const style = cameraTransform(resolved, frame, durationInFrames);
  return (
    <div style={{ position: "absolute", inset: 0, ...style }}>
      {children}
    </div>
  );
};
