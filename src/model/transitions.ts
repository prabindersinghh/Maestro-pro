// Transitions between adjacent clips. A transition of `d` timeline frames INTO the incoming clip
// from the outgoing one is expressed purely with the fade + overlap machinery the compositor and
// exporter already honor (opacityAt applies fades to video/image; composeFrame renders overlapping
// same-track clips; audioMix emits afade) — so NO new serialized field is needed and the .palmier
// format stays unchanged.
//
//   cross dissolve — needs the incoming clip's LEFT handle (trimmed-in footage). Slide the incoming
//     clip left by d so it overlaps the outgoing clip's own tail, and cross-fade: outgoing fades out
//     over its last d frames while incoming fades in over its first d. Nothing downstream moves
//     (the incoming clip's END is unchanged: start-=d, duration+=d). The outgoing clip is untouched
//     except its fade — its tail was always its own footage.
//   dip to black — the fallback when there's no handle (or for audio): fades only, no move, so the
//     picture dips through black across the cut. Always possible.

import type { Clip } from "./types";
import { endFrame } from "./helpers";

export type TransitionKind = "crossDissolve" | "dipToBlack";

export interface TransitionEdit {
  kind: TransitionKind;
  prevFadeOutFrames: number;
  /** Mutations for the incoming clip (unchanged fields keep their current value). */
  cur: { startFrame: number; trimStartFrame: number; durationFrames: number; fadeInFrames: number };
}

/** Left-handle: source frames available before the incoming clip's in-point. */
export function leftHandleFrames(cur: Clip): number {
  return Math.max(0, cur.trimStartFrame);
}

/** Whether `d` frames can cross-dissolve into `cur` (enough handle, both are picture). */
export function canCrossDissolve(prev: Clip, cur: Clip, d: number): boolean {
  if (prev.mediaType === "audio" || cur.mediaType === "audio") return false;
  const dur = clampDur(prev, cur, d);
  return leftHandleFrames(cur) >= Math.round(dur * cur.speed);
}

function clampDur(prev: Clip, cur: Clip, d: number): number {
  return Math.max(1, Math.min(Math.round(d), prev.durationFrames, cur.durationFrames));
}

/** Plan a transition of `d` timeline frames from `prev` into `cur` (must be adjacent). */
export function planTransition(prev: Clip, cur: Clip, d: number): TransitionEdit {
  const dur = clampDur(prev, cur, d);
  if (canCrossDissolve(prev, cur, d)) {
    const needSrc = Math.round(dur * cur.speed);
    return {
      kind: "crossDissolve",
      prevFadeOutFrames: dur,
      cur: {
        startFrame: cur.startFrame - dur,
        trimStartFrame: cur.trimStartFrame - needSrc,
        durationFrames: cur.durationFrames + dur,
        fadeInFrames: dur,
      },
    };
  }
  return {
    kind: "dipToBlack",
    prevFadeOutFrames: dur,
    cur: { startFrame: cur.startFrame, trimStartFrame: cur.trimStartFrame, durationFrames: cur.durationFrames, fadeInFrames: dur },
  };
}

/** True when `cur` butts directly against `prev`'s end (a hard cut — no gap, no overlap). */
export function isHardCut(prev: Clip, cur: Clip): boolean {
  return cur.startFrame === endFrame(prev);
}
