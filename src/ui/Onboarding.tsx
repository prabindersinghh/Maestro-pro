// First-run onboarding — a short, warm 4-step walkthrough shown once (gated on
// store.settings.onboarded / localStorage "kaestral.onboarded"). Purely additive: skipping or
// finishing never blocks the app, and the demo project underneath is already loaded and playable.

import { useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";

const STEPS = ["Welcome", "Sample project", "Try a prompt", "Connect AI"] as const;

const EXAMPLE_PROMPTS = [
  "Add captions to my clip",
  "Cut this down to 30 seconds on the beat",
  "Make a title that says “Trip 2026” and animate it in",
];

function StepDots({ index }: { index: number }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: theme.space.lg }}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          style={{
            width: i === index ? 18 : 6, height: 6, borderRadius: 3,
            background: i === index ? theme.color.accent : theme.color.borderPrimary,
            transition: "all 0.2s",
          }}
        />
      ))}
    </div>
  );
}

function PrimaryButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: theme.color.accent, color: theme.color.onAccent, border: "none",
        borderRadius: theme.radius.sm, padding: "10px 20px", fontSize: theme.fontSize.md, fontWeight: 700,
        cursor: "pointer", fontFamily: theme.font.ui, opacity: hover ? 0.92 : 1, transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent", color: theme.color.textTertiary, border: "none",
        borderRadius: theme.radius.sm, padding: "10px 14px", fontSize: theme.fontSize.smMd,
        cursor: "pointer", fontFamily: theme.font.ui,
      }}
    >
      {children}
    </button>
  );
}

export function Onboarding() {
  useEditorVersion();
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState<number | null>(null);

  if (store.settings.onboarded) return null;

  const last = step === STEPS.length - 1;
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const skip = () => store.completeOnboarding();
  const finishAndConnect = () => { store.completeOnboarding(); store.openSettings(true); };

  const copyPrompt = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied(null), 1400); } catch { /* clipboard blocked — presentation still works */ }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
    >
      <div
        style={{
          width: 560, maxWidth: "92vw", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`,
          borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui,
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header strip */}
        <div style={{ padding: `${theme.space.xl}px ${theme.space.xl}px ${theme.space.lg}px`, background: `linear-gradient(135deg, ${theme.color.raised}, ${theme.color.surface})`, borderBottom: `1px solid ${theme.color.borderPrimary}` }}>
          <StepDots index={step} />

          {step === 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: theme.fontSize.title1, fontWeight: 700, marginBottom: 6 }}>Welcome to Kaestral</div>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6 }}>
                The AI-operated video editor for Windows — you describe the edit, it makes it.
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: theme.fontSize.title2, fontWeight: 700, marginBottom: 6 }}>A sample project is already loaded</div>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6 }}>
                Explore it right away — footage, a title, and music are already on the timeline below.
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: theme.fontSize.title2, fontWeight: 700, marginBottom: 6 }}>Just ask, in plain English</div>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6 }}>
                Once you're connected, try prompts like these — no menus to learn.
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: theme.fontSize.title2, fontWeight: 700, marginBottom: 6 }}>Connect Claude to start editing by conversation</div>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6 }}>
                It's easy, and works either with a Claude subscription (Claude Code) or your own API key (in-app chat).
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: theme.space.xl, minHeight: 130 }}>
          {step === 0 && (
            <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.7, textAlign: "center" }}>
              No timelines to master, no effect stacks to dig through. Say what you want in your own words,
              and Kaestral edits your project live, right in front of you.
            </div>
          )}

          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: theme.space.md }}>
              <div style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600, color: theme.color.textPrimary, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>▶</span> Press Space to play it
              </div>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textTertiary, textAlign: "center", lineHeight: 1.6 }}>
                Look for the timeline at the bottom of the window — your clips, title, and music are laid out there.
                Drag the playhead or hit the transport controls to scrub through.
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: theme.space.sm }}>
              {EXAMPLE_PROMPTS.map((p, i) => (
                <button
                  key={p}
                  onClick={() => void copyPrompt(p, i)}
                  title="Copy this prompt"
                  style={{
                    textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: theme.space.sm,
                    background: theme.color.base, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm,
                    padding: `${theme.space.smMd}px ${theme.space.md}px`, cursor: "pointer", fontFamily: theme.font.ui,
                  }}
                >
                  <span style={{ fontSize: theme.fontSize.smMd, color: theme.color.textPrimary, lineHeight: 1.5 }}>“{p}”</span>
                  <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted, flex: "0 0 auto" }}>{copied === i ? "✓ Copied" : "Copy"}</span>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: theme.space.md }}>
              <PrimaryButton onClick={finishAndConnect} title="Opens Settings → Connect AI">Connect AI →</PrimaryButton>
              <div style={{ fontSize: theme.fontSize.xs, color: theme.color.textMuted, textAlign: "center", lineHeight: 1.6, maxWidth: 380 }}>
                You can always open this later from the "Connect AI" button in the title bar.
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${theme.space.md}px ${theme.space.xl}px`, borderTop: `1px solid ${theme.color.borderPrimary}` }}>
          <GhostButton onClick={skip}>Skip</GhostButton>
          <div style={{ display: "flex", gap: theme.space.sm }}>
            {step > 0 && <GhostButton onClick={back}>Back</GhostButton>}
            {!last && <PrimaryButton onClick={next}>Next</PrimaryButton>}
            {last && <GhostButton onClick={skip}>Maybe later</GhostButton>}
          </div>
        </div>
      </div>
    </div>
  );
}
