import { interpolate, spring, Easing } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";
import { bezierFromSpec } from "./easing";

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
    // TASK 5 UPGRADE — `enter.spring` lets an authored spec tune the entrance's physics
    // (damping/mass/stiffness) instead of always getting the hardcoded `{damping:15}` default.
    const springConfig = enter?.spring ?? { damping: 15, mass: 1, stiffness: 100 };
    const p = spring({ frame: local, fps, config: springConfig });
    animOpacity = p;
    const from = enter?.from ?? "below";
    // Pure directional slide, no scale (forensic delta #1 — HeroDemo display text never scale-pops).
    // `scale` from-mode is the one deliberate exception: it exists precisely for an author who wants
    // a scale entrance, and it's a gentle 0.92 (was 0.85 — a big scale reads cheap).
    if (from === "below") translateY = interpolate(p, [0, 1], [22, 0]);
    else if (from === "left") translateX = interpolate(p, [0, 1], [-30, 0]);
    else if (from === "scale") scale = interpolate(p, [0, 1], [0.92, 1]);
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
  } else if (enter?.easing === "linear" || (enter?.easing !== undefined && enter.easing !== "spring")) {
    // Explicit escape hatch: a spec that sets an explicit easing OTHER than "spring" (the literal
    // preset "linear", OR a custom `{curve:[...]}` bezier) must render a plain fade shaped by that
    // curve, never the hardcoded spring default below (defaults only fill gaps, they never override
    // an authored choice) — also covers karaoke/draw/collapse/maskReveal until later tasks implement
    // them. TASK 5 UPGRADE — routes through `bezierFromSpec` so a custom curve (not just the
    // "linear" preset) is honored here too, via the single shared bezier-resolution path.
    animOpacity = interpolate(local, [0, 12], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(...bezierFromSpec(enter?.easing)),
    });
  } else {
    // DEFAULT (no anim authored, or anim falls through e.g. karaoke/draw/collapse/maskReveal):
    // EXACT HeroDemo thesis-line entrance — spring(damping 15), opacity = spring, and a pure
    // translateY 22->0 rise. NO scale: HeroDemo's display text does not scale-pop, and a scale on
    // display type is the single biggest "template" tell (forensic delta #1). Match the bar exactly.
    const p = spring({ frame: local, fps, config: { damping: 15 } });
    animOpacity = p;
    translateY = interpolate(p, [0, 1], [22, 0]);
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        // TASK 10 UPGRADE — optical baseline finish (ENGINE-DEFECTS.md root cause D):
        // translate(-50%,-50%) centers the LINE BOX (which includes descender space below the
        // caps), so caps-height display text sits optically low relative to its anchor. The extra
        // `translateY(-0.08em)` nudges it up by a font-relative amount (em scales with this
        // element's own computed fontSize, so it stays proportionally correct at any `style.size`)
        // to match how HeroDemo's thesis line sits — HeroDemo achieves the same effect implicitly
        // via its specific line-height/margin combination; this makes it explicit and universal.
        transform: `translate(-50%, calc(-50% - 0.08em)) translate(${translateX}px, ${translateY}px) scale(${scale})`,
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
