import { interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS, tokenColor } from "./tokens";

// Kinetic typography element ("textOnPath") — text arcs along a path (arc/wave/diagonal), each
// word landing individually with its own spring + kinetic scale/rotate, emphasis words picked out
// in green/gold. This is the "landing as a composition, not a monospace line centered" fix
// (binding critique #6): every word gets its own position along the path and its own entrance
// timing, so the whole line reads as a designed arrangement rather than a single static string.
//
// `props.text`: the line. `props.path`: "arc" | "wave" | "diagonal" (default "arc").
// `props.emphasis`: number[] — word indices to render in accent green/gold with extra kinetic
// punch (scale/rotate overshoot).

type PathKind = "arc" | "wave" | "diagonal";

function resolveEmphasis(raw: unknown): Set<number> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((n): n is number => typeof n === "number"));
}

/** Per-word offset (dx, dy, rotate deg) along the chosen path, as a function of the word's
 * normalized position `t` (0..1 across the line) and total word count. */
function pathOffset(path: PathKind, t: number, amplitude: number): { dx: number; dy: number; rotate: number } {
  const centered = t - 0.5; // -0.5..0.5
  if (path === "wave") {
    const y = Math.sin(t * Math.PI * 2) * amplitude;
    return { dx: 0, dy: y, rotate: Math.cos(t * Math.PI * 2) * 6 };
  }
  if (path === "diagonal") {
    return { dx: 0, dy: centered * amplitude * 2, rotate: 0 };
  }
  // "arc": classic upward arc, apex in the middle, words toward the edges dip down and rotate
  // slightly outward — a gentle smile-shaped baseline.
  const y = centered * centered * amplitude * 4; // parabola, 0 at center, rises at edges
  const rotate = centered * -14;
  return { dx: 0, dy: y, rotate };
}

export const TextOnPath: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, position, enter, style }) => {
  const text = typeof props.text === "string" ? props.text : "";
  const path = (props.path === "wave" || props.path === "diagonal" ? props.path : "arc") as PathKind;
  const emphasis = resolveEmphasis(props.emphasis);
  const words = text.split(" ").filter(Boolean);
  if (words.length === 0) return null;

  const delay = enter?.delay ?? 0;
  const local = frame - delay;
  const size = style?.size ?? 0.1;
  const fontSize = Math.round(Math.min(width, height) * size); // min() keeps portrait (9:16) titles inside the narrow frame
  const amplitude = fontSize * 0.7;

  const groupIn = spring({ frame: local, fps, config: { damping: 16, mass: 0.7 } });
  const trackWidth = Math.min(width * 0.86, fontSize * text.length * 0.62);

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: "translate(-50%, -50%)",
        width: trackWidth,
        height: fontSize * 2.4,
        opacity: opacity * groupIn,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
      }}
    >
      {words.map((word, i) => {
        const t = words.length === 1 ? 0.5 : i / (words.length - 1);
        const { dx, dy, rotate } = pathOffset(path, t, amplitude);
        const leftPct = (i + 0.5) / words.length; // even horizontal slot per word

        // Each word lands on its own staggered spring — later words land slightly after earlier
        // ones so the line assembles left-to-right rather than popping in all at once.
        const wordDelay = i * 4;
        const wp = spring({ frame: local - wordDelay, fps, config: { damping: 13, mass: 0.6 } });
        const isEmphasis = emphasis.has(i);
        const kineticScale = interpolate(wp, [0, 1], [isEmphasis ? 1.6 : 1.3, isEmphasis ? 1.08 : 1]);
        const landRotate = interpolate(wp, [0, 1], [rotate * 2.4, rotate]);
        const wordOpacity = wp;
        const color = isEmphasis ? (i % 2 === 0 ? TOKENS.greenHi : TOKENS.gold) : (props.color ? tokenColor(String(props.color)) : TOKENS.ink);

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${leftPct * 100}%`,
              top: "50%",
              transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${landRotate}deg) scale(${kineticScale})`,
              opacity: wordOpacity,
              fontFamily: TOKENS.fontSans,
              fontWeight: isEmphasis ? 900 : 800,
              fontSize,
              color,
              letterSpacing: -1,
              whiteSpace: "pre",
              textShadow: isEmphasis ? `0 0 24px ${color}66` : undefined,
            }}
          >
            {word}
          </div>
        );
      })}
    </div>
  );
};
