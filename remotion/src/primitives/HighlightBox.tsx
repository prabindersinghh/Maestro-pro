import { interpolate, spring, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// A "look here" callout: a rounded rect whose border DRAWS ON around `props.rect`
// ({x,y,w,h} normalized 0..1 of frame width/height), gold or green accent (default gold hairline,
// matching the brand's callout-accent convention), then settles into a subtle pulse (breathing
// opacity) once drawn — never a static instant-appear box. Pairs with ScreenMock/Image + Arrow to
// call out specific UI regions of a real product screenshot.

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

function toRect(v: unknown, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const fallback = { x: 0.3, y: 0.3, w: 0.3, h: 0.2 };
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const x = typeof o.x === "number" ? o.x : fallback.x;
  const y = typeof o.y === "number" ? o.y : fallback.y;
  const w = typeof o.w === "number" ? o.w : fallback.w;
  const h = typeof o.h === "number" ? o.h : fallback.h;
  return { x: x * width, y: y * height, w: w * width, h: h * height };
}

export const HighlightBox: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, enter }) => {
  const color = props.color ? tokenColor(String(props.color)) : TOKENS.gold;
  const radius = typeof props.radius === "number" ? props.radius : 14;
  const thickness = typeof props.thickness === "number" ? props.thickness : 2.5;
  const rect = toRect(props.rect, width, height);

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const p = spring({ frame: local, fps, config: { damping: 17, mass: 0.7 } });
  const drawEnd = 26;
  const draw = interpolate(local, [0, drawEnd], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // Perimeter length for the dash-draw effect (rounded rect approximated as a plain rect perimeter,
  // close enough visually at typical corner radii).
  const perimeter = 2 * (rect.w + rect.h);

  // Pulse kicks in once the draw has finished settling.
  const pulseLocal = Math.max(0, local - drawEnd - 4);
  const pulse = 0.85 + 0.15 * Math.sin(pulseLocal * 0.12);
  const pulseOpacity = draw >= 1 ? pulse : 1;

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        opacity: opacity * interpolate(p, [0, 1], [0, 1]) * pulseOpacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        overflow: "visible",
      }}
    >
      <defs>
        <filter id="hbox-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={radius}
        ry={radius}
        fill="none"
        stroke={color}
        strokeWidth={thickness}
        strokeDasharray={perimeter}
        strokeDashoffset={interpolate(draw, [0, 1], [perimeter, 0])}
        filter="url(#hbox-glow)"
      />
    </svg>
  );
};
