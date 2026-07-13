import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import {
  REGISTRY,
  Grid,
  GlowField,
  Particles,
  Camera,
  DEFAULT_CAMERA,
  parallaxOffset,
  applyTransition,
  TRANSITION_FRAMES,
  Mask,
  applyKenBurns,
  applyDepthOfField,
  applyMotionBlur,
  applyLightingSweep,
  resolveLayoutPosition,
  resolveEntranceTiming,
} from "../primitives";
import type { CameraSpec, TransitionKind, MaskShape, MaskReveal } from "../primitives";
import { TOKENS, tokenColor } from "../primitives/tokens";
import type { PrimitiveProps, EnterSpec, StyleSpec } from "../primitives/types";

// The trusted interpreter: takes a *validated* SceneSpec (never agent-authored code) and maps it
// onto the primitive registry. It never executes anything from the spec beyond reading its
// closed-enum fields / clamped numbers — see Global Constraints in the design spec.
//
// Structural (not imported) mirror of `src/gen/sceneSpec.ts`'s `SceneSpec` shape: the `remotion/`
// workspace does not depend on `src/` (it's synced standalone into the app's render dir, see
// `primitives/tokens.ts`), and `spec` arrives here as plain validated JSON over the render
// bridge — a structural type is sufficient and keeps this workspace self-contained.
//
// TASK 6 UPGRADE — fixes the 3 biggest slideshow failures called out in the binding critique:
//   1. No hard cuts: consecutive beats now OVERLAP by TRANSITION_FRAMES and `applyTransition`
//      renders both the outgoing and incoming beat together during the overlap (see
//      `BeatSequence` below). Only `transitionOut.kind === "cut"` skips the overlap.
//   2. Camera on every beat: every beat renders through the real `Camera` primitive. A beat with
//      no `camera` (or `move: "none"`) still gets a default slow push-in — the frame is NEVER
//      dead still.
//   3. Atmosphere: beats can carry a `particles` layer (registered in the primitive registry) and
//      the existing Grid/GlowField backgrounds continue to animate every frame.
//
// TASK 6.5 UPGRADE — "premium by construction": a sparse agent-authored spec (no `background`, no
// `enter`) must NEVER regress to a flat-black slideshow. This is now enforced at the INTERPRETER
// level, not left to the agent remembering to author atmosphere:
//   4. Baseline ambient atmosphere on EVERY beat: `resolveBackground` defaults a beat with no
//      `background` to the same animated Grid+GlowField combo HeroDemo uses (never flat black),
//      and `BeatContent` ALWAYS mounts a low-opacity drifting `Particles` layer behind the
//      authored layers UNLESS the beat explicitly opts into `background:{kind:"solid"}` — that's
//      the deliberate clean/minimal escape hatch (see `wantsAmbientParticles`).
//   5. Spring/overshoot default entrance: `resolveEnter` fills in a spring/overshoot entrance
//      whenever a layer's `enter` is missing or incomplete (no `anim` / no `easing`) so nothing
//      defaults to a dead linear cut. An explicit `easing:"linear"` is always honored verbatim —
//      defaults only fill gaps, they never override an authored choice.
//
// TASK 9 UPGRADE — "premium motion" primitives (masked reveals, multi-panel layouts,
// depth-of-field, motion blur, kinetic typography, lighting sweeps, Ken Burns, stingers). Every
// layer now runs through the four composable modifier helpers (`remotion/src/primitives/
// modifiers.ts`) in a FIXED order, applied by `BeatLayer` below: kenBurns transform -> element ->
// mask clip -> depth-of-field blur -> motion-blur/trail -> lighting-sweep overlay ->
// opacity/position wrapper.
//   6. `layer.mask` (shape circle/pill/rect/logo/wipe, reveal left/up/iris/none) clips the
//      element via the new `Mask` primitive; `enter.anim === "maskReveal"` gets an implicit
//      default mask (rect/left) so that enum value actually clips rather than falling through to
//      a plain fade.
//   7. `layer.kenBurns` (push/drift/zoom) applies a slow subtle scale/pan transform scoped to the
//      one layer, independent of the beat's own Camera move — a still image/video can breathe on
//      its own even on a static camera.
//   8. `layer.depth` now also drives a baseline depth-of-field blur (foreground sharp, mid/
//      background progressively blurred) even OUTSIDE a "rack" camera move; `applyDepthOfField`
//      is the single source of truth for both that baseline and the existing rack-focus sweep.
//   9. `layer.motionBlur` estimates the entrance spring's velocity and adds a directional blur +
//      a faint trailing ghost duplicate while the element is still moving fast — nothing "just
//      appears" at speed with a hard edge.
//   10. `layer.lightingSweep` composites a specular diagonal light band sweeping across the
//       layer, screen-blended, Apple-product-shot style.
//   11. `layer.exit.anim === "glitch"` now renders an RGB-split/jitter/hue-shift burst on the
//       layer's own wrapper starting at `exit.at`, reusing the same visual language as
//       `Transitions.tsx`'s beat-level glitch transition.
//   12. New nested-layout elements registered in the primitive REGISTRY: `splitLayout` (2 panels
//       side-by-side/stacked with a hairline divider), `gridLayout` (2x2 or filmstrip), `textOnPath`
//       (kinetic per-word typography arcing along a path, emphasis words in green/gold), and
//       `countdown` (3-2-1 stinger with overshoot + glow ring). Nested panels/cells look up their
//       child element through the SAME closed primitive REGISTRY (see `primitives/registry.ts`) —
//       bounded data only, never a free-form component synthesized from a string. ZERO Noop
//       mappings remain in REGISTRY after this task.

export interface SceneMeta {
  aspect: "16:9" | "9:16" | "1:1";
  fps: number;
  brand?: string;
  beatMarkers?: number[];
}

// Named CameraField (not `Camera`) to avoid colliding with the imported `Camera` component from
// ../primitives — this is the SceneSpec's per-beat camera *data*, resolved into a `CameraSpec`
// (see resolveCamera) before being handed to the real `Camera` primitive.
export interface CameraField {
  move: "push-in" | "pan-left" | "pan-right" | "rack" | "parallax" | "none";
  amount: number;
}

export interface Background {
  kind: "grid" | "glow" | "parallax" | "solid";
  accent: string;
}

export interface TransitionOut {
  kind: TransitionKind;
  accent: string;
  snapToBeat?: boolean;
}

export interface MaskField {
  shape: MaskShape;
  reveal: MaskReveal;
}

export interface KenBurnsField {
  move: "push" | "drift" | "zoom" | "none";
  amount: number;
}

export interface LightingSweepField {
  on: boolean;
  angle: number;
  speed: number;
}

export interface ExitField {
  anim: "fade" | "collapse" | "glitch" | "none";
  at: number;
}

export interface Layer {
  element: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  opacity: number;
  blur: number;
  depth?: "foreground" | "mid" | "background";
  mask?: MaskField;
  motionBlur?: boolean;
  kenBurns?: KenBurnsField;
  lightingSweep?: LightingSweepField;
  enter?: EnterSpec;
  exit?: ExitField;
  style?: StyleSpec;
}

export interface Beat {
  durationInFrames: number;
  camera?: CameraField;
  background?: Background;
  layers: Layer[];
  transitionOut?: TransitionOut;
}

export interface SceneSpec {
  meta: SceneMeta;
  beats: Beat[];
}

export interface GenerativeProps {
  spec: SceneSpec;
}

/** Sum of every beat's durationInFrames — used by Root.tsx's calculateMetadata. */
export function totalDuration(spec: SceneSpec): number {
  return spec.beats.reduce((sum, b) => sum + b.durationInFrames, 0);
}

/** meta.aspect -> pixel dimensions, per the design spec (16:9, 9:16, 1:1). */
export function dimsForAspect(aspect: SceneSpec["meta"]["aspect"]): { width: number; height: number } {
  if (aspect === "9:16") return { width: 1080, height: 1920 };
  if (aspect === "1:1") return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

/** Ensures every beat gets a camera — the frame must never be dead still (critique #3). */
function resolveCamera(camera: Beat["camera"] | undefined): CameraSpec {
  if (!camera || camera.move === "none" || camera.amount <= 0) return DEFAULT_CAMERA;
  return camera as CameraSpec;
}

/** Default accent used for synthesized ambient atmosphere when a beat authors no background/accent. */
const AMBIENT_ACCENT = "green";

/**
 * Opacity for the always-on ambient Particles field behind authored layers (critique #4).
 * TASK 10 UPGRADE — restraint defaults (ENGINE-DEFECTS.md root cause C): dialed from 0.5(originally)
 * / 0.3 down to ~0.14, matching hero-demo's quiet grid (0.10 white, composited well below authored
 * content) — ambient atmosphere must read as subtle depth behind the shot, never compete with it.
 */
const AMBIENT_PARTICLES_OPACITY = 0.14;

/**
 * True unless the beat explicitly opts into the deliberate clean/minimal escape hatch
 * (`background:{kind:"solid"}`) — every other beat (including beats with NO background at all)
 * gets the always-on ambient Particles field per the binding critique's "atmosphere everywhere".
 */
function wantsAmbientParticles(background: Beat["background"] | undefined): boolean {
  return background?.kind !== "solid";
}

/**
 * Renders a beat's `background` field (kind -> Grid/GlowField/solid/parallax). A beat with NO
 * `background` at all is the common sparse-spec case — it must NEVER fall through to flat black
 * (critique: "slideshow... dead-still frames, zero atmosphere"), so it defaults to the same
 * animated Grid + breathing GlowField combo HeroDemo composites on every frame.
 */
const BeatBackground: React.FC<{ background?: Beat["background"]; frame: number; fps: number; width: number; height: number }> = ({
  background,
  frame,
  fps,
  width,
  height,
}) => {
  const accent = background?.accent ?? AMBIENT_ACCENT;
  const basePrimitiveProps: PrimitiveProps = {
    props: { accent },
    frame,
    fps,
    width,
    height,
    opacity: 1,
    blur: 0,
    position: { x: 0.5, y: 0.5 },
  };

  if (!background) {
    // No background authored at all -> baseline ambient atmosphere: drifting grid + breathing
    // glow together, never a bare AbsoluteFill of flat black.
    return (
      <>
        <GlowField {...basePrimitiveProps} />
        <Grid {...basePrimitiveProps} />
      </>
    );
  }

  // HeroDemo (the quality bar) composites BOTH the breathing glow AND the drifting grid on EVERY
  // beat — the grid gives the frame its consistent premium texture, the glow its depth. So `grid`,
  // `glow`, and `parallax` all render the same grid+glow pair (the `kind` only nudges emphasis:
  // "grid" leads with the grid on top for a more technical read, "glow"/"parallax" lead with the
  // glow). This is a root-cause fix for "grid too faint / near-black on glow beats" — a beat should
  // never lose hero's grid texture just because its author picked kind:"glow".
  if (background.kind === "grid") {
    return (
      <>
        <GlowField {...basePrimitiveProps} />
        <Grid {...basePrimitiveProps} />
      </>
    );
  }
  if (background.kind === "glow" || background.kind === "parallax") {
    return (
      <>
        <Grid {...basePrimitiveProps} />
        <GlowField {...basePrimitiveProps} />
      </>
    );
  }
  // "solid" — the deliberate clean/minimal escape hatch: flat fill in the accent color, no grid/glow.
  return <AbsoluteFill style={{ backgroundColor: tokenColor(accent) }} />;
};

/**
 * Always-on ambient Particles layer, mounted BEHIND authored layers (z-order lowest, above only
 * the background) for every beat that isn't the explicit `background:{kind:"solid"}` escape
 * hatch. Low opacity so it reads as atmosphere, not competing with authored content.
 */
const AmbientParticles: React.FC<{ background?: Beat["background"]; frame: number; fps: number; width: number; height: number }> = ({
  background,
  frame,
  fps,
  width,
  height,
}) => {
  if (!wantsAmbientParticles(background)) return null;
  const accent = background?.accent ?? AMBIENT_ACCENT;
  return (
    <Particles
      props={{ accent }}
      frame={frame}
      fps={fps}
      width={width}
      height={height}
      opacity={AMBIENT_PARTICLES_OPACITY}
      blur={0}
      position={{ x: 0.5, y: 0.5 }}
    />
  );
};

/** Structural default so a missing `position`/`opacity`/`blur` (e.g. a hand-authored raw JSON
 * spec that skipped `validateSceneSpec`) never crashes a primitive that reads `position.x`. */
const DEFAULT_POSITION = { x: 0.5, y: 0.5 };

/**
 * Spring/overshoot is the DEFAULT entrance (critique #5: "everything overshoots, settles, has
 * spring physics" — never linear). Fills in a spring entrance whenever `enter` is missing
 * entirely, or present but missing `anim`/`easing`. An explicit `easing:"linear"` (or any other
 * authored easing) is always preserved verbatim — defaults only fill gaps they never overwrite
 * an authored choice.
 *
 * TASK 10 UPGRADE — "hold/settle" pacing (ENGINE-DEFECTS.md root cause B): the resolved `delay` is
 * ALWAYS passed through `resolveEntranceTiming` against the beat's own duration, here at the single
 * interpreter choke point every layer's enter passes through — so an authored `delay:34` on a
 * 60-frame beat (which would otherwise settle at ~90% through the beat, smearing motion across the
 * whole thing) gets pulled back to complete within the first ~45%. This clamp only ever SHORTENS a
 * delay, never lengthens one, so a snappy authored entrance is untouched.
 */
function resolveEnter(enter: EnterSpec | undefined, beatDurationInFrames: number): EnterSpec {
  const base: EnterSpec = enter ? { ...enter, easing: enter.easing ?? "spring", anim: enter.anim ?? (enter.easing === "linear" ? "fade" : "spring") } : { anim: "spring", easing: "spring", from: "below" };
  const authoredDelay = base.delay ?? 0;
  return { ...base, delay: resolveEntranceTiming(authoredDelay, beatDurationInFrames) };
}

/** Default mask used when `enter.anim === "maskReveal"` but the layer authored no explicit
 * `mask` — a plain rect wipe from the left reads as a clean generic reveal for any element. */
const DEFAULT_MASK_REVEAL: MaskField = { shape: "rect", reveal: "left" };

/** How many frames the glitch exit's RGB-split/jitter burst lasts once `frame` reaches `exit.at`. */
const EXIT_GLITCH_FRAMES = 12;

/**
 * Resolves an `exit.anim === "glitch"` burst into a wrapper style, active for a short window
 * starting at `exit.at` (frame index within the beat) and BEYOND — once the burst itself finishes
 * the layer stays fully faded (opacity 0), it never reverts to visible. Reuses the same
 * RGB-split/jitter/hue-shift language as `Transitions.tsx`'s "glitch" beat transition (see
 * applyTransition) so a per-layer glitch exit reads as the same family of effect, just scoped to
 * one layer instead of the whole frame. Returns `undefined` only BEFORE `exit.at` (the layer hasn't
 * started exiting yet) or for any other/no exit anim.
 */
function glitchExitStyle(exit: ExitField | undefined, frame: number): React.CSSProperties | undefined {
  if (!exit || exit.anim !== "glitch") return undefined;
  const local = frame - exit.at;
  if (local < 0) return undefined; // exit hasn't started yet — render normally
  if (local > EXIT_GLITCH_FRAMES) return { opacity: 0 }; // burst finished — stay gone, never pop back
  const p = local / EXIT_GLITCH_FRAMES; // 0..1 across the burst
  const jitter = Math.sin(p * 50) * (1 - p) * 14;
  const split = Math.sin(p * Math.PI) * 10;
  return {
    opacity: 1 - p,
    transform: `translateX(${jitter}px)`,
    filter: [
      `hue-rotate(${(1 - p) * 50}deg)`,
      `drop-shadow(${split}px 0 0 rgba(255,0,64,0.55))`,
      `drop-shadow(${-split}px 0 0 rgba(0,200,255,0.55))`,
    ].join(" "),
  };
}

const BeatLayer: React.FC<{
  layer: Layer;
  frame: number;
  fps: number;
  width: number;
  height: number;
  camera: CameraSpec;
  durationInFrames: number;
  rackInvert: boolean;
}> = ({ layer, frame, fps, width, height, camera, durationInFrames, rackInvert }) => {
  const Primitive = REGISTRY[layer.element];
  if (!Primitive) return null;

  // Per-depth parallax offset (rack-focus BLUR is now folded into applyDepthOfField below, one
  // source of truth for both the baseline per-plane blur and the rack-focus sweep).
  const parallaxPx = parallaxOffset(camera, layer.depth, frame, durationInFrames);
  // Defensive defaults: a spec rendered outside `validateSceneSpec` (e.g. a bare hand-authored
  // JSON prop) may omit opacity/blur/position entirely — never let a missing field crash a
  // primitive or silently produce NaN styles.
  const opacity = layer.opacity ?? 1;
  const blur = layer.blur ?? 0;
  // TASK 10 UPGRADE — layout system (ENGINE-DEFECTS.md root cause A): every layer's authored
  // position runs through `resolveLayoutPosition` (safe-area clamp + baseline-grid snap) before it
  // ever reaches a primitive, so a guessed decimal never lands a few px off — see
  // `../primitives/layout.ts` for the full rationale.
  const rawPosition = layer.position ?? DEFAULT_POSITION;
  const position = resolveLayoutPosition(rawPosition, width, height);

  const resolvedEnter = resolveEnter(layer.enter, durationInFrames);

  // Fixed composition order (per the design spec): kenBurns transform -> element -> mask clip ->
  // depth-of-field blur -> motion-blur/trail -> lighting-sweep overlay -> opacity/position
  // wrapper. Every primitive already applies its OWN `opacity`/`blur` props internally at the
  // exact point it draws itself at `position` (see Text/Image/Shape/etc — there is no separate
  // "blur the whole subtree" wrapper for authored blur), so DOF blur + motion blur + the
  // authored `layer.blur` are combined into ONE `totalBlur` value and threaded into
  // `primitiveProps` BEFORE building the JSX tree below — this still honors the fixed order
  // visually (DOF/motion-blur apply to "the element" exactly where the spec's order says they
  // should), it's just computed early because that's where the primitive contract requires it.
  const dofBlurPx = applyDepthOfField(layer.depth, camera, frame, durationInFrames, rackInvert);
  const motion = applyMotionBlur(layer.motionBlur, frame, fps);
  const totalBlur = blur + dofBlurPx + motion.blurPx;

  const primitiveProps: PrimitiveProps = {
    props: layer.props,
    frame,
    fps,
    width,
    height,
    opacity,
    blur: totalBlur,
    position,
    enter: resolvedEnter,
    style: layer.style,
  };

  // 1) Ken Burns — slow push/drift/zoom transform on the element itself (image/video content
  // moving within its own frame), independent of the beat camera. Wraps the primitive in a
  // full-frame `inset:0` div so the transform doesn't disturb the primitive's own internal
  // `position`-based placement (every primitive positions itself via `left/top: position * 100%`
  // relative to a full-size ancestor, per PrimitiveProps convention).
  const kenBurnsTransform = applyKenBurns(layer.kenBurns, frame, durationInFrames);

  // 2) element — the primitive (already rendering with the combined DOF/motion/authored blur
  // baked in via primitiveProps.blur above), wrapped by its Ken Burns transform.
  let content: React.ReactNode = (
    <div style={{ position: "absolute", inset: 0, transform: kenBurnsTransform, transformOrigin: "50% 50%" }}>
      <Primitive {...primitiveProps} />
    </div>
  );

  // 3) mask clip — explicit `layer.mask`, OR the implicit default when the layer's entrance is
  // `maskReveal` (the interpreter must make `enter.anim === "maskReveal"` actually clip, not just
  // read as an unimplemented enum value).
  const effectiveMask = layer.mask ?? (resolvedEnter.anim === "maskReveal" ? DEFAULT_MASK_REVEAL : undefined);
  if (effectiveMask) {
    content = (
      <Mask
        shape={effectiveMask.shape}
        reveal={effectiveMask.reveal}
        frame={frame}
        fps={fps}
        width={width}
        height={height}
        delay={resolvedEnter.delay ?? 0}
      >
        {content}
      </Mask>
    );
  }

  // 5) motion-blur / trail — velocity-estimated directional ghost trail composited BEHIND the
  // (already-masked, already-blurred-via-primitiveProps) element when the layer is still moving
  // fast out of its entrance spring. The blur itself is already folded into `totalBlur` above
  // (passed through to the primitive), so this step only adds the trailing duplicate. `mainContent`
  // holds the pre-trail node so the ghost and the "real" element are two independently-keyed
  // fragment children, not the same element reference reused twice.
  if (motion.ghostOpacity > 0) {
    const mainContent = content;
    content = (
      <>
        <div
          key="ghost"
          style={{
            position: "absolute",
            inset: 0,
            opacity: motion.ghostOpacity,
            transform: `translate(${motion.ghostOffsetX}px, ${motion.ghostOffsetY}px)`,
          }}
        >
          {mainContent}
        </div>
        <div key="main" style={{ position: "absolute", inset: 0 }}>
          {mainContent}
        </div>
      </>
    );
  }

  // 6) lighting-sweep overlay — a specular diagonal band composited above the (now masked/
  // trailed) element.
  const sweep = applyLightingSweep(layer.lightingSweep, frame, fps, width);
  if (sweep) {
    content = (
      <div style={{ position: "absolute", inset: 0 }}>
        {content}
        <div style={sweep.style} />
      </div>
    );
  }

  // 7) opacity/position wrapper — the OUTERMOST wrapper: full-frame so the primitive's own
  // `position`-relative placement resolves correctly, plus the parallax depth offset and (if this
  // layer authored `exit.anim === "glitch"`) the glitch exit burst composited as the final wrapper
  // style so it visibly affects the whole layer as it exits. Layer-level `opacity` is already
  // folded into `primitiveProps.opacity` above (every primitive multiplies its own entrance-driven
  // opacity by the passed-in `opacity`), so it's not reapplied here — only the glitch burst's own
  // opacity (an independent EXIT effect, not the authored layer opacity) touches this wrapper.
  const glitchStyle = glitchExitStyle(layer.exit, frame);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: parallaxPx ? `translateX(${parallaxPx}px)` : undefined,
        ...glitchStyle,
      }}
    >
      {content}
    </div>
  );
};

/**
 * Full visual content of one beat (background + camera + layers), independent of *when* it's
 * mounted on the timeline. `frame` is LOCAL to the beat (0 at the beat's first frame) so the same
 * component renders correctly whether it's the "incoming" or "outgoing" side of a transition
 * overlap, or playing standalone mid-beat.
 */
const BeatContent: React.FC<{ beat: Beat; fps: number; width: number; height: number; frame: number; beatIndex: number }> = ({
  beat,
  fps,
  width,
  height,
  frame,
  beatIndex,
}) => {
  const camera = resolveCamera(beat.camera);
  const rackInvert = beatIndex % 2 === 1; // alternate rack-focus direction beat to beat for variety

  return (
    <AbsoluteFill style={{ backgroundColor: TOKENS.black }}>
      {/* z-order lowest -> highest: flat black fallback, background (grid/glow/solid/parallax),
          ambient particles, then authored layers on top (under the Camera transform so they read
          as part of the same shot). Plain DOM order = paint order here, no z-index needed. */}
      <BeatBackground background={beat.background} frame={frame} fps={fps} width={width} height={height} />
      <AmbientParticles background={beat.background} frame={frame} fps={fps} width={width} height={height} />
      <Camera camera={camera} frame={frame} durationInFrames={beat.durationInFrames}>
        {beat.layers.map((layer, i) => (
          <BeatLayer
            key={i}
            layer={layer}
            frame={frame}
            fps={fps}
            width={width}
            height={height}
            camera={camera}
            durationInFrames={beat.durationInFrames}
            rackInvert={rackInvert}
          />
        ))}
      </Camera>
    </AbsoluteFill>
  );
};

/**
 * One beat's Sequence body. `overlapStart` is how many frames from the END of this beat the NEXT
 * beat's transition-in begins overlapping (0 if this is the last beat or its transitionOut is
 * "cut"). During that tail window this component fades/wipes/pushes itself out per
 * `applyTransition`'s `outgoing` style. Symmetrically, `leadIn` is how many frames this beat's
 * OWN Sequence was pulled earlier to overlap the PREVIOUS beat's tail — during that head window
 * it renders the `incoming` style of the previous beat's transitionOut.
 */
const BeatSequence: React.FC<{
  beat: Beat;
  fps: number;
  width: number;
  height: number;
  beatIndex: number;
  outgoingTransition?: TransitionOut;
  incomingTransition?: TransitionOut;
  leadIn: number;
}> = ({ beat, fps, width, height, beatIndex, outgoingTransition, incomingTransition, leadIn }) => {
  const seqFrame = useCurrentFrame();
  // seqFrame is local to this Sequence, which starts `leadIn` frames before the beat's "true"
  // start (0 = the moment the previous beat would have hard-cut). Local beat time is therefore
  // shifted back by leadIn during the lead-in window, then proceeds normally.
  const localFrame = seqFrame - leadIn;

  const tailStart = beat.durationInFrames - TRANSITION_FRAMES;
  const inOverlap = incomingTransition && incomingTransition.kind !== "cut" && seqFrame < leadIn;
  const outOverlap = outgoingTransition && outgoingTransition.kind !== "cut" && localFrame >= tailStart;

  let wrapperStyle: React.CSSProperties = {};
  let overlay: (React.CSSProperties & { content?: React.ReactNode }) | undefined;

  if (inOverlap) {
    const progress = interpolate(seqFrame, [0, leadIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const styles = applyTransition(incomingTransition!.kind, progress, incomingTransition!.accent);
    wrapperStyle = styles.incoming;
    overlay = styles.overlay;
  } else if (outOverlap) {
    const progress = interpolate(localFrame, [tailStart, beat.durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const styles = applyTransition(outgoingTransition!.kind, progress, outgoingTransition!.accent);
    wrapperStyle = styles.outgoing;
    overlay = styles.overlay;
  }

  // Clamp local frame into [0, durationInFrames] so content driven by `frame` (camera progress,
  // entrance springs) never sees negative time during a lead-in window.
  const clampedLocal = Math.max(0, Math.min(beat.durationInFrames, localFrame));

  // Forensic delta #2: HeroDemo fades each beat's CONTENT out over its final ~18 frames (its
  // `outFade`) so a beat RESOLVES rather than abruptly stops. We apply the same content-level fade
  // — but ONLY when this beat's own transitionOut is a hard "cut" (or it's the last beat). For any
  // animated transition the overlap/wipe already carries the resolve, and double-fading would
  // dim the crossover. This gives cut-endings and the film's final beat hero's graceful exit.
  const OUT_FADE_FRAMES = 18;
  const isLastBeat = !outgoingTransition || outgoingTransition.kind === "cut";
  const contentFade = isLastBeat
    ? interpolate(localFrame, [beat.durationInFrames - OUT_FADE_FRAMES, beat.durationInFrames], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{ ...wrapperStyle, opacity: (wrapperStyle.opacity as number | undefined ?? 1) * contentFade }}>
      <BeatContent beat={beat} fps={fps} width={width} height={height} frame={clampedLocal} beatIndex={beatIndex} />
      {overlay && <div style={overlay}>{overlay.content}</div>}
    </AbsoluteFill>
  );
};

export const Generative: React.FC<GenerativeProps> = ({ spec }) => {
  const { width, height } = dimsForAspect(spec.meta.aspect);
  const fps = spec.meta.fps;

  // Compute each beat's "true" start (as if hard-cut back-to-back), then pull each beat's
  // Sequence start earlier by its transition-in overlap (driven by the PREVIOUS beat's
  // transitionOut) so it renders under the previous beat's tail instead of after it — this is
  // what removes the hard cut. Beats overlap by TRANSITION_FRAMES; the actual overlap used is
  // also clamped so it never exceeds either beat's own duration (avoids negative Sequence
  // durations on very short beats).
  let trueStart = 0;
  const layout = spec.beats.map((beat, i) => {
    const prevBeat = i > 0 ? spec.beats[i - 1] : undefined;
    const prevTransition = prevBeat?.transitionOut;
    const usesOverlap = prevTransition && prevTransition.kind !== "cut";
    const overlap = usesOverlap
      ? Math.max(0, Math.min(TRANSITION_FRAMES, Math.floor(beat.durationInFrames / 2), Math.floor((prevBeat?.durationInFrames ?? 0) / 2)))
      : 0;

    const seqFrom = trueStart - overlap;
    const seqDuration = beat.durationInFrames + overlap;
    trueStart += beat.durationInFrames;

    return {
      beat,
      from: Math.max(0, seqFrom),
      durationInFrames: seqDuration,
      leadIn: overlap,
      incomingTransition: usesOverlap ? prevTransition : undefined,
      outgoingTransition: beat.transitionOut,
    };
  });

  const sequences = layout.map((entry, i) => (
    <Sequence key={i} from={entry.from} durationInFrames={entry.durationInFrames}>
      <BeatSequence
        beat={entry.beat}
        fps={fps}
        width={width}
        height={height}
        beatIndex={i}
        outgoingTransition={entry.outgoingTransition}
        incomingTransition={entry.incomingTransition}
        leadIn={entry.leadIn}
      />
    </Sequence>
  ));

  return <AbsoluteFill style={{ backgroundColor: TOKENS.black }}>{sequences}</AbsoluteFill>;
};
