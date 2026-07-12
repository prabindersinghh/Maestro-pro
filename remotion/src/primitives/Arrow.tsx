import { interpolate, spring, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// A "look here" callout: an arrow that DRAWS ON via stroke-dashoffset from `props.from` to
// `props.to` (normalized {x,y}, 0..1 of frame width/height), green accent by default with a
// glowing arrowhead tip. Spring/ease-out entrance — never an instant pop-in, matching the
// draw-on physics used across Hairline/Waveform. Pairs with HighlightBox/PointerLine/SpotlightDim
// to point at real product screenshots (ScreenMock/Image) per the binding critique's "show the
// product" requirement.

function toPoint(v: unknown, width: number, height: number, fallback: { x: number; y: number }): { x: number; y: number } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const x = typeof o.x === "number" ? o.x : fallback.x;
    const y = typeof o.y === "number" ? o.y : fallback.y;
    return { x: x * width, y: y * height };
  }
  return { x: fallback.x * width, y: fallback.y * height };
}

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

export const Arrow: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, enter }) => {
  const color = props.color ? tokenColor(String(props.color)) : TOKENS.greenHi;
  const from = toPoint(props.from, width, height, { x: 0.2, y: 0.2 });
  const to = toPoint(props.to, width, height, { x: 0.5, y: 0.5 });
  const thickness = typeof props.thickness === "number" ? props.thickness : 3;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 16, mass: 0.7 } });
  const draw = interpolate(local, [0, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  // Pull the line back a bit so the arrowhead (drawn separately) sits at `to` without overlapping it.
  const headSize = Math.max(10, thickness * 6);
  const lineLen = Math.max(0, len - headSize * 0.6);

  const dashOffset = interpolate(draw, [0, 1], [lineLen, 0]);
  const headOpacity = interpolate(draw, [0.7, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const headScale = interpolate(p, [0, 1], [0.4, 1]);

  return (
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
      <defs>
        <filter id="arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line
        x1={from.x}
        y1={from.y}
        x2={from.x + (dx / len) * lineLen}
        y2={from.y + (dy / len) * lineLen}
        stroke={color}
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={lineLen}
        strokeDashoffset={dashOffset}
        filter="url(#arrow-glow)"
      />
      <g
        transform={`translate(${to.x}, ${to.y}) rotate(${angle}) scale(${headScale})`}
        opacity={headOpacity}
        filter="url(#arrow-glow)"
      >
        <polygon
          points={`0,0 ${-headSize},${-headSize * 0.42} ${-headSize},${headSize * 0.42}`}
          fill={color}
        />
      </g>
    </svg>
  );
};
