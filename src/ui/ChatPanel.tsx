// Option A — in-app AI chat. A right-docked panel: the user types prompts + attaches files, and the
// KaestralAgent runs Claude's tool loop against the local MCP server, so edits and generated clips
// appear live on the timeline. BYOK (the Anthropic key from Settings → Connect AI).

import { useEffect, useMemo, useRef, useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";
import { BRIDGE_URL } from "../state/bridge";
import { KaestralAgent, type Msg, type ContentBlock } from "../agent/agent";
import { humanizeError } from "./errors";

function textOf(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content.filter((b) => b.type === "text").map((b) => String((b as Record<string, unknown>).text ?? "")).join("\n");
}
function toolNames(content: string | ContentBlock[]): string[] {
  if (typeof content === "string") return [];
  return content.filter((b) => b.type === "tool_use").map((b) => String((b as Record<string, unknown>).name ?? ""));
}

export function ChatPanel() {
  useEditorVersion();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; assetId: string; block?: ContentBlock }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agent = useMemo(() => new KaestralAgent(
    { apiKey: () => store.settings.apiKey, model: () => store.settings.model, mcpBase: BRIDGE_URL },
    {
      onMessages: (m, t) => { setMessages([...m]); setThinking(t); if (!t) setActiveTool(null); },
      onToolCall: (n) => setActiveTool(n),
      afterTool: () => { void store.syncNow(); },
    },
  ), []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, thinking, activeTool]);

  if (!store.settings.showChat) return null;
  const hasKey = store.settings.apiKey.trim().length > 0;

  const attach = async (files: FileList) => {
    for (const f of Array.from(files)) {
      try {
        const assetId = await store.bridge?.importFile(f);
        if (!assetId) continue;
        let block: ContentBlock | undefined;
        if (f.type.startsWith("image/")) {
          const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); });
          block = { type: "image", source: { type: "base64", media_type: f.type, data: dataUrl.split(",")[1] } };
        }
        setAttachments((a) => [...a, { name: f.name, assetId, block }]);
      } catch (e) { setError(humanizeError(e, `Couldn't attach ${f.name}`)); }
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setError(null);
    setInput("");
    const blocks: ContentBlock[] = [];
    for (const a of attachments) { if (a.block) blocks.push(a.block); }
    const note = attachments.length ? `\n\n[Attached & imported: ${attachments.map((a) => `${a.name} (assetId ${a.assetId})`).join(", ")}]` : "";
    setAttachments([]);
    try { await agent.send(text + note, blocks); }
    catch (e) { setError(humanizeError(e, "The AI hit a snag")); }
  };

  return (
    <div style={{ width: 380, flex: "0 0 auto", background: theme.color.surface, borderLeft: `1px solid ${theme.color.borderPrimary}`, display: "flex", flexDirection: "column", fontFamily: theme.font.ui }}>
      <div style={{ height: theme.timeline.panelHeaderHeight, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, flex: "0 0 auto" }}>
        <span style={{ fontSize: theme.fontSize.smMd, fontWeight: 600 }}>AI Chat</span>
        <div style={{ display: "flex", gap: theme.space.sm, alignItems: "center" }}>
          <span style={{ fontSize: theme.fontSize.xxs, color: theme.color.textMuted, fontFamily: theme.font.mono }}>{store.settings.model}</span>
          <button onClick={() => { agent.reset(); setMessages([]); }} title="New chat" style={iconBtn}>⟲</button>
          <button onClick={() => store.openChat(false)} title="Close" style={iconBtn}>✕</button>
        </div>
      </div>

      {!hasKey ? (
        <div style={{ padding: theme.space.xl, color: theme.color.textSecondary, fontSize: theme.fontSize.smMd, lineHeight: 1.6 }}>
          Add your Anthropic API key to use in-app chat.
          <button onClick={() => { store.openChat(false); store.setConnectMode("inapp"); store.openSettings(true); }} style={{ display: "block", marginTop: theme.space.md, background: theme.color.accent, color: theme.color.onAccent, border: "none", borderRadius: theme.radius.sm, padding: "8px 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>Open Connect AI settings</button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} style={{ flex: "1 1 auto", overflowY: "auto", padding: theme.space.mdLg, display: "flex", flexDirection: "column", gap: theme.space.mdLg }}>
            {messages.length === 0 && (
              <div style={{ color: theme.color.textMuted, fontSize: theme.fontSize.smMd, lineHeight: 1.6 }}>
                Ask me to edit your timeline — e.g. <em>“add an animated intro that says Trip 2026”</em>, <em>“cut the first 2 seconds”</em>, or <em>“make a data-viz of these numbers”</em>. I edit live in front of you.
              </div>
            )}
            {messages.map((m, i) => {
              const body = textOf(m.content);
              const tools = toolNames(m.content);
              if (!body && tools.length === 0) return null;
              return (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%" }}>
                  {body && (
                    <div style={{ background: m.role === "user" ? theme.color.prominent : theme.color.raised, color: theme.color.textPrimary, borderRadius: theme.radius.md, padding: "8px 11px", fontSize: theme.fontSize.smMd, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{body}</div>
                  )}
                  {tools.map((t, j) => (
                    <div key={j} style={{ marginTop: 4, fontSize: theme.fontSize.xs, color: theme.color.textTertiary, fontFamily: theme.font.mono }}>⚙ {t}</div>
                  ))}
                </div>
              );
            })}
            {thinking && <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textTertiary }}>{activeTool ? `⚙ running ${activeTool}…` : "thinking…"}</div>}
            {error && <div style={{ fontSize: theme.fontSize.xs, color: theme.color.error, lineHeight: 1.5 }}>{error}</div>}
          </div>

          <div style={{ borderTop: `1px solid ${theme.color.borderPrimary}`, padding: theme.space.smMd, flex: "0 0 auto" }}>
            {attachments.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: theme.space.sm }}>
                {attachments.map((a, i) => <span key={i} style={{ fontSize: theme.fontSize.xxs, background: theme.color.raised, borderRadius: theme.radius.xs, padding: "2px 6px", color: theme.color.textSecondary }}>📎 {a.name}</span>)}
              </div>
            )}
            <div style={{ display: "flex", gap: theme.space.sm, alignItems: "flex-end" }}>
              <button onClick={() => fileRef.current?.click()} title="Attach media" style={{ ...iconBtn, height: 34 }}>＋</button>
              <input ref={fileRef} type="file" multiple accept="video/*,audio/*,image/*" style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) void attach(e.target.files); e.target.value = ""; }} />
              <textarea
                value={input} onChange={(e) => setInput(e.target.value)} rows={2}
                placeholder="Ask the AI to edit…"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                style={{ flex: 1, resize: "none", background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "8px 10px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.ui }}
              />
              <button onClick={() => void send()} disabled={thinking || !input.trim()} style={{ height: 34, background: thinking || !input.trim() ? theme.color.raised : theme.color.accent, color: thinking || !input.trim() ? theme.color.textMuted : theme.color.onAccent, border: "none", borderRadius: theme.radius.sm, padding: "0 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer" }}>Send</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = { background: "transparent", border: "none", color: theme.color.textSecondary, cursor: "pointer", fontSize: 15 };
