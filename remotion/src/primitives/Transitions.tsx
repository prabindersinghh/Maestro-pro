import { tokenColor } from "./tokens";

// Beat transitions — the fix for binding critique #1 ("No hard cuts"). Generative.tsx overlaps
// consecutive beats by a fixed window (see TRANSITION_FRAMES) and, during the overlap, renders
// BOTH the outgoing beat (fading/animating out) and the incoming beat (animating in) together,
// with `applyTransition` supplying the per-frame style for each side plus any full-screen overlay
// (e.g. a glitch/rgbSplit flash or a wipe mask). `progress` is 0 at the start of the overlap and 1
// at its end. `cut` is the only instant transition (no overlap rendered) — everything else
// animates across the whole overlap window.

export const TRANSITION_FRAMES = 14; // overlap window, in frames, for every non-cut transition

export type TransitionKind = "wipe" | "dissolve" | "push" | "glitch" | "rgbSplit" | "cut";

export interface TransitionStyles {
  /** Style applied to the OUTGOING (previous) beat's wrapper during the overlap. */
  outgoing: React.CSSProperties;
  /** Style applied to the INCOMING (next) beat's wrapper during the overlap. */
  incoming: React.CSSProperties;
  /** Optional full-screen overlay rendered above both beats (glitch bars / rgb flash / wipe edge). */
  overlay?: React.CSSProperties & { content?: React.ReactNode };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Resolves outgoing/incoming styles (+ optional overlay) for a transition at a given progress
 * (0..1 across the overlap window). `accent` colors any transition-specific flash/edge glow.
 */
export function applyTransition(kind: TransitionKind, progress: number, accent: string): TransitionStyles {
  const p = clamp01(progress);
  const color = tokenColor(accent);

  switch (kind) {
    case "cut":
      // instant — no overlap ever rendered for "cut" (Generative.tsx skips the overlap window
      // entirely), but define a sane passthrough in case it's queried anyway.
      return { outgoing: { opacity: 1 }, incoming: { opacity: 1 } };

    case "wipe": {
      // incoming beat wipes in left->right behind a hard edge; outgoing stays put until covered.
      const edge = p * 100;
      return {
        outgoing: { opacity: 1 },
        incoming: {
          opacity: 1,
          clipPath: `polygon(0 0, ${edge}% 0, ${edge}% 100%, 0 100%)`,
        },
        overlay: {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: `linear-gradient(90deg, transparent ${Math.max(0, edge - 1.2)}%, ${color} ${edge}%, transparent ${Math.min(100, edge + 1.2)}%)`,
          opacity: 0.9 * (1 - Math.abs(p - 0.5) * 0.4),
        },
      };
    }

    case "dissolve": {
      return {
        outgoing: { opacity: 1 - p },
        incoming: { opacity: p },
      };
    }

    case "push": {
      // incoming slides in from the right, outgoing pushed out to the left — a hard-edge slide,
      // not a soft crossfade, so it reads as deliberate camera-like motion between beats.
      const shift = interpolate1(p, 0, 100);
      return {
        outgoing: { opacity: 1, transform: `translateX(${-shift}%)` },
        incoming: { opacity: 1, transform: `translateX(${100 - shift}%)` },
      };
    }

    case "glitch": {
      // short, punchy digital stinger: outgoing breaks into jittering slices and fades, incoming
      // snaps in through a few stepped flashes rather than a smooth fade.
      const jitter = Math.sin(p * 60) * (1 - p) * 10;
      const flashOn = Math.floor(p * 8) % 2 === 0;
      return {
        outgoing: {
          opacity: 1 - p,
          transform: `translateX(${jitter}px)`,
          filter: `hue-rotate(${(1 - p) * 40}deg)`,
        },
        incoming: {
          opacity: p < 0.85 ? (flashOn ? 0.6 : 1) : 1,
          transform: `translateX(${-jitter * 0.6}px)`,
        },
        overlay: {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: p < 0.9 && flashOn ? `repeating-linear-gradient(0deg, ${color}22 0px, transparent 2px, transparent 6px)` : "transparent",
          mixBlendMode: "screen",
          opacity: (1 - p) * 0.8,
        },
      };
    }

    case "rgbSplit": {
      // channel-split flash: outgoing ghosts into red/cyan-shifted duplicates as it fades,
      // incoming resolves from a split back to true color.
      const split = Math.sin(p * Math.PI) * 8; // peaks mid-transition, resolves at both ends
      return {
        outgoing: {
          opacity: 1 - p,
          filter: `drop-shadow(${split}px 0 0 rgba(255,0,64,0.55)) drop-shadow(${-split}px 0 0 rgba(0,200,255,0.55))`,
        },
        incoming: {
          opacity: p,
          filter: `drop-shadow(${-split * (1 - p)}px 0 0 rgba(255,0,64,0.45)) drop-shadow(${split * (1 - p)}px 0 0 rgba(0,200,255,0.45))`,
        },
        overlay: {
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: color,
          opacity: Math.sin(p * Math.PI) * 0.06,
          mixBlendMode: "screen",
        },
      };
    }

    default:
      return { outgoing: { opacity: 1 - p }, incoming: { opacity: p } };
  }
}

function interpolate1(p: number, from: number, to: number): number {
  return from + (to - from) * p;
}
