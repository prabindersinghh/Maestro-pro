// Bezier easing resolution — the remotion-side twin of `src/gen/sceneSpec.ts`'s
// `resolveEasingToBezier`. The `remotion/` workspace is standalone (its own tsconfig, no
// `src/gen` import — see Generative.tsx's header comment), so this is a deliberate COPY of that
// function's tuple logic, not a re-export, kept in lockstep by matching the same preset values
// verbatim. Any change to the presets in `src/gen/sceneSpec.ts` must be mirrored here too.
//
// An `EasingSpec` (as it arrives over the render bridge, already validated/clamped by
// `validateSceneSpec`) is either a closed preset string ("ease-out"|"spring"|"linear") or an
// explicit `{curve:[x1,y1,x2,y2]}` cubic-bezier. This resolves either form to the same
// `[x1,y1,x2,y2]` tuple shape so callers can always do `Easing.bezier(...bezierFromSpec(spec))`
// without branching on preset-vs-custom themselves.

export type EasingSpec = "ease-out" | "spring" | "linear" | { curve: [number, number, number, number] };

const EASING_PRESET_BEZIER: Record<"ease-out" | "spring" | "linear", [number, number, number, number]> = {
  "ease-out": [0.22, 0.61, 0.16, 1],
  linear: [0, 0, 1, 1],
  spring: [0.16, 1, 0.3, 1],
};

/**
 * Resolves an `EasingSpec` (preset name, custom curve, or `undefined`) to its cubic-bezier tuple.
 * Pure and total — never throws. `undefined` (no easing specified) resolves to the `ease-out`
 * tuple, matching `resolveEasingToBezier`'s default in `src/gen/sceneSpec.ts`.
 */
export function bezierFromSpec(e: EasingSpec | undefined): [number, number, number, number] {
  if (e === undefined) return EASING_PRESET_BEZIER["ease-out"];
  if (typeof e === "string") return EASING_PRESET_BEZIER[e];
  return e.curve;
}
