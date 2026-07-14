// Generation panel — ports the surface of Palmier's Generation/UI/GenerationView (kind tabs, model
// picker, prompt box, aspect/duration, Generate). Wired to HOSTED generation (STRATEGY ③): the user
// brings their own Fal or Replicate key (pay-per-clip on their account), the panel calls
// generate_video/generate_image over MCP, and the result auto-imports + places on the timeline.
// It never fakes a clip — on success the real generated clip appears; on error it shows the reason.

import { useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme, sectionLabelStyle } from "./theme";

type Kind = "video" | "image" | "audio";

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

export function GenerationPanel() {
  useEditorVersion();
  const [kind, setKind] = useState<Kind>("video");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [seconds, setSeconds] = useState(5);
  const [status, setStatus] = useState<{ kind: "info" | "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [keyInput, setKeyInput] = useState(store.settings.genKey);

  // Hidden feature: renders ONLY when the generation dev flag is on AND the panel was opened.
  if (!store.settings.genDevMode || !store.settings.showGenerate) return null;
  const provider = store.settings.genProvider;
  const hasKey = !!store.settings.genKey;

  const saveKey = async () => {
    const label = provider === "fal" ? "Fal" : provider === "replicate" ? "Replicate" : "GPU token";
    try { await store.saveGenKey(keyInput.trim()); setStatus({ kind: "ok", text: keyInput.trim() ? `${label} saved.${provider === "gcp-ltx" ? " Now start the GPU below." : " You can generate now."}` : "Key cleared." }); }
    catch (e) { setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) }); }
  };

  const providerName = provider === "fal" ? "Fal" : provider === "replicate" ? "Replicate" : "your GPU";
  const onGenerate = async () => {
    if (kind === "audio") { setStatus({ kind: "info", text: "Audio generation isn't wired yet. Use Generate → animated titles (generate_title) or import audio." }); return; }
    if (!prompt.trim()) { setStatus({ kind: "error", text: "Enter a prompt describing what to generate." }); return; }
    if (provider === "gcp-ltx" && store.gpuState.status !== "ready") { setStatus({ kind: "error", text: "Start the GPU first (Start GPU above), then generate. It boots in a couple of minutes." }); return; }
    if (provider !== "gcp-ltx" && !hasKey) { setStatus({ kind: "error", text: `Add your ${providerName} key above first — generation runs on your account (~$0.02–0.10/video, ~$0.003–0.03/image).` }); return; }
    setBusy(true);
    setStatus({ kind: "info", text: provider === "gcp-ltx" ? `Generating ${kind} on your GPU… an LTX clip takes a few minutes on an L4. It'll drop onto the timeline when ready.` : `Generating ${kind} on ${providerName}… this can take 15–90s. The clip will drop onto the timeline when it's ready.` });
    try {
      const res = await store.generate(kind, prompt.trim(), { aspectRatio: aspect, durationSeconds: kind === "video" ? seconds : undefined });
      setStatus({ kind: "ok", text: `Done — placed "${String(res.name ?? "clip")}" on the timeline${res.width ? ` (${res.width}×${res.height})` : ""}.` });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  };

  const statusColor = status?.kind === "error" ? "#e88" : status?.kind === "ok" ? "#9d9" : theme.color.textSecondary;

  return (
    <div onClick={() => store.openGenerate(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: "92vw", maxHeight: "86vh", overflow: "hidden", display: "flex", flexDirection: "column", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui }}>
        <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised }}>
          <span style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600 }}>Generate</span>
          <button onClick={() => store.openGenerate(false)} style={{ background: "transparent", border: "none", color: theme.color.textSecondary, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: theme.space.xl, overflowY: "auto", display: "flex", flexDirection: "column", gap: theme.space.lg }}>
          {/* BYOK key row */}
          <div style={{ background: theme.color.base, border: `1px solid ${hasKey ? "#2e5" : theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: theme.space.md, display: "flex", flexDirection: "column", gap: theme.space.sm }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ ...sectionLabelStyle }}>Generation provider (bring your own key)</span>
              <span style={{ fontSize: theme.fontSize.xs, color: hasKey ? "#9d9" : theme.color.textSecondary }}>{hasKey ? "● key set" : "○ no key"}</span>
            </div>
            <div style={{ display: "flex", gap: theme.space.xs }}>
              {(["fal", "replicate", "gcp-ltx"] as const).map((p) => (
                <button key={p} onClick={() => store.setGenProvider(p)} style={{ flex: 1, padding: "6px", borderRadius: theme.radius.sm, cursor: "pointer", border: `1px solid ${provider === p ? theme.color.accent : theme.color.borderSubtle}`, background: provider === p ? theme.color.prominent : theme.color.base, color: provider === p ? theme.color.textPrimary : theme.color.textSecondary, fontSize: theme.fontSize.smMd }}>{p === "fal" ? "Fal.ai" : p === "replicate" ? "Replicate" : "My GPU (LTX)"}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: theme.space.xs }}>
              <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder={provider === "fal" ? "Fal key (fal.ai/dashboard/keys)" : provider === "replicate" ? "Replicate token (replicate.com/account)" : "Shared secret (must match the VM's LTX_TOKEN)"} style={{ flex: 1, background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "6px 8px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.mono }} />
              <button onClick={saveKey} style={{ padding: "6px 12px", borderRadius: theme.radius.sm, cursor: "pointer", border: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, color: theme.color.textPrimary, fontSize: theme.fontSize.smMd }}>Save</button>
            </div>
            <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textSecondary, lineHeight: 1.4 }}>
              {provider === "gcp-ltx"
                ? "Runs on YOUR Google Cloud GPU (LTX-2) — ~$0.05/clip on L4 spot, paid from your $300 credits. See docs/GCP-LTX-GUIDE.md. The token authenticates Kaestral to your VM."
                : "Runs on your account — pay per clip (~$0.02–0.10/video, ~$0.003–0.03/image). Key stays on this machine."}
            </span>
          </div>

          {/* GPU control (gcp-ltx only): configure the VM + one-click Start/Stop so it only bills while generating */}
          {provider === "gcp-ltx" && <GpuControl />}

          <div style={{ display: "flex", gap: theme.space.xs }}>
            {(["video", "image", "audio"] as Kind[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} style={{ flex: 1, padding: `${theme.space.smMd}px`, borderRadius: theme.radius.sm, cursor: "pointer", textTransform: "capitalize", border: `1px solid ${kind === k ? theme.color.accent : theme.color.borderSubtle}`, background: kind === k ? theme.color.prominent : theme.color.base, color: kind === k ? theme.color.textPrimary : theme.color.textSecondary, fontSize: theme.fontSize.smMd }}>{k}</button>
            ))}
          </div>

          <div>
            <div style={{ ...sectionLabelStyle, marginBottom: theme.space.sm }}>{kind === "audio" ? "Describe the sound" : `Describe the ${kind}`}</div>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder={kind === "video" ? "A slow dolly across a neon-lit street at night…" : kind === "image" ? "A misty pine forest at dawn, cinematic…" : "…"} style={{ width: "100%", boxSizing: "border-box", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "8px 10px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.ui, resize: "vertical" }} />
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

          {status && <div style={{ fontSize: theme.fontSize.xs, color: statusColor, lineHeight: 1.5, background: theme.color.base, borderRadius: theme.radius.sm, padding: theme.space.md, border: `1px solid ${theme.color.borderSubtle}` }}>{status.text}</div>}

          <button onClick={onGenerate} disabled={busy} style={{ background: busy ? theme.color.raised : theme.color.accent, color: busy ? theme.color.textSecondary : theme.color.onAccent, border: "none", borderRadius: theme.radius.sm, padding: "10px", fontSize: theme.fontSize.md, fontWeight: 600, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Generating…" : `✨ Generate ${kind}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// One-click Start/Stop for the LTX GPU VM, so it only bills while you're generating. The VM also has
// its own idle watchdog that stops it if this app or the network goes away — this is the fast path.
function GpuControl() {
  const s = store.settings;
  const g = store.gpuState;
  const ready = g.status === "ready";
  const busy = g.status === "starting" || g.status === "stopping";
  const color = g.status === "ready" ? "#9d9" : g.status === "error" ? "#e88" : busy ? theme.color.warning : theme.color.textSecondary;
  const field = (label: string, value: string, on: (v: string) => void, ph?: string) => (
    <label style={{ flex: 1, fontSize: theme.fontSize.xs, color: theme.color.textSecondary }}>{label}
      <input value={value} onChange={(e) => on(e.target.value)} placeholder={ph} style={{ display: "block", marginTop: 3, width: "100%", boxSizing: "border-box", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "5px 7px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.mono }} />
    </label>
  );
  return (
    <div style={{ background: theme.color.base, border: `1px solid ${ready ? "#2e5" : theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: theme.space.md, display: "flex", flexDirection: "column", gap: theme.space.sm }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ ...sectionLabelStyle }}>Your GPU (Google Cloud LTX-2)</span>
        <span style={{ fontSize: theme.fontSize.xs, fontFamily: theme.font.mono, color }}>{ready ? "● ready" : busy ? `◍ ${g.status}` : g.status === "error" ? "✕ error" : "○ stopped"}</span>
      </div>
      <div style={{ display: "flex", gap: theme.space.xs }}>
        {field("Project ID", s.gpuProject, (v) => store.setGpuField("gpuProject", v), "my-gcp-project")}
        {field("Zone", s.gpuZone, (v) => store.setGpuField("gpuZone", v))}
      </div>
      <div style={{ display: "flex", gap: theme.space.xs }}>
        {field("Instance", s.gpuInstance, (v) => store.setGpuField("gpuInstance", v))}
        <label style={{ width: 90, fontSize: theme.fontSize.xs, color: theme.color.textSecondary }}>Port
          <input type="number" value={s.gpuPort} onChange={(e) => store.setGpuPort(Number(e.target.value))} style={{ display: "block", marginTop: 3, width: "100%", boxSizing: "border-box", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "5px 7px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.mono }} />
        </label>
      </div>
      <div style={{ display: "flex", gap: theme.space.xs, alignItems: "center" }}>
        <button disabled={busy || ready} onClick={() => void store.startGpu()} style={{ flex: 1, padding: "7px", borderRadius: theme.radius.sm, cursor: busy || ready ? "default" : "pointer", border: "none", background: ready ? theme.color.raised : "#1db26b", color: ready ? theme.color.textSecondary : "#0a1a12", fontWeight: 600, fontSize: theme.fontSize.smMd }}>▶ Start GPU</button>
        <button disabled={busy || g.status === "stopped"} onClick={() => void store.stopGpu()} style={{ flex: 1, padding: "7px", borderRadius: theme.radius.sm, cursor: busy || g.status === "stopped" ? "default" : "pointer", border: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, color: theme.color.textPrimary, fontWeight: 600, fontSize: theme.fontSize.smMd }}>■ Stop GPU</button>
      </div>
      {g.detail && <span style={{ fontSize: theme.fontSize.xs, color, lineHeight: 1.4 }}>{g.detail}</span>}
      <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textSecondary, lineHeight: 1.4 }}>
        Billing runs only while the GPU is on. It also auto-stops after 15 idle minutes on its own — but click Stop when you're done to be sure. Needs the Google Cloud CLI installed &amp; logged in on this PC.
      </span>
    </div>
  );
}
