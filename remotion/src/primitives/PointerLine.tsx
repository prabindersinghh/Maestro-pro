import { interpolate, spring, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// A thin hairline callout from `props.from` to `props.to` (normalized {x,y}) with a mono-font
// label chip anchored at the `to` end (`props.label`) — the "annotation leader line" motif, more
// understated than Arrow (no arrowhead, just a hairline + tag), used for labeling a specific point
// on a real product screenshot ("this is the timeline", "playhead here"). Draws on like
// Hairline/Arrow/HighlightBox — never appears instantly.

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

function toPoint(v: unknown, width: number, height: number, fallback: { x: number; y: number }): { x: number; y: number } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const x = typeof o.x === "number" ? o.x : fallback.x;
  const y = typeof o.y === "number" ? o.y : fallback.y;
  return { x: x * width, y: y * height };
}

export const PointerLine: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, enter }) => {
  const color = props.color ? tokenColor(String(props.color)) : TOKENS.ink2;
  const from = toPoint(props.from, width, height, { x: 0.3, y: 0.3 });
  const to = toPoint(props.to, width, height, { x: 0.55, y: 0.45 });
  const label = typeof props.label === "string" ? props.label : "";

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 18, mass: 0.6 } });
  const draw = interpolate(local, [0, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  const labelOpacity = interpolate(local, [14, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const dotScale = interpolate(p, [0, 1], [0.2, 1]);

  return (
    <>
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          opacity: opacity * interpolate(p, [0, 1], [0, 1]),
          filter: blur > 0 ? `blur(${blur}px)` : undefined,
          overflow: "visible",
        }}
      >
        <line
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke={color}
          strokeWidth={1}
          strokeDasharray={len}
          strokeDashoffset={interpolate(draw, [0, 1], [len, 0])}
        />
        <circle cx={from.x} cy={from.y} r={3.5 * dotScale} fill={color} />
        <circle cx={to.x} cy={to.y} r={3.5 * dotScale} fill={color} />
      </svg>
      {label && (
        <div
          style={{
            position: "absolute",
            left: to.x,
            top: to.y,
            transform: "translate(12px, -50%)",
            opacity: opacity * labelOpacity,
            filter: blur > 0 ? `blur(${blur}px)` : undefined,
            background: "rgba(18,17,22,0.92)",
            border: `1px solid ${TOKENS.white}`,
            borderRadius: 6,
            padding: "5px 10px",
            fontFamily: TOKENS.fontMono,
            fontSize: 15,
            color: TOKENS.ink,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </>
  );
};
