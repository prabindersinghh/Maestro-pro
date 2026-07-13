import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpExecutor } from "../executor";

// Blocker 2: inspect_media + inspect_timeline were stubbed as "unavailable in this build". These
// tests prove they now return real data — ffprobe metadata for a media asset, and the in-memory
// timeline summary — so a fresh install's AI can actually reason about footage and verify edits.

const dir = mkdtempSync(join(tmpdir(), "kaestral-inspect-"));
const clip = join(dir, "clip.mp4"); // 320x240, 30fps, 2s, with a tone (has audio)

beforeAll(() => {
  execFileSync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=0x113355:s=320x240:r=30:d=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-pix_fmt", "yuv420p", "-shortest", clip,
  ], { stdio: "ignore" });
}, 60000);

describe("inspect_media (ffprobe metadata)", () => {
  it("returns real width/height/duration/fps/hasAudio for an imported clip", async () => {
    const ex = new McpExecutor();
    const imp = await ex.execute("import_media", { source: { path: clip } });
    const { assetId } = JSON.parse(imp.content[0].text) as { assetId: string };

    const r = await ex.execute("inspect_media", { mediaRef: assetId });
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0].text) as {
      width: number; height: number; fps: number; durationSeconds: number; durationFrames: number; hasAudio: boolean; aspectRatio: number;
    };
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
    expect(Math.round(out.fps)).toBe(30);
    expect(out.durationSeconds).toBeGreaterThan(1.5);
    expect(out.durationFrames).toBeGreaterThan(45);
    expect(out.hasAudio).toBe(true);
    expect(out.aspectRatio).toBeCloseTo(320 / 240, 2);
  }, 60000);

  it("errors clearly when the mediaRef is unknown", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("inspect_media", { mediaRef: "nope" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/no media found|Call get_media/);
  });
});

describe("inspect_timeline (in-memory state summary)", () => {
  it("summarizes tracks + placed clips with in/out frames and seconds", async () => {
    const ex = new McpExecutor();
    const imp = await ex.execute("import_media", { source: { path: clip } });
    const { assetId } = JSON.parse(imp.content[0].text) as { assetId: string };
    // place the clip on the timeline
    const add = await ex.execute("add_clips", { entries: [{ mediaRef: assetId, startFrame: 0 }] });
    expect(add.isError, add.content[0].text).toBeFalsy();

    const r = await ex.execute("inspect_timeline", {});
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0].text) as {
      fps: number; totalFrames: number; totalSeconds: number; trackCount: number;
      tracks: { type: string; clipCount: number; clips: { media: string; startFrame: number; endFrame: number; startSec: number; endSec: number }[] }[];
    };
    expect(out.fps).toBe(30);
    expect(out.trackCount).toBeGreaterThanOrEqual(1);
    const withClip = out.tracks.find((t) => t.clipCount > 0);
    expect(withClip, "a track should hold the placed clip").toBeTruthy();
    const c = withClip!.clips[0];
    expect(c.startFrame).toBe(0);
    expect(c.endFrame).toBeGreaterThan(c.startFrame);
    expect(c.endSec).toBeGreaterThan(0);
    expect(out.totalFrames).toBeGreaterThan(0);
  }, 60000);

  it("returns an empty-but-valid summary for a fresh timeline", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("inspect_timeline", {});
    expect(r.isError).toBeFalsy();
    const out = JSON.parse(r.content[0].text) as { totalFrames: number; trackCount: number };
    expect(out.totalFrames).toBe(0);
    expect(out.trackCount).toBe(0);
  });
});
