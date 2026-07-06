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
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(CONNECT_CMD); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: theme.space.sm, marginBottom: theme.space.lg }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: connected ? theme.color.success : "#e0a63b" }} />
        <span style={{ fontSize: theme.fontSize.md }}>{connected ? "Project server running" : "Project server offline"}</span>
        <span style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.xs, color: theme.color.textMuted, marginLeft: "auto" }}>{MCP_URL}</span>
      </div>

      <div style={{ ...sectionLabelStyle, marginBottom: theme.space.smMd }}>Connect Claude</div>
      <ol style={{ margin: 0, paddingLeft: 18, color: theme.color.textSecondary, fontSize: theme.fontSize.smMd, lineHeight: 1.7 }}>
        <li>Install Claude Code (<span style={{ fontFamily: theme.font.mono }}>npm i -g @anthropic-ai/claude-code</span>).</li>
        <li>Run the command below in a terminal to connect it to Maestro.</li>
        <li>Start <span style={{ fontFamily: theme.font.mono }}>claude</span> and ask it to edit your timeline — changes appear here live.</li>
      </ol>

      <div style={{ marginTop: theme.space.mdLg, display: "flex", alignItems: "center", gap: theme.space.sm }}>
        <code style={{ flex: 1, background: theme.color.base, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "8px 10px", fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.color.textPrimary, overflowX: "auto", whiteSpace: "nowrap" }}>{CONNECT_CMD}</code>
        <button onClick={copy} style={{ background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "8px 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <div style={{ marginTop: theme.space.md, fontSize: theme.fontSize.xs, color: theme.color.textMuted }}>Local only — the server listens on 127.0.0.1 and is not exposed to the network.</div>
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
