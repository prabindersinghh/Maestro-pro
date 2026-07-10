import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpExecutor } from "../executor";
import { endFrame } from "../../model/helpers";
import type { Clip } from "../../model/types";

// "Make this a viral-style reel": drive the EXACT tool-chain the viral-reel skill prescribes against
// a real clip, and assert the timeline actually transforms (9:16, pauses cut, hook text, zoom punch,
// palette-driven grade). Actions go through execute() (the thing under test); identity/state is read
// from the raw engine timeline (get_timeline's compact form strips default fields like mediaType).

const dir = mkdtempSync(join(tmpdir(), "maestro-reel-"));
const reel = join(dir, "reel.mp4"); // 4s landscape video WITH audio: tone / ~1s silence / tone

beforeAll(() => {
  execFileSync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=0x2a6f97:s=640x360:r=30:d=4",
    "-f", "lavfi", "-i", "aevalsrc=0.6*sin(2*PI*300*t)*(lt(t\\,1.5)+gt(t\\,2.5)):d=4:s=22050",
    "-shortest", "-pix_fmt", "yuv420p", reel,
  ], { stdio: "ignore" });
}, 60000);

const ok = (r: { content: { type: string; text?: string }[]; isError?: boolean }) => { expect(r.isError).toBeFalsy(); return JSON.parse(r.content[0].text ?? ""); };
const allClips = (ex: McpExecutor): Clip[] => ex.timeline.tracks.flatMap((t) => t.clips);
const videoClip = (ex: McpExecutor): Clip => allClips(ex).find((c) => c.mediaType === "video")!;
const timelineLen = (ex: McpExecutor): number => Math.max(0, ...allClips(ex).map(endFrame));

describe("viral-reel workflow (agent runs the skill's tool-chain on real footage)", () => {
  it("reframes 9:16, cuts the pause, adds a hook + zoom punch + palette grade", async () => {
    const ex = new McpExecutor();

    // Seed: import + place the clip (0..120 @30fps).
    const { assetId } = ok(await ex.execute("import_media", { source: { path: reel } }));
    await ex.execute("add_clips", { entries: [{ mediaRef: assetId, startFrame: 0, durationFrames: 120 }] });
    const vid0 = videoClip(ex);
    expect(vid0).toBeTruthy();

    // 1) Frame the reel 9:16.
    await ex.execute("set_project_settings", { aspectRatio: "9:16" });
    expect(ex.timeline.height).toBeGreaterThan(ex.timeline.width); // portrait

    // 2) Jump-cut on pause: analyze → remove silenceRanges → timeline shortens.
    const beats = ok(await ex.execute("analyze_audio", { clipId: vid0.id }));
    expect(beats.silenceRanges.length).toBeGreaterThanOrEqual(1);
    const before = timelineLen(ex);
    await ex.execute("ripple_delete_ranges", { clipId: vid0.id, ranges: beats.silenceRanges.map((r: any) => [r.startFrame, r.endFrame]), units: "frames" });
    expect(timelineLen(ex)).toBeLessThan(before); // dead air removed

    // 3) Hook text in the first ~1.5s, bold with a pop.
    await ex.execute("add_texts", { entries: [{ startFrame: 0, durationFrames: 45, content: "watch this", textStyle: { fontSize: 110, isBold: true }, textAnimation: { preset: "popIn" } }] });
    expect(allClips(ex).some((c) => c.mediaType === "text" && (c.textContent ?? "").includes("watch"))).toBe(true);

    // 4) Zoom punch on the video: scale 1.0 → 1.12 → 1.0, eased.
    const vid = videoClip(ex);
    await ex.execute("set_keyframes", { clipId: vid.id, property: "scale", keyframes: [[0, 1, 1, "smooth"], [4, 1.12, 1.12, "smooth"], [10, 1, 1, "smooth"]] });
    expect(videoClip(ex).scaleTrack?.keyframes?.length ?? 0).toBeGreaterThanOrEqual(3);

    // 5) Palette-driven grade: pull the footage palette, push contrast + saturation.
    const pal = ok(await ex.execute("extract_palette", { clipId: vid.id, colors: 4 }));
    expect(pal.swatches.length).toBeGreaterThanOrEqual(1);
    expect(pal.swatches[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    await ex.execute("apply_color", { clipIds: [vid.id], contrast: 1.12, saturation: 1.15 });
    expect((videoClip(ex).effects ?? []).length).toBeGreaterThanOrEqual(1); // a color effect is on the clip

    // Result: portrait, pause removed, hook + zoom punch + grade — a reel.
  }, 90000);
});
