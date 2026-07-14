// Discoverable keyboard-shortcuts cheat-sheet. Opened via the "?" key or a small ⌨ toolbar button
// (wired from Editor.tsx). Simple, on-brand, read-only.

import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Space", label: "Play / pause" },
  { keys: "S", label: "Split at playhead" },
  { keys: "Delete / Backspace", label: "Delete selected clip" },
  { keys: "Ctrl+Z", label: "Undo" },
  { keys: "Ctrl+Shift+Z / Ctrl+Y", label: "Redo" },
  { keys: "?", label: "Show this cheat-sheet" },
];

export function ShortcutsModal() {
  useEditorVersion();
  if (!store.settings.showShortcuts) return null;

  return (
    <div
      onClick={() => store.openShortcuts(false)}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 210 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380, maxWidth: "90vw", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui, overflow: "hidden" }}
      >
        <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised }}>
          <span style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600 }}>Keyboard shortcuts</span>
          <button onClick={() => store.openShortcuts(false)} style={{ background: "transparent", border: "none", color: theme.color.textSecondary, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: theme.space.lg }}>
          {SHORTCUTS.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${theme.space.sm}px 0`, borderBottom: `1px solid ${theme.color.borderSubtle}` }}>
              <span style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary }}>{s.label}</span>
              <code style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.sm, color: theme.color.textPrimary, background: theme.color.base, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.xs, padding: "3px 8px" }}>{s.keys}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
