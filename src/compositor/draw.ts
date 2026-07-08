// Shared compositor draw — one function used by the live preview (browser canvas) AND the video
// render (node canvas), so what you preview is what you export. Draws each layer with transform,
// crop, opacity, blend mode, and the effect-stack canvas filter; real text; media placeholders.

import type { RGBA, TextAnimation, TextStyle, Timeline } from "../model/types";
import { composeFrame, blendToCanvas, type CompositedLayer } from "./frameState";
import { canvasFilter } from "./effectFilter";
import { clipColor } from "../ui/theme";
import { clipEntry, wordState, synthWords, renderMode, type Word } from "./textAnimator";
import type { FrameSource } from "./frameSource";

export interface DrawOpts {
  width: number;
  height: number;
  frame: number;
  /** mediaRef → display name (for placeholder tiles when pixels aren't decoded yet). */
  mediaName: (mediaRef: string) => string;
  /** Decoded source pixels for video/image clips; null falls back to a labelled tile. */
  frameSource?: FrameSource;
}

function rgbaCss(c: RGBA): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
}

function setFont(ctx: CanvasRenderingContext2D, style: TextStyle, size: number): void {
  const family = style.fontName.split("-")[0] || "sans-serif";
  const weight = style.isBold ? "bold" : "normal";
  const italic = style.isItalic ? "italic" : "";
  ctx.font = `${italic} ${weight} ${size}px ${family}, system-ui, sans-serif`.trim();
}

// One line of text with the full style stack (bg box, outline, shadow, fill). `content` may be a
// partial string (typewriter). `overrideColor` tints for highlight presets.
function drawStyledLine(ctx: CanvasRenderingContext2D, style: TextStyle, content: string, anchorX: number, y: number, size: number, drawBg: boolean, overrideColor?: RGBA): void {
  if (drawBg && style.background.enabled && content) {
    const w = ctx.measureText(content).width;
    const padX = size * 0.35, padY = size * 0.2, lh = size * 1.2;
    const bx = (style.alignment === "left" ? anchorX : style.alignment === "right" ? anchorX - w : anchorX - w / 2) - padX;
    ctx.fillStyle = rgbaCss(style.background.color);
    ctx.beginPath();
    ctx.roundRect(bx, y - lh / 2 - padY, w + padX * 2, lh + padY * 2, Math.min(size * 0.25, w / 2));
    ctx.fill();
  }
  if (style.shadow.enabled) {
    ctx.shadowColor = rgbaCss(style.shadow.color);
    ctx.shadowOffsetX = style.shadow.offsetX; ctx.shadowOffsetY = style.shadow.offsetY; ctx.shadowBlur = style.shadow.blur;
  }
  if (style.border.enabled) {
    ctx.strokeStyle = rgbaCss(style.border.color); ctx.lineWidth = Math.max(1, size * 0.06); ctx.lineJoin = "round";
    ctx.strokeText(content, anchorX, y);
  }
  ctx.fillStyle = rgbaCss(overrideColor ?? style.color);
  ctx.fillText(content, anchorX, y);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
}

// Text with animation (TextAnimator). `rel` = frame offset within the clip; frameSize is the render height.
function drawText(ctx: CanvasRenderingContext2D, style: TextStyle, content: string, box: { x: number; y: number; w: number; h: number }, anim: TextAnimation | undefined, rel: number, frameH: number) {
  const size = style.fontSize * style.fontScale;
  setFont(ctx, style, size);
  ctx.textBaseline = "middle";
  ctx.textAlign = style.alignment;
  const anchorX = style.alignment === "left" ? box.x : style.alignment === "right" ? box.x + box.w : box.x + box.w / 2;
  const lineHeight = size * 1.2;
  const mode = anim ? renderMode(anim.preset) : "entrance";

  // --- Per-word presets (wordReveal/Slide/Pop/Cycle/highlight*) ---
  if (anim && anim.preset !== "none" && mode === "perWord") {
    const lines = content.split("\n");
    const startY = box.y + box.h / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;
    let wordIdx = 0;
    const all = synthWords(content, Math.max(1, anim.perWordFrames));
    let y = startY;
    for (const line of lines) {
      const words = line.split(/(\s+)/).filter((s) => s.length > 0);
      const lineW = ctx.measureText(line).width;
      let x = style.alignment === "left" ? box.x : style.alignment === "right" ? box.x + box.w - lineW : box.x + box.w / 2 - lineW / 2;
      for (const tok of words) {
        if (/^\s+$/.test(tok)) { x += ctx.measureText(tok).width; continue; }
        const w: Word = all[wordIdx++] ?? { text: tok, startFrame: 0, endFrame: 1 };
        const st = wordState(anim, w, rel, style.color);
        ctx.save();
        ctx.globalAlpha *= Math.max(0, Math.min(1, st.opacity));
        const wx = x, wy = y + st.dy * lineHeight;
        if (st.scale !== 1) { ctx.translate(wx, wy); ctx.scale(st.scale, st.scale); ctx.translate(-wx, -wy); }
        ctx.textAlign = "left";
        drawStyledLineWord(ctx, style, tok, wx, wy, size, st.bgColor, st.color);
        ctx.restore();
        x += ctx.measureText(tok).width;
      }
      y += lineHeight;
    }
    return;
  }

  // --- Entrance (fadeIn/popIn/slideUp) + typewriter + none ---
  const st = anim && anim.preset !== "none" ? clipEntry(anim, rel) : { opacity: 1, scale: 1, dy: 0 };
  let shown = content;
  if (anim && anim.preset === "typewriter") {
    const wordCount = Math.max(1, content.trim().split(/\s+/).length);
    const total = Math.max(1, wordCount * anim.perWordFrames);
    const chars = Math.floor(Math.min(1, Math.max(0, rel / total)) * content.length);
    shown = content.slice(0, Math.max(0, chars));
  }
  const lines = shown.split("\n");
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, st.opacity));
  ctx.translate(0, st.dy * frameH);
  if (st.scale !== 1) { ctx.translate(cx, cy); ctx.scale(st.scale, st.scale); ctx.translate(-cx, -cy); }
  let y = box.y + box.h / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;
  for (const line of lines) { drawStyledLine(ctx, style, line, anchorX, y, size, true); y += lineHeight; }
  ctx.restore();
}

// A single animated word: optional per-word highlight bg, then outline + fill in the word's color.
function drawStyledLineWord(ctx: CanvasRenderingContext2D, style: TextStyle, word: string, x: number, y: number, size: number, bgColor: RGBA | undefined, color: RGBA): void {
  const w = ctx.measureText(word).width;
  const lh = size * 1.2, pad = size * 0.12;
  if (bgColor && bgColor.a > 0.01) {
    ctx.fillStyle = rgbaCss(bgColor);
    ctx.beginPath();
    ctx.roundRect(x - pad, y - lh / 2, w + pad * 2, lh, size * 0.12);
    ctx.fill();
  } else if (style.background.enabled) {
    ctx.fillStyle = rgbaCss(style.background.color);
    ctx.fillRect(x - pad, y - lh / 2, w + pad * 2, lh);
  }
  if (style.shadow.enabled) { ctx.shadowColor = rgbaCss(style.shadow.color); ctx.shadowOffsetX = style.shadow.offsetX; ctx.shadowOffsetY = style.shadow.offsetY; ctx.shadowBlur = style.shadow.blur; }
  if (style.border.enabled) { ctx.strokeStyle = rgbaCss(style.border.color); ctx.lineWidth = Math.max(1, size * 0.06); ctx.lineJoin = "round"; ctx.strokeText(word, x, y); }
  ctx.fillStyle = rgbaCss(color);
  ctx.fillText(word, x, y);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
}

function drawLayer(ctx: CanvasRenderingContext2D, L: CompositedLayer, box: { x: number; y: number; w: number; h: number }, opts: DrawOpts) {
  if (L.mediaType === "text") {
    if (L.clip.textStyle && L.clip.textContent) drawText(ctx, L.clip.textStyle, L.clip.textContent, box, L.clip.textAnimation, opts.frame - L.clip.startFrame, opts.height);
    return;
  }
  // Real decoded pixels: crop selects a source sub-rect that fills the (crop-inset) box.
  const fi = opts.frameSource?.imageFor(L.clip, opts.frame);
  if (fi) {
    const c = L.crop;
    const sx = c.left * fi.width;
    const sy = c.top * fi.height;
    const sw = fi.width * Math.max(0.001, 1 - c.left - c.right);
    const sh = fi.height * Math.max(0.001, 1 - c.top - c.bottom);
    ctx.drawImage(fi.image, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
    return;
  }
  // Fallback tile (pixels not decoded yet, or no frame source). The label sits in a small
  // top-left chip — never centred — so it can't collide/garble with centred title text.
  ctx.fillStyle = clipColor(L.mediaType);
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  const label = opts.mediaName(L.clip.mediaRef);
  const fontSize = Math.max(11, Math.min(box.h * 0.06, 22));
  const pad = Math.max(4, fontSize * 0.4);
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(box.x + pad, box.y + pad, tw + pad * 2, fontSize + pad);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(label, box.x + pad * 2, box.y + pad * 1.5);
}

/** Draw the composited frame into `ctx` (canvas already sized to width×height). */
export function drawFrame(ctx: CanvasRenderingContext2D, timeline: Timeline, opts: DrawOpts): void {
  const { width: W, height: H, frame } = opts;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  for (const L of composeFrame(timeline, frame)) {
    const bx = L.x * W, by = L.y * H, bw = L.w * W, bh = L.h * H;
    const box = {
      x: bx + L.crop.left * bw,
      y: by + L.crop.top * bh,
      w: bw * Math.max(0, 1 - L.crop.left - L.crop.right),
      h: bh * Math.max(0, 1 - L.crop.top - L.crop.bottom),
    };
    ctx.save();
    ctx.globalAlpha = L.opacity;
    ctx.globalCompositeOperation = blendToCanvas(L.blendMode);
    ctx.filter = canvasFilter(L.clip.effects);
    const ccx = (L.x + L.w / 2) * W, ccy = (L.y + L.h / 2) * H;
    ctx.translate(ccx, ccy);
    if (L.rotation) ctx.rotate((L.rotation * Math.PI) / 180);
    if (L.flipH || L.flipV) ctx.scale(L.flipH ? -1 : 1, L.flipV ? -1 : 1);
    ctx.translate(-ccx, -ccy);
    drawLayer(ctx, L, box, opts);
    ctx.restore();
  }
}
