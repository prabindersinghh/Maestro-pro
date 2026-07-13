import { interpolate, spring } from "remotion";
import type { PrimitiveProps } from "./types";
import { TOKENS } from "./tokens";

// Ported from `remotion/src/compositions/CondenseReel.tsx` beat 3: karaoke-style caption chips —
// each word springs in staggered (translateY settle), and the "hot" word gets a green pill
// highlight (background rgba(31,206,126,0.14) + green-hi text) exactly like CondenseReel's fourth
// word ("hook"). `props.words: string[]` supplies the caption; `props.highlightIndex` optionally
// pins which word is hot (defaults to the last word, matching CondenseReel). Without an explicit
// pin, the highlight also sweeps across words over time so long caption lines still read as
// "karaoke" rather than a single static highlight.

export const CaptionKaraoke: React.FC<PrimitiveProps> = ({ props, frame, fps, width, height, opacity, blur, position, enter, style }) => {
  const words = Array.isArray(props.words) ? (props.words as unknown[]).map(String) : ["this", "is", "the", "hook"];
  // Honor an authored style.size (fraction of the frame's short edge, like Text). The previous
  // hardcoded width*0.06 ignored the spec author and produced enormous chips at 1920px wide.
  const fontSize = Math.round((style?.size ?? 0.045) * Math.min(width, height));
  const delay = enter?.delay ?? 0;
  const local = frame - delay;

  const groupIn = spring({ frame: local, fps, config: { damping: 15 } });

  const pinnedIndex = typeof props.highlightIndex === "number" ? Math.round(props.highlightIndex) : undefined;
  // Sweeping highlight: advances one word roughly every 10 frames after the group has settled in,
  // so the "karaoke" read-along effect is visible even when the spec doesn't pin a word.
  const sweepIndex = Math.min(words.length - 1, Math.max(0, Math.floor((local - 10) / 10)));
  const hotIndex = pinnedIndex ?? sweepIndex;

  return (
    <div
      style={{
        position: "absolute",
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
        transform: "translate(-50%, -50%)",
        opacity: opacity * groupIn,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, maxWidth: width * 0.8 }}>
        {words.map((w, i) => {
          const wp = spring({ frame: local - 10 - i * 8, fps, config: { damping: 16 } });
          const hot = i === hotIndex;
          return (
            <span
              key={i}
              style={{
                opacity: wp,
                transform: `translateY(${interpolate(wp, [0, 1], [16, 0])}px)`,
                fontWeight: 800,
                fontFamily: TOKENS.fontSans,
                fontSize,
                color: hot ? TOKENS.greenHi : TOKENS.ink,
                background: hot ? "rgba(31,206,126,0.14)" : "transparent",
                padding: "2px 14px",
                borderRadius: 12,
                letterSpacing: -1,
                boxShadow: hot ? `0 0 24px rgba(31,206,126,0.25)` : undefined,
                transition: "none",
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
};
