import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { renderVideo } from "../renderVideo";
import { EditEngine } from "../../engine/editEngine";
import { defaultClip, defaultTrack, defaultTimeline } from "../../model/defaults";
import type { Clip, Timeline } from "../../model/types";

// Two 2s solid-colour sources: RED and GREEN. Clip A = red (2s). Clip B = green, trimmed 1s in so it
// has a 1s LEFT HANDLE (required for a cross-dissolve), placed to butt against A. After
// addTransitionsAtCuts, the boundary frame should show BOTH clips blended (red AND green present) —
// proving the compositor renders the overlap as a real dissolve, in the actual FFmpeg export.
const dir = mkdtempSync(join(tmpdir(), "maestro-xdissolve-"));
const redPath = join(dir, "red.mp4");
const greenPath = join(dir, "green.mp4");

beforeAll(() => {
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0xFF0000:s=320x240:r=30:d=2", "-pix_fmt", "yuv420p", redPath], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=0x00FF00:s=320x240:r=30:d=2", "-pix_fmt", "yuv420p", greenPath], { stdio: "ignore" });
}, 60000);

async function samplePixel(file: string, n: number, x: number, y: number): Promise<[number, number, number]> {
  const png = join(dir, `probe_${n}.png`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", file, "-vf", `select=eq(n\\,${n})`, "-vframes", "1", png], { stdio: "ignore" });
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height);
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0);
  const d = cx.getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}

function timeline(): Timeline {
  const a: Clip = defaultClip({ mediaRef: "red", startFrame: 0, durationFrames: 60, id: "A", mediaType: "video" });
  const b: Clip = defaultClip({ mediaRef: "green", startFrame: 60, durationFrames: 60, id: "B", mediaType: "video" });
  b.trimStartFrame = 30; // 1s left handle → cross-dissolve is possible
  return { ...defaultTimeline(), fps: 30, width: 320, height: 240, tracks: [{ ...defaultTrack("video", "main"), clips: [a, b] }] };
}

describe("cross-dissolve renders as a real blend in the FFmpeg export", () => {
  it("blends red and green at the transition midpoint", async () => {
    const eng = new EditEngine(timeline());
    const n = eng.addTransitionsAtCuts(15); // 0.5s dissolve
    expect(n).toBe(1);
    const b = eng.timeline.tracks[0].clips[1];
    expect(b.startFrame).toBe(45); // slid left → overlaps A's tail [45,60)

    const out = join(dir, "out.mp4");
    const paths: Record<string, string> = { red: redPath, green: greenPath };
    await renderVideo(eng.timeline, { outputPath: out, codec: "H.264", mediaName: (r) => r, mediaPath: (r) => paths[r] ?? null });

    // Frame 52 ≈ overlap midpoint (window 45–60): both clips ~50% → red AND green both present.
    const [r, g, bl] = await samplePixel(out, 52, 160, 120);
    expect(r).toBeGreaterThan(50);   // red still visible (A fading out)
    expect(g).toBeGreaterThan(50);   // green already visible (B fading in)
    expect(bl).toBeLessThan(90);     // no blue — it's a red/green mix, not washed out

    // Before the transition (frame 20): pure red.
    const [r20, g20] = await samplePixel(out, 20, 160, 120);
    expect(r20).toBeGreaterThan(150);
    expect(g20).toBeLessThan(90);

    // Well after (frame 100): pure green.
    const [r100, g100] = await samplePixel(out, 100, 160, 120);
    expect(g100).toBeGreaterThan(150);
    expect(r100).toBeLessThan(90);
  }, 120000);
});
