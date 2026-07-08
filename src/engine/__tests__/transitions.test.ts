import { describe, it, expect } from "vitest";
import { planTransition, canCrossDissolve } from "../../model/transitions";
import { EditEngine } from "../editEngine";
import { defaultClip, defaultTrack } from "../../model/defaults";
import { endFrame } from "../../model/helpers";
import type { Clip, Timeline } from "../../model/types";

// defaultClip hardcodes trimStartFrame/speed, so spread-override to set a left handle for a dissolve.
const vid = (over: Partial<Clip> = {}): Clip => ({
  ...defaultClip({ mediaRef: "m", startFrame: 0, durationFrames: 60, mediaType: "video", sourceClipType: "video" }),
  ...over,
});

describe("planTransition", () => {
  it("cross-dissolves when the incoming clip has enough left handle", () => {
    const prev = vid({ startFrame: 0, durationFrames: 60, trimStartFrame: 0 });
    const cur = vid({ startFrame: 60, durationFrames: 60, trimStartFrame: 20 }); // 20-frame handle
    expect(canCrossDissolve(prev, cur, 15)).toBe(true);
    const p = planTransition(prev, cur, 15);
    expect(p.kind).toBe("crossDissolve");
    expect(p.prevFadeOutFrames).toBe(15);
    expect(p.cur.startFrame).toBe(45);          // slid left by 15 → overlaps prev's tail
    expect(p.cur.trimStartFrame).toBe(5);        // consumed 15 source frames of handle
    expect(p.cur.durationFrames).toBe(75);       // end unchanged (60+15, start-15)
    expect(p.cur.fadeInFrames).toBe(15);
    // end is preserved so nothing downstream moves
    expect(p.cur.startFrame + p.cur.durationFrames).toBe(120);
  });

  it("falls back to dip-to-black when there is no handle", () => {
    const prev = vid({ startFrame: 0, durationFrames: 60, trimStartFrame: 0 });
    const cur = vid({ startFrame: 60, durationFrames: 60, trimStartFrame: 0 }); // no handle
    expect(canCrossDissolve(prev, cur, 15)).toBe(false);
    const p = planTransition(prev, cur, 15);
    expect(p.kind).toBe("dipToBlack");
    expect(p.cur.startFrame).toBe(60);           // NOT moved
    expect(p.prevFadeOutFrames).toBe(15);
    expect(p.cur.fadeInFrames).toBe(15);
  });

  it("audio never cross-dissolves (uses fades = dip)", () => {
    const a = vid({ mediaType: "audio", startFrame: 0, durationFrames: 60, trimStartFrame: 30 });
    const b = vid({ mediaType: "audio", startFrame: 60, durationFrames: 60, trimStartFrame: 30 });
    expect(canCrossDissolve(a, b, 15)).toBe(false);
  });

  it("clamps duration to the shorter neighbour", () => {
    const prev = vid({ startFrame: 0, durationFrames: 5, trimStartFrame: 0 });
    const cur = vid({ startFrame: 5, durationFrames: 60, trimStartFrame: 20 });
    expect(planTransition(prev, cur, 30).prevFadeOutFrames).toBe(5); // capped at prev's 5 frames
  });
});

function tl(): Timeline {
  const track = { ...defaultTrack("video", "v"), clips: [
    vid({ id: "A", startFrame: 0, durationFrames: 60, trimStartFrame: 0 }),
    vid({ id: "B", startFrame: 60, durationFrames: 60, trimStartFrame: 20 }),
    vid({ id: "C", startFrame: 120, durationFrames: 60, trimStartFrame: 20 }),
  ] };
  return { fps: 30, width: 1920, height: 1080, settingsConfigured: true, tracks: [track] };
}

describe("EditEngine transitions", () => {
  it("addTransitionsAtCuts dissolves every hard cut and keeps downstream ends fixed", () => {
    const eng = new EditEngine(tl());
    const n = eng.addTransitionsAtCuts(15);
    expect(n).toBe(2); // A|B and B|C
    const [a, b, c] = eng.timeline.tracks[0].clips;
    expect(a.fadeOutFrames).toBe(15);
    expect(b.fadeInFrames).toBe(15);
    expect(b.startFrame).toBe(45);      // slid left over A's tail
    expect(endFrame(b)).toBe(120);      // B's end unchanged
    expect(c.startFrame).toBe(105);     // C slid too
    expect(endFrame(c)).toBe(180);      // C's end unchanged → nothing after moves
  });

  it("is undoable", () => {
    const eng = new EditEngine(tl());
    eng.addTransitionsAtCuts(15);
    expect(eng.timeline.tracks[0].clips[1].startFrame).toBe(45);
    eng.undo();
    expect(eng.timeline.tracks[0].clips[1].startFrame).toBe(60); // restored
  });

  it("does not transition across a gap", () => {
    const track = { ...defaultTrack("video", "v"), clips: [
      vid({ id: "A", startFrame: 0, durationFrames: 60, trimStartFrame: 0 }),
      vid({ id: "B", startFrame: 90, durationFrames: 60, trimStartFrame: 20 }), // 30-frame gap
    ] };
    const eng = new EditEngine({ fps: 30, width: 1920, height: 1080, settingsConfigured: true, tracks: [track] });
    expect(eng.addTransitionsAtCuts(15)).toBe(0);
  });
});
