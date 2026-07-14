import { useEffect, useRef, useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";
import { Timeline } from "./timeline/Timeline";
import { CanvasPreview } from "../compositor/CanvasPreview";
import { Inspector } from "./Inspector";
import { MediaPanel } from "./MediaPanel";
import { Settings } from "./Settings";
import { GenerationPanel } from "./GenerationPanel";
import { WaitlistModal } from "./WaitlistModal";
import { ChatPanel } from "./ChatPanel";
import { Onboarding } from "./Onboarding";
import { ShortcutsModal } from "./ShortcutsModal";
import { CloseConfirm } from "./CloseConfirm";
import { exportVideoFromUI } from "./exportVideo";
import { previewAudio } from "../audio/previewAudio";
import { humanizeError } from "./errors";

const inTauri = (): boolean => "__TAURI_INTERNALS__" in globalThis;

function tc(frame: number, fps: number): string {
  const f = Math.round(frame) % fps;
  const totalSec = Math.floor(Math.round(frame) / fps);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSec / 60))}:${pad(totalSec % 60)}:${pad(f)}`;
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
function aspectLabel(w: number, h: number): string {
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

// Icon-only button (transport, tools).
function IconBtn({ glyph, title, onClick, active, size = 15 }: { glyph: string; title: string; onClick: () => void; active?: boolean; size?: number }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 28, borderRadius: theme.radius.sm, cursor: "pointer",
        border: `1px solid ${active ? theme.color.borderPrimary : "transparent"}`,
        background: active ? theme.color.prominent : hover ? theme.color.raised : "transparent",
        color: active ? theme.color.textPrimary : theme.color.textSecondary,
        fontSize: size, lineHeight: 1, fontFamily: theme.font.ui, transition: "background 0.15s",
      }}
    >
      {glyph}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textTertiary, fontFamily: theme.font.mono, padding: "2px 6px", borderRadius: theme.radius.xs, background: theme.color.raised }}>
      {children}
    </span>
  );
}

// Small animated indeterminate progress indicator (export has no real % from the render pipeline
// today, so a pulsing dot keeps the UI from looking frozen). `dark` = for use on the accent button.
function PulsingDot({ dark }: { dark?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block", width: 6, height: 6, borderRadius: 3, flex: "0 0 auto",
        background: dark ? theme.color.onAccent : theme.color.accent,
        animation: "kaestral-pulse 1s ease-in-out infinite",
      }}
    />
  );
}

export function Editor() {
  useEditorVersion();
  const { timeline } = store;
  const { currentFrame, pixelsPerFrame, playing } = store.view;
  const floatFrame = useRef(currentFrame);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const total = store.totalFrames;
  const timelineEmpty = total === 0;

  const doExport = async () => {
    setExporting(true);
    setExportMsg("Exporting…");
    try {
      const r = await exportVideoFromUI(store.settings.exportCodec, store.settings.exportResolution);
      store.clearDirty();
      setExportMsg(`Exported → ${r.outputPath}`);
    } catch (e) {
      setExportMsg(humanizeError(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (!playing) return;
    floatFrame.current = store.view.currentFrame;
    void previewAudio.play(store.timeline, Math.round(store.view.currentFrame), (r) => store.mediaSrcFor(r));
    let raf = 0;
    let last = performance.now();
    let lastEmit = last;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      floatFrame.current += dt * timeline.fps;
      const totalF = store.totalFrames;
      if (floatFrame.current >= totalF) { store.setCurrentFrame(totalF); store.setPlaying(false); return; }
      // Advance the playhead directly; the preview has its own 60fps draw loop. Emit only ~20/s so
      // the timeline playhead + timecode update without a per-frame React re-render storm.
      store.view.currentFrame = floatFrame.current;
      if (now - lastEmit > 50) { lastEmit = now; store.emit(); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); previewAudio.stop(); store.emit(); };
  }, [playing, timeline.fps]);

  // Single source of truth for global shortcuts (Timeline.tsx no longer binds its own copy, so
  // Space/S/Del/undo/redo can't double-fire).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); store.setPlaying(!store.view.playing); }
      else if (e.key === "s" || e.key === "S") { store.splitAtPlayhead(); }
      else if (e.key === "Delete" || e.key === "Backspace") { store.removeSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); store.redo(); }
      else if (e.key === "?") { store.openShortcuts(!store.settings.showShortcuts); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Unsaved-changes guard: browser/dev path (beforeunload) + Tauri path (window close-request).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!store.dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    let unlisten: (() => void) | undefined;
    if (inTauri()) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
        const win = getCurrentWindow();
        void win.onCloseRequested(async (event) => {
          if (store.dirty) {
            event.preventDefault();
            setCloseConfirmOpen(true);
          }
        }).then((fn) => { unlisten = fn; });
      }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    store.startBridge();
    // Robust drag-drop import: any file type / large files stream through the server, and every
    // failure surfaces as a toast instead of being silently swallowed.
    const importOne = async (name: string, run: () => Promise<unknown>) => {
      try { await run(); store.toast(`Imported ${name}`); }
      catch (e) { store.toast(humanizeError(e, `Couldn't import ${name}`), "error"); }
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragActive(true); };
    const onDragLeave = (e: DragEvent) => { if (e.relatedTarget === null) setDragActive(false); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); setDragActive(false);
      const files = e.dataTransfer?.files;
      if (files?.length) for (const f of files) void importOne(f.name, () => store.bridge!.importFile(f));
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    let unlisten: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in globalThis) {
      void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") setDragActive(true);
          else if (event.payload.type === "leave") setDragActive(false);
          else if (event.payload.type === "drop") {
            setDragActive(false);
            for (const p of event.payload.paths) void importOne(p.split(/[/\\]/).pop() ?? p, () => store.bridge!.importPath(p));
          }
        });
      }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      unlisten?.();
    };
  }, []);

  const step = (d: number) => { store.setPlaying(false); store.setCurrentFrame(Math.max(0, Math.min(total, Math.round(currentFrame) + d))); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.color.base, color: theme.color.textPrimary, fontFamily: theme.font.ui, overflow: "hidden" }}>
      {/* Global animation keyframes + focus-visible outline for key buttons (scoped, additive). */}
      <style>{`
        @keyframes kaestral-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.15); } }
        button:focus-visible { outline: 2px solid ${theme.color.accent}; outline-offset: 2px; }
      `}</style>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: theme.space.smMd, height: 44, padding: `0 ${theme.space.mdLg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, flex: "0 0 auto" }}>
        <span style={{ fontSize: theme.fontSize.md, fontWeight: 600, letterSpacing: 0.2 }}>Kaestral</span>
        <span
          title={store.bridge?.connected ? "Connected — the AI can edit your project" : "Reconnecting to the project engine…"}
          style={{ width: 7, height: 7, borderRadius: 4, background: store.bridge?.connected ? theme.color.success : theme.color.warning }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: theme.fontSize.smMd, color: theme.color.textTertiary }}>Untitled Project</span>
        <div style={{ flex: 1 }} />
        {exportMsg && (
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: theme.fontSize.xs, color: theme.color.textTertiary, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {exporting && <PulsingDot />}
            {exportMsg}
          </span>
        )}
        <button
          onClick={() => store.openShortcuts(true)} title="Keyboard shortcuts (?)"
          style={{ background: "transparent", color: theme.color.textSecondary, border: "none", borderRadius: theme.radius.sm, padding: "6px 8px", fontSize: 15, cursor: "pointer" }}
        >
          ⌨
        </button>
        <button
          onClick={() => {
            if (store.settings.connectMode === "inapp" && store.settings.apiKey.trim()) store.openChat(!store.settings.showChat);
            else store.openSettings(true);
          }}
          title="Connect / open AI"
          style={{ background: store.settings.showChat ? theme.color.prominent : "transparent", color: theme.color.textSecondary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "6px 12px", fontSize: theme.fontSize.smMd, cursor: "pointer", fontFamily: theme.font.ui, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: store.bridge?.connected ? theme.color.success : theme.color.warning }} /> {store.settings.connectMode === "inapp" && store.settings.apiKey.trim() ? "AI Chat" : "Connect AI"}
        </button>
        <button
          onClick={() => store.openWaitlist(true)} title="Kaestral Pro — AI generation (join the waitlist)"
          style={{ background: "transparent", color: theme.color.accent, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "6px 12px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer", fontFamily: theme.font.ui }}
        >
          ✨ Pro
        </button>
        <button
          onClick={() => store.openSettings(true)} title="Settings"
          style={{ background: "transparent", color: theme.color.textSecondary, border: "none", borderRadius: theme.radius.sm, padding: "6px 8px", fontSize: 16, cursor: "pointer" }}
        >
          ⚙
        </button>
        <button
          onClick={doExport} title={exporting ? "Export in progress…" : `Render ${store.settings.exportCodec} via FFmpeg`}
          disabled={exporting}
          style={{
            background: exporting ? theme.color.raised : theme.color.accent,
            color: exporting ? theme.color.textMuted : theme.color.onAccent,
            border: "none", borderRadius: theme.radius.sm, padding: "6px 14px", fontSize: theme.fontSize.smMd, fontWeight: 600,
            cursor: exporting ? "default" : "pointer", fontFamily: theme.font.ui, opacity: exporting ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {exporting && <PulsingDot dark />} {exporting ? "Exporting…" : "Export"}
        </button>
      </div>

      {/* Media | Preview | Inspector */}
      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        <MediaPanel />
        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", background: theme.color.base, minHeight: 0, minWidth: 0 }}>
          <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: theme.space.lg }}>
            <CanvasPreview />
          </div>
          {/* Transport */}
          <div style={{ display: "flex", alignItems: "center", gap: theme.space.smMd, height: 46, padding: `0 ${theme.space.lg}px`, borderTop: `1px solid ${theme.color.borderPrimary}`, background: theme.color.surface, flex: "0 0 auto" }}>
            <span style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.md, color: theme.color.timecode, minWidth: 82 }}>{tc(currentFrame, timeline.fps)}</span>
            <div style={{ flex: 1 }} />
            <IconBtn glyph="⏮" title="Start" onClick={() => step(-total)} />
            <IconBtn glyph="◀" title="Back 1 frame" onClick={() => step(-1)} />
            <IconBtn glyph={playing ? "❚❚" : "▶"} title="Play/Pause (Space)" onClick={() => store.setPlaying(!playing)} size={16} />
            <IconBtn glyph="▶|" title="Forward 1 frame" onClick={() => step(1)} />
            <IconBtn glyph="⏭" title="End" onClick={() => step(total)} />
            <div style={{ flex: 1 }} />
            <Badge>{aspectLabel(timeline.width, timeline.height)}</Badge>
            <Badge>{timeline.fps} fps</Badge>
            <Badge>{timeline.height}p</Badge>
            <span style={{ fontFamily: theme.font.mono, fontSize: theme.fontSize.md, color: theme.color.textMuted, minWidth: 82, textAlign: "right" }}>{tc(total, timeline.fps)}</span>
          </div>
        </div>
        <Inspector />
        <ChatPanel />
      </div>

      {/* Timeline toolbar + tracks */}
      <div style={{ height: 330, flex: "0 0 auto", borderTop: `1px solid ${theme.color.borderPrimary}`, display: "flex", flexDirection: "column", background: theme.color.base }}>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space.xs, height: theme.timeline.toolbarHeight, padding: `0 ${theme.space.md}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.surface, flex: "0 0 auto" }}>
          <IconBtn glyph="↶" title="Undo (Ctrl+Z)" onClick={() => store.undo()} />
          <IconBtn glyph="↷" title="Redo (Ctrl+Shift+Z)" onClick={() => store.redo()} />
          <div style={{ width: 1, height: 18, background: theme.color.borderSubtle, margin: `0 ${theme.space.xs}px` }} />
          <IconBtn glyph="▚" title="Split at playhead (S)" onClick={() => store.splitAtPlayhead()} />
          <IconBtn glyph="🗑" title="Delete selected (Del)" onClick={() => store.removeSelected()} size={13} />
          <div style={{ width: 1, height: 18, background: theme.color.borderSubtle, margin: `0 ${theme.space.xs}px` }} />
          <IconBtn glyph="⇄" title="Add transitions at cuts (cross-dissolve, 0.5s)" onClick={() => {
            const n = store.addTransitionsAtCuts(0.5);
            store.toast?.(n > 0 ? `Added ${n} transition${n === 1 ? "" : "s"} at cuts.` : "No hard cuts to transition — clips need to butt together.");
          }} />
          <div style={{ flex: 1 }} />
          <IconBtn glyph="－" title="Zoom out" onClick={() => store.setZoom(pixelsPerFrame / theme.zoom.stepFactor)} />
          <input
            type="range" min={theme.zoom.min} max={theme.zoom.max} step={0.01} value={pixelsPerFrame}
            onChange={(e) => store.setZoom(parseFloat(e.target.value))}
            style={{ width: 120, accentColor: theme.color.accent }}
          />
          <IconBtn glyph="＋" title="Zoom in" onClick={() => store.setZoom(pixelsPerFrame * theme.zoom.stepFactor)} />
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0, position: "relative" }}>
          <Timeline />
          {timelineEmpty && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: theme.fontSize.smMd, color: theme.color.textMuted, textAlign: "center", lineHeight: 1.6, maxWidth: 360 }}>
                Your timeline is empty.<br />Import media (top-left) or ask the AI to build an edit.
              </div>
            </div>
          )}
        </div>
      </div>

      <Settings />
      <GenerationPanel />
      <WaitlistModal />
      <Onboarding />
      <ShortcutsModal />
      {closeConfirmOpen && (
        <CloseConfirm
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={() => {
            setCloseConfirmOpen(false);
            if (inTauri()) {
              void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().destroy());
            }
          }}
        />
      )}

      {/* Drag-drop hint overlay */}
      {dragActive && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", border: `3px dashed ${theme.color.accent}`, pointerEvents: "none" }}>
          <div style={{ fontSize: theme.fontSize.mdLg, fontWeight: 600, color: theme.color.textPrimary, background: theme.color.surface, padding: `${theme.space.md}px ${theme.space.xl}px`, borderRadius: theme.radius.mdLg, border: `1px solid ${theme.color.borderPrimary}` }}>
            Drop media to import — video, audio, or images
          </div>
        </div>
      )}

      {/* Toast stack */}
      <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 200, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none" }}>
        {store.toasts.map((t) => (
          <div key={t.id} style={{ maxWidth: 520, fontSize: theme.fontSize.smMd, color: t.kind === "error" ? theme.color.errorText : theme.color.textPrimary, background: t.kind === "error" ? theme.color.errorBg : theme.color.raised, border: `1px solid ${t.kind === "error" ? theme.color.errorBorder : theme.color.borderPrimary}`, borderRadius: theme.radius.sm, padding: `${theme.space.sm}px ${theme.space.md}px`, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
