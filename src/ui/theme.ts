// Design tokens — ported verbatim from Palmier's Sources/PalmierPro/UI/AppTheme.swift so Kaestral
// matches the real app. Backgrounds/borders/text/track-colors/radii/spacing/font-sizes are the exact
// Palmier values; timeline layout constants come from Utilities/Constants.swift.

import type { CSSProperties } from "react";
import type { ClipType } from "../model/enums";

// AppTheme.Background / Border / Text / Accent / TrackColor
const bg = { base: "#0a0a0a", surface: "#161616", raised: "#1e1e1e", prominent: "#2c2c2c" };
const border = { primary: "rgba(255,255,255,0.16)", subtle: "rgba(255,255,255,0.12)", divider: "rgba(255,255,255,0.44)" };
const text = { primary: "rgba(255,255,255,1)", secondary: "rgba(255,255,255,0.80)", tertiary: "rgba(255,255,255,0.62)", muted: "rgba(255,255,255,0.34)" };

export const theme = {
  color: {
    // Palmier names (preferred going forward)
    base: bg.base,
    surface: bg.surface,
    raised: bg.raised,
    prominent: bg.prominent,
    borderPrimary: border.primary,
    borderSubtle: border.subtle,
    divider: border.divider,
    textPrimary: text.primary,
    textSecondary: text.secondary,
    textTertiary: text.tertiary,
    textMuted: text.muted,
    accent: "#f5efe4", // Accent.primary (warm off-white)
    timecode: "#f29933", // Accent.timecode rgb(0.95,0.6,0.2)
    playhead: "#ff4545", // Accent.spotlight rgb(1,0.27,0.27)
    selection: "#f5efe4",
    success: "#4fb85f",
    error: "#e54f4f",
    warning: "#e0a63b", // connecting / pending states (amber)
    errorBg: "#5a2020",
    errorBorder: "#a34",
    errorText: "#ffd9d9",
    onAccent: "#1a1a1a", // text color for content sitting on the accent (warm off-white) background

    // Back-compat aliases (older components reference these)
    bg: bg.base,
    panel: bg.surface,
    trackBg: bg.raised,
    trackBgAlt: bg.surface,
    trackHeader: bg.base,
    ruler: bg.base,
    rulerTick: "rgba(255,255,255,0.28)",
    border: border.primary,
    borderStrong: border.divider,
    text: text.primary,
    textDim: text.secondary,
    textFaint: text.muted,

    clip: {
      video: "#0091c2",
      image: "#b72dd2",
      audio: "#58a822",
      text: "#b72dd2",
      lottie: "#e0a800",
    } satisfies Record<ClipType, string>,
  },
  timeline: {
    pixelsPerFrame: 4.0,
    rulerHeight: 26,
    trackHeight: 52,
    dropZoneHeight: 56,
    headerWidth: 108,
    trimHandleWidth: 6,
    clipRadius: 4,
    insertThreshold: 10,
    toolbarHeight: 40,
    panelHeaderHeight: 38,
  },
  snap: { thresholdPixels: 8.0, stickyMultiplier: 1.5, playheadMultiplier: 1.5 },
  zoom: { min: 0.05, max: 40.0, floor: 0.0001, stepFactor: 1.25 },
  // AppTheme.Spacing
  space: { xxs: 2, xs: 4, sm: 6, smMd: 8, md: 10, mdLg: 12, lg: 14, lgXl: 16, xl: 20, xlXxl: 24, xxl: 28 },
  // AppTheme.Radius
  radius: { xs: 3, xsSm: 4, sm: 6, md: 10, mdLg: 12, lg: 14, xl: 20 },
  // AppTheme.FontSize
  fontSize: { micro: 8, xxs: 9, xs: 10, sm: 11, smMd: 12, md: 13, mdLg: 14, lg: 15, xl: 18, title1: 22, title2: 28, display: 36 },
  font: {
    ui: '-apple-system, system-ui, "Segoe UI", "Inter", sans-serif',
    mono: 'ui-monospace, "SF Mono", "Cascadia Code", "Geist Mono", monospace',
  },
} as const;

export function clipColor(type: ClipType): string {
  return theme.color.clip[type] ?? theme.color.clip.video;
}

/** Section header label styling used across the inspector (uppercase, tracked, tertiary). */
export const sectionLabelStyle: CSSProperties = {
  fontSize: theme.fontSize.xs, fontWeight: 600, letterSpacing: 0.8,
  textTransform: "uppercase", color: theme.color.textTertiary,
};
