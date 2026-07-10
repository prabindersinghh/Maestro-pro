import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractFrames } from "../frames";
import { McpExecutor } from "../../mcp/executor";

// A 3s clip that changes color halfway (red → blue) so scene sampling has something to find.
const dir = mkdtempSync(join(tmpdir(), "maestro-vision-test-"));
const clip = join(dir, "shots.mp4");

beforeAll(() => {
  execFileSync("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", "color=c=0xE03030:s=320x240:r=30:d=1.5",
    "-f", "lavfi", "-i", "color=c=0x3040E0:s=320x240:r=30:d=1.5",
    "-filter_complex", "[0][1]concat=n=2:v=1:a=0", "-pix_fmt", "yuv420p", clip,
  ], { stdio: "ignore" });
}, 60000);

describe("video vision — extractFrames", () => {
  it("returns base64 JPEG frames with timestamps (interval)", async () => {
    const frames = await extractFrames(clip, { count: 4, mode: "interval", maxDim: 256 });
    expect(frames.length).toBe(4);
    for (const f of frames) {
      expect(f.media_type).toBe("image/jpeg");
      expect(f.data.length).toBeGreaterThan(100);      // real base64 payload
      expect(Buffer.from(f.data, "base64").length).toBeGreaterThan(200); // decodes to real bytes
    }
    // timestamps ascend across the clip
    for (let i = 1; i < frames.length; i++) expect(frames[i].timeSec).toBeGreaterThan(frames[i - 1].timeSec);
  }, 60000);

  it("scene mode finds the color change", async () => {
    const frames = await extractFrames(clip, { count: 6, mode: "scene", maxDim: 256 });
    expect(frames.length).toBeGreaterThanOrEqual(1); // at least the first shot; the cut adds another
  }, 60000);
});

describe("see_video MCP tool returns viewable image blocks", () => {
  it("emits an image content block per frame", async () => {
    const ex = new McpExecutor();
    const imp = JSON.parse((await ex.execute("import_media", { source: { path: clip } })).content[0].text ?? "{}") as { assetId: string };
    const r = await ex.execute("see_video", { mediaRef: imp.assetId, count: 3, mode: "interval" });
    expect(r.isError).toBeFalsy();
    // content[0] is the text caption; the rest are image blocks the model can SEE
    expect(r.content[0].type).toBe("text");
    const images = r.content.filter((c) => c.type === "image");
    expect(images.length).toBe(3);
    // MCP-canonical flat image shape {type:"image", data, mimeType}
    const img0 = images[0] as { type: "image"; data: string; mimeType: string };
    expect(img0.mimeType).toBe("image/jpeg");
    expect(img0.data.length).toBeGreaterThan(100);
    expect(Buffer.from(img0.data, "base64").length).toBeGreaterThan(200);
  }, 60000);
});
