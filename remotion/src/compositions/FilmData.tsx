import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing } from "remotion";

// FilmData — a bespoke, hand-authored vertical (9:16) data-story. Raw Remotion, hand-placed for a
// portrait frame. 1080x1920, ~12.4s. Authored, not generated.

const BLACK = "#0b0a0d";
const GREEN = "#16b16a";
const GREEN_HI = "#1fce7e";
const GOLD = "rgba(201,162,39,0.55)";
const WHITE_LINE = "rgba(255,255,255,0.10)";
const INK = "#eaeaef";
const INK_DIM = "rgba(255,255,255,0.55)";
const RED = "#e5484d";
const SANS = "'Inter','Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono','Consolas',monospace";
const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

const Grid: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = (frame * 0.12) % 64;
  return (
    <AbsoluteFill style={{ opacity: 0.5 }}>
      {Array.from({ length: Math.ceil(width / 64) + 2 }).map((_, i) => (
        <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 64 - drift, width: 1, background: WHITE_LINE }} />
      ))}
      {Array.from({ length: Math.ceil(height / 64) + 2 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * 64 - drift, height: 1, background: WHITE_LINE }} />
      ))}
    </AbsoluteFill>
  );
};
const Glow: React.FC<{ cy?: number }> = ({ cy = 44 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = 0.2 + 0.06 * Math.sin((frame / fps) * 1.5);
  const a = Math.round(g * 255).toString(16).padStart(2, "0");
  return <AbsoluteFill style={{ background: `radial-gradient(40% 26% at 50% ${cy}%, ${GREEN}${a} 0%, transparent 62%)` }} />;
};

export interface FilmDataProps { durationSeconds?: number }

export const FilmData: React.FC<FilmDataProps> = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const outFade = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: BLACK, fontFamily: SANS, opacity: outFade }}>
      <Sequence from={0} durationInFrames={78}><Stat /></Sequence>
      <Sequence from={72} durationInFrames={114}><Chart /></Sequence>
      <Sequence from={180} durationInFrames={114}><Delta /></Sequence>
      <Sequence from={288} durationInFrames={84}><Close /></Sequence>
    </AbsoluteFill>
  );
};

// ---- Stat: "20 min of raw footage. Nobody watches that." ----
const Stat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const fade = interpolate(local, [64, 78], [1, 0], { extrapolateLeft: "clamp" });
  const num = spring({ frame: local, fps, config: { damping: 15 } });
  const val = Math.round(interpolate(num, [0, 1], [0, 20]));
  const sub = spring({ frame: local - 18, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Glow cy={42} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: Math.round(width * 0.19), color: INK, letterSpacing: -2,
            fontVariantNumeric: "tabular-nums", opacity: num, transform: `translateY(${interpolate(num, [0, 1], [22, 0])}px)`,
            textShadow: `0 0 40px rgba(31,206,126,0.25)` }}>{val}<span style={{ color: GREEN_HI, fontSize: Math.round(width * 0.09) }}> min</span></div>
          <div style={{ marginTop: 18, fontWeight: 700, fontSize: Math.round(width * 0.05), color: INK_DIM,
            opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [16, 0])}px)` }}>of raw footage.</div>
          <div style={{ marginTop: 8, fontWeight: 700, fontSize: Math.round(width * 0.05), color: INK,
            opacity: interpolate(local, [30, 44], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>Nobody watches that.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---- Chart: "Shorts win the feed." growing bars 8/34/86 with count-up. ----
const Chart: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [102, 114], [1, 0], { extrapolateLeft: "clamp" });
  const title = spring({ frame: local - 4, fps, config: { damping: 15 } });

  const bars = [
    { label: "20 min", v: 8 },
    { label: "3 min", v: 34 },
    { label: "20 sec", v: 86 },
  ];
  const maxV = 86;
  const chartH = height * 0.42, chartTop = height * 0.34;
  const barW = width * 0.16, gap = width * 0.08;
  const totalW = bars.length * barW + (bars.length - 1) * gap;
  const baseX = (width - totalW) / 2;
  const axisY = chartTop + chartH;

  return (
    <AbsoluteFill style={{ opacity: fade * inFade }}>
      <Glow cy={40} />
      <Grid />
      <div style={{ position: "absolute", left: 0, right: 0, top: "20%", textAlign: "center", fontWeight: 800, fontSize: Math.round(width * 0.075), letterSpacing: -1.5, color: INK,
        opacity: title, transform: `translateY(${interpolate(title, [0, 1], [22, 0])}px)` }}>Shorts win the feed.</div>

      {/* gold axis line */}
      <div style={{ position: "absolute", left: baseX - 20, top: axisY, width: totalW + 40, height: 2, background: GOLD, boxShadow: `0 0 10px ${GOLD}` }} />

      {bars.map((b, i) => {
        const grow = interpolate(local, [8 + i * 6, 8 + i * 6 + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
        const h = (b.v / maxV) * chartH * grow;
        const x = baseX + i * (barW + gap);
        const count = Math.round(b.v * grow);
        return (
          <div key={i}>
            <div style={{ position: "absolute", left: x, top: axisY - h, width: barW, height: h, borderRadius: "6px 6px 0 0",
              background: `linear-gradient(180deg, ${GREEN_HI}, ${GREEN})`, boxShadow: `0 0 24px rgba(31,206,126,0.3)` }} />
            <div style={{ position: "absolute", left: x, top: axisY - h - Math.round(width * 0.06), width: barW, textAlign: "center",
              fontFamily: MONO, fontWeight: 700, fontSize: Math.round(width * 0.05), color: INK, fontVariantNumeric: "tabular-nums", opacity: grow }}>{count}</div>
            <div style={{ position: "absolute", left: x, top: axisY + 14, width: barW, textAlign: "center",
              fontFamily: MONO, fontSize: Math.round(width * 0.032), color: INK_DIM }}>{b.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---- Delta: "340% more minutes watched." big counter. ----
const Delta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [102, 114], [1, 0], { extrapolateLeft: "clamp" });
  const num = spring({ frame: local - 4, fps, config: { damping: 16 } });
  const val = Math.round(interpolate(num, [0, 1], [0, 340]));
  const sub = spring({ frame: local - 22, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill style={{ opacity: fade * inFade }}>
      <Glow cy={44} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: Math.round(width * 0.22), color: GREEN_HI, letterSpacing: -3,
            fontVariantNumeric: "tabular-nums", opacity: num, transform: `translateY(${interpolate(num, [0, 1], [24, 0])}px)`,
            textShadow: `0 0 50px rgba(31,206,126,0.4)` }}>{val}%</div>
          <div style={{ marginTop: 14, fontWeight: 700, fontSize: Math.round(width * 0.05), color: INK,
            opacity: sub, transform: `translateY(${interpolate(sub, [0, 1], [16, 0])}px)` }}>more minutes watched.</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---- Close: "Publish-ready in one prompt." ----
const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const line1 = spring({ frame: local - 6, fps, config: { damping: 15 } });
  const line2 = spring({ frame: local - 18, fps, config: { damping: 15 } });
  const rule = interpolate(local, [24, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const size = Math.round(width * 0.078);
  // three-bar mark
  const bar = (i: number) => { const p = spring({ frame: local - 8 - i * 5, fps, config: { damping: 15, mass: 0.7 } }); return { transform: `translateX(${interpolate(p, [0, 1], [-24, 0])}px)`, opacity: p }; };
  return (
    <AbsoluteFill style={{ opacity: inFade }}>
      <Glow cy={40} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: height * 0.03 }}>
          <div style={{ width: width * 0.22, height: width * 0.05, borderRadius: 10, background: GREEN, boxShadow: `0 0 24px rgba(31,206,126,0.5)`, ...bar(0) }} />
          <div style={{ width: width * 0.16, height: width * 0.05, borderRadius: 10, background: "#484852", ...bar(1) }} />
          <div style={{ width: width * 0.19, height: width * 0.05, borderRadius: 10, background: "#2b2931", ...bar(2) }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: INK, opacity: line1, transform: `translateY(${interpolate(line1, [0, 1], [22, 0])}px)` }}>Publish-ready</div>
          <div style={{ fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: GREEN_HI, opacity: line2, transform: `translateY(${interpolate(line2, [0, 1], [22, 0])}px)` }}>in one prompt.</div>
          <div style={{ margin: "22px auto 0", height: 2, width: interpolate(rule, [0, 1], [0, width * 0.2]), background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
