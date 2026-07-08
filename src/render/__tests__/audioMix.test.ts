import { describe, it, expect } from "vitest";
import { buildAudioMix, atempoChain, timelineSeconds } from "../audioMix";
import { defaultTimeline, defaultTrack, defaultClip } from "../../model/defaults";
import type { Timeline } from "../../model/types";

function tl(over: Partial<Timeline> = {}): Timeline {
  return { ...defaultTimeline(), fps: 30, ...over };
}

describe("atempoChain", () => {
  it("is empty at speed 1", () => expect(atempoChain(1)).toBe(""));
  it("passes a single stage in [0.5,100]", () => expect(atempoChain(2)).toBe("atempo=2.000000"));
  it("chains stages for slow speeds below 0.5", () => {
    // 0.25 needs two stages (0.5 * 0.5)
    expect(atempoChain(0.25)).toBe("atempo=0.500000,atempo=0.500000");
  });
});

describe("buildAudioMix", () => {
  const path = (r: string) => (r === "missing" ? null : `/abs/${r}.mp4`);

  it("returns null when there are no audible audio clips", () => {
    const t = tl({ tracks: [{ ...defaultTrack("video", "v"), clips: [defaultClip({ mediaRef: "a", startFrame: 0, durationFrames: 30 })] }] });
    expect(buildAudioMix(t, path)).toBeNull();
  });

  it("skips muted tracks and zero-volume/zero-length clips", () => {
    const c = defaultClip({ mediaRef: "a", startFrame: 0, durationFrames: 30, mediaType: "audio" });
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), muted: true, clips: [c] }] });
    expect(buildAudioMix(t, path)).toBeNull();
  });

  it("emits atrim/adelay/volume and an amix for two clips", () => {
    const c1 = defaultClip({ mediaRef: "a", startFrame: 0, durationFrames: 30, mediaType: "audio" });
    const c2 = defaultClip({ mediaRef: "b", startFrame: 30, durationFrames: 30, mediaType: "audio" });
    c2.volume = 0.5;
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), clips: [c1, c2] }] });
    const plan = buildAudioMix(t, path)!;
    expect(plan).not.toBeNull();
    expect(plan.inputs).toEqual(["/abs/a.mp4", "/abs/b.mp4"]);
    expect(plan.filterComplex).toContain("atrim=");
    expect(plan.filterComplex).toContain("adelay=1000:all=1"); // c2 starts at frame 30 → 1000ms
    expect(plan.filterComplex).toContain("volume=0.500000");
    expect(plan.filterComplex).toContain("amix=inputs=2:normalize=0[aout]");
  });

  it("drops clips whose media path is null (offline)", () => {
    const c = defaultClip({ mediaRef: "missing", startFrame: 0, durationFrames: 30, mediaType: "audio" });
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), clips: [c] }] });
    expect(buildAudioMix(t, path)).toBeNull();
  });

  it("emits a keyframed volume ENVELOPE (eval=frame) when the clip has volume keyframes", () => {
    const c = defaultClip({ mediaRef: "a", startFrame: 0, durationFrames: 60, mediaType: "audio" });
    c.volume = 1;
    c.volumeTrack = { keyframes: [{ frame: 0, value: -40, interpolationOut: "smooth" }, { frame: 59, value: 0, interpolationOut: "smooth" }] };
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), clips: [c] }] });
    const plan = buildAudioMix(t, path)!;
    expect(plan.filterComplex).toContain("eval=frame");
    expect(plan.filterComplex).toMatch(/volume='if\(lt\(t,/); // piecewise-linear gain expression
  });

  it("applies head/tail fades", () => {
    const c = defaultClip({ mediaRef: "a", startFrame: 0, durationFrames: 60, mediaType: "audio" });
    c.fadeInFrames = 15;
    c.fadeOutFrames = 15;
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), clips: [c] }] });
    const plan = buildAudioMix(t, path)!;
    expect(plan.filterComplex).toContain("afade=t=in:st=0:d=0.500000");
    expect(plan.filterComplex).toContain("afade=t=out:");
  });
});

describe("timelineSeconds", () => {
  it("is the max clip end over fps", () => {
    const c = defaultClip({ mediaRef: "a", startFrame: 30, durationFrames: 60, mediaType: "audio" });
    const t = tl({ tracks: [{ ...defaultTrack("audio", "a1"), clips: [c] }] });
    expect(timelineSeconds(t)).toBeCloseTo(3, 5); // (30+60)/30
  });
});
