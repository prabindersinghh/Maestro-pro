// SceneSpec — the declarative contract the agent emits to describe a generated video. Pure module:
// no rendering, only node:path beyond Node/TS. `validateSceneSpec` is the single trusted gate between
// agent-authored JSON and the Generative.tsx interpreter — it never throws, and on failure it names
// the exact offending path so the agent can self-correct and retry (fail loud, never silent-substitute).
// See docs/superpowers/specs/2026-07-12-generative-motion-engine-design.md for the full design.

import { normalize } from "node:path";

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
  "spring", "typewriter", "wordReveal", "wordStagger", "kinetic", "draw", "fade", "collapse", "maskReveal",
] as const;

export const EASINGS = ["ease-out", "spring", "linear"] as const;

export const CAMERA_MOVES = ["push-in", "pan-left", "pan-right", "rack", "parallax", "none"] as const;

export const BG_KINDS = ["grid", "glow", "parallax", "solid"] as const;

export const TRANSITIONS = ["wipe", "dissolve", "push", "glitch", "rgbSplit", "cut"] as const;

export const MASK_SHAPES = ["circle", "pill", "rect", "logo", "wipe"] as const;

export const STYLE_ROLES = ["display", "accent", "muted"] as const;

// Task 6b1: text anchor (horizontal placement relative to `position.x`) and mono font opt-in.
export const STYLE_ANCHORS = ["left", "center", "right"] as const;

export const STYLE_FONTS = ["sans", "mono"] as const;

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

export interface SpringConfig {
  damping: number;
  mass: number;
  stiffness: number;
}

export interface Enter {
  anim: (typeof ANIMS)[number];
  easing: EasingSpec;
  delay: number;
  from: (typeof ENTER_FROM)[number];
  snapToBeat: boolean;
  durationFrames?: number;
  spring?: SpringConfig;
}

export interface Exit {
  anim: (typeof EXIT_ANIMS)[number];
  at: number;
  easing?: EasingSpec;
  durationFrames?: number;
}

export interface LayerStyle {
  role: (typeof STYLE_ROLES)[number];
  size: number;
  anchor: (typeof STYLE_ANCHORS)[number];
  font: (typeof STYLE_FONTS)[number];
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
  overlapFrames?: number;
  easing?: EasingSpec;
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

export interface Hold {
  startFrame: number;
  durationFrames: number;
}

/**
 * A single scalar property's independent keyframe curve: linear interpolation from `from` to `to`
 * over `[startFrame, startFrame+durationFrames)`, shaped by `easing`. Used for opacity/scale/blur/
 * rotation under `Layer.animate` — the per-property escape hatch for motion that `enter`/`exit`
 * (whole-layer, single-curve) can't express, e.g. an opacity fade on a different timeline than the
 * layer's entrance.
 */
export interface Tween {
  from: number;
  to: number;
  startFrame: number;
  durationFrames: number;
  easing: EasingSpec;
}

/** Same shape as `Tween` but for the 2D `position` property: `from`/`to` are `{x,y}` points. */
export interface PositionTween {
  from: { x: number; y: number };
  to: { x: number; y: number };
  startFrame: number;
  durationFrames: number;
  easing: EasingSpec;
}

export interface Animate {
  position?: PositionTween;
  opacity?: Tween;
  scale?: Tween;
  blur?: Tween;
  rotation?: Tween;
}

export interface Layer {
  element: (typeof ELEMENTS)[number];
  props: Record<string, unknown>;
  position: { x: number; y: number; snap: boolean };
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
  hold?: Hold;
  animate?: Animate;
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

/**
 * Custom easing: either a closed-set preset name (`EASINGS`) or an explicit cubic-bezier curve
 * `{curve:[x1,y1,x2,y2]}`. Lets the agent reach for a bespoke curve when a preset isn't expressive
 * enough, while keeping the common case a plain string. See `resolveEasingToBezier` for the single
 * path both forms render through.
 */
export type EasingSpec = (typeof EASINGS)[number] | { curve: [number, number, number, number] };

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

const POSITION_KEYS = ["x", "y", "snap"] as const;
const CAMERA_KEYS = ["move", "amount"] as const;
const BACKGROUND_KEYS = ["kind", "accent"] as const;
const TRANSITION_OUT_KEYS = ["kind", "accent", "snapToBeat", "overlapFrames", "easing"] as const;
const MASK_KEYS = ["shape", "reveal"] as const;
const KEN_BURNS_KEYS = ["move", "amount"] as const;
const LIGHTING_SWEEP_KEYS = ["on", "angle", "speed"] as const;
const ENTER_KEYS = ["anim", "easing", "delay", "from", "snapToBeat", "durationFrames", "spring"] as const;
const EXIT_KEYS = ["anim", "at", "easing", "durationFrames"] as const;
const SPRING_CONFIG_KEYS = ["damping", "mass", "stiffness"] as const;
const STYLE_KEYS = ["role", "size", "anchor", "font"] as const;
const HOLD_KEYS = ["startFrame", "durationFrames"] as const;
const ANIMATE_KEYS = ["position", "opacity", "scale", "blur", "rotation"] as const;
const TWEEN_KEYS = ["from", "to", "startFrame", "durationFrames", "easing"] as const;
const POSITION_TWEEN_POINT_KEYS = ["x", "y"] as const;

// Per-property clamp range for each scalar tween kind under `animate` — mirrors the corresponding
// static field's own range (opacity/blur match `Layer.opacity`/`Layer.blur`; scale/rotation have no
// static counterpart on `Layer` so their ranges are set generously per the design spec).
const TWEEN_RANGES: Record<"opacity" | "scale" | "blur" | "rotation", [number, number]> = {
  opacity: [0, 1],
  scale: [0, 8],
  blur: [0, 64],
  rotation: [-720, 720],
};

function validatePosition(value: unknown, path: string): { x: number; y: number; snap: boolean } {
  if (value === undefined) return { x: 0.5, y: 0.5, snap: true };
  if (!isPlainObject(value)) fail(path, "must be an object {x,y}");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, POSITION_KEYS, path);
  const snap = obj.snap === undefined ? true : Boolean(obj.snap);
  return {
    x: clamp(obj.x, 0, 1, 0.5),
    y: clamp(obj.y, 0, 1, 0.5),
    snap,
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
  const overlapFrames = obj.overlapFrames === undefined ? undefined : clamp(obj.overlapFrames, 1, 60, 15);
  const easing = obj.easing === undefined ? undefined : validateEasing(obj.easing, `${path}.easing`);
  const transitionOut: TransitionOut = { kind, accent, snapToBeat };
  if (overlapFrames !== undefined) transitionOut.overlapFrames = overlapFrames;
  if (easing !== undefined) transitionOut.easing = easing;
  return transitionOut;
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

/**
 * Validates a spring physics config for `Enter.spring`. Each field is independently clamped
 * (never a loud failure) — a spring config is tuning, not structural, so an out-of-range value
 * is normalized rather than rejected. Returns `undefined` when `value` is absent so the field
 * doesn't get materialized with defaults on layers that never requested a spring.
 */
function validateSpringConfig(value: unknown, path: string): SpringConfig | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, SPRING_CONFIG_KEYS, path);
  const damping = clamp(obj.damping, 1, 40, 15);
  const mass = clamp(obj.mass, 0.1, 5, 1);
  const stiffness = clamp(obj.stiffness, 1, 400, 100);
  return { damping, mass, stiffness };
}

function validateEnter(value: unknown, path: string): Enter | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, ENTER_KEYS, path);
  const anim = checkEnum(obj.anim, ANIMS, `${path}.anim`);
  const easing = validateEasing(obj.easing ?? "ease-out", `${path}.easing`);
  const delay = clamp(obj.delay, 0, 600, 0);
  const from = obj.from === undefined ? "below" : checkEnum(obj.from, ENTER_FROM, `${path}.from`);
  const snapToBeat = obj.snapToBeat === undefined ? false : Boolean(obj.snapToBeat);
  const durationFrames = obj.durationFrames === undefined ? undefined : clamp(obj.durationFrames, 1, 600, 30);
  const spring = validateSpringConfig(obj.spring, `${path}.spring`);
  const enter: Enter = { anim, easing, delay, from, snapToBeat };
  if (durationFrames !== undefined) enter.durationFrames = durationFrames;
  if (spring !== undefined) enter.spring = spring;
  return enter;
}

function validateExit(value: unknown, path: string): Exit | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, EXIT_KEYS, path);
  const anim = checkEnum(obj.anim, EXIT_ANIMS, `${path}.anim`);
  const at = clamp(obj.at, 0, 600, 60);
  const easing = obj.easing === undefined ? undefined : validateEasing(obj.easing, `${path}.easing`);
  const durationFrames = obj.durationFrames === undefined ? undefined : clamp(obj.durationFrames, 1, 600, 30);
  const exit: Exit = { anim, at };
  if (easing !== undefined) exit.easing = easing;
  if (durationFrames !== undefined) exit.durationFrames = durationFrames;
  return exit;
}

function validateStyle(value: unknown, path: string): LayerStyle | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, STYLE_KEYS, path);
  const role = checkEnum(obj.role, STYLE_ROLES, `${path}.role`);
  const size = clamp(obj.size, 0.01, 0.4, 0.09);
  // Present-but-invalid must fail loud (checkEnum throws); absent must yield a materialized
  // default, never undefined — checkEnum itself would fail loud on `undefined` too (it's not a
  // string in the allowed set), so absence is special-cased before reaching checkEnum.
  const anchor = obj.anchor === undefined ? "center" : checkEnum(obj.anchor, STYLE_ANCHORS, `${path}.anchor`);
  const font = obj.font === undefined ? "sans" : checkEnum(obj.font, STYLE_FONTS, `${path}.font`);
  return { role, size, anchor, font };
}

function validateHold(value: unknown, path: string): Hold | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, HOLD_KEYS, path);
  const startFrame = clamp(obj.startFrame, 0, 600, 0);
  const durationFrames = clamp(obj.durationFrames, 0, 600, 0);
  return { startFrame, durationFrames };
}

/**
 * Validates one scalar tween (`opacity`|`scale`|`blur`|`rotation` under `animate`). Unlike most
 * numeric fields in this file, `from`/`to` are checked for finiteness and fail loud rather than
 * silently defaulting — a missing/garbled tween endpoint is a structural error in the agent's
 * output (there's no sane default "from" value), not a tuning knob to clamp away. Once finiteness
 * is confirmed, the value is clamped into the property's own range (see `TWEEN_RANGES`) same as
 * every other numeric field.
 */
function validateTween(value: unknown, path: string, range: [number, number]): Tween {
  if (!isPlainObject(value)) fail(path, "must be an object {from,to,startFrame,durationFrames,easing}");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, TWEEN_KEYS, path);
  if (typeof obj.from !== "number" || !Number.isFinite(obj.from)) {
    fail(`${path}.from`, `must be a finite number, got '${String(obj.from)}'`);
  }
  if (typeof obj.to !== "number" || !Number.isFinite(obj.to)) {
    fail(`${path}.to`, `must be a finite number, got '${String(obj.to)}'`);
  }
  const [min, max] = range;
  const from = clamp(obj.from, min, max, min);
  const to = clamp(obj.to, min, max, max);
  const startFrame = clamp(obj.startFrame, 0, 600, 0);
  const durationFrames = clamp(obj.durationFrames, 0, 600, 30);
  const easing = validateEasing(obj.easing, `${path}.easing`);
  return { from, to, startFrame, durationFrames, easing };
}

/** Validates a single `{x,y}` point for `PositionTween.from`/`.to`, clamped 0..1 per axis. */
function validatePositionTweenPoint(value: unknown, path: string): { x: number; y: number } {
  if (!isPlainObject(value)) fail(path, "must be an object {x,y}");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, POSITION_TWEEN_POINT_KEYS, path);
  if (typeof obj.x !== "number" || !Number.isFinite(obj.x)) {
    fail(`${path}.x`, `must be a finite number, got '${String(obj.x)}'`);
  }
  if (typeof obj.y !== "number" || !Number.isFinite(obj.y)) {
    fail(`${path}.y`, `must be a finite number, got '${String(obj.y)}'`);
  }
  return { x: clamp(obj.x, 0, 1, 0.5), y: clamp(obj.y, 0, 1, 0.5) };
}

/** Validates `animate.position`: a `PositionTween` whose `from`/`to` are `{x,y}` points (0..1 per axis). */
function validatePositionTween(value: unknown, path: string): PositionTween {
  if (!isPlainObject(value)) fail(path, "must be an object {from,to,startFrame,durationFrames,easing}");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, TWEEN_KEYS, path);
  const from = validatePositionTweenPoint(obj.from, `${path}.from`);
  const to = validatePositionTweenPoint(obj.to, `${path}.to`);
  const startFrame = clamp(obj.startFrame, 0, 600, 0);
  const durationFrames = clamp(obj.durationFrames, 0, 600, 30);
  const easing = validateEasing(obj.easing, `${path}.easing`);
  return { from, to, startFrame, durationFrames, easing };
}

/**
 * Validates `Layer.animate`: a bag of independent per-property tweens (`position`/`opacity`/
 * `scale`/`blur`/`rotation`), each on its own timeline — the escape hatch for motion that
 * `enter`/`exit` (whole-layer, single-curve) can't express. Presence of a conflicting `enter`/
 * `exit` animation on the *same* property is NOT checked here (this function only validates
 * shape/ranges) — that cross-field fail-loud check lives in `validateLayer`, after both `animate`
 * and `enter`/`exit` have been parsed, so it can inspect all three together.
 */
function validateAnimate(value: unknown, path: string): Animate | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, ANIMATE_KEYS, path);

  const animate: Animate = {};
  if (obj.position !== undefined) {
    animate.position = validatePositionTween(obj.position, `${path}.position`);
  }
  if (obj.opacity !== undefined) {
    animate.opacity = validateTween(obj.opacity, `${path}.opacity`, TWEEN_RANGES.opacity);
  }
  if (obj.scale !== undefined) {
    animate.scale = validateTween(obj.scale, `${path}.scale`, TWEEN_RANGES.scale);
  }
  if (obj.blur !== undefined) {
    animate.blur = validateTween(obj.blur, `${path}.blur`, TWEEN_RANGES.blur);
  }
  if (obj.rotation !== undefined) {
    animate.rotation = validateTween(obj.rotation, `${path}.rotation`, TWEEN_RANGES.rotation);
  }
  return animate;
}

/**
 * Validates an `EasingSpec`: either a preset string (one of `EASINGS`) or an explicit
 * `{curve:[x1,y1,x2,y2]}` cubic-bezier. Unlike most numeric fields in this file, a malformed curve
 * is a loud failure rather than a silent-substituted default — `clamp`'s NaN-to-default fallback
 * would otherwise mask a badly-shaped agent output as a valid curve, so finiteness is checked
 * explicitly before any clamping happens.
 */
export function validateEasing(value: unknown, path: string): EasingSpec {
  if (typeof value === "string") {
    return checkEnum(value, EASINGS, path);
  }
  if (isPlainObject(value) && Array.isArray(value.curve)) {
    const curve = value.curve as unknown[];
    if (curve.length !== 4 || !curve.every((n) => typeof n === "number" && Number.isFinite(n))) {
      fail(`${path}.curve`, "must be 4 finite numbers");
    }
    const [x1, y1, x2, y2] = curve as number[];
    return {
      curve: [clamp(x1, 0, 1, 0), clamp(y1, -2, 3, 0), clamp(x2, 0, 1, 1), clamp(y2, -2, 3, 1)],
    };
  }
  fail(path, "must be a preset (ease-out|spring|linear) or { curve:[x1,y1,x2,y2] }");
}

const LAYER_KEYS = [
  "element", "props", "position", "opacity", "blur", "depth", "mask", "motionBlur",
  "kenBurns", "lightingSweep", "enter", "exit", "style", "hold", "animate",
] as const;

// Elements whose `props.src` names a real on-disk media file — these are the ones the media-path
// allowlist (see ValidateOpts below) must guard, since they're the only elements that can point the
// renderer at an arbitrary absolute path.
const MEDIA_SRC_ELEMENTS = new Set(["video", "image", "screenMock"]);

/** Normalizes a path for comparison: node:path normalize + lowercase (Windows paths are case-insensitive). */
function normalizeForCompare(p: string): string {
  return normalize(p).toLowerCase();
}

/**
 * Validates that a media-bearing layer's `props.src` (when present and non-empty) resolves to one
 * of the caller-supplied allowed absolute paths. Skipped entirely when `allowedMediaPaths` is
 * undefined (back-compat for callers — e.g. render tests — that don't pass opts). This is the
 * only place SceneSpec validation reaches into a layer's free-form `props` bag, and only to block
 * path traversal / arbitrary filesystem reads, per Task 8's media-path security requirement.
 */
function checkMediaPath(element: string, props: Record<string, unknown>, allowedMediaPaths: string[] | undefined, path: string): void {
  if (allowedMediaPaths === undefined) return;
  if (!MEDIA_SRC_ELEMENTS.has(element)) return;
  const src = props.src;
  if (typeof src !== "string" || src === "") return;
  const normalizedSrc = normalizeForCompare(src);
  const allowed = allowedMediaPaths.some((p) => normalizeForCompare(p) === normalizedSrc);
  if (!allowed) {
    fail(`${path}.props.src`, `not in project media: '${src}'`);
  }
}

export interface ValidateOpts {
  /** Absolute paths of media assets known to the project. When provided, every video/image/
   * screenMock layer's `props.src` (if set) must match one of these exactly (path-normalized,
   * case-insensitive) or validation fails loud, naming the offending path. */
  allowedMediaPaths?: string[];
}

/**
 * Fail-loud conflict guard: rejects a layer whose `animate` block drives a property that
 * `enter`/`exit` ALSO drives, since the interpreter would otherwise have to silently pick a
 * winner (last-write-wins or some other implicit precedence) — exactly the silent-substitute
 * behavior this validator exists to prevent. Must run after `animate`/`enter`/`exit` are all
 * parsed so it can inspect the fully-validated `enter.anim`/`exit.anim` together with `animate`'s
 * validated presence.
 *
 * The `enter.from` check is the one exception that needs the *raw* (pre-validation) `enter`
 * object rather than the validated one: `validateEnter` fills in a default `from:"below"` when
 * the agent didn't specify one, so checking the validated `enter.from` would treat every layer
 * with *any* enter animation as conflicting with `animate.position` — including ones that never
 * asked for a `from`-driven slide-in. Checking raw presence (`rawEnter.from !== undefined`)
 * conflicts only when the agent explicitly opted into an enter *position* animation.
 */
function checkAnimateConflicts(
  animate: Animate | undefined,
  enter: Enter | undefined,
  exit: Exit | undefined,
  rawEnter: unknown,
  path: string
): void {
  if (animate?.opacity !== undefined) {
    const enterDrivesOpacity = enter?.anim === "fade" || enter?.anim === "spring";
    const exitDrivesOpacity = exit?.anim === "fade";
    if (enterDrivesOpacity || exitDrivesOpacity) {
      const culprit = enterDrivesOpacity ? `enter.anim:"${enter!.anim}"` : `exit.anim:"fade"`;
      fail(path, `animate.opacity conflicts with ${culprit} — both drive opacity; keep one`);
    }
  }

  if (animate?.position !== undefined) {
    const rawFrom = isPlainObject(rawEnter) ? rawEnter.from : undefined;
    if (rawFrom !== undefined) {
      fail(path, `animate.position conflicts with enter.from:"${String(rawFrom)}" — both drive position; keep one`);
    }
  }

  if (animate?.scale !== undefined) {
    if (enter?.anim === "kinetic") {
      fail(path, `animate.scale conflicts with enter.anim:"kinetic" — both drive scale; keep one`);
    }
  }
}

function validateLayer(value: unknown, path: string, opts: ValidateOpts | undefined): Layer {
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, LAYER_KEYS, path);

  const element = checkEnum(obj.element, ELEMENTS, `${path}.element`);
  const props = isPlainObject(obj.props) ? (obj.props as Record<string, unknown>) : {};
  checkMediaPath(element, props, opts?.allowedMediaPaths, path);
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
  const hold = validateHold(obj.hold, `${path}.hold`);
  const animate = validateAnimate(obj.animate, `${path}.animate`);

  checkAnimateConflicts(animate, enter, exit, obj.enter, path);

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
  if (hold !== undefined) layer.hold = hold;
  if (animate !== undefined) layer.animate = animate;

  return layer;
}

const BEAT_KEYS = ["durationInFrames", "camera", "background", "layers", "transitionOut"] as const;

function validateBeat(value: unknown, path: string, opts: ValidateOpts | undefined): Beat {
  if (!isPlainObject(value)) fail(path, "must be an object");
  const obj = value as Record<string, unknown>;
  checkUnknownKeys(obj, BEAT_KEYS, path);

  const durationInFrames = clamp(obj.durationInFrames, 8, 600, 60);

  if (!Array.isArray(obj.layers) || obj.layers.length === 0) {
    fail(`${path}.layers`, "must be a non-empty array");
  }
  const layers = (obj.layers as unknown[]).map((l, i) => validateLayer(l, `${path}.layers[${i}]`, opts));

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
 *
 * `opts.allowedMediaPaths`, when provided, additionally enforces that every video/image/screenMock
 * layer's `props.src` (if set) resolves to one of the given absolute paths — blocking path
 * traversal / arbitrary filesystem reads from an agent-authored spec. Omitting `opts` entirely
 * skips this check (back-compat for callers, e.g. render tests, that don't track project media).
 */
const SCENE_SPEC_KEYS = ["meta", "beats"] as const;

export function validateSceneSpec(input: unknown, opts?: ValidateOpts): ValidationResult {
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
    const beats = (obj.beats as unknown[]).map((b, i) => validateBeat(b, `beats[${i}]`, opts));

    const spec: SceneSpec = { meta, beats };
    return { ok: true, spec };
  } catch (e) {
    if (e instanceof ValidationError) {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: `unexpected error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ---------------------------------------------------------------------------
// Easing resolution — pure, used by the Generative.tsx interpreter so presets and custom curves
// render through a single bezier path.
// ---------------------------------------------------------------------------

const EASING_PRESET_BEZIER: Record<(typeof EASINGS)[number], [number, number, number, number]> = {
  "ease-out": [0.22, 0.61, 0.16, 1],
  linear: [0, 0, 1, 1],
  spring: [0.16, 1, 0.3, 1],
};

/**
 * Resolves an `EasingSpec` (preset name, custom curve, or `undefined`) to its cubic-bezier tuple.
 * Pure and total — never throws. `undefined` (no easing specified) resolves to the `ease-out`
 * tuple, matching `validateEnter`'s default. The interpreter should call this rather than branch
 * on preset-vs-custom itself, so both forms render through the same bezier path.
 */
export function resolveEasingToBezier(e: EasingSpec | undefined): [number, number, number, number] {
  if (e === undefined) return EASING_PRESET_BEZIER["ease-out"];
  if (typeof e === "string") return EASING_PRESET_BEZIER[e];
  return e.curve;
}
