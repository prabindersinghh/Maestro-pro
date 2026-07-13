// Shared types for the primitive layer. Every primitive is a `React.FC<PrimitiveProps>` driven
// entirely by plain data (frame/fps/dimensions + a validated SceneSpec layer's fields) — no
// free-form code or CSS ever reaches a primitive, per the Global Constraints' "no agent-authored
// executable code is ever rendered" rule. `props` is the layer's per-element data bag
// (`Layer.props` in `src/gen/sceneSpec.ts`), typed loosely here since each primitive interprets
// its own subset.

import type { EasingSpec } from "./easing";

export interface SpringConfig {
  damping: number;
  mass: number;
  stiffness: number;
}

export interface EnterSpec {
  anim: "spring" | "typewriter" | "wordReveal" | "wordStagger" | "kinetic" | "draw" | "fade" | "collapse" | "maskReveal";
  easing?: EasingSpec;
  delay?: number;
  from?: "below" | "left" | "scale";
  snapToBeat?: boolean;
  durationFrames?: number;
  spring?: SpringConfig;
  /**
   * TASK 5 FIX — per-property `animate` "sole driver" contract (see `Generative.tsx`'s
   * `BeatLayer`): when `layer.animate.opacity`/`layer.animate.position` is present, that property
   * must be driven SOLELY by the tween, and the entrance must not ALSO drive it internally (every
   * primitive bakes its own entrance-driven opacity multiplier and/or translate/scale offset from
   * one shared spring/interpolate curve). These two flags are independent — one may be true while
   * the other is false/undefined — so a layer authoring `animate.position` ALONE continues to get
   * its normal entrance-driven opacity fade-in, and vice versa. A primitive that reads these should
   * pin its OWN internal opacity multiplier to 1 (when `neutralizeOpacity`) and/or its own internal
   * translate/scale offset to its settled value — 0 offset / scale 1 (when `neutralizePosition`) —
   * as a final step, without altering which `anim` branch it takes or how that branch computes its
   * *other* (non-neutralized) property.
   */
  neutralizeOpacity?: boolean;
  neutralizePosition?: boolean;
}

export interface StyleSpec {
  role?: "display" | "accent" | "muted";
  size?: number;
  anchor?: "left" | "center" | "right";
  font?: "sans" | "mono";
}

export interface PrimitiveProps {
  props: Record<string, unknown>;
  frame: number;
  fps: number;
  width: number;
  height: number;
  opacity: number;
  blur: number;
  position: { x: number; y: number };
  enter?: EnterSpec;
  style?: StyleSpec;
}
