// Motion graphics — animated title / intro / outro renderer (STRATEGY ② "the other big thing Palmier
// doesn't have"). Draws each frame with @napi-rs/canvas and pipes to FFmpeg → H.264 MP4. Fully local,
// no browser, no GPU, no API key — reuses the same render stack as the exporter. Claude maps a natural
// prompt ("a bold cinematic intro that says Trip 2026") to a TitleSpec; the MP4 imports onto the
// timeline via import_media.

import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { spawn } from "node:child_process";

export type TitlePreset = "fadeSlideUp" | "scaleIn" | "typewriter" | "wordReveal" | "lowerThird";
export type TitleBackground = "black" | "gradient" | "spotlight" | string; // or a hex

export interface TitleSpec {
  text: string;
  subtitle?: string;
  preset?: TitlePreset;
  fontSize?: number;         // px in the design (1080p); scaled to the actual height
  color?: string;            // hex, default white
  accent?: string;           // hex, used by gradient/spotlight/lowerThird bar
  background?: TitleBackground;
  width?: number;
  height?: number;
  fps?: number;
  durationSeconds?: number;
  outputPath: string;
  ffmpegPath?: string;
}

export interface TitleResult { outputPath: string; frames: number; width: number; height: number }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function hexToRgb(h: string): [number, number, number] {
  const s = h.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function paintBackground(ctx: SKRSContext2D, spec: TitleSpec, W: number, H: number, t: number): void {
  const bg = spec.background ?? "gradient";
  const accent = spec.accent ?? "#1db26b";
  if (bg === "black") { ctx.fillStyle = "#050505"; ctx.fillRect(0, 0, W, H); return; }
  if (bg === "gradient") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    const [ar, ag, ab] = hexToRgb(accent);
    g.addColorStop(0, `rgb(${Math.round(ar * 0.5)},${Math.round(ag * 0.5)},${Math.round(ab * 0.5)})`);
    g.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return;
  }
  if (bg === "spotlight") {
    ctx.fillStyle = "#070707"; ctx.fillRect(0, 0, W, H);
    const r = Math.max(W, H) * (0.5 + 0.15 * Math.sin(t * Math.PI));
    const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, r);
    const [ar, ag, ab] = hexToRgb(accent);
    rg.addColorStop(0, `rgba(${ar},${ag},${ab},0.35)`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = bg.startsWith("#") ? bg : "#0a0a0a"; ctx.fillRect(0, 0, W, H);
}

function drawFrame(ctx: SKRSContext2D, spec: TitleSpec, W: number, H: number, f: number, total: number): void {
  const t = total > 1 ? f / (total - 1) : 1;
  const preset = spec.preset ?? "fadeSlideUp";
  const scale = H / 1080;
  const size = (spec.fontSize ?? 120) * scale;
  const color = spec.color ?? "#ffffff";
  const accent = spec.accent ?? "#1db26b";

  paintBackground(ctx, spec, W, H, t);

  // In over the first 35%, out (fade) over the last 18%.
  const inRaw = clamp01(t / 0.35);
  const outRaw = clamp01((t - 0.82) / 0.18);
  const appear = easeOutCubic(inRaw) * (1 - outRaw);

  ctx.textBaseline = "middle";
  ctx.textAlign = preset === "lowerThird" ? "left" : "center";
  const cx = preset === "lowerThird" ? W * 0.08 : W / 2;
  const cy = preset === "lowerThird" ? H * 0.82 : H / 2;

  // lower-third bar
  if (preset === "lowerThird") {
    const barW = W * 0.5 * easeOutCubic(inRaw) * (1 - outRaw);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 1;
    ctx.fillRect(cx - size * 0.25, cy - size * 0.75, 8 * scale, size * 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(cx - size * 0.25 + 8 * scale, cy - size * 0.75, barW, size * 1.5);
  }

  ctx.save();
  ctx.globalAlpha = clamp01(appear);
  let drawText = spec.text;
  if (preset === "typewriter") {
    const n = Math.floor(inRaw * spec.text.length + 0.001);
    drawText = spec.text.slice(0, n) + (inRaw < 1 && Math.floor(f / 6) % 2 === 0 ? "▏" : "");
    ctx.globalAlpha = 1 - outRaw;
  }

  // slide/scale transforms
  let ty = cy;
  if (preset === "fadeSlideUp") ty = cy + (1 - easeOutCubic(inRaw)) * 60 * scale;
  ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
  if (preset === "scaleIn") {
    const s = 0.7 + 0.3 * easeOutBack(inRaw);
    ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  }

  // subtle shadow for legibility
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12 * scale; ctx.shadowOffsetY = 3 * scale;

  if (preset === "wordReveal") {
    const words = spec.text.split(" ");
    const per = 1 / Math.max(1, words.length);
    ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
    const widths = words.map((w) => ctx.measureText(w + " ").width);
    const totalW = widths.reduce((a, b) => a + b, 0);
    let x = cx - totalW / 2;
    for (let i = 0; i < words.length; i++) {
      const wp = clamp01((inRaw - i * per) / per);
      ctx.globalAlpha = easeOutCubic(wp) * (1 - outRaw);
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(words[i], x, cy + (1 - easeOutCubic(wp)) * 30 * scale);
      x += widths[i];
    }
  } else {
    ctx.fillStyle = color;
    ctx.fillText(drawText, cx, ty);
  }
  ctx.restore();

  // subtitle
  if (spec.subtitle) {
    ctx.save();
    ctx.globalAlpha = clamp01(easeOutCubic(clamp01((t - 0.15) / 0.35)) * (1 - outRaw));
    ctx.font = `500 ${size * 0.38}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.textAlign = preset === "lowerThird" ? "left" : "center";
    ctx.fillText(spec.subtitle, cx, cy + size * 0.85);
    ctx.restore();
  }
}

export async function renderTitle(spec: TitleSpec): Promise<TitleResult> {
  const W = spec.width ?? 1920;
  const H = spec.height ?? 1080;
  const fps = spec.fps ?? 30;
  const total = Math.max(1, Math.round((spec.durationSeconds ?? 3) * fps));
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const ff = spawn(spec.ffmpegPath ?? "ffmpeg", [
    "-y", "-f", "image2pipe", "-framerate", String(fps), "-s", `${W}x${H}`, "-i", "-",
    "-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-movflags", "+faststart",
    spec.outputPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ff.stderr.on("data", (d) => { stderr += String(d); if (stderr.length > 20000) stderr = stderr.slice(-20000); });
  const closed = new Promise<void>((resolve, reject) => {
    ff.on("error", (e) => reject(new Error(`Failed to launch ffmpeg: ${e.message}`)));
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`))));
  });
  const write = (b: Buffer): Promise<void> => (ff.stdin.write(b) ? Promise.resolve() : new Promise((r) => ff.stdin.once("drain", () => r())));

  try {
    for (let f = 0; f < total; f++) {
      drawFrame(ctx, spec, W, H, f, total);
      await write(canvas.toBuffer("image/png"));
    }
  } finally {
    ff.stdin.end();
  }
  await closed;
  return { outputPath: spec.outputPath, frames: total, width: W, height: H };
}
