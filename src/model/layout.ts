// Multi-video layouts — ported from Models/VideoLayout.swift + EditorViewModel+Layout.swift.
// A named layout has slots (normalized 0..1 rects); each clip assigned to a slot gets a
// transform + cover-crop so it FILLS the slot without stretching (fit="fill"), or is letterboxed
// inside it (fit="fit"). Anchors bias which part of a cover-cropped source survives.

import type { Crop, Transform } from "./types";
import { defaultTransform, defaultCrop } from "./defaults";

export interface LayoutRect { x: number; y: number; w: number; h: number }
export interface LayoutSlot { id: string; rect: LayoutRect; z: number }
export type LayoutFit = "fill" | "fit";

const PIP_INSET = 0.28;
const PIP_MARGIN = 0.035;
const pip = (insetX: number, insetY: number): LayoutSlot[] => [
  { id: "main", rect: { x: 0, y: 0, w: 1, h: 1 }, z: 0 },
  { id: "inset", rect: { x: insetX, y: insetY, w: PIP_INSET, h: PIP_INSET }, z: 1 },
];
const third = 1 / 3;

export const LAYOUTS: Record<string, LayoutSlot[]> = {
  full: [{ id: "main", rect: { x: 0, y: 0, w: 1, h: 1 }, z: 0 }],
  side_by_side: [
    { id: "left", rect: { x: 0, y: 0, w: 0.5, h: 1 }, z: 0 },
    { id: "right", rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, z: 0 },
  ],
  top_bottom: [
    { id: "top", rect: { x: 0, y: 0, w: 1, h: 0.5 }, z: 0 },
    { id: "bottom", rect: { x: 0, y: 0.5, w: 1, h: 0.5 }, z: 0 },
  ],
  pip_bottom_right: pip(1 - PIP_MARGIN - PIP_INSET, 1 - PIP_MARGIN - PIP_INSET),
  pip_bottom_left: pip(PIP_MARGIN, 1 - PIP_MARGIN - PIP_INSET),
  pip_top_right: pip(1 - PIP_MARGIN - PIP_INSET, PIP_MARGIN),
  pip_top_left: pip(PIP_MARGIN, PIP_MARGIN),
  grid_2x2: [
    { id: "top_left", rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, z: 0 },
    { id: "top_right", rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, z: 0 },
    { id: "bottom_left", rect: { x: 0, y: 0.5, w: 0.5, h: 0.5 }, z: 0 },
    { id: "bottom_right", rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, z: 0 },
  ],
  main_sidebar: [
    { id: "main", rect: { x: 0, y: 0, w: 0.7, h: 1 }, z: 0 },
    { id: "sidebar", rect: { x: 0.7, y: 0, w: 0.3, h: 1 }, z: 0 },
  ],
  three_up: [
    { id: "left", rect: { x: 0, y: 0, w: third, h: 1 }, z: 0 },
    { id: "center", rect: { x: third, y: 0, w: third, h: 1 }, z: 0 },
    { id: "right", rect: { x: third * 2, y: 0, w: third, h: 1 }, z: 0 },
  ],
};

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

function transformFromTopLeft(x: number, y: number, w: number, h: number): Transform {
  return { ...defaultTransform(), centerX: x + w / 2, centerY: y + h / 2, width: w, height: h };
}

// cropFittingAspect (EditorViewModel.swift): crop the source to `targetPixelAspect`, biased by anchor.
function cropFittingAspect(sw: number, sh: number, target: number, anchorX: number, anchorY: number): Crop {
  const base = defaultCrop();
  if (!(sw > 0 && sh > 0 && target > 0)) return base;
  const sourceAspect = sw / sh;
  if (Math.abs(sourceAspect - target) < 0.0001) return base;
  const ax = Math.min(1, Math.max(0, anchorX));
  const ay = Math.min(1, Math.max(0, anchorY));
  if (sourceAspect > target) {
    const total = 1 - target / sourceAspect;
    const left = total * ax;
    return { left, top: 0, right: total - left, bottom: 0 };
  }
  const total = 1 - sourceAspect / target;
  const top = total * ay;
  return { left: 0, top, right: 0, bottom: total - top };
}

/** Transform + crop that places a source of (sw×sh) into `rect` on a canvasW×canvasH frame. */
export function layoutPlacement(
  sw: number | undefined, sh: number | undefined,
  canvasW: number, canvasH: number,
  rect: LayoutRect, fit: LayoutFit, anchorX = 0.5, anchorY = 0.5,
): { transform: Transform; crop: Crop } {
  const canvasAspect = canvasW / Math.max(1, canvasH);
  const slotPixelAspect = rect.h > 0 ? (rect.w / rect.h) * canvasAspect : canvasAspect;

  if (fit === "fill") {
    const crop = (sw && sh) ? cropFittingAspect(sw, sh, slotPixelAspect, anchorX, anchorY) : defaultCrop();
    const vw = Math.max(0, 1 - crop.left - crop.right);
    const vh = Math.max(0, 1 - crop.top - crop.bottom);
    if (!(vw > 0 && vh > 0)) return { transform: transformFromTopLeft(rect.x, rect.y, rect.w, rect.h), crop };
    const w = rect.w / vw;
    const h = rect.h / vh;
    return { transform: transformFromTopLeft(rect.x - crop.left * w, rect.y - crop.top * h, w, h), crop };
  }

  // fit: letterbox the whole source inside the slot (no crop).
  const rel = (sw && sh && canvasW > 0 && canvasH > 0) ? (sw / sh) / canvasAspect : 0;
  if (!(rel > 0)) return { transform: transformFromTopLeft(rect.x, rect.y, rect.w, rect.h), crop: defaultCrop() };
  let drawW = rect.w, drawH = rect.h;
  if (rel * rect.h <= rect.w) { drawH = rect.h; drawW = rel * rect.h; } else { drawW = rect.w; drawH = rect.w / rel; }
  const ax = Math.min(1, Math.max(0, anchorX));
  const ay = Math.min(1, Math.max(0, anchorY));
  return {
    transform: transformFromTopLeft(rect.x + (rect.w - drawW) * ax, rect.y + (rect.h - drawH) * ay, drawW, drawH),
    crop: defaultCrop(),
  };
}
