import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing } from "remotion";
import { KAESTRAL_UI } from "./kaestralUiAsset";

// FilmSaaS — a bespoke, hand-authored product demo. Raw Remotion, hand-placed. Shows the REAL
// Kaestral editor (baked-in capture) inside a browser window, with callouts. 1080p (16:9), ~14s.

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

export interface FilmSaaSProps { durationSeconds?: number }

export const FilmSaaS: React.FC<FilmSaaSProps> = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const outFade = interpolate(frame, [durationInFrames - 16, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: BLACK, fontFamily: SANS, opacity: outFade }}>
      <Sequence from={0} durationInFrames={72}><Hook /></Sequence>
      <Sequence from={66} durationInFrames={144}><ProductShot /></Sequence>
      <Sequence from={204} durationInFrames={108}><CutShot /></Sequence>
      <Sequence from={306} durationInFrames={114}><Close /></Sequence>
    </AbsoluteFill>
  );
};

// ---- Hook: two-line claim, left-anchored ----
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const fade = interpolate(local, [58, 72], [1, 0], { extrapolateLeft: "clamp" });
  const l1 = spring({ frame: local, fps, config: { damping: 15 } });
  const l2 = spring({ frame: local - 12, fps, config: { damping: 15 } });
  const rule = interpolate(local, [22, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const size = Math.round(height * 0.07);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Glow cx={40} cy={44} />
      <Grid />
      <div style={{ position: "absolute", left: "12%", top: "38%", fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: INK,
        opacity: l1, transform: `translateY(${interpolate(l1, [0, 1], [22, 0])}px)` }}>Ship product demos</div>
      <div style={{ position: "absolute", left: "12%", top: "50%", fontWeight: 800, fontSize: size, letterSpacing: -1.5, color: GREEN_HI,
        opacity: l2, transform: `translateY(${interpolate(l2, [0, 1], [22, 0])}px)` }}>without an editor.</div>
      <div style={{ position: "absolute", left: "12%", top: "62%", width: interpolate(rule, [0, 1], [0, width * 0.22]), height: 2, background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />
    </AbsoluteFill>
  );
};

// ---- ProductShot: the real editor in a browser window; arrow draws to it; highlight box; caption. ----
const ProductShot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [132, 144], [1, 0], { extrapolateLeft: "clamp" });

  // window: right of center, reveals up with a spring, gentle ken-burns drift
  const win = spring({ frame: local, fps, config: { damping: 16, mass: 0.9 } });
  const winW = width * 0.46, winH = winW * (800 / 1280) + 44; // chrome height added
  const winX = width * 0.52, winY = height * 0.5 - winH / 2;
  const drift = interpolate(local, [0, 144], [0, -14], { easing: ease });
  const chromeH = 40;

  // arrow from the title toward the window's preview area
  const ax0 = width * 0.34, ay0 = height * 0.4, ax1 = winX + winW * 0.18, ay1 = winY + chromeH + winH * 0.4;
  const arrow = interpolate(local, [22, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const title = spring({ frame: local - 6, fps, config: { damping: 15 } });

  // highlight box on the preview, draws on after the arrow
  const hb = interpolate(local, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const hbX = winX + winW * 0.44, hbY = winY + chromeH + winH * 0.22, hbW = winW * 0.5, hbH = winH * 0.5;

  return (
    <AbsoluteFill style={{ opacity: fade * inFade }}>
      <Glow cx={58} cy={50} />
      <Grid />

      {/* left copy */}
      <div style={{ position: "absolute", left: "8%", top: "30%", width: "24%", fontWeight: 800, fontSize: Math.round(height * 0.042), letterSpacing: -1.2, color: INK,
        opacity: title, transform: `translateY(${interpolate(title, [0, 1], [20, 0])}px)` }}>Point at your product.</div>

      {/* browser window with the REAL editor */}
      <div style={{ position: "absolute", left: winX, top: winY + drift, width: winW, opacity: win,
        transform: `translateY(${interpolate(win, [0, 1], [40, 0])}px)`, borderRadius: 14, overflow: "hidden",
        border: `1px solid ${WHITE_LINE}`, boxShadow: "0 50px 130px -20px rgba(0,0,0,0.85)" }}>
        <div style={{ height: chromeH, background: "#17161c", display: "flex", alignItems: "center", padding: "0 14px", gap: 8, borderBottom: `1px solid ${WHITE_LINE}` }}>
          <div style={{ width: 11, height: 11, borderRadius: 6, background: RED }} />
          <div style={{ width: 11, height: 11, borderRadius: 6, background: "#f0b429" }} />
          <div style={{ width: 11, height: 11, borderRadius: 6, background: GREEN }} />
          <div style={{ flex: 1, textAlign: "center", fontFamily: MONO, fontSize: 13, color: INK_DIM, letterSpacing: 0.5 }}>kaestral.dev</div>
        </div>
        <Img src={KAESTRAL_UI} style={{ display: "block", width: "100%" }} />
      </div>

      {/* arrow (SVG, draws on) */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <defs>
          <marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={GREEN_HI} />
          </marker>
        </defs>
        <line x1={ax0} y1={ay0} x2={ax0 + (ax1 - ax0) * arrow} y2={ay0 + (ay1 - ay0) * arrow}
          stroke={GREEN_HI} strokeWidth={3} markerEnd={arrow > 0.98 ? "url(#ah)" : undefined}
          style={{ filter: `drop-shadow(0 0 6px ${GREEN_HI})` }} />
      </svg>

      {/* highlight box */}
      <div style={{ position: "absolute", left: hbX, top: hbY, width: hbW, height: hbH, borderRadius: 8,
        border: `2px solid ${GREEN_HI}`, opacity: hb, boxShadow: `0 0 24px rgba(31,206,126,0.3)`,
        clipPath: `inset(0 ${(1 - hb) * 100}% 0 0)` }} />
    </AbsoluteFill>
  );
};

// ---- CutShot: waveform with red filler collapsing; "It cuts the boring parts itself." ----
const CutShot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const fade = interpolate(local, [96, 108], [1, 0], { extrapolateLeft: "clamp" });
  const title = spring({ frame: local - 4, fps, config: { damping: 15 } });

  const N = 26;
  const filler = new Set([3, 4, 9, 14, 15, 20]);
  const reveal = interpolate(local, [10, 34], [0, N], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const collapse = interpolate(local, [40, 66], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const barGap = width * 0.008, barW = width * 0.02;
  const totalW = N * barW + (N - 1) * barGap;

  return (
    <AbsoluteFill style={{ opacity: fade * inFade }}>
      <Glow cx={50} cy={50} />
      <Grid />
      <div style={{ position: "absolute", left: 0, right: 0, top: "24%", textAlign: "center", fontWeight: 800, fontSize: Math.round(height * 0.044), letterSpacing: -1.2, color: INK,
        opacity: title, transform: `translateY(${interpolate(title, [0, 1], [20, 0])}px)` }}>It cuts the boring parts itself.</div>

      <div style={{ position: "absolute", left: (width - totalW) / 2, top: "48%", display: "flex", alignItems: "center", gap: barGap, height: height * 0.2 }}>
        {Array.from({ length: N }).map((_, i) => {
          if (i >= reveal) return <div key={i} style={{ width: barW }} />;
          const h = 0.25 + 0.6 * Math.abs(Math.sin(i * 1.3));
          const isF = filler.has(i);
          const sc = isF ? 1 - collapse : 1;
          return <div key={i} style={{ width: barW * (isF ? Math.max(0.001, sc) : 1), height: `${h * 100}%`, borderRadius: 6,
            background: isF ? RED : GREEN, opacity: isF ? 0.9 * (1 - collapse) : 0.8 }} />;
        })}
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, top: "74%", textAlign: "center", fontFamily: MONO, fontSize: Math.round(height * 0.03), color: INK }}>
        <span style={{ color: RED, textDecoration: "line-through", opacity: 1 - collapse * 0.6 }}>filler</span>
        <span style={{ color: GREEN, margin: "0 14px" }}>→</span>
        <span style={{ color: GREEN_HI }}>hook, up front</span>
      </div>
    </AbsoluteFill>
  );
};

// ---- Close: logo + CTA + npx line, holds. ----
const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const local = frame;
  const inFade = interpolate(local, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const line = spring({ frame: local - 6, fps, config: { damping: 15 } });
  const rule = interpolate(local, [18, 42], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const cmd = "npx kaestral";
  const typed = Math.floor(interpolate(local, [30, 60], [0, cmd.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }));
  const caret = Math.floor(local / 8) % 2 === 0;

  return (
    <AbsoluteFill style={{ opacity: inFade }}>
      <Glow cx={50} cy={46} />
      <Grid />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: Math.round(height * 0.062), letterSpacing: -1.5, color: INK,
            opacity: line, transform: `translateY(${interpolate(line, [0, 1], [22, 0])}px)` }}>
            Your demo. <span style={{ color: GREEN_HI }}>One prompt.</span>
          </div>
          <div style={{ margin: "24px auto 0", height: 2, width: interpolate(rule, [0, 1], [0, width * 0.14]), background: GOLD, boxShadow: `0 0 12px ${GOLD}` }} />
          <div style={{ marginTop: 30, fontFamily: MONO, fontSize: Math.round(height * 0.028), color: INK, background: "rgba(18,17,22,0.9)",
            border: `1px solid ${WHITE_LINE}`, borderRadius: 10, padding: "12px 20px", display: "inline-block" }}>
            <span style={{ color: GREEN }}>$ </span>{cmd.slice(0, typed)}<span style={{ opacity: caret ? 1 : 0, color: GREEN_HI }}>▍</span>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
