// Unsaved-changes confirm modal, shown when the user tries to close the window while store.dirty is
// true. Deliberately simple: Cancel keeps the app open, "Close without saving" destroys the window
// (Tauri) — wired from Editor.tsx's onCloseRequested handler.

import { theme } from "./theme";

export function CloseConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: "90vw", background: theme.color.surface, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.mdLg, boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: theme.font.ui, padding: theme.space.xl }}
      >
        <div style={{ fontSize: theme.fontSize.mdLg, fontWeight: 700, marginBottom: theme.space.sm }}>You have unsaved changes</div>
        <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textSecondary, lineHeight: 1.6, marginBottom: theme.space.lg }}>
          If you close Kaestral now, recent edits to your project won't be exported. Close anyway?
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: theme.space.sm }}>
          <button
            onClick={onCancel}
            style={{ background: theme.color.raised, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.sm, padding: "8px 16px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer", fontFamily: theme.font.ui }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ background: theme.color.errorBg, color: theme.color.errorText, border: `1px solid ${theme.color.errorBorder}`, borderRadius: theme.radius.sm, padding: "8px 16px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer", fontFamily: theme.font.ui }}
          >
            Close without saving
          </button>
        </div>
      </div>
    </div>
  );
}
