import { interpolate, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// Ported from `remotion/src/compositions/HeroDemo.tsx` beat 2: the editor "responds" motif — a
// ruler with tick marks, N colored tracks whose clips GROW in left-to-right (staggered), and a
// glowing green playhead sweeping across over the beat. This is the single most important "show
// the product working" primitive per the binding critique (#7). `props.tracks` (default 3, colors
// green / #b72dd2 / #f0b429 exactly matching HeroDemo) each optionally take `{color, width, delay}`
// overrides via `props.tracks: [{color, width}]`; otherwise the HeroDemo defaults are used.

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

const DEFAULT_TRACKS = [
  { color: TOKENS.green, width: 0.9, delay: 0 },
  { color: "#b72dd2", width: 0.7, delay: 6 },
  { color: "#f0b429", width: 0.82, delay: 12 },
];

interface TrackSpec {
  color: string;
  width: number;
  delay: number;
}

function resolveTracks(raw: unknown): TrackSpec[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TRACKS;
  return raw.map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const fallback = DEFAULT_TRACKS[i % DEFAULT_TRACKS.length];
    return {
      color: o.color ? tokenColor(String(o.color)) : fallback.color,
      width: typeof o.width === "number" ? Math.max(0, Math.min(1, o.width)) : fallback.width,
      delay: typeof o.delay === "number" ? o.delay : i * 6,
    };
  });
}

export const Timeline: React.FC<PrimitiveProps> = ({ props, frame, width, height, opacity, blur, position, enter }) => {
  const tracks = resolveTracks(props.tracks);
  const delay = enter?.delay ?? 0;
  const local = frame - delay;

  const groupIn = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const playhead = interpolate(local, [6, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // Honor an authored props.width (fraction of frame width, clamped 0.2..1); default 0.66.
  const widthFrac = typeof props.width === "number" ? Math.max(0.2, Math.min(1, props.width)) : 0.66;
  const boxW = width * widthFrac;
  const trackH = height * 0.045;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: "translate(-50%, -50%)",
        width: boxW,
        opacity: opacity * groupIn,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
      }}
    >
      {/* ruler */}
      <div style={{ position: "relative", height: 16, marginBottom: 10 }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(i / 12) * 100}%`,
              top: 0,
              width: 1,
              height: i % 3 === 0 ? 16 : 9,
              background: TOKENS.white,
            }}
          />
        ))}
        {/* glowing green playhead sweeping across */}
        <div
          style={{
            position: "absolute",
            left: `${playhead * 100}%`,
            top: -4,
            width: 2,
            height: (trackH + 8) * tracks.length + 20,
            background: TOKENS.greenHi,
            boxShadow: `0 0 10px ${TOKENS.greenHi}`,
          }}
        />
      </div>
      {/* N tracks with clips growing in */}
      {tracks.map((t, i) => {
        const grow = interpolate(local, [t.delay, t.delay + 20], [0, t.width], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        });
        return (
          <div
            key={i}
            style={{
              height: trackH,
              marginBottom: 8,
              background: "rgba(255,255,255,0.03)",
              borderRadius: 6,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${grow * 100}%`,
                background: t.color,
                opacity: 0.85,
                borderRadius: 6,
                boxShadow: `0 0 20px ${t.color}55`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
