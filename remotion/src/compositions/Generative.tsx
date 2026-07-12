import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { REGISTRY, Grid, GlowField, Particles, Camera, DEFAULT_CAMERA, parallaxOffset, rackBlurFor, applyTransition, TRANSITION_FRAMES } from "../primitives";
import type { CameraSpec, TransitionKind } from "../primitives";
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

export interface Layer {
  element: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  opacity: number;
  blur: number;
  depth?: "foreground" | "mid" | "background";
  motionBlur?: boolean;
  enter?: EnterSpec;
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

/** Opacity for the always-on ambient Particles field behind authored layers (critique #4). */
const AMBIENT_PARTICLES_OPACITY = 0.3;

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

  if (background.kind === "grid") return <Grid {...basePrimitiveProps} />;
  if (background.kind === "glow" || background.kind === "parallax") return <GlowField {...basePrimitiveProps} />;
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
 */
function resolveEnter(enter: EnterSpec | undefined): EnterSpec {
  if (!enter) return { anim: "spring", easing: "spring", from: "below" };
  const easing = enter.easing ?? "spring";
  const anim = enter.anim ?? (easing === "linear" ? "fade" : "spring");
  return { ...enter, anim, easing };
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

  // Per-depth parallax offset + rack-focus blur, layered on top of the layer's authored blur —
  // this is what makes "rack" / "parallax" camera moves visibly differ per depth plane rather
  // than moving the whole frame as one flat slab.
  const parallaxPx = parallaxOffset(camera, layer.depth, frame, durationInFrames);
  const rackBlurPx = rackBlurFor(camera, layer.depth, frame, durationInFrames, rackInvert);
  // Defensive defaults: a spec rendered outside `validateSceneSpec` (e.g. a bare hand-authored
  // JSON prop) may omit opacity/blur/position entirely — never let a missing field crash a
  // primitive or silently produce NaN styles.
  const opacity = layer.opacity ?? 1;
  const blur = layer.blur ?? 0;
  const position = layer.position ?? DEFAULT_POSITION;
  const totalBlur = blur + rackBlurPx;

  const primitiveProps: PrimitiveProps = {
    props: layer.props,
    frame,
    fps,
    width,
    height,
    opacity,
    blur: totalBlur,
    position,
    enter: resolveEnter(layer.enter),
    style: layer.style,
  };

  return (
    <div style={{ position: "absolute", inset: 0, transform: parallaxPx ? `translateX(${parallaxPx}px)` : undefined }}>
      <Primitive {...primitiveProps} />
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

  return (
    <AbsoluteFill style={wrapperStyle}>
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
