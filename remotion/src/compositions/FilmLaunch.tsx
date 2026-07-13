import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing } from "remotion";

// FilmLaunch — a bespoke, hand-authored launch film. No preset system, no SceneSpec: raw frames,
// raw springs, hand-placed positions, optical alignment eyeballed against the reference films
// (hero-demo / condense-demo). 1080p (16:9), ~13s. Authored, not generated.
//
// Palette (exact, from the app logo): near-black #0b0a0d, Kaestral green #16b16a / #1fce7e,
// gold hairline rgba(201,162,39,.55), white hairline rgba(255,255,255,.10), slate #484852 / #2b2931.

const BLACK = "#0b0a0d";
const GREEN = "#16b16a";
const GREEN_HI = "#1fce7e";
const GOLD = "rgba(201,162,39,0.55)";
const WHITE_LINE = "rgba(255,255,255,0.10)";
const INK = "#eaeaef";
const INK_DIM = "rgba(255,255,255,0.55)";
const SANS = "'Inter','Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono','Consolas',monospace";

// One easing curve for everything non-spring — a soft, confident ease-out. This single curve used
// consistently is a big part of what reads as "one hand made this".
const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

// ---- ambient layers (shared, drawn on every beat so the frame always has the same texture) ----
const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = (frame * 0.14) % 72;
  return (
    <AbsoluteFill style={{ opacity: 0.5 }}>
      {Array.from({ length: Math.ceil(width / 72) + 2 }).map((_, i) => (
        <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 72 - drift, width: 1, background: WHITE_LINE }} />
      ))}
      {Array.from({ length: Math.ceil(height / 72) + 2 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * 72 - drift, height: 1, background: WHITE_LINE }} />
      ))}
    </AbsoluteFill>
  );
};

const Glow: React.FC<{ cx?: number; cy?: number }> = ({ cx = 50, cy = 46 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = 0.2 + 0.06 * Math.sin((frame / fps) * 1.5);
  const a = Math.round(g * 255).toString(16).padStart(2, "0");
  return <AbsoluteFill style={{ background: `radial-gradient(44% 40% at ${cx}% ${cy}%, ${GREEN}${a} 0%, transparent 62%)` }} />;
};

// The three-bar Kaestral mark, bars sliding in staggered from the left.
const LogoMark: React.FC<{ frame: number; fps: number; s: number }> = ({ frame, fps, s }) => {
  const bar = (i: number) => {
    const p = spring({ frame: frame - i * 5, fps, config: { damping: 15, mass: 0.7 } });
    return { transform: `translateX(${interpolate(p, [0, 1], [-38, 0])}px)`, opacity: p };
  };
  const w = 200 * s, h = 48 * s, gap = 16 * s, r = 11 * s;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <div style={{ width: w, height: h, borderRadius: r, background: GREEN, boxShadow: `0 0 ${30 * s}px rgba(31,206,126,0.55)`, ...bar(0) }} />
      <div style={{ width: w * 0.72, height: h, borderRadius: r, background: "#484852", ...bar(1) }} />
      <div style={{ width: w * 0.86, height: h, borderRadius: r, background: "#2b2931", ...bar(2) }} />
    </div>
  );
};

export interface FilmLaunchProps {
  durationSeconds?: number;
}

export const FilmLaunch: React.FC<FilmLaunchProps> = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const outFade = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: BLACK, fontFamily: SANS, opacity: outFade }}>

      {/* ============ BEAT 1 — cold open: the kestrel line (0–78) ============ */}
      <Sequence from={0} durationInFrames={84}>
        <Beat1 />
      </Sequence>

      {/* ============ BEAT 2 — the thesis (72–174) ============ */}
      <Sequence from={72} durationInFrames={108}>
        <Beat2 />
      </Sequence>

      {/* ============ BEAT 3 — it edits on a real timeline (168–288) ============ */}
      <Sequence from={168} durationInFrames={120}>
        <Beat3 />
      </Sequence>

      {/* ============ BEAT 4 — logo lockup (282–end) ============ */}
      <Sequence from={282} durationInFrames={108}>
        <Beat4 />
      </Sequence>
    </AbsoluteFill>
  );
};

// ---- Beat 1: "A kestrel watches." left-anchored, gold hairline drawing under it, a subline. ----
const Beat1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const fade = interpolate(local, [70, 84], [1, 0], { extrapolateLeft: "clamp" }); // resolve out into the wipe

  const t = spring({ frame: local, fps, config: { damping: 15 } });
  const rule = interpolate(local, [10, 32], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const words = "Total precision. Then it strikes.".split(" ");

  // slow push-in on the whole beat
  const push = 1 + interpolate(local, [0, 84], [0, 0.04], { easing: ease });

  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Glow cx={40} cy={44} />
      <Grid />
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        {/* left column, optically set: title baseline ~0.44, hairline just under, subline under that */}
        <div style={{ position: "absolute", left: "12%", top: "40%", opacity: t, transform: `translateY(${interpolate(t, [0, 1], [22, 0])}px)`,
          fontWeight: 800, fontSize: Math.round(height * 0.072), letterSpacing: -1.5, color: INK }}>
          A kestrel watches.
        </div>
        <div style={{ position: "absolute", left: "12%", top: "52%", width: interpolate(rule, [0, 1], [0, width * 0.2]), height: 2,
          background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />
        <div style={{ position: "absolute", left: "12%", top: "56%", display: "flex", gap: "0.4ch",
          fontFamily: MONO, fontSize: Math.round(height * 0.024), color: INK_DIM, letterSpacing: 0.5 }}>
          {words.map((w, i) => {
            const wp = spring({ frame: local - 16 - i * 4, fps, config: { damping: 16 } });
            return <span key={i} style={{ opacity: wp, transform: `translateY(${interpolate(wp, [0, 1], [12, 0])}px)`, display: "inline-block" }}>{w}</span>;
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---- Beat 2: the thesis. Two lines centered, green second line, underline. Hero's discipline. ----
const Beat2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inWipe = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [96, 108], [1, 0], { extrapolateLeft: "clamp" });

  const line1 = spring({ frame: local - 6, fps, config: { damping: 15 } });
  const line2 = spring({ frame: local - 22, fps, config: { damping: 15 } });
  const underline = interpolate(local, [30, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const size = Math.round(height * 0.086);
  const push = 1 + interpolate(local, [0, 108], [0, 0.03], { easing: ease });

  return (
    <AbsoluteFill style={{ opacity: fade * inWipe }}>
      <Glow cx={50} cy={44} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `scale(${push})` }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: INK, opacity: line1,
            transform: `translateY(${interpolate(line1, [0, 1], [22, 0])}px)` }}>
            You describe the edit.
          </div>
          <div style={{ fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: GREEN_HI, marginTop: 8, opacity: line2,
            transform: `translateY(${interpolate(line2, [0, 1], [22, 0])}px)` }}>
            It makes it.
          </div>
          <div style={{ margin: "26px auto 0", height: 2, width: interpolate(underline, [0, 1], [0, size * 2.6]),
            background: GREEN, borderRadius: 2, boxShadow: `0 0 18px ${GREEN}` }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---- Beat 3: shows the product. A real multi-track timeline fills; playhead sweeps; title top-left. ----
const Beat3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inWipe = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [108, 120], [1, 0], { extrapolateLeft: "clamp" });

  const title = spring({ frame: local - 4, fps, config: { damping: 15 } });
  const rule = interpolate(local, [14, 36], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // timeline geometry — centered lower third, three tracks growing staggered, playhead sweeping
  const tlW = width * 0.6, tlX = (width - tlW) / 2, tlY = height * 0.56;
  const trackH = 30, gap = 10;
  const tracks = [
    { c: GREEN, w: 0.92, d: 10 },
    { c: "#b72dd2", w: 0.72, d: 16 },
    { c: "#f0b429", w: 0.84, d: 22 },
  ];
  const playhead = interpolate(local, [14, 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const chips = ["cut", "caption", "punch", "grade"];
  const hot = Math.min(chips.length - 1, Math.max(0, Math.floor((local - 30) / 12)));

  return (
    <AbsoluteFill style={{ opacity: fade * inWipe }}>
      <Glow cx={50} cy={52} />
      <Grid />

      {/* title top-left, gold hairline anchoring the left column */}
      <div style={{ position: "absolute", left: "12%", top: "26%", opacity: title, transform: `translateY(${interpolate(title, [0, 1], [20, 0])}px)`,
        fontWeight: 800, fontSize: Math.round(height * 0.05), letterSpacing: -1.2, color: INK }}>
        It edits on a real timeline.
      </div>
      <div style={{ position: "absolute", left: "12%", top: "36%", width: interpolate(rule, [0, 1], [0, width * 0.16]), height: 2, background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />

      {/* the timeline */}
      <div style={{ position: "absolute", left: tlX, top: tlY, width: tlW }}>
        {/* ruler ticks */}
        <div style={{ position: "relative", height: 14, marginBottom: 10 }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <div key={i} style={{ position: "absolute", left: `${(i / 12) * 100}%`, top: 0, width: 1, height: i % 3 === 0 ? 14 : 8, background: WHITE_LINE }} />
          ))}
        </div>
        {tracks.map((t, i) => {
          const grow = interpolate(local, [t.d, t.d + 22], [0, t.w], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
          return (
            <div key={i} style={{ height: trackH, marginBottom: gap, background: "rgba(255,255,255,0.03)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${grow * 100}%`, background: t.c, opacity: 0.9, borderRadius: 6, boxShadow: `0 0 18px ${t.c}55` }} />
            </div>
          );
        })}
        {/* playhead */}
        <div style={{ position: "absolute", left: `${playhead * 100}%`, top: -6, width: 2, height: (trackH + gap) * 3 + 14, background: GREEN_HI, boxShadow: `0 0 10px ${GREEN_HI}` }} />
      </div>

      {/* caption chips band, under the timeline */}
      <div style={{ position: "absolute", left: 0, right: 0, top: "82%", display: "flex", justifyContent: "center", gap: 16 }}>
        {chips.map((w, i) => {
          const wp = spring({ frame: local - 30 - i * 6, fps, config: { damping: 16 } });
          const isHot = i === hot;
          return (
            <span key={i} style={{ opacity: wp, transform: `translateY(${interpolate(wp, [0, 1], [14, 0])}px)`,
              fontWeight: 700, fontSize: Math.round(height * 0.03), color: isHot ? GREEN_HI : INK,
              background: isHot ? "rgba(31,206,126,0.14)" : "transparent", padding: "2px 14px", borderRadius: 10,
              boxShadow: isHot ? "0 0 22px rgba(31,206,126,0.25)" : undefined }}>{w}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---- Beat 4: logo lockup with a soft specular sweep. Holds. ----
const Beat4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inWipe = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  const word = spring({ frame: local - 12, fps, config: { damping: 16 } });
  const sub = spring({ frame: local - 26, fps, config: { damping: 16 } });
  const rule = interpolate(local, [20, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  // specular sweep across the lockup, one slow pass
  const sweep = interpolate(local, [10, 70], [-40, 140], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const push = 1 + interpolate(local, [0, 108], [0, 0.05], { easing: ease });

  return (
    <AbsoluteFill style={{ opacity: inWipe }}>
      <Glow cx={50} cy={46} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", transform: `scale(${push})` }}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 30 }}>
          <LogoMark frame={local} fps={fps} s={0.82} />
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontWeight: 800, fontSize: Math.round(height * 0.1), letterSpacing: -3, color: INK,
              opacity: word, transform: `translateX(${interpolate(word, [0, 1], [-28, 0])}px)` }}>
              Kaestral
            </div>
          </div>
          {/* specular band */}
          <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen",
            background: `linear-gradient(105deg, transparent ${sweep - 8}%, rgba(255,255,255,0.22) ${sweep}%, transparent ${sweep + 8}%)` }} />
        </div>
        <div style={{ marginTop: 18, height: 2, width: interpolate(rule, [0, 1], [0, width * 0.14]), background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />
        <div style={{ marginTop: 22, fontFamily: MONO, fontSize: Math.round(height * 0.024), color: INK_DIM, letterSpacing: 1,
          opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [14, 0])}px)` }}>
          The AI-operated video editor for Windows
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
