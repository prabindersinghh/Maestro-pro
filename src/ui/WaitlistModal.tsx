// "Pro / AI features — join the waitlist" — a visible email-capture so the owner can gauge demand for
// AI generation BEFORE building the cloud GPU infra. This is the only place "AI generation" surfaces in
// the shipping UI, and it captures interest rather than exposing the (hidden, paid-tier) generator.
// Submits to VITE_WAITLIST_URL if configured; otherwise opens the user's mail client to the owner.

import { useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";

const OWNER_EMAIL = "prabindersinghh@gmail.com";
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function WaitlistModal() {
  useEditorVersion();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ kind: "idle" | "sending" | "done" | "error"; msg?: string }>({ kind: "idle" });

  if (!store.settings.showWaitlist) return null;
  const joined = store.settings.waitlistJoined;

  const submit = async () => {
    if (!validEmail(email)) { setState({ kind: "error", msg: "Enter a valid email address." }); return; }
    setState({ kind: "sending" });
    const r = await store.joinWaitlist(email.trim());
    if (r.mode === "mailto") {
      const subject = encodeURIComponent("Kaestral Pro — waitlist");
      const body = encodeURIComponent(`Add me to the Kaestral Pro / AI-features waitlist.\n\nEmail: ${email.trim()}`);
      window.open(`mailto:${OWNER_EMAIL}?subject=${subject}&body=${body}`, "_blank");
      setState({ kind: "done", msg: "Opening your email app — hit send and you're on the list." });
    } else if (r.ok) {
      setState({ kind: "done", msg: "You're on the list. We'll email you when AI features open up." });
    } else {
      setState({ kind: "error", msg: r.detail ?? "Something went wrong. Try again." });
    }
  };

  return (
    <div onClick={() => store.openWaitlist(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "92vw", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui, overflow: "hidden" }}>
        <div style={{ padding: `${theme.space.xl}px ${theme.space.xl}px ${theme.space.lg}px`, background: `linear-gradient(135deg, ${theme.color.raised}, ${theme.color.surface})` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ fontSize: 11, fontFamily: theme.font.mono, letterSpacing: "0.12em", textTransform: "uppercase", color: theme.color.accent, fontWeight: 700 }}>Kaestral Pro</span>
            <button onClick={() => store.openWaitlist(false)} style={{ background: "transparent", border: "none", color: theme.color.textSecondary, fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <h2 style={{ margin: "10px 0 8px", fontSize: 22, fontWeight: 750, letterSpacing: "-0.01em" }}>AI generation is coming</h2>
          <p style={{ margin: 0, fontSize: 14, color: theme.color.textSecondary, lineHeight: 1.55 }}>
            Type a prompt, get a real clip on your timeline. Generate video, images, and B-roll — right inside Kaestral. Join the waitlist and we'll let you know the moment it opens.
          </p>
        </div>

        <div style={{ padding: `${theme.space.lg}px ${theme.space.xl}px ${theme.space.xl}px`, display: "flex", flexDirection: "column", gap: theme.space.md }}>
          {joined && state.kind === "idle" ? (
            <div style={{ fontSize: 14, color: theme.color.success, fontFamily: theme.font.mono }}>✓ You're already on the list. Thanks!</div>
          ) : state.kind === "done" ? (
            <div style={{ fontSize: 14, color: theme.color.success, lineHeight: 1.5 }}>✓ {state.msg}</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: theme.space.xs }}>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  style={{ flex: 1, background: theme.color.base, color: theme.color.textPrimary, border: `1px solid ${state.kind === "error" ? theme.color.errorBorder : theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "9px 11px", fontSize: theme.fontSize.smMd, fontFamily: theme.font.ui }}
                />
                <button onClick={() => void submit()} disabled={state.kind === "sending"} style={{ background: state.kind === "sending" ? theme.color.raised : theme.color.accent, color: state.kind === "sending" ? theme.color.textSecondary : theme.color.onAccent, border: "none", borderRadius: theme.radius.sm, padding: "9px 16px", fontSize: theme.fontSize.smMd, fontWeight: 700, cursor: state.kind === "sending" ? "default" : "pointer", whiteSpace: "nowrap" }}>
                  {state.kind === "sending" ? "…" : "Join waitlist"}
                </button>
              </div>
              {state.kind === "error" && <span style={{ fontSize: theme.fontSize.xs, color: "#e88" }}>{state.msg}</span>}
              <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textTertiary, lineHeight: 1.4 }}>
                No spam — one email when it's ready. Your address isn't shared.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
