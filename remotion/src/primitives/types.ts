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
  anim: "spring" | "typewriter" | "wordReveal" | "kinetic" | "draw" | "fade" | "collapse" | "maskReveal";
  easing?: EasingSpec;
  delay?: number;
  from?: "below" | "left" | "scale";
  snapToBeat?: boolean;
  durationFrames?: number;
  spring?: SpringConfig;
}

export interface StyleSpec {
  role?: "display" | "accent" | "muted";
  size?: number;
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
