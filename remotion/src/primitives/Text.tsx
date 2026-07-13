import { interpolate, spring, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// Ported from `remotion/src/compositions/HeroDemo.tsx` beat 3 (the thesis line): white display
// text with a green-accent second line, heavy weight, tight negative letter-spacing, spring
// entrance with a translateY settle. This is the quality baseline for every text render —
// do not soften the weight/letter-spacing or swap the spring for a cheaper linear fade.

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

function roleColor(role: string | undefined): string {
  if (role === "accent") return TOKENS.greenHi;
  if (role === "muted") return TOKENS.ink2;
  return TOKENS.ink; // "display" or unset
}

export const Text: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, position, enter, style }) => {
  const text = typeof props.text === "string" ? props.text : "";
  const delay = enter?.delay ?? 0;
  const local = frame - delay;

  const size = style?.size ?? 0.086; // fraction of height, matches HeroDemo's thesis line
  const fontSize = Math.round(Math.min(width, height) * size); // min() keeps portrait (9:16) titles inside the narrow frame
  const color = style?.role ? roleColor(style.role) : props.color ? tokenColor(String(props.color)) : roleColor(undefined);

  const anim = enter?.anim ?? "fade";

  let animOpacity = 1;
  let translateY = 0;
  let translateX = 0;
  let visibleText = text;
  let scale = 1;

  if (anim === "spring") {
    const p = spring({ frame: local, fps, config: { damping: 15 } });
    animOpacity = p;
    const from = enter?.from ?? "below";
    if (from === "below") translateY = interpolate(p, [0, 1], [22, 0]);
    else if (from === "left") translateX = interpolate(p, [0, 1], [-30, 0]);
    else if (from === "scale") scale = interpolate(p, [0, 1], [0.85, 1]);
  } else if (anim === "typewriter") {
    const typed = Math.floor(
      interpolate(local, [0, Math.max(10, text.length * 1.6)], [0, text.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ease,
      })
    );
    visibleText = text.slice(0, typed);
    animOpacity = interpolate(local, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  } else if (anim === "wordReveal") {
    const words = text.split(" ");
    const revealed = Math.floor(
      interpolate(local, [0, Math.max(8, words.length * 6)], [0, words.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: ease,
      })
    );
    visibleText = words.slice(0, revealed).join(" ");
    animOpacity = 1;
  } else if (anim === "kinetic") {
    const p = spring({ frame: local, fps, config: { damping: 12, mass: 0.6 } });
    animOpacity = p;
    translateY = interpolate(p, [0, 1], [40, 0]);
    scale = interpolate(p, [0, 1], [1.15, 1]);
  } else if (enter?.easing === "linear") {
    // Explicit escape hatch: a spec that sets easing:"linear" must render a plain linear fade,
    // never the spring default below (defaults only fill gaps, they never override an authored
    // choice) — also covers karaoke/draw/collapse/maskReveal until later tasks implement them.
    animOpacity = interpolate(local, [0, 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.linear,
    });
  } else {
    // DEFAULT (no anim authored, or anim falls through to this branch e.g. karaoke/draw/collapse/
    // maskReveal not yet implemented): spring rise with scale + translateY overshoot, matching
    // HeroDemo's thesis line — never a linear/bezier fade. Spring/overshoot is the default
    // entrance everywhere per the binding critique (#5: "everything overshoots, settles, has
    // spring physics").
    const p = spring({ frame: local, fps, config: { damping: 15 } });
    animOpacity = p;
    translateY = interpolate(p, [0, 1], [22, 0]);
    scale = interpolate(p, [0, 1], [0.94, 1]);
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(${scale})`,
        opacity: opacity * animOpacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        fontFamily: TOKENS.fontSans,
        fontWeight: 800,
        fontSize,
        color,
        letterSpacing: -1.5,
        textAlign: "center",
        whiteSpace: "pre",
      }}
    >
      {visibleText}
    </div>
  );
};
