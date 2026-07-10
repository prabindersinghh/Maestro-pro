// Video vision — Maestro's OWN implementation. Extracts frames with the bundled FFmpeg and returns
// them base64-encoded so a vision-capable model (Claude Code over MCP, or the in-app agent via the
// Messages API) can actually SEE the footage — to find the best moments, read the subject/framing,
// and edit on what's in the video, not just its rhythm/color. Ideas informed by the permissive
// claude-video / claude-video-vision projects (studied, not copied): sample sparsely, downscale hard,
// hand the model timestamped frames as image blocks.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, ffprobeBin } from "../mcp/env";

export interface VisionFrame { timeSec: number; media_type: string; data: string } // data = base64 JPEG
export type SampleMode = "interval" | "scene";

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    p.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out + err) : reject(new Error(`${bin} exited ${code}: ${err.slice(0, 200)}`))));
  });
}

async function probeDuration(path: string): Promise<number> {
  try {
    const out = await run(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]);
    const d = parseFloat(out.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch { return 0; }
}

/**
 * Extract up to `count` frames from a clip/asset for the model to view.
 *  - "interval": evenly spaced across the duration (good default overview).
 *  - "scene":    on scene changes (best for finding distinct moments/shots).
 * Frames are downscaled to `maxDim` and JPEG-encoded to keep the payload small.
 */
export async function extractFrames(
  path: string,
  opts: { count?: number; maxDim?: number; mode?: SampleMode; startSec?: number; endSec?: number } = {},
  ffmpegPath = ffmpegBin(),
): Promise<VisionFrame[]> {
  const count = Math.max(1, Math.min(12, opts.count ?? 6));
  const maxDim = Math.max(128, Math.min(1024, opts.maxDim ?? 512));
  const mode = opts.mode ?? "interval";
  const scale = `scale='min(${maxDim},iw)':-2`;
  const dir = await mkdtemp(join(tmpdir(), "maestro-vision-"));
  try {
    const frames: VisionFrame[] = [];

    if (mode === "scene") {
      // One pass: keep scene-change frames (fallback to a periodic keyframe if a clip is static),
      // capped at `count`. showinfo gives us each kept frame's timestamp.
      const log = await run(ffmpegPath, [
        "-v", "info", "-i", path,
        "-vf", `select='gt(scene\\,0.3)+eq(n\\,0)',${scale},showinfo`,
        "-vsync", "vfr", "-frames:v", String(count), "-q:v", "4", join(dir, "f_%03d.jpg"),
      ]);
      const times = [...log.matchAll(/pts_time:([0-9.]+)/g)].map((m) => parseFloat(m[1]));
      for (let i = 0; i < times.length; i++) {
        const data = await readFile(join(dir, `f_${String(i + 1).padStart(3, "0")}.jpg`)).catch(() => null);
        if (data) frames.push({ timeSec: Number(times[i].toFixed(2)), media_type: "image/jpeg", data: data.toString("base64") });
      }
      if (frames.length > 0) return frames;
      // static clip → fall through to interval sampling
    }

    const dur = (opts.endSec ?? await probeDuration(path)) - (opts.startSec ?? 0);
    const base = opts.startSec ?? 0;
    const span = dur > 0 ? dur : 0;
    for (let i = 0; i < count; i++) {
      // spread across the clip; single-frame clips still get frame 0
      const t = span > 0 ? base + (span * (i + 0.5)) / count : base;
      const outFile = join(dir, `i_${i}.jpg`);
      await run(ffmpegPath, ["-y", "-ss", t.toFixed(3), "-i", path, "-frames:v", "1", "-vf", scale, "-q:v", "4", outFile]);
      const data = await readFile(outFile).catch(() => null);
      if (data) frames.push({ timeSec: Number(t.toFixed(2)), media_type: "image/jpeg", data: data.toString("base64") });
      if (span <= 0) break; // still image / no duration → one frame is enough
    }
    return frames;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
