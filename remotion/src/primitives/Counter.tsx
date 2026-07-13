import { interpolate, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// Big mono count-up display — `props.value` counts from 0 up to its target with an ease-out
// curve (never linear), tabular-nums so digits don't jitter width frame to frame, tight
// letter-spacing, and an optional green accent glow on the number itself (LogoMark/Shape-style
// bloom). `props.label` sits below in the muted ink tone; `props.prefix`/`props.suffix` wrap the
// number (e.g. "$", "%").

const ease = Easing.bezier(0.16, 1, 0.3, 1); // strong ease-out, no overshoot needed for a counter

export const Counter: React.FC<PrimitiveProps> = ({ props, frame, width, height, opacity, blur, position, enter, style }) => {
  const target = typeof props.value === "number" ? props.value : 0;
  const label = typeof props.label === "string" ? props.label : undefined;
  const prefix = typeof props.prefix === "string" ? props.prefix : "";
  const suffix = typeof props.suffix === "string" ? props.suffix : "";
  const decimals = typeof props.decimals === "number" ? Math.max(0, Math.round(props.decimals)) : 0;
  const accented = props.accent !== false; // green accent on by default
  const color = accented ? TOKENS.greenHi : props.color ? tokenColor(String(props.color)) : TOKENS.ink;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;

  const groupIn = interpolate(local, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const countP = interpolate(local, [4, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const shown = target * countP;
  const display = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toLocaleString("en-US");

  const scale = interpolate(groupIn, [0, 1], [0.9, 1]);
  const size = style?.size ?? 0.14;
  const fontSize = Math.round(Math.min(width, height) * size); // min() keeps portrait (9:16) titles inside the narrow frame

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: opacity * groupIn,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: TOKENS.fontMono,
          fontWeight: 800,
          fontSize,
          color,
          letterSpacing: -1,
          fontVariantNumeric: "tabular-nums",
          textShadow: accented ? `0 0 30px ${TOKENS.greenHi}66` : undefined,
        }}
      >
        {prefix}
        {display}
        {suffix}
      </div>
      {label && (
        <div
          style={{
            marginTop: 6,
            fontFamily: TOKENS.fontSans,
            fontSize: Math.round(fontSize * 0.22),
            color: TOKENS.ink2,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
};
