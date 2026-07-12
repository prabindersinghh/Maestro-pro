// SceneSpec — the declarative contract the agent emits to describe a generated video. Pure module:
// no rendering, no imports beyond Node/TS. `validateSceneSpec` is the single trusted gate between
// agent-authored JSON and the Generative.tsx interpreter — it never throws, and on failure it names
// the exact offending path so the agent can self-correct and retry (fail loud, never silent-substitute).
// See docs/superpowers/specs/2026-07-12-generative-motion-engine-design.md for the full design.

// ---------------------------------------------------------------------------
// Closed enums (exported for reuse by later tasks: Generative.tsx, compose_motion tool, etc.)
// ---------------------------------------------------------------------------

export const ELEMENTS = [
  "text", "textOnPath", "video", "image", "screenMock", "waveform", "timeline", "logo",
  "shape", "hairline", "barChart", "lineChart", "areaChart", "counter",
  "captionKaraoke", "particles", "arrow", "highlightBox", "pointerLine", "spotlightDim",
  "splitLayout", "gridLayout", "countdown",
] as const;

export const ANIMS = [
  "spring", "typewriter", "wordReveal", "kinetic", "draw", "fade", "collapse", "maskReveal",
] as const;

export const EASINGS = ["ease-out", "spring", "linear"] as const;

export const CAMERA_MOVES = ["push-in", "pan-left", "pan-right", "rack", "parallax", "none"] as const;

export const BG_KINDS = ["grid", "glow", "parallax", "solid"] as const;

export const TRANSITIONS = ["wipe", "dissolve", "push", "glitch", "rgbSplit", "cut"] as const;

export const MASK_SHAPES = ["circle", "pill", "rect", "logo", "wipe"] as const;

export const STYLE_ROLES = ["display", "accent", "muted"] as const;

export const ASPECTS = ["16:9", "9:16", "1:1"] as const;

// Additional closed enums used by nested modifier fields (per the SceneSpec block in the design spec).
const EXIT_ANIMS = ["fade", "collapse", "glitch", "none"] as const;
const ENTER_FROM = ["below", "left", "scale"] as const;
const MASK_REVEALS = ["left", "up", "iris", "none"] as const;
const KEN_BURNS_MOVES = ["push", "drift", "zoom", "none"] as const;

// ---------------------------------------------------------------------------
// Brand tokens (single source of truth per Global Constraints)
// ---------------------------------------------------------------------------

export const BRAND_TOKENS: Record<string, string> = {
  black: "#0b0a0d",
  green: "#16b16a",
  greenLight: "#1fce7e",
  goldHairline: "rgba(201,162,39,0.55)",
  whiteHairline: "rgba(255,255,255,0.10)",
  slate: "#484852",
  slateDark: "#2b2931",
};

const HEX_COLOR_RE = /^#([0-9a-f]{6})$/i;

/** True if `c` matches a brand token value verbatim, or is a plain `#rrggbb` hex color. */
export function isAllowedColor(c: string): boolean {
  if (typeof c !== "string") return false;
  if (Object.values(BRAND_TOKENS).includes(c)) return true;
  return HEX_COLOR_RE.test(c);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneMeta {
  aspect: (typeof ASPECTS)[number];
  fps: number;
  brand: string;
  beatMarkers?: number[];
}

export interface Enter {
  anim: (typeof ANIMS)[number];
  easing: (typeof EASINGS)[number];
  delay: number;
  from: (typeof ENTER_FROM)[number];
  snapToBeat: boolean;
}

export interface Exit {
  anim: (typeof EXIT_ANIMS)[number];
  at: number;
}

export interface LayerStyle {
  role: (typeof STYLE_ROLES)[number];
  size: number;
}

export interface Camera {
  move: (typeof CAMERA_MOVES)[number];
  amount: number;
}

export interface Background {
  kind: (typeof BG_KINDS)[number];
  accent: string;
}

export interface TransitionOut {
  kind: (typeof TRANSITIONS)[number];
  accent: string;
  snapToBeat: boolean;
}

export interface Mask {
  shape: (typeof MASK_SHAPES)[number];
  reveal: (typeof MASK_REVEALS)[number];
}

export interface KenBurns {
  move: (typeof KEN_BURNS_MOVES)[number];
  amount: number;
}

export interface LightingSweep {
  on: boolean;
  angle: number;
  speed: number;
}

export interface Layer {
  element: (typeof ELEMENTS)[number];
  props: Record<string, unknown>;
  position: { x: number; y: number };
  opacity: number;
  blur: number;
  depth: "foreground" | "mid" | "background";
  mask?: Mask;
  motionBlur: boolean;
  kenBurns?: KenBurns;
  lightingSweep?: LightingSweep;
  enter?: Enter;
  exit?: Exit;
  style?: LayerStyle;
}

export interface Beat {
  durationInFrames: number;
  camera?: Camera;
  background?: Background;
  layers: Layer[];
  transitionOut?: TransitionOut;
}

export interface SceneSpec {
  meta: SceneMeta;
  beats: Beat[];
}

export type ValidationResult =
  | { ok: true; spec: SceneSpec }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clamp a number into [min,max]; falls back to `def` if `n` isn't a finite number. */
function clamp(n: unknown, min: number, max: number, def: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : def;
  return Math.min(max, Math.max(min, v));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class ValidationError extends Error {
  constructor(public path: string, msg: string) {
    super(`${path}: ${msg}`);
  }
}

function fail(path: string, msg: string): never {
  throw new ValidationError(path, msg);
}

function checkEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  path: string
): T[number] {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(path, `unknown value '${String(value)}' (allowed: ${allowed.join(", ")})`);
  }
  return value as T[number];
}

function checkColor(value: unknown, path: string): string {
  if (typeof value !== "string" || !isAllowedColor(value)) {
    fail(path, `disallowed color '${String(value)}' (must be a brand token or #rrggbb hex)`);
  }
  return value;
}

/**
 * Rejects any key on `obj` that isn't in `known`. Enforces the design spec's normative
 * "Unknown field → validation error" rule at a single object level (fail loud, never
 * silent-substitute — a typo'd key like `oppacity` must not be silently dropped).
 * Intentionally NOT applied inside a layer's free-form `props` bag, which is per-element
 * and not part of the structural spec.
 */
function checkUnknownKeys(obj: Record<string, unknown>, known: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      fail(path, `unknown field '${key}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// Nested validators — each returns a fully-defaulted, clamped object or throws ValidationError.
// ---------------------------------------------------------------------------

const POSITION_KEYS = ["x", "y"] as const;
const CAMERA_KEYS = ["move", "amount"] as const;
const BACKGROUND_KEYS = ["kind", "accent"] as const;
const TRANSITION_OUT_KEYS = ["kind", "accent", "snapToBeat"] as const;
const MASK_KEYS = ["shape", "reveal"] as const;
const KEN_BURNS_KEYS = ["move", "amount"] as const;
const LIGHTING_SWEEP_KEYS = ["on", "angle", "speed"] as const;
const ENTER_KEYS = ["anim", "easing", "delay", "from", "snapToBeat"] as const;
const EXIT_KEYS = ["anim", "at"] as const;
const STYLE_KEYS = ["role", "size"] as const;

function validatePosition(value: unknown, path: string): { x: number; y: number } {
  if (value === undefined) return { x: 0.5, y: 0.5 };
  if (!isPlainObject(value)) fail(path, "must be an object {x,y}");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, POSITION_KEYS, path);
  return {
    x: clamp(obj.x, 0, 1, 0.5),
    y: clamp(obj.y, 0, 1, 0.5),
  };
}

function validateCamera(value: unknown, path: string): Camera | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, CAMERA_KEYS, path);
  const move = checkEnum(obj.move, CAMERA_MOVES, `${path}.move`);
  const amount = clamp(obj.amount, 0, 0.3, 0);
  return { move, amount };
}

function validateBackground(value: unknown, path: string): Background | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, BACKGROUND_KEYS, path);
  const kind = checkEnum(obj.kind, BG_KINDS, `${path}.kind`);
  const accent = checkColor(obj.accent, `${path}.accent`);
  return { kind, accent };
}

function validateTransitionOut(value: unknown, path: string): TransitionOut | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, TRANSITION_OUT_KEYS, path);
  const kind = checkEnum(obj.kind, TRANSITIONS, `${path}.kind`);
  const accent = obj.accent === undefined ? BRAND_TOKENS.green : checkColor(obj.accent, `${path}.accent`);
  const snapToBeat = obj.snapToBeat === undefined ? false : Boolean(obj.snapToBeat);
  return { kind, accent, snapToBeat };
}

function validateMask(value: unknown, path: string): Mask | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, MASK_KEYS, path);
  const shape = checkEnum(obj.shape, MASK_SHAPES, `${path}.shape`);
  const reveal = obj.reveal === undefined ? "none" : checkEnum(obj.reveal, MASK_REVEALS, `${path}.reveal`);
  return { shape, reveal };
}

function validateKenBurns(value: unknown, path: string): KenBurns | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, KEN_BURNS_KEYS, path);
  const move = checkEnum(obj.move, KEN_BURNS_MOVES, `${path}.move`);
  const amount = clamp(obj.amount, 0, 0.3, 0.08);
  return { move, amount };
}

function validateLightingSweep(value: unknown, path: string): LightingSweep | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, LIGHTING_SWEEP_KEYS, path);
  const on = obj.on === undefined ? false : Boolean(obj.on);
  const angle = clamp(obj.angle, 0, 360, 20);
  const speed = clamp(obj.speed, 0, 10, 1);
  return { on, angle, speed };
}

function validateEnter(value: unknown, path: string): Enter | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, ENTER_KEYS, path);
  const anim = checkEnum(obj.anim, ANIMS, `${path}.anim`);
  const easing = obj.easing === undefined ? "ease-out" : checkEnum(obj.easing, EASINGS, `${path}.easing`);
  const delay = clamp(obj.delay, 0, 600, 0);
  const from = obj.from === undefined ? "below" : checkEnum(obj.from, ENTER_FROM, `${path}.from`);
  const snapToBeat = obj.snapToBeat === undefined ? false : Boolean(obj.snapToBeat);
  return { anim, easing, delay, from, snapToBeat };
}

function validateExit(value: unknown, path: string): Exit | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, EXIT_KEYS, path);
  const anim = checkEnum(obj.anim, EXIT_ANIMS, `${path}.anim`);
  const at = clamp(obj.at, 0, 600, 60);
  return { anim, at };
}

function validateStyle(value: unknown, path: string): LayerStyle | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, STYLE_KEYS, path);
  const role = checkEnum(obj.role, STYLE_ROLES, `${path}.role`);
  const size = clamp(obj.size, 0.01, 0.4, 0.09);
  return { role, size };
}

const LAYER_KEYS = [
  "element", "props", "position", "opacity", "blur", "depth", "mask", "motionBlur",
  "kenBurns", "lightingSweep", "enter", "exit", "style",
] as const;

function validateLayer(value: unknown, path: string): Layer {
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, LAYER_KEYS, path);

  const element = checkEnum(obj.element, ELEMENTS, `${path}.element`);
  const props = isPlainObject(obj.props) ? (obj.props as Record<string, unknown>) : {};
  const position = validatePosition(obj.position, `${path}.position`);
  const opacity = clamp(obj.opacity, 0, 1, 1);
  const blur = clamp(obj.blur, 0, 24, 0);
  const depth =
    obj.depth === undefined
      ? "mid"
      : checkEnum(obj.depth, ["foreground", "mid", "background"] as const, `${path}.depth`);
  const motionBlur = obj.motionBlur === undefined ? false : Boolean(obj.motionBlur);

  const mask = validateMask(obj.mask, `${path}.mask`);
  const kenBurns = validateKenBurns(obj.kenBurns, `${path}.kenBurns`);
  const lightingSweep = validateLightingSweep(obj.lightingSweep, `${path}.lightingSweep`);
  const enter = validateEnter(obj.enter, `${path}.enter`);
  const exit = validateExit(obj.exit, `${path}.exit`);
  const style = validateStyle(obj.style, `${path}.style`);

  const layer: Layer = {
    element,
    props,
    position,
    opacity,
    blur,
    depth,
    motionBlur,
  };
  if (mask !== undefined) layer.mask = mask;
  if (kenBurns !== undefined) layer.kenBurns = kenBurns;
  if (lightingSweep !== undefined) layer.lightingSweep = lightingSweep;
  if (enter !== undefined) layer.enter = enter;
  if (exit !== undefined) layer.exit = exit;
  if (style !== undefined) layer.style = style;

  return layer;
}

const BEAT_KEYS = ["durationInFrames", "camera", "background", "layers", "transitionOut"] as const;

function validateBeat(value: unknown, path: string): Beat {
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, BEAT_KEYS, path);

  const durationInFrames = clamp(obj.durationInFrames, 8, 600, 60);

  if (!Array.isArray(obj.layers) || obj.layers.length === 0) {
    fail(`${path}.layers`, "must be a non-empty array");
  }
  const layers = (obj.layers as unknown[]).map((l, i) => validateLayer(l, `${path}.layers[${i}]`));

  const camera = validateCamera(obj.camera, `${path}.camera`);
  const background = validateBackground(obj.background, `${path}.background`);
  const transitionOut = validateTransitionOut(obj.transitionOut, `${path}.transitionOut`);

  const beat: Beat = { durationInFrames, layers };
  if (camera !== undefined) beat.camera = camera;
  if (background !== undefined) beat.background = background;
  if (transitionOut !== undefined) beat.transitionOut = transitionOut;

  return beat;
}

const META_KEYS = ["aspect", "fps", "brand", "beatMarkers"] as const;

// Upper bound for beatMarkers frame indices: at 120fps (the max meta.fps allowed above) this is
// ~833s / ~13.9min of runway, comfortably beyond any realistic single generated clip. Ties the
// clamp to the same "generous but not unbounded" rationale as the other numeric clamps in this
// file rather than leaving 100000 as a magic number.
const MAX_BEAT_MARKER_FRAME = 100000;

function validateMeta(value: unknown, path: string): SceneMeta {
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, META_KEYS, path);

  const aspect = checkEnum(obj.aspect, ASPECTS, `${path}.aspect`);
  const fps = clamp(obj.fps, 1, 120, 30);

  if (obj.brand !== undefined && typeof obj.brand !== "string") {
    fail(`${path}.brand`, `must be a string, got '${String(obj.brand)}'`);
  }
  const brand = obj.brand === undefined ? "kaestral" : obj.brand;

  const meta: SceneMeta = { aspect, fps, brand };

  if (obj.beatMarkers !== undefined) {
    if (!Array.isArray(obj.beatMarkers)) {
      fail(`${path}.beatMarkers`, "must be an array of frame indices");
    }
    const rawMarkers = obj.beatMarkers as unknown[];
    // Validate each entry is actually numeric so garbage doesn't silently become 0.
    rawMarkers.forEach((v, i) => {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        fail(`${path}.beatMarkers[${i}]`, `must be a finite number, got '${String(v)}'`);
      }
    });
    meta.beatMarkers = rawMarkers.map((v) => clamp(v, 0, MAX_BEAT_MARKER_FRAME, 0));
  }

  return meta;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes an unknown value into a `SceneSpec`. Never throws — all validation
 * failures are caught and surfaced as `{ ok:false, error }`, where `error` names the exact
 * offending path (e.g. `"beats[0].layers[2].element: unknown value 'foo' (allowed: text, ...)"`).
 * On success, all numeric fields are clamped into range and all defaults are filled in.
 */
const SCENE_SPEC_KEYS = ["meta", "beats"] as const;

export function validateSceneSpec(input: unknown): ValidationResult {
  try {
    if (!isPlainObject(input)) {
      fail("$", "SceneSpec must be an object");
    }
    const obj = input as Record<string, unknown>;
    checkUnknownKeys(obj, SCENE_SPEC_KEYS, "$");

    const meta = validateMeta(obj.meta, "meta");

    if (!Array.isArray(obj.beats) || obj.beats.length === 0) {
      fail("beats", "must be a non-empty array");
    }
    const beats = (obj.beats as unknown[]).map((b, i) => validateBeat(b, `beats[${i}]`));

    const spec: SceneSpec = { meta, beats };
    return { ok: true, spec };
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: `unexpected error: ${e instanceof Error ? e.message : String(e)}` };
  }
}
