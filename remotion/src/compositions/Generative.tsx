import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { REGISTRY, Grid, GlowField } from "../primitives";
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

export interface SceneMeta {
  aspect: "16:9" | "9:16" | "1:1";
  fps: number;
  brand?: string;
  beatMarkers?: number[];
}

export interface Camera {
  move: "push-in" | "pan-left" | "pan-right" | "rack" | "parallax" | "none";
  amount: number;
}

export interface Background {
  kind: "grid" | "glow" | "parallax" | "solid";
  accent: string;
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
  camera?: Camera;
  background?: Background;
  layers: Layer[];
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

/** Renders a beat's `background` field (kind -> Grid/GlowField/solid/parallax). */
const BeatBackground: React.FC<{ background?: Beat["background"]; frame: number; fps: number; width: number; height: number }> = ({
  background,
  frame,
  fps,
  width,
  height,
}) => {
  if (!background) return null;
  const basePrimitiveProps: PrimitiveProps = {
    props: { accent: background.accent },
    frame,
    fps,
    width,
    height,
    opacity: 1,
    blur: 0,
    position: { x: 0.5, y: 0.5 },
  };
  if (background.kind === "grid") return <Grid {...basePrimitiveProps} />;
  if (background.kind === "glow" || background.kind === "parallax") return <GlowField {...basePrimitiveProps} />;
  // "solid" — flat fill in the accent color
  return <AbsoluteFill style={{ backgroundColor: tokenColor(background.accent) }} />;
};

/**
 * Simple inline camera treatment (push-in / pan) via interpolate on scale/translate.
 * Full Camera primitive lands in Task 6 — this stays minimal on purpose.
 */
function cameraStyle(camera: Beat["camera"] | undefined, frame: number, durationInFrames: number): React.CSSProperties {
  if (!camera || camera.move === "none" || camera.amount <= 0) return {};
  const t = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (camera.move === "push-in") {
    const scale = interpolate(t, [0, 1], [1, 1 + camera.amount]);
    return { transform: `scale(${scale})`, transformOrigin: "50% 50%" };
  }
  if (camera.move === "pan-left" || camera.move === "pan-right") {
    const dir = camera.move === "pan-left" ? -1 : 1;
    const shiftPct = camera.amount * 100 * dir;
    const translate = interpolate(t, [0, 1], [0, shiftPct]);
    return { transform: `translateX(${translate}%)` };
  }
  // "rack" / "parallax" fall back to a gentle push-in until Task 6 differentiates them.
  const scale = interpolate(t, [0, 1], [1, 1 + camera.amount * 0.5]);
  return { transform: `scale(${scale})`, transformOrigin: "50% 50%" };
}

const BeatLayer: React.FC<{ layer: Layer; frame: number; fps: number; width: number; height: number }> = ({
  layer,
  frame,
  fps,
  width,
  height,
}) => {
  const Primitive = REGISTRY[layer.element];
  if (!Primitive) return null;

  const primitiveProps: PrimitiveProps = {
    props: layer.props,
    frame,
    fps,
    width,
    height,
    opacity: layer.opacity,
    blur: layer.blur,
    position: layer.position,
    enter: layer.enter,
    style: layer.style,
  };

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Primitive {...primitiveProps} />
    </div>
  );
};

const BeatSequence: React.FC<{ beat: Beat; fps: number; width: number; height: number }> = ({ beat, fps, width, height }) => {
  const frame = useCurrentFrame();
  const camStyle = cameraStyle(beat.camera, frame, beat.durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: TOKENS.black }}>
      <BeatBackground background={beat.background} frame={frame} fps={fps} width={width} height={height} />
      <AbsoluteFill style={camStyle}>
        {beat.layers.map((layer, i) => (
          <BeatLayer key={i} layer={layer} frame={frame} fps={fps} width={width} height={height} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Generative: React.FC<GenerativeProps> = ({ spec }) => {
  const { width, height } = dimsForAspect(spec.meta.aspect);
  const fps = spec.meta.fps;

  let offset = 0;
  const sequences = spec.beats.map((beat, i) => {
    const from = offset;
    offset += beat.durationInFrames;
    return (
      <Sequence key={i} from={from} durationInFrames={beat.durationInFrames}>
        <BeatSequence beat={beat} fps={fps} width={width} height={height} />
      </Sequence>
    );
  });

  return <AbsoluteFill style={{ backgroundColor: TOKENS.black }}>{sequences}</AbsoluteFill>;
};
