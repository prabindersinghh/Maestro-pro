// Generation panel — ports the surface of Palmier's Generation/UI/GenerationView (kind tabs, model
// picker, prompt box, aspect/duration, reference tiles, Generate). Generation itself is NOT wired in
// this open build (Palmier's is a closed paid cloud) — the panel is honest about that: it shows the
// interface and, on Generate, explains that a free/open backend (LTX-2 local or Fal/Replicate) is
// set up in STRATEGY ③. It never fakes a result.

import { useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme, sectionLabelStyle } from "./theme";

type Kind = "video" | "image" | "audio";

// Representative open-model catalog (STRATEGY ③). Marked "setup required" until wired.
const MODELS: Record<Kind, { id: string; label: string; note: string }[]> = {
  video: [
    { id: "ltx-2", label: "LTX-2", note: "open weights · 4K · synced audio · Apache-2.0" },
    { id: "wan-2.2", label: "Wan 2.2", note: "via Open-Generative-AI" },
  ],
  image: [
    { id: "flux", label: "FLUX", note: "via Open-Generative-AI" },
    { id: "ltx-image", label: "LTX image", note: "open weights" },
  ],
  audio: [{ id: "open-audio", label: "Open audio", note: "TBD open backend" }],
};

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

export function GenerationPanel() {
  useEditorVersion();
  const [kind, setKind] = useState<Kind>("video");
  const [model, setModel] = useState("ltx-2");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [seconds, setSeconds] = useState(5);
  const [status, setStatus] = useState<string | null>(null);

  if (!store.settings.showGenerate) return null;

  const models = MODELS[kind];
  const onGenerate = () => {
    // Honest: no closed cloud, no faked clip. Explain the open path.
    setStatus(
      `Generation isn't wired in this open build yet. Per docs/STRATEGY.md ③, this connects to a free/` +
      `open backend — LTX-2 locally on an NVIDIA GPU, or a hosted API (Fal/Replicate) — then the result ` +
      `auto-imports to the timeline via import_media. Not faking a clip.`,
    );
  };

  return (
    <div onClick={() => store.openGenerate(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "86vh", overflow: "hidden", display: "flex", flexDirection: "column", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui }}>
        <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised }}>
          <span style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600 }}>Generate</span>
          <button onClick={() => store.openGenerate(false)} style={{ background: "transparent", border: "none", color: theme.color.textSecondary, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: theme.space.xl, overflowY: "auto", display: "flex", flexDirection: "column", gap: theme.space.lg }}>
          <div style={{ background: "#3a2f12", border: "1px solid #7a5c1e", borderRadius: theme.radius.sm, padding: `${theme.space.smMd}px ${theme.space.md}px`, fontSize: theme.fontSize.xs, color: "#e8c774" }}>
            Open build — generation backend not connected yet. This is the interface; wiring lands with STRATEGY ③ (free/open LTX-2 or a hosted API). Results auto-import to the timeline.
          </div>

          <div style={{ display: "flex", gap: theme.space.xs }}>
            {(["video", "image", "audio"] as Kind[]).map((k) => (
              <button key={k} onClick={() => { setKind(k); setModel(MODELS[k][0].id); }} style={{ flex: 1, padding: `${theme.space.smMd}px`, borderRadius: theme.radius.sm, cursor: "pointer", textTransform: "capitalize", border: `1px solid ${kind === k ? theme.color.accent : theme.color.borderSubtle}`, background: kind === k ? theme.color.prominent : theme.color.base, color: kind === k ? theme.color.textPrimary : theme.color.textSecondary, fontSize: theme.fontSize.smMd }}>{k}</button>
            ))}
          </div>

          <div>
            <div style={{ ...sectionLabelStyle, marginBottom: theme.space.sm }}>Model</div>
            <select value={model} onChange={(e) => setModel(e.target.value)} style={{ width: "100%", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.sm, padding: "7px 8px", fontSize: theme.fontSize.smMd }}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.note}</option>)}
            </select>
          </div>

          <div>
            <div style={{ ...sectionLabelStyle, marginBottom: theme.space.sm }}>{kind === "audio" ? "Describe the sound" : `Describe the ${kind}`}</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={kind === "video" ? "A slow dolly across a neon-lit street at night…" : "…"} style={{ width: "100%", boxSizing: "border-box", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "8px 10px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.ui, resize: "vertical" }} />
          </div>

          {kind !== "audio" && (
            <div style={{ display: "flex", gap: theme.space.lg }}>
              <label style={{ flex: 1, fontSize: theme.fontSize.smMd, color: theme.color.textSecondary }}>Aspect
                <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ display: "block", marginTop: 4, width: "100%", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "5px 8px", fontSize: theme.fontSize.smMd }}>
                  {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              {kind === "video" && (
                <label style={{ flex: 1, fontSize: theme.fontSize.smMd, color: theme.color.textSecondary }}>Duration
                  <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} style={{ display: "block", marginTop: 4, width: "100%", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "5px 8px", fontSize: theme.fontSize.smMd }}>
                    {[3, 5, 8, 10].map((s) => <option key={s} value={s}>{s}s</option>)}
                  </select>
                </label>
              )}
            </div>
          )}

          {status && <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textSecondary, lineHeight: 1.5, background: theme.color.base, borderRadius: theme.radius.sm, padding: theme.space.md, border: `1px solid ${theme.color.borderSubtle}` }}>{status}</div>}

          <button onClick={onGenerate} style={{ background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "10px", fontSize: theme.fontSize.md, fontWeight: 600, cursor: "pointer" }}>
            ✨ Generate {kind}
          </button>
        </div>
      </div>
    </div>
  );
}
