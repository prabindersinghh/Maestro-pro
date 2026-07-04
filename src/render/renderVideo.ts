// Video render — the finish line. Rasterizes each composited frame headlessly with @napi-rs/canvas
// (the SAME drawFrame the live preview uses, so preview == export) and pipes PNG frames to FFmpeg
// (on PATH / Tauri sidecar) → H.264/H.265 (mp4) or ProRes (mov). Runs in Node (MCP server / sidecar).

import { createCanvas } from "@napi-rs/canvas";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { drawFrame } from "../compositor/draw";
import { totalFrames } from "../model/helpers";
import { NodeFrameSource } from "./nodeFrameSource";
import { buildAudioMix, type AudioMixPlan } from "./audioMix";
import type { Timeline } from "../model/types";

export type VideoCodec = "H.264" | "H.265" | "ProRes";
export type VideoResolution = "720p" | "1080p" | "2K" | "4K" | "Match Timeline";

export interface RenderOptions {
  outputPath: string;
  codec?: VideoCodec;
  resolution?: VideoResolution;
  mediaName?: (mediaRef: string) => string;
  /** mediaRef → absolute source path; enables real decoded pixels (else labelled tiles). */
  mediaPath?: (mediaRef: string) => string | null;
  onProgress?: (done: number, total: number) => void;
  ffmpegPath?: string;
}

export interface RenderResult {
  outputPath: string;
  frames: number;
  width: number;
  height: number;
  codec: VideoCodec;
}

const even = (n: number): number => Math.max(2, Math.floor(Math.round(n) / 2) * 2);

/** ExportResolution.renderSize (ExportOptions.swift). */
export function renderSize(timeline: Timeline, resolution: VideoResolution): [number, number] {
  const short = { "720p": 720, "1080p": 1080, "2K": 1440, "4K": 2160 }[resolution as "720p"];
  if (!short) return [even(timeline.width), even(timeline.height)];
  const canvasShort = Math.min(timeline.width, timeline.height);
  if (canvasShort <= 0) return [even(timeline.width), even(timeline.height)];
  const scale = short / canvasShort;
  return [even(timeline.width * scale), even(timeline.height * scale)];
}

function videoCodecArgs(codec: VideoCodec): string[] {
  switch (codec) {
    case "ProRes":
      return ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le"];
    case "H.265":
      return ["-c:v", "libx265", "-pix_fmt", "yuv420p", "-crf", "22", "-tag:v", "hvc1"];
    default:
      return ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart"];
  }
}

function ffmpegArgs(
  codec: VideoCodec, fps: number, W: number, H: number, out: string,
  audio: AudioMixPlan | null, durationSec: number,
): string[] {
  const args = ["-y", "-f", "image2pipe", "-framerate", String(fps), "-s", `${W}x${H}`, "-i", "-"];
  if (audio) for (const p of audio.inputs) args.push("-i", p);
  args.push("-r", String(fps), ...videoCodecArgs(codec));
  if (audio) {
    // mov (ProRes) → pcm; mp4 (H.264/H.265) → aac.
    const acodec = codec === "ProRes" ? ["-c:a", "pcm_s16le"] : ["-c:a", "aac", "-b:a", "192k"];
    args.push("-filter_complex", audio.filterComplex, "-map", "0:v", "-map", "[aout]", ...acodec, "-t", durationSec.toFixed(3));
  } else {
    args.push("-map", "0:v");
  }
  args.push(out);
  return args;
}

export async function renderVideo(timeline: Timeline, opts: RenderOptions): Promise<RenderResult> {
  const codec = opts.codec ?? "H.264";
  const fps = Math.max(1, timeline.fps);
  const [W, H] = renderSize(timeline, opts.resolution ?? "Match Timeline");
  const total = Math.max(1, totalFrames(timeline.tracks));
  const mediaName = opts.mediaName ?? ((r) => r);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Real decoded pixels (images + extracted video frames), when a path resolver is given.
  const frameSource = opts.mediaPath ? new NodeFrameSource(opts.mediaPath, fps, opts.ffmpegPath) : undefined;
  if (frameSource) await frameSource.prepare(timeline);

  // Audio mix (unmuted audio clips → per-clip trim/speed/volume/fades → amix). Only real on-disk
  // inputs are included, so a missing/offline source silently drops out instead of failing ffmpeg.
  const audioResolve = opts.mediaPath;
  const audio = audioResolve
    ? buildAudioMix(timeline, (ref) => { const p = audioResolve(ref); return p && existsSync(p) ? p : null; })
    : null;

  const ff = spawn(opts.ffmpegPath ?? "ffmpeg", ffmpegArgs(codec, fps, W, H, opts.outputPath, audio, total / fps), {
    stdio: ["pipe", "ignore", "pipe"],
  });
  let stderr = "";
  ff.stderr.on("data", (d) => { stderr += String(d); if (stderr.length > 20000) stderr = stderr.slice(-20000); });

  const closed = new Promise<void>((resolve, reject) => {
    ff.on("error", (e) => reject(new Error(`Failed to launch ffmpeg (${opts.ffmpegPath ?? "ffmpeg"}): ${e.message}`)));
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-800)}`))));
  });

  const write = (buf: Buffer): Promise<void> =>
    ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once("drain", () => r()));

  try {
    for (let f = 0; f < total; f++) {
      if (frameSource) await frameSource.ensure(timeline, f);
      drawFrame(ctx as unknown as CanvasRenderingContext2D, timeline, { width: W, height: H, frame: f, mediaName, frameSource });
      await write(canvas.toBuffer("image/png"));
      opts.onProgress?.(f + 1, total);
    }
  } finally {
    ff.stdin.end();
    await frameSource?.cleanup();
  }
  await closed;
  return { outputPath: opts.outputPath, frames: total, width: W, height: H, codec };
}
