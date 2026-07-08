// Per-frame text-animation evaluator — ported from Compositing/TextAnimator.swift. Given a clip's
// TextAnimation and the frame offset within the clip (`rel`), returns whole-clip entrance state or
// per-word state so the compositor actually animates titles/captions (not static text).

import type { RGBA, TextAnimation } from "../model/types";
import type { TextAnimationPreset } from "../model/enums";

export interface ClipState { opacity: number; scale: number; dy: number } // dy = fraction of render height
export interface WordState { opacity: number; scale: number; dy: number; color: RGBA; bgColor?: RGBA }
export interface Word { text: string; startFrame: number; endFrame: number }

export const DEFAULT_HIGHLIGHT: RGBA = { r: 1, g: 0.85, b: 0, a: 1 };

export function renderMode(p: TextAnimationPreset): "entrance" | "perWord" | "typewriter" {
  if (p === "typewriter") return "typewriter";
  if (p === "wordReveal" || p === "wordSlide" || p === "wordPop" || p === "wordCycle" || p === "highlightPop" || p === "highlightBlock") return "perWord";
  return "entrance";
}

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const linear = (rel: number, start: number, dur: number): number => (rel <= start ? 0 : rel >= start + dur ? 1 : (rel - start) / dur);
const progress = (rel: number, start: number, dur: number): number => smoothstep(linear(rel, start, dur));
const overshoot = (t: number): number => { const s = 1.70158, p = t - 1; return 1 + (s + 1) * p * p * p + s * p * p; };

function activeRamp(rel: number, w: Word, ramp: number): number {
  if (rel < w.startFrame || rel >= w.endFrame) return 0;
  const span = Math.max(1, w.endFrame - w.startFrame);
  if (span <= 1) return 1;
  const r = Math.min(Math.max(1, ramp), Math.max(1, Math.floor(span / 2)));
  const rampIn = smoothstep(Math.min(1, (rel - w.startFrame) / r));
  const rampOut = smoothstep(Math.min(1, (w.endFrame - rel) / r));
  return Math.min(rampIn, rampOut);
}

function lerp(a: RGBA, b: RGBA, t: number): RGBA {
  const u = Math.min(1, Math.max(0, t));
  return { r: a.r + (b.r - a.r) * u, g: a.g + (b.g - a.g) * u, b: a.b + (b.b - a.b) * u, a: a.a + (b.a - a.a) * u };
}

/** Whole-clip entrance (fadeIn/popIn/slideUp). Identity for non-entrance presets. */
export function clipEntry(anim: TextAnimation, rel: number): ClipState {
  const t = progress(rel, 0, Math.max(1, anim.perWordFrames));
  switch (anim.preset) {
    case "fadeIn": return { opacity: t, scale: 1, dy: 0 };
    case "popIn": return { opacity: t, scale: 0.6 + 0.4 * t, dy: 0 };
    case "slideUp": return { opacity: t, scale: 1, dy: 0.05 * (1 - t) };
    default: return { opacity: 1, scale: 1, dy: 0 };
  }
}

function activeTint(anim: TextAnimation, w: Word, rel: number, base: RGBA): RGBA {
  if (!anim.highlight) return base;
  const on = activeRamp(rel, w, Math.max(1, anim.perWordFrames));
  return lerp(base, anim.highlight, on);
}

/** Per-word state for per-word presets. */
export function wordState(anim: TextAnimation, w: Word, rel: number, base: RGBA): WordState {
  const highlight = anim.highlight ?? DEFAULT_HIGHLIGHT;
  const hand = Math.max(1, anim.perWordFrames);
  switch (anim.preset) {
    case "wordReveal": { const t = progress(rel, w.startFrame, hand); return { opacity: t, scale: 1, dy: 0, color: activeTint(anim, w, rel, base) }; }
    case "wordSlide": { const t = progress(rel, w.startFrame, hand); return { opacity: t, scale: 1, dy: 0.5 * (1 - t), color: activeTint(anim, w, rel, base) }; }
    case "wordPop": { const u = linear(rel, w.startFrame, hand); return { opacity: smoothstep(u), scale: 0.6 + 0.4 * overshoot(u), dy: 0, color: activeTint(anim, w, rel, base) }; }
    case "wordCycle": { const on = activeRamp(rel, w, hand); return { opacity: on, scale: 1, dy: 0, color: activeTint(anim, w, rel, base) }; }
    case "highlightPop": { const on = activeRamp(rel, w, Math.min(hand, 4)); return { opacity: 1, scale: 1 + 0.15 * on, dy: 0, color: lerp(base, highlight, on) }; }
    case "highlightBlock": { const on = activeRamp(rel, w, Math.min(hand, 4)); return { opacity: 1, scale: 1, dy: 0, color: base, bgColor: { ...highlight, a: highlight.a * on } }; }
    default: return { opacity: 1, scale: 1, dy: 0, color: base };
  }
}

/** Synthesize word timings for a text clip that has no transcript timings: contiguous perWordFrames. */
export function synthWords(text: string, perWordFrames: number): Word[] {
  const parts = text.split(/(\s+)/).filter((s) => s.length > 0);
  const words: Word[] = [];
  let i = 0;
  for (const p of parts) {
    if (/^\s+$/.test(p)) continue;
    words.push({ text: p, startFrame: i * perWordFrames, endFrame: (i + 1) * perWordFrames });
    i++;
  }
  return words;
}
