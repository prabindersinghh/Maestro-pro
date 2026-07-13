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
  } else if (anim === "wordStagger") {
    // TASK 6b3 — REAL per-word spring stagger (the hand-authored-film idiom): unlike wordReveal's
    // flat word-COUNT reveal (Math.floor of a count over time, all-visible words instantly fully
    // opaque, no per-word transform), each word here springs up INDEPENDENTLY — its own
    // opacity+translateY(12->0) driven by its own spring, offset by a fixed 4-frame stagger per
    // word index. The wrapper's own `animOpacity` stays 1 (set below): each word carries its own
    // opacity, so the outer div must not ALSO apply a wrapper-level fade (that would double-apply
    // and desync from the per-word timing proven by the render test).
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

  // TASK 5 FIX (per-property `animate` "sole driver" contract, see Generative.tsx's `BeatLayer`) —
  // `enter.neutralizeOpacity`/`enter.neutralizePosition` are independent: pin ONLY the specific
  // piece `layer.animate.<prop>` actually owns to its settled/rest value, as a final step AFTER the
  // branch above has computed its natural entrance — the branch selection and the OTHER (non-
  // neutralized) property's motion are completely untouched, so e.g. `animate.position` alone still
  // lets `animOpacity` play its normal entrance fade-in.
  if (enter?.neutralizeOpacity) animOpacity = 1;
  if (enter?.neutralizePosition) {
    translateX = 0;
    translateY = 0;
    scale = 1;
  }

  // TASK 6b1 — text ANCHOR: `text` layers used to unconditionally CENTER on `position` (translate
  // -50%,-50%), which runs a left-column title authored at e.g. x:0.12 off the left edge of the
  // frame. Anchor picks the horizontal placement relative to `position.x`:
  //   left   -> position.x is the text's LEFT edge   (base translateX 0)
  //   right  -> position.x is the text's RIGHT edge  (base translateX -100%)
  //   center -> position.x is the text's CENTER      (base translateX -50%, unchanged default)
  // The vertical half (`calc(-50% - 0.08em)`, the optical-baseline nudge from TASK 10) is identical
  // across anchors. The entrance-driven translateX/translateY/scale must COMPOSE with this base
  // transform (appended, not overwritten) so spring/kinetic/etc. entrances still work per-anchor.
  const anchor = style?.anchor ?? "center";
  const baseTranslateX = anchor === "left" ? "0" : anchor === "right" ? "-100%" : "-50%";
  const textAlign = anchor === "left" ? "left" : anchor === "right" ? "right" : "center";

  // TASK 6b3 — wordStagger renders one span PER WORD instead of a single text node, each with its
  // own independent spring-driven opacity/translateY. The OUTER div (below) still owns anchor/
  // position/font/color/letterSpacing exactly like every other branch — this only lays the words
  // out in a row inside it, so anchor placement from Task 6b1 keeps working unmodified.
  const words = anim === "wordStagger" ? text.split(" ") : null;

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
        transform: `translate(${baseTranslateX}, calc(-50% - 0.08em)) translate(${translateX}px, ${translateY}px) scale(${scale})`,
        opacity: opacity * animOpacity,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        fontFamily: style?.font === "mono" ? TOKENS.fontMono : TOKENS.fontSans,
        fontWeight: 800,
        fontSize,
        color,
        letterSpacing: -1.5,
        textAlign,
        whiteSpace: "pre",
        ...(words ? { display: "flex", flexWrap: "nowrap" as const } : {}),
      }}
    >
      {words
        ? words.map((word, i) => {
            // `local` already has `enter.delay` subtracted (see top of component); each word adds
            // its own fixed 4-frame stagger on top of that shared base delay.
            const wp = spring({
              frame: local - i * 4,
              fps,
              config: enter?.spring ?? { damping: 16 },
            });
            const wordOpacity = enter?.neutralizeOpacity ? 1 : wp;
            const wordTranslateY = interpolate(wp, [0, 1], [12, 0]);
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  display: "inline-block",
                  opacity: wordOpacity,
                  transform: `translateY(${wordTranslateY}px)`,
                  marginRight: i < words.length - 1 ? "0.28em" : 0,
                  whiteSpace: "pre",
                }}
              >
                {word}
              </span>
            );
          })
        : visibleText}
    </div>
  );
};
