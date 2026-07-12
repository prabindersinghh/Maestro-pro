import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing } from "remotion";

// Premium bespoke hero for the landing page. Four beats, cinematically timed:
//   1) a prompt is typed into a command bar
//   2) the editor "responds" — a timeline fills, clips + captions snap in
//   3) the thesis line resolves: "You describe the edit. It makes it."
//   4) the Kaestral three-bar logo assembles + wordmark
// Dark instrument aesthetic, exact logo green, gold+white hairlines. No stock-template feel.

export interface HeroDemoProps {
  accent?: string;
  durationSeconds?: number;
}

const GREEN = "#16b16a";
const GREEN_HI = "#1fce7e";
const GOLD = "rgba(201,162,39,0.55)";
const WHITE_LINE = "rgba(255,255,255,0.10)";
const INK = "#eaeaef";
const INK2 = "rgba(255,255,255,0.55)";
const MONO = "'SF Mono','Consolas','Menlo',monospace";
const SANS = "'Inter','Helvetica Neue',Arial,sans-serif";

const ease = Easing.bezier(0.22, 0.61, 0.16, 1);

/** faint drifting timeline grid — the instrument backdrop */
const Grid: React.FC<{ accent: string }> = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const drift = (frame * 0.15) % 72;
  return (
    <AbsoluteFill style={{ opacity: 0.5 }}>
      {Array.from({ length: Math.ceil(width / 72) + 1 }).map((_, i) => (
        <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: i * 72 - drift, width: 1, background: WHITE_LINE }} />
      ))}
      {Array.from({ length: Math.ceil(height / 72) + 1 }).map((_, i) => (
        <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: i * 72, height: 1, background: WHITE_LINE }} />
      ))}
    </AbsoluteFill>
  );
};

/** the three-bar Kaestral mark, bars assembling in sequence */
const LogoMark: React.FC<{ frame: number; fps: number; s: number }> = ({ frame, fps, s }) => {
  const bar = (i: number) => {
    const p = spring({ frame: frame - i * 5, fps, config: { damping: 15, mass: 0.7 } });
    return { transform: `translateX(${interpolate(p, [0, 1], [-40, 0])}px)`, opacity: p };
  };
  const w = 190 * s, h = 46 * s, gap = 16 * s, r = 10 * s;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      <div style={{ width: w, height: h, borderRadius: r, background: GREEN, boxShadow: `0 0 ${28 * s}px rgba(31,206,126,0.55)`, ...bar(0) }} />
      <div style={{ width: w * 0.72, height: h, borderRadius: r, background: "#484852", ...bar(1) }} />
      <div style={{ width: w * 0.86, height: h, borderRadius: r, background: "#2b2931", ...bar(2) }} />
    </div>
  );
};

export const HeroDemo: React.FC<HeroDemoProps> = ({ accent = GREEN }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const cx = width / 2, cy = height / 2;

  // ambient kestrel-eye glow, gentle breathing
  const glow = 0.20 + 0.07 * Math.sin((frame / fps) * 1.6);
  const outFade = interpolate(frame, [durationInFrames - 18, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });

  // ---- BEAT 1 (0–75f): prompt typing in a command bar ----
  const PROMPT = "cut the boring parts, caption it, punch in on the hook";
  const typed = Math.floor(interpolate(frame, [10, 62], [0, PROMPT.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }));
  const caretOn = Math.floor(frame / 8) % 2 === 0;
  const barIn = spring({ frame: frame - 4, fps, config: { damping: 16 } });

  // ---- BEAT 2 (75–150f): editor responds — timeline fills, clips snap ----
  const localB2 = frame - 78;
  const trackFill = interpolate(localB2, [6, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const playhead = interpolate(localB2, [6, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // ---- BEAT 3 (150–228f): the thesis line ----
  const localB3 = frame - 152;
  const line1 = spring({ frame: localB3, fps, config: { damping: 15 } });
  const line2 = spring({ frame: localB3 - 16, fps, config: { damping: 15 } });
  const underline = interpolate(localB3, [22, 46], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

  // ---- BEAT 4 (228f–end): logo lands ----
  const localB4 = frame - 230;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0a0d", opacity: outFade, fontFamily: SANS }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 40% at 50% 42%, ${accent}${Math.round(glow * 255).toString(16).padStart(2, "0")} 0%, transparent 60%)` }} />
      <Grid accent={accent} />

      {/* BEAT 1 — command bar with typing prompt */}
      <Sequence from={0} durationInFrames={80}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{
            width: width * 0.62, transform: `translateY(${interpolate(barIn, [0, 1], [24, 0])}px)`, opacity: barIn,
            background: "rgba(18,17,22,0.92)", border: `1px solid ${WHITE_LINE}`, borderRadius: 16,
            boxShadow: "0 40px 120px -30px rgba(0,0,0,0.8)", padding: "30px 34px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 12px ${accent}`, flex: "none" }} />
              <div style={{ fontFamily: MONO, fontSize: Math.round(height * 0.033), color: INK, letterSpacing: 0.2 }}>
                {PROMPT.slice(0, typed)}
                <span style={{ opacity: caretOn ? 1 : 0, color: accent }}>▍</span>
              </div>
            </div>
            <div style={{ marginTop: 18, height: 1, background: WHITE_LINE }} />
            <div style={{ marginTop: 14, fontFamily: MONO, fontSize: Math.round(height * 0.02), color: INK2, letterSpacing: 1.5, textTransform: "uppercase" }}>
              Kaestral · editing from a prompt
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* BEAT 2 — timeline responds */}
      <Sequence from={78} durationInFrames={74}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: width * 0.66 }}>
            <div style={{ fontFamily: MONO, fontSize: Math.round(height * 0.022), color: accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 22, textAlign: "center" }}>
              …it makes it
            </div>
            {/* ruler */}
            <div style={{ position: "relative", height: 16, marginBottom: 10 }}>
              {Array.from({ length: 13 }).map((_, i) => (
                <div key={i} style={{ position: "absolute", left: `${(i / 12) * 100}%`, top: 0, width: 1, height: i % 3 === 0 ? 16 : 9, background: WHITE_LINE }} />
              ))}
              {/* playhead */}
              <div style={{ position: "absolute", left: `${playhead * 100}%`, top: -4, width: 2, height: 120, background: GREEN_HI, boxShadow: `0 0 10px ${GREEN_HI}` }} />
            </div>
            {/* three tracks with clips growing in */}
            {[
              { c: accent, y: 0, w: 0.9, delay: 0 },
              { c: "#b72dd2", y: 1, w: 0.7, delay: 6 },
              { c: "#f0b429", y: 2, w: 0.82, delay: 12 },
            ].map((t, i) => {
              const grow = interpolate(localB2, [t.delay, t.delay + 20], [0, t.w], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
              return (
                <div key={i} style={{ height: 30, marginBottom: 8, background: "rgba(255,255,255,0.03)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${grow * 100}%`, background: t.c, opacity: 0.85, borderRadius: 6, boxShadow: `0 0 20px ${t.c}55` }} />
                </div>
              );
            })}
            {/* progress caption */}
            <div style={{ marginTop: 18, textAlign: "center", fontFamily: MONO, fontSize: Math.round(height * 0.02), color: INK2 }}>
              {trackFill > 0.3 && "✓ filler cut"} {trackFill > 0.6 && "· ✓ captions on the word"} {trackFill > 0.9 && "· ✓ hook punched in"}
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* BEAT 3 — the thesis */}
      <Sequence from={152} durationInFrames={80}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ textAlign: "center", padding: "0 6%" }}>
            <div style={{ fontWeight: 800, fontSize: Math.round(height * 0.086), color: INK, letterSpacing: -1.5, opacity: line1, transform: `translateY(${interpolate(line1, [0, 1], [22, 0])}px)` }}>
              You describe the edit.
            </div>
            <div style={{ fontWeight: 800, fontSize: Math.round(height * 0.086), color: GREEN_HI, letterSpacing: -1.5, marginTop: 6, opacity: line2, transform: `translateY(${interpolate(line2, [0, 1], [22, 0])}px)` }}>
              It makes it.
            </div>
            <div style={{ margin: "26px auto 0", height: 3, width: interpolate(underline, [0, 1], [0, width * 0.16]), background: accent, borderRadius: 3, boxShadow: `0 0 20px ${accent}` }} />
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* BEAT 4 — logo lands */}
      <Sequence from={230}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <LogoMark frame={localB4} fps={fps} s={1} />
            <div style={{ overflow: "hidden" }}>
              <div style={{
                fontWeight: 800, fontSize: Math.round(height * 0.11), color: INK, letterSpacing: -3,
                transform: `translateX(${interpolate(spring({ frame: localB4 - 14, fps, config: { damping: 16 } }), [0, 1], [-30, 0])}px)`,
                opacity: spring({ frame: localB4 - 14, fps, config: { damping: 16 } }),
              }}>
                Kaestral
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
