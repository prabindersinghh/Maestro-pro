// Settings + Connect-AI panel — ported in spirit from Palmier's Settings/ + Agent/Panel. A modal
// with three tabs: Connect AI (MCP endpoint + one-click copy of the Claude Code connect command +
// live server status), Project (fps / resolution defaults), and Export (default codec / resolution).

import { useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme, sectionLabelStyle } from "./theme";
import { BRIDGE_URL } from "../state/bridge";

const MCP_URL = `${BRIDGE_URL}/mcp`;
const CONNECT_CMD = `claude mcp add --transport http palmier-pro ${MCP_URL}`;

type Tab = "connect" | "project" | "export";

export function Settings() {
  useEditorVersion();
  const [tab, setTab] = useState<Tab>("connect");
  if (!store.settings.showSettings) return null;
  const connected = store.bridge?.connected;

  return (
    <div
      onClick={() => store.openSettings(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "92vw", maxHeight: "86vh", overflow: "hidden", display: "flex", flexDirection: "column", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui }}
      >
        <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised }}>
          <span style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600 }}>Settings</span>
          <button onClick={() => store.openSettings(false)} style={{ background: "transparent", border: "none", color: theme.color.textSecondary, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: theme.space.xs, padding: `${theme.space.smMd}px ${theme.space.lg}px 0`, borderBottom: `1px solid ${theme.color.borderPrimary}` }}>
          {(["connect", "project", "export"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: "transparent", border: "none", cursor: "pointer", padding: `${theme.space.smMd}px ${theme.space.md}px`,
                color: tab === t ? theme.color.textPrimary : theme.color.textTertiary, fontSize: theme.fontSize.smMd, fontWeight: tab === t ? 600 : 400,
                borderBottom: `2px solid ${tab === t ? theme.color.accent : "transparent"}`,
              }}
            >
              {t === "connect" ? "Connect AI" : t === "project" ? "Project" : "Export"}
            </button>
          ))}
        </div>

        <div style={{ padding: theme.space.xl, overflowY: "auto" }}>
          {tab === "connect" && <ConnectTab connected={!!connected} />}
          {tab === "project" && <ProjectTab />}
          {tab === "export" && <ExportTab />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: theme.space.md, marginBottom: theme.space.mdLg }}>
      <span style={{ width: 140, fontSize: theme.fontSize.smMd, color: theme.color.textSecondary }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderPrimary}`,
  borderRadius: theme.radius.sm, padding: "5px 8px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.ui, width: 180,
};

function ConnectTab({ connected }: { connected: boolean }) {
  const mode = store.settings.connectMode;
  if (mode === "inapp") return <InAppSetup />;
  if (mode === "claudecode") return <ClaudeCodeSetup connected={connected} />;
  return <ConnectChooser />;
}

function ConnectChooser() {
  const Card = ({ badge, title, sub, points, onPick, cta }: { badge: string; title: string; sub: string; points: string[]; onPick: () => void; cta: string }) => (
    <div style={{ flex: 1, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.md, padding: theme.space.lg, display: "flex", flexDirection: "column", background: theme.color.base }}>
      <span style={{ fontSize: theme.fontSize.xxs, textTransform: "uppercase", letterSpacing: 0.6, color: theme.color.accent }}>{badge}</span>
      <div style={{ fontSize: theme.fontSize.mdLg, fontWeight: 700, marginTop: 4 }}>{title}</div>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textTertiary, marginBottom: theme.space.smMd }}>{sub}</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: theme.color.textSecondary, fontSize: theme.fontSize.smMd, lineHeight: 1.6, flex: 1 }}>
        {points.map((p, i) => <li key={i}>{p}</li>)}
      </ul>
      <button onClick={onPick} style={{ marginTop: theme.space.mdLg, background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "8px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>{cta}</button>
    </div>
  );
  return (
    <div>
      <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, marginBottom: theme.space.lg, lineHeight: 1.6 }}>
        Two ways to let AI edit your timeline. Pick one — you can switch later.
      </div>
      <div style={{ display: "flex", gap: theme.space.mdLg }}>
        <Card
          badge="Option A · Best experience"
          title="In-app chat"
          sub="Uses your own Anthropic API key"
          points={["Chat right inside Maestro", "Attach files, edits happen live in the window", "Small cost per use (billed to your API key)"]}
          onPick={() => store.setConnectMode("inapp")}
          cta="Set up in-app chat"
        />
        <Card
          badge="Option B · Free"
          title="Claude Code"
          sub="For users on a Claude subscription"
          points={["Free with your Claude plan", "Runs in a separate terminal window", "Connects over MCP; edits still show live here"]}
          onPick={() => store.setConnectMode("claudecode")}
          cta="Set up Claude Code"
        />
      </div>
    </div>
  );
}

function BackLink() {
  return <button onClick={() => store.setConnectMode("choose")} style={{ background: "transparent", border: "none", color: theme.color.textTertiary, cursor: "pointer", fontSize: theme.fontSize.xs, padding: 0, marginBottom: theme.space.md }}>← other options</button>;
}

function InAppSetup() {
  const [key, setKey] = useState(store.settings.apiKey);
  const saved = store.settings.apiKey.trim().length > 0;
  return (
    <div>
      <BackLink />
      <div style={{ ...sectionLabelStyle, marginBottom: theme.space.smMd }}>In-app chat — Anthropic API key</div>
      <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6, marginBottom: theme.space.mdLg }}>
        Paste your Anthropic key (from <span style={{ fontFamily: theme.font.mono }}>console.anthropic.com</span>). Stored locally in this app only. This uses your own key — a small cost per use.
      </div>
      <div style={{ display: "flex", gap: theme.space.sm, marginBottom: theme.space.mdLg }}>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…"
          style={{ flex: 1, background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "7px 9px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.mono }} />
        <button onClick={() => store.setApiKey(key.trim())} style={{ background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "0 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>Save</button>
      </div>
      <Field label="Model">
        <select style={selectStyle} value={store.settings.model} onChange={(e) => store.setModel(e.target.value)}>
          {["claude-sonnet-5", "claude-opus-4-8", "claude-haiku-4-5-20251001"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      {saved && (
        <button onClick={() => { store.openSettings(false); store.openChat(true); }} style={{ marginTop: theme.space.md, background: theme.color.prominent, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.sm, padding: "8px 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>Open chat →</button>
      )}
    </div>
  );
}

function LaunchButton() {
  const [status, setStatus] = useState<string | null>(null);
  const inTauri = "__TAURI_INTERNALS__" in globalThis;
  const launch = async () => {
    setStatus("Opening a terminal…");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("launch_claude_code");
      setStatus("A terminal opened — Claude is connecting to Maestro. Edits will appear here live.");
    } catch (e) {
      setStatus(`Couldn't launch: ${e instanceof Error ? e.message : String(e)}. Make sure Claude Code is installed (see manual steps).`);
    }
  };
  return (
    <div>
      <button
        onClick={launch} disabled={!inTauri}
        title={inTauri ? "Open a terminal with Claude Code connected" : "Available in the Maestro app"}
        style={{ width: "100%", background: inTauri ? theme.color.accent : theme.color.raised, color: inTauri ? "#1a1a1a" : theme.color.textMuted, border: "none", borderRadius: theme.radius.sm, padding: "11px", fontSize: theme.fontSize.md, fontWeight: 700, cursor: inTauri ? "pointer" : "default" }}
      >
        🚀 Launch Claude Code (connected)
      </button>
      <div style={{ marginTop: theme.space.sm, fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>
        {inTauri
          ? "One click — opens a terminal, connects to Maestro, and starts Claude. Requires Claude Code installed (npm i -g @anthropic-ai/claude-code)."
          : "The launch button runs in the Maestro desktop app. In a browser, use the manual steps below."}
      </div>
      {status && <div style={{ marginTop: theme.space.sm, fontSize: theme.fontSize.xs, color: theme.color.textSecondary, lineHeight: 1.5 }}>{status}</div>}
    </div>
  );
}

function ClaudeCodeSetup({ connected }: { connected: boolean }) {
  const [copied, setCopied] = useState("");
  const copy = async (cmd: string, tag: string) => { try { await navigator.clipboard.writeText(cmd); setCopied(tag); setTimeout(() => setCopied(""), 1500); } catch { /* blocked */ } };
  const Cmd = ({ cmd, tag }: { cmd: string; tag: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: theme.space.sm, marginBottom: theme.space.sm }}>
      <code style={{ flex: 1, background: theme.color.base, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "7px 9px", fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.color.textPrimary, overflowX: "auto", whiteSpace: "nowrap" }}>{cmd}</code>
      <button onClick={() => copy(cmd, tag)} style={{ background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "7px 12px", fontSize: theme.fontSize.sm, fontWeight: 600, cursor: "pointer" }}>{copied === tag ? "✓" : "Copy"}</button>
    </div>
  );
  return (
    <div>
      <BackLink />
      <div style={{ display: "flex", alignItems: "center", gap: theme.space.sm, marginBottom: theme.space.mdLg }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: connected ? theme.color.success : "#e0a63b" }} />
        <span style={{ fontSize: theme.fontSize.smMd }}>{connected ? "Project server running" : "Project server offline — run npm run mcp"}</span>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.color.textMuted, marginLeft: "auto" }}>{MCP_URL}</span>
      </div>
      <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, marginBottom: theme.space.mdLg }}>Free with your Claude plan. Runs in a separate terminal; edits still appear here live.</div>
      <LaunchButton />
      <details style={{ marginTop: theme.space.mdLg }}>
        <summary style={{ cursor: "pointer", fontSize: theme.fontSize.xs, color: theme.color.textTertiary }}>or do it manually (copy the 3 steps)</summary>
        <div style={{ marginTop: theme.space.md }}>
          <div style={{ ...sectionLabelStyle, marginBottom: theme.space.sm }}>1 · Install Claude Code (once)</div>
          <Cmd cmd="npm i -g @anthropic-ai/claude-code" tag="install" />
          <div style={{ ...sectionLabelStyle, margin: `${theme.space.md}px 0 ${theme.space.sm}px` }}>2 · Connect it to Maestro</div>
          <Cmd cmd={CONNECT_CMD} tag="add" />
          <div style={{ ...sectionLabelStyle, margin: `${theme.space.md}px 0 ${theme.space.sm}px` }}>3 · Start Claude and prompt it</div>
          <Cmd cmd="claude" tag="run" />
        </div>
      </details>
      <div style={{ marginTop: theme.space.md, fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>Local only — the server listens on 127.0.0.1. Then ask e.g. “add an animated intro that says Trip 2026”.</div>
    </div>
  );
}

function ProjectTab() {
  const t = store.timeline;
  const RES = [["1280×720", 1280, 720], ["1920×1080", 1920, 1080], ["2560×1440", 2560, 1440], ["3840×2160", 3840, 2160], ["1080×1920 (vertical)", 1080, 1920]] as const;
  const cur = `${t.width}×${t.height}`;
  return (
    <div>
      <Field label="Frame rate">
        <select style={selectStyle} value={t.fps} onChange={(e) => store.setProjectSettings({ fps: Number(e.target.value) })}>
          {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
        </select>
      </Field>
      <Field label="Resolution">
        <select style={selectStyle} value={RES.find((r) => `${r[1]}×${r[2]}` === cur) ? cur : cur} onChange={(e) => { const r = RES.find((x) => `${x[1]}×${x[2]}` === e.target.value); if (r) store.setProjectSettings({ width: r[1], height: r[2] }); }}>
          {!RES.find((r) => `${r[1]}×${r[2]}` === cur) && <option value={cur}>{cur}</option>}
          {RES.map((r) => <option key={r[0]} value={`${r[1]}×${r[2]}`}>{r[0]}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>Applies to the preview canvas and the exported video.</div>
    </div>
  );
}

function ExportTab() {
  const s = store.settings;
  return (
    <div>
      <Field label="Default codec">
        <select style={selectStyle} value={s.exportCodec} onChange={(e) => store.setExportDefaults({ codec: e.target.value })}>
          {["H.264", "H.265", "ProRes"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Default resolution">
        <select style={selectStyle} value={s.exportResolution} onChange={(e) => store.setExportDefaults({ resolution: e.target.value })}>
          {["720p", "1080p", "2K", "4K", "Match Timeline"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>The Export button uses these. Files land next to the project as palmier-export.mp4.</div>
    </div>
  );
}
