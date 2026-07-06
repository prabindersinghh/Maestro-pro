// Shared compositor draw — one function used by the live preview (browser canvas) AND the video
// render (node canvas), so what you preview is what you export. Draws each layer with transform,
// crop, opacity, blend mode, and the effect-stack canvas filter; real text; media placeholders.

import type { RGBA, TextStyle, Timeline } from "../model/types";
import { composeFrame, blendToCanvas, type CompositedLayer } from "./frameState";
import { canvasFilter } from "./effectFilter";
import { clipColor } from "../ui/theme";
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

function drawText(ctx: CanvasRenderingContext2D, style: TextStyle, content: string, box: { x: number; y: number; w: number; h: number }) {
  const family = style.fontName.split("-")[0] || "sans-serif";
  const weight = style.isBold ? "bold" : "normal";
  const italic = style.isItalic ? "italic" : "";
  const size = style.fontSize * style.fontScale;
  ctx.font = `${italic} ${weight} ${size}px ${family}, system-ui, sans-serif`.trim();
  ctx.textBaseline = "middle";
  ctx.textAlign = style.alignment;
  const anchorX = style.alignment === "left" ? box.x : style.alignment === "right" ? box.x + box.w : box.x + box.w / 2;
  const lines = content.split("\n");
  const lineHeight = size * 1.2;
  const startY = box.y + box.h / 2 - (lines.length * lineHeight) / 2 + lineHeight / 2;

  // Background fill (TextFill) — a padded rounded box behind the text block.
  if (style.background.enabled) {
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);
    const padX = size * 0.35, padY = size * 0.2;
    const bx = (style.alignment === "left" ? box.x : style.alignment === "right" ? box.x + box.w - maxW : box.x + box.w / 2 - maxW / 2) - padX;
    const by = startY - lineHeight / 2 - padY;
    const bw = maxW + padX * 2;
    const bh = lines.length * lineHeight + padY * 2;
    const r = Math.min(size * 0.25, bw / 2, bh / 2);
    ctx.fillStyle = rgbaCss(style.background.color);
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();
  }

  if (style.shadow.enabled) {
    ctx.shadowColor = rgbaCss(style.shadow.color);
    ctx.shadowOffsetX = style.shadow.offsetX;
    ctx.shadowOffsetY = style.shadow.offsetY;
    ctx.shadowBlur = style.shadow.blur;
  }
  // Outline (border TextFill) drawn under the fill.
  const stroke = style.border.enabled;
  if (stroke) {
    ctx.strokeStyle = rgbaCss(style.border.color);
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.lineJoin = "round";
  }
  ctx.fillStyle = rgbaCss(style.color);
  let y = startY;
  for (const line of lines) {
    if (stroke) ctx.strokeText(line, anchorX, y);
    ctx.fillText(line, anchorX, y);
    y += lineHeight;
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

function drawLayer(ctx: CanvasRenderingContext2D, L: CompositedLayer, box: { x: number; y: number; w: number; h: number }, opts: DrawOpts) {
  if (L.mediaType === "text") {
    if (L.clip.textStyle && L.clip.textContent) drawText(ctx, L.clip.textStyle, L.clip.textContent, box);
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
