import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

export interface MaestroLaunchProps {
  durationSeconds?: number;
}

// ---------------------------------------------------------------------------
// 60-second launch film for Maestro. Eight scenes on a shared dark brand
// system: hook → logo sting → editor UI → agent demo → features → stats →
// tagline → end card. All timing in frames @ 30fps.
// ---------------------------------------------------------------------------

const BG = "#07070d";
const ACCENT = "#5b8cff";
const ACCENT2 = "#8b5cf6";
const GREEN = "#1db26b";
const TEXT = "#f2f4f8";
const DIM = "#8a90a3";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";

const easeOut = Easing.out(Easing.cubic);

const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='300' height='300' filter='url(%23n)' opacity='0.6'/></svg>`
  );

// Drifting gradient orbs + vignette + static grain. Sits under every scene.
const Backdrop: React.FC<{ pulse?: number }> = ({ pulse = 0 }) => {
  const frame = useCurrentFrame();
  const dx = Math.sin(frame / 220) * 60;
  const dy = Math.cos(frame / 260) * 40;
  const glow = 0.16 + pulse * 0.1;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(720px 540px at ${28 + dx / 19.2}% ${30 + dy / 10.8}%, rgba(91,140,255,${glow}), transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(820px 620px at ${74 - dx / 19.2}% ${72 - dy / 10.8}%, rgba(139,92,246,${glow * 0.85}), transparent 65%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.6) 100%)",
        }}
      />
      <AbsoluteFill
        style={{ backgroundImage: `url("${GRAIN}")`, opacity: 0.04, mixBlendMode: "overlay" }}
      />
    </AbsoluteFill>
  );
};

// Per-scene fade envelope (local frames).
const useFade = (len: number, inF = 8, outF = 10) => {
  const f = useCurrentFrame();
  return (
    interpolate(f, [0, inF], [0, 1], { extrapolateRight: "clamp" }) *
    interpolate(f, [len - outF, len], [1, 0], { extrapolateLeft: "clamp" })
  );
};

// ------------------------------------------------------------------ scene 1
const Hook: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 6, 8);
  const words = ["Video", "editing", "hasn't", "changed", "in", "20", "years."];
  const line1Out = interpolate(frame, [104, 118], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const punch = spring({ frame: frame - 124, fps, config: { damping: 14, mass: 0.7 } });
  const underline = interpolate(frame, [140, 165], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div
        style={{
          position: "absolute",
          opacity: line1Out,
          transform: `translateY(${(1 - line1Out) * -30}px)`,
          display: "flex",
          gap: 26,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1400,
        }}
      >
        {words.map((w, i) => {
          const s = spring({ frame: frame - 8 - i * 5, fps, config: { damping: 16, mass: 0.6 } });
          return (
            <span
              key={i}
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 88,
                color: i >= 4 ? DIM : TEXT,
                opacity: s,
                transform: `translateY(${(1 - s) * 40}px)`,
                letterSpacing: -1,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div style={{ position: "absolute", opacity: punch, transform: `scale(${1.18 - punch * 0.18})` }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 124, color: TEXT, letterSpacing: -2 }}>
          Until now.
        </div>
        <div
          style={{
            height: 8,
            width: `${underline * 100}%`,
            marginTop: 14,
            borderRadius: 4,
            background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`,
            boxShadow: `0 0 24px ${ACCENT}aa`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// The Maestro mark (from app-icon.png): three timeline bars — green on top,
// two grays below. Rebuilt as vectors so the bars can animate like clips.
// `t(i)` is a 0..1 progress per bar; pass () => 1 for the static version.
const LogoMark: React.FC<{ size: number; t?: (i: number) => number; glow?: boolean }> = ({
  size,
  t = () => 1,
  glow,
}) => {
  const bars = [
    { w: 1, c: "#1db26b" },
    { w: 0.695, c: "#4c4c58" },
    { w: 0.833, c: "#33333f" },
  ];
  const barH = size * 0.198;
  const gap = size * 0.046;
  return (
    <div style={{ width: size, display: "flex", flexDirection: "column", gap }}>
      {bars.map((b, i) => {
        const p = t(i);
        return (
          <div
            key={i}
            style={{
              height: barH,
              width: b.w * size * (0.35 + 0.65 * p),
              opacity: p,
              transform: `translateX(${(1 - p) * -size * 0.12}px)`,
              borderRadius: size * 0.014,
              background: b.c,
              boxShadow: glow && i === 0 ? `0 0 ${size * 0.12}px ${GREEN}66` : "none",
            }}
          />
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ scene 2
const LogoSting: React.FC<{ len: number; tagline: string; sub?: string; cta?: boolean }> = ({
  len,
  tagline,
  sub,
  cta,
}) => {
  const frame = useCurrentFrame();
  const { fps, height, width } = useVideoConfig();
  const fade = useFade(len, 6, 12);
  const R = height * 0.17;
  const circ = 2 * Math.PI * R;
  const draw = interpolate(frame, [0, 38], [0, 1], { extrapolateRight: "clamp", easing: easeOut });
  const bar = (i: number) =>
    spring({ frame: frame - 22 - i * 7, fps, config: { damping: 15, mass: 0.7 } });
  const pop = spring({ frame: frame - 38, fps, config: { damping: 12, mass: 0.8 } });
  const shine = interpolate(frame, [52, 84], [-1, 2], { extrapolateLeft: "clamp" });
  const tagIn = interpolate(frame, [72, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const subIn = interpolate(frame, [94, 114], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const cy = height / 2 - 156;
  const markSize = R * 1.06;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <svg width={width} height={height} style={{ position: "absolute" }}>
        <circle
          cx={width / 2}
          cy={cy}
          r={R}
          fill="none"
          stroke={ACCENT}
          strokeWidth={height * 0.01}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - draw)}
          strokeLinecap="round"
          transform={`rotate(-90 ${width / 2} ${cy})`}
          style={{ filter: `drop-shadow(0 0 20px ${ACCENT})` }}
        />
      </svg>
      {/* mark centered in the ring */}
      <div
        style={{
          position: "absolute",
          top: cy - (markSize * 0.198 * 3 + markSize * 0.046 * 2) / 2,
          left: width / 2 - markSize / 2,
        }}
      >
        <LogoMark size={markSize} t={bar} glow />
      </div>
      <div style={{ position: "absolute", top: cy + R + 44, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ display: "inline-block", position: "relative", transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`, opacity: pop, overflow: "hidden" }}>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 96, color: TEXT, letterSpacing: 10 }}>
            MAESTRO
          </div>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "40%",
              left: `${shine * 100}%`,
              background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent)",
              transform: "skewX(-18deg)",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: SANS,
            fontWeight: 400,
            fontSize: 40,
            color: TEXT,
            opacity: tagIn,
            transform: `translateY(${(1 - tagIn) * 20}px)`,
          }}
        >
          {tagline}
        </div>
        {sub ? (
          <div
            style={{
              marginTop: 22,
              fontFamily: cta ? MONO : SANS,
              fontSize: cta ? 26 : 30,
              color: cta ? ACCENT : DIM,
              opacity: subIn,
              transform: `translateY(${(1 - subIn) * 16}px)`,
            }}
          >
            {sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// -------------------------------------------------------- shared UI pieces
const Panel: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <div
    style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 14,
      ...style,
    }}
  >
    {children}
  </div>
);

const ClipRect: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  label?: string;
  progress: number; // 0..1 slide-in
  kf?: boolean;
}> = ({ x, y, w, h, color, label, progress, kf }) => (
  <div
    style={{
      position: "absolute",
      left: x + (1 - progress) * 320,
      top: y,
      width: w,
      height: h,
      opacity: progress,
      borderRadius: 8,
      background: `linear-gradient(180deg, ${color}55, ${color}2e)`,
      border: `1px solid ${color}aa`,
      overflow: "hidden",
    }}
  >
    {label ? (
      <div style={{ fontFamily: MONO, fontSize: 15, color: "#dfe4ee", padding: "6px 10px", whiteSpace: "nowrap" }}>
        {label}
      </div>
    ) : null}
    {kf ? (
      <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", justifyContent: "space-around" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 9, height: 9, background: "#fff", transform: "rotate(45deg)", opacity: 0.85 }} />
        ))}
      </div>
    ) : null}
  </div>
);

const Ruler: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ position: "relative", height: 26, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
    {Array.from({ length: 25 }).map((_, i) => (
      <div key={i} style={{ position: "absolute", left: (i * w) / 24, top: i % 4 === 0 ? 8 : 16, bottom: 0, width: 1, background: "rgba(255,255,255,0.22)" }} />
    ))}
  </div>
);

// ------------------------------------------------------------------ scene 3
const EditorScene: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 8, 10);
  const winIn = spring({ frame, fps, config: { damping: 18, mass: 0.9 } });
  const clip = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 17, mass: 0.7 } });
  const playhead = interpolate(frame, [110, 285], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const cap = interpolate(frame, [55, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut });
  const W = 1500, H = 800, TL = 250, tlW = W - 32;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div style={{ transform: `scale(${0.94 + winIn * 0.06})`, opacity: winIn }}>
        <Panel style={{ width: W, height: H, background: "#0c0e16", boxShadow: "0 40px 120px rgba(0,0,0,0.6)" }}>
          {/* title bar */}
          <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: "1px solid rgba(255,255,255,0.07)", gap: 8 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.9 }} />
            ))}
            <div style={{ marginLeft: 16 }}>
              <LogoMark size={24} />
            </div>
            <div style={{ marginLeft: 10, fontFamily: MONO, fontSize: 16, color: DIM }}>Maestro — trip-2026.palmier</div>
          </div>
          {/* main area */}
          <div style={{ display: "flex", height: H - 46 - TL, padding: 14, gap: 14 }}>
            {/* media panel */}
            <div style={{ width: 230, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: SANS, fontSize: 14, color: DIM, letterSpacing: 2 }}>MEDIA</div>
              {[ACCENT, ACCENT2, GREEN, "#e8834a"].map((c, i) => {
                const s = clip(18 + i * 6);
                return (
                  <div key={i} style={{ height: 84, borderRadius: 10, opacity: s, transform: `translateX(${(1 - s) * -40}px)`, background: `linear-gradient(135deg, ${c}44, ${c}18)`, border: "1px solid rgba(255,255,255,0.08)" }} />
                );
              })}
            </div>
            {/* preview */}
            <div style={{ flex: 1, borderRadius: 12, background: "#05060b", border: "1px solid rgba(255,255,255,0.07)", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: `radial-gradient(600px 360px at ${30 + playhead * 40}% 55%, rgba(91,140,255,0.35), transparent 70%), radial-gradient(500px 300px at ${70 - playhead * 30}% 40%, rgba(139,92,246,0.3), transparent 70%)` }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
                <div style={{ width: 0, height: 0, borderLeft: "34px solid rgba(255,255,255,0.9)", borderTop: "22px solid transparent", borderBottom: "22px solid transparent", marginLeft: 8, filter: "drop-shadow(0 0 18px rgba(255,255,255,0.35))" }} />
              </div>
              <div style={{ position: "absolute", right: 14, bottom: 12, fontFamily: MONO, fontSize: 15, color: DIM }}>
                00:00:{String(Math.floor(playhead * 24)).padStart(2, "0")} · 1080p
              </div>
            </div>
            {/* inspector */}
            <div style={{ width: 250, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontFamily: SANS, fontSize: 14, color: DIM, letterSpacing: 2 }}>INSPECTOR</div>
              {["Opacity", "Scale", "Speed", "Volume"].map((l, i) => {
                const s = clip(30 + i * 5);
                const v = [0.9, 0.62, 0.5, 0.75][i];
                return (
                  <div key={l} style={{ opacity: s }}>
                    <div style={{ fontFamily: SANS, fontSize: 15, color: "#c6cbda", marginBottom: 6 }}>{l}</div>
                    <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.1)" }}>
                      <div style={{ height: 5, width: `${v * s * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})` }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 14, color: DIM }}>blend: screen · 16 modes</div>
            </div>
          </div>
          {/* timeline */}
          <div style={{ height: TL, borderTop: "1px solid rgba(255,255,255,0.07)", padding: "0 16px", position: "relative" }}>
            <Ruler w={tlW} />
            <div style={{ position: "relative", height: TL - 26 }}>
              <ClipRect x={0} y={16} w={430} h={52} color={ACCENT} label="beach-drone.mp4" progress={clip(42)} />
              <ClipRect x={438} y={16} w={320} h={52} color={ACCENT} label="sunset.mp4" progress={clip(52)} kf />
              <ClipRect x={766} y={16} w={380} h={52} color={ACCENT} label="dinner.mp4" progress={clip(62)} />
              <ClipRect x={120} y={78} w={300} h={44} color={ACCENT2} label='T  "Trip 2026"' progress={clip(74)} />
              <ClipRect x={0} y={132} w={1146} h={40} color={GREEN} label="soundtrack.wav" progress={clip(86)} />
              {/* playhead */}
              <div style={{ position: "absolute", top: -26, bottom: 12, left: playhead * tlW, width: 2, background: TEXT, boxShadow: `0 0 12px ${ACCENT}`, opacity: frame > 105 ? 1 : 0 }}>
                <div style={{ position: "absolute", top: 0, left: -7, width: 16, height: 12, background: TEXT, clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <div style={{ position: "absolute", bottom: 64, opacity: cap, transform: `translateY(${(1 - cap) * 18}px)`, fontFamily: SANS, fontWeight: 600, fontSize: 42, color: TEXT }}>
        A real editor. <span style={{ color: DIM }}>Multi-track. Frame-accurate. Keyframes.</span>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene 4
const AgentScene: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 8, 10);
  const head = spring({ frame: frame - 4, fps, config: { damping: 15, mass: 0.7 } });
  const PROMPT = 'Cut the first 2 seconds, add a title "Trip 2026", and export as MP4.';
  const chars = Math.min(PROMPT.length, Math.max(0, Math.floor((frame - 30) * 1.15)));
  const typingDone = chars >= PROMPT.length;
  // timeline reactions
  const trim = spring({ frame: frame - 130, fps, config: { damping: 16, mass: 0.8 } });
  const titlePop = spring({ frame: frame - 168, fps, config: { damping: 12, mass: 0.7 } });
  const exportBar = interpolate(frame, [210, 268], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const checks = [
    { t: "clip_split · beach-drone.mp4 @ 2.0s", at: 138 },
    { t: 'add_title · "Trip 2026"', at: 176 },
    { t: "export_video · trip.mp4", at: 214 },
  ];
  const trimPx = trim * 90;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div style={{ position: "absolute", top: 96, left: 0, right: 0, textAlign: "center", opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 84, color: TEXT, letterSpacing: -1 }}>Or just ask.</div>
      </div>
      <div style={{ display: "flex", gap: 28, marginTop: 130 }}>
        {/* chat card */}
        <Panel style={{ width: 640, padding: 28, backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <LogoMark size={22} />
            <div style={{ fontFamily: MONO, fontSize: 15, color: DIM, letterSpacing: 2 }}>CLAUDE ⇄ MAESTRO · MCP</div>
          </div>
          <div style={{ minHeight: 120, fontFamily: MONO, fontSize: 24, lineHeight: 1.5, color: TEXT }}>
            <span style={{ color: ACCENT }}>&gt; </span>
            {PROMPT.slice(0, chars)}
            <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>▋</span>
          </div>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            {checks.map((c, i) => {
              const s = spring({ frame: frame - c.at, fps, config: { damping: 14, mass: 0.6 } });
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, opacity: typingDone ? s : 0, transform: `translateX(${(1 - s) * -20}px)` }}>
                  <div style={{ width: 22, height: 22, borderRadius: 11, background: `${GREEN}22`, border: `1.5px solid ${GREEN}`, color: GREEN, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</div>
                  <div style={{ fontFamily: MONO, fontSize: 18, color: "#c6cbda" }}>{c.t}</div>
                </div>
              );
            })}
          </div>
        </Panel>
        {/* live timeline card */}
        <Panel style={{ width: 760, padding: 24 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, color: DIM, letterSpacing: 2, marginBottom: 16 }}>
            TIMELINE — LIVE
          </div>
          <div style={{ position: "relative", height: 190 }}>
            <Ruler w={712} />
            <div style={{ position: "relative", height: 150 }}>
              {/* trimmed clip: left edge moves right, width shrinks */}
              <div style={{ position: "absolute", left: trimPx, top: 18, width: 300 - trimPx, height: 50, borderRadius: 8, background: `linear-gradient(180deg, ${ACCENT}55, ${ACCENT}2e)`, border: `1px solid ${ACCENT}aa`, overflow: "hidden" }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color: "#dfe4ee", padding: "5px 9px", whiteSpace: "nowrap" }}>beach-drone.mp4</div>
              </div>
              <div style={{ position: "absolute", left: 308, top: 18, width: 250, height: 50, borderRadius: 8, background: `linear-gradient(180deg, ${ACCENT}55, ${ACCENT}2e)`, border: `1px solid ${ACCENT}aa` }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color: "#dfe4ee", padding: "5px 9px" }}>sunset.mp4</div>
              </div>
              {/* title pops in */}
              <div style={{ position: "absolute", left: trimPx + 20, top: 80, width: 240, height: 42, borderRadius: 8, opacity: titlePop, transform: `scale(${0.6 + titlePop * 0.4})`, transformOrigin: "left center", background: `linear-gradient(180deg, ${ACCENT2}66, ${ACCENT2}30)`, border: `1px solid ${ACCENT2}` }}>
                <div style={{ fontFamily: MONO, fontSize: 14, color: "#e8e4ff", padding: "5px 9px" }}>T &nbsp;"Trip 2026"</div>
              </div>
              {/* export bar */}
              <div style={{ position: "absolute", left: 0, right: 0, top: 142 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 14, color: DIM, marginBottom: 8 }}>
                  <span>ffmpeg · H.264</span>
                  <span style={{ color: exportBar >= 1 ? GREEN : DIM }}>{exportBar >= 1 ? "✓ trip.mp4" : `${Math.round(exportBar * 100)}%`}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ height: 6, width: `${exportBar * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${GREEN}, ${ACCENT})`, boxShadow: exportBar > 0 ? `0 0 14px ${GREEN}88` : "none" }} />
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
      <div style={{ position: "absolute", bottom: 58, fontFamily: SANS, fontSize: 34, color: DIM, opacity: interpolate(frame, [240, 262], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        Your edits and Claude's merge in the same live project.
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene 5
const FeaturesScene: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 8, 10);
  const head = spring({ frame: frame - 4, fps, config: { damping: 15, mass: 0.7 } });
  const cards = [
    { icon: "❯_", title: "41 agent tools", body: "The full Palmier MCP contract. Every cut, keyframe and title — scriptable." },
    { icon: "▣", title: "Real render pipeline", body: "H.264 · H.265 · ProRes, straight through FFmpeg. No cloud round-trips." },
    { icon: "⇄", title: "Plays with everyone", body: "Hand off to Premiere, Resolve or Final Cut. Your project, portable." },
  ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div style={{ position: "absolute", top: 130, textAlign: "center", opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 78, color: TEXT, letterSpacing: -1 }}>
          Built like a <span style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`, WebkitBackgroundClip: "text", color: "transparent" }}>pro tool</span>.
        </div>
      </div>
      <div style={{ display: "flex", gap: 30, marginTop: 120 }}>
        {cards.map((c, i) => {
          const s = spring({ frame: frame - 26 - i * 12, fps, config: { damping: 15, mass: 0.8 } });
          return (
            <Panel key={i} style={{ width: 440, padding: 36, opacity: s, transform: `translateY(${(1 - s) * 60}px)`, backdropFilter: "blur(8px)" }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: 28, color: ACCENT, background: `${ACCENT}18`, border: `1px solid ${ACCENT}55`, marginBottom: 26 }}>
                {c.icon}
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34, color: TEXT, marginBottom: 14 }}>{c.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 23, lineHeight: 1.45, color: DIM }}>{c.body}</div>
            </Panel>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene 6
const StatsScene: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 8, 10);
  const stats = [
    { n: 41, suffix: "", label: "MCP tools" },
    { n: 127, suffix: "", label: "tests, all passing" },
    { n: 100, suffix: "%", label: "local & open source" },
  ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div style={{ display: "flex", gap: 140 }}>
        {stats.map((s, i) => {
          const sp = spring({ frame: frame - 8 - i * 10, fps, config: { damping: 30, mass: 1 } });
          const v = Math.round(sp * s.n);
          return (
            <div key={i} style={{ textAlign: "center", opacity: Math.min(1, sp * 2) }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 150, letterSpacing: -3, fontVariantNumeric: "tabular-nums", background: `linear-gradient(180deg, ${TEXT}, ${ACCENT})`, WebkitBackgroundClip: "text", color: "transparent" }}>
                {v}
                {s.suffix}
              </div>
              <div style={{ fontFamily: SANS, fontSize: 30, color: DIM, marginTop: 6 }}>{s.label}</div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "absolute", bottom: 96, fontFamily: MONO, fontSize: 24, color: DIM, opacity: interpolate(frame, [90, 112], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        GPLv3 · Tauri 2 + React + FFmpeg · Windows-native
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ scene 7
const TaglineScene: React.FC<{ len: number }> = ({ len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = useFade(len, 8, 10);
  const l1 = spring({ frame: frame - 8, fps, config: { damping: 15, mass: 0.8 } });
  const l2 = spring({ frame: frame - 52, fps, config: { damping: 13, mass: 0.8 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: fade }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 116, color: TEXT, letterSpacing: -2, opacity: l1, transform: `translateY(${(1 - l1) * 40}px)` }}>
          You direct.
        </div>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 116, letterSpacing: -2, marginTop: 10, opacity: l2, transform: `translateY(${(1 - l2) * 40}px)`, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT2})`, WebkitBackgroundClip: "text", color: "transparent" }}>
          Maestro performs.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------- root
export const MaestroLaunch: React.FC<MaestroLaunchProps> = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // scene cue points (frames)
  const S = { hook: 0, logo: 195, editor: 360, agent: 660, features: 990, stats: 1230, tagline: 1440, end: 1620 };
  const finalFade = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  const pulse = interpolate(frame, [S.logo - 10, S.logo + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: finalFade }}>
      <Backdrop pulse={pulse} />
      <Sequence from={S.hook} durationInFrames={S.logo - S.hook}>
        <Hook len={S.logo - S.hook} />
      </Sequence>
      <Sequence from={S.logo} durationInFrames={S.editor - S.logo}>
        <LogoSting len={S.editor - S.logo} tagline="The AI-native video editor for Windows." />
      </Sequence>
      <Sequence from={S.editor} durationInFrames={S.agent - S.editor}>
        <EditorScene len={S.agent - S.editor} />
      </Sequence>
      <Sequence from={S.agent} durationInFrames={S.features - S.agent}>
        <AgentScene len={S.features - S.agent} />
      </Sequence>
      <Sequence from={S.features} durationInFrames={S.stats - S.features}>
        <FeaturesScene len={S.stats - S.features} />
      </Sequence>
      <Sequence from={S.stats} durationInFrames={S.tagline - S.stats}>
        <StatsScene len={S.tagline - S.stats} />
      </Sequence>
      <Sequence from={S.tagline} durationInFrames={S.end - S.tagline}>
        <TaglineScene len={S.end - S.tagline} />
      </Sequence>
      <Sequence from={S.end} durationInFrames={durationInFrames - S.end}>
        <LogoSting len={durationInFrames - S.end} tagline="Free. Open source. On Windows, today." sub="github.com/prabindersinghh/Maestro-pro" cta />
      </Sequence>
    </AbsoluteFill>
  );
};
