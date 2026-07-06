import { useEffect, useRef, useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";
import { Timeline } from "./timeline/Timeline";
import { CanvasPreview } from "../compositor/CanvasPreview";
import { Inspector } from "./Inspector";
import { MediaPanel } from "./MediaPanel";
import { Settings } from "./Settings";
import { exportVideoFromUI } from "./exportVideo";
import { previewAudio } from "../audio/previewAudio";

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

export function Editor() {
  useEditorVersion();
  const { timeline } = store;
  const { currentFrame, pixelsPerFrame, playing } = store.view;
  const floatFrame = useRef(currentFrame);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const total = store.totalFrames;

  const doExport = async () => {
    setExportMsg("Exporting…");
    try {
      const r = await exportVideoFromUI(store.settings.exportCodec, store.settings.exportResolution);
      setExportMsg(`Exported → ${r.outputPath}`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); store.setPlaying(!store.view.playing); }
      else if (e.key === "s" || e.key === "S") { store.splitAtPlayhead(); }
      else if (e.key === "Delete" || e.key === "Backspace") { store.removeSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); store.undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); store.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    store.startBridge();
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files?.length) for (const f of files) void store.bridge?.importFile(f);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    let unlisten: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in globalThis) {
      void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "drop") for (const p of event.payload.paths) void store.bridge?.importPath(p);
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
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: theme.space.smMd, height: 44, padding: `0 ${theme.space.mdLg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, flex: "0 0 auto" }}>
        <span style={{ fontSize: theme.fontSize.md, fontWeight: 600, letterSpacing: 0.2 }}>Maestro</span>
        <span
          title={store.bridge?.connected ? "Project server connected — Claude can edit via MCP" : "Project server offline — run: npm run mcp"}
          style={{ width: 7, height: 7, borderRadius: 4, background: store.bridge?.connected ? theme.color.success : "#e0a63b" }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: theme.fontSize.smMd, color: theme.color.textTertiary }}>Untitled Project</span>
        <div style={{ flex: 1 }} />
        {exportMsg && <span style={{ fontSize: theme.fontSize.xs, color: theme.color.textTertiary, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exportMsg}</span>}
        <button
          onClick={() => store.openSettings(true)} title="Connect Claude over MCP"
          style={{ background: "transparent", color: theme.color.textSecondary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "6px 12px", fontSize: theme.fontSize.smMd, cursor: "pointer", fontFamily: theme.font.ui, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: store.bridge?.connected ? theme.color.success : "#e0a63b" }} /> Connect AI
        </button>
        <button
          onClick={() => store.openSettings(true)} title="Settings"
          style={{ background: "transparent", color: theme.color.textSecondary, border: "none", borderRadius: theme.radius.sm, padding: "6px 8px", fontSize: 16, cursor: "pointer" }}
        >
          ⚙
        </button>
        <button
          onClick={doExport} title={`Render ${store.settings.exportCodec} via FFmpeg`}
          style={{ background: theme.color.accent, color: "#1a1a1a", border: "none", borderRadius: theme.radius.sm, padding: "6px 14px", fontSize: theme.fontSize.smMd, fontWeight: 600, cursor: "pointer", fontFamily: theme.font.ui }}
        >
          Export
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
      </div>

      {/* Timeline toolbar + tracks */}
      <div style={{ height: 330, flex: "0 0 auto", borderTop: `1px solid ${theme.color.borderPrimary}`, display: "flex", flexDirection: "column", background: theme.color.base }}>
        <div style={{ display: "flex", alignItems: "center", gap: theme.space.xs, height: theme.timeline.toolbarHeight, padding: `0 ${theme.space.md}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.surface, flex: "0 0 auto" }}>
          <IconBtn glyph="↶" title="Undo (Ctrl+Z)" onClick={() => store.undo()} />
          <IconBtn glyph="↷" title="Redo (Ctrl+Shift+Z)" onClick={() => store.redo()} />
          <div style={{ width: 1, height: 18, background: theme.color.borderSubtle, margin: `0 ${theme.space.xs}px` }} />
          <IconBtn glyph="▚" title="Split at playhead (S)" onClick={() => store.splitAtPlayhead()} />
          <IconBtn glyph="🗑" title="Delete selected (Del)" onClick={() => store.removeSelected()} size={13} />
          <div style={{ flex: 1 }} />
          <IconBtn glyph="－" title="Zoom out" onClick={() => store.setZoom(pixelsPerFrame / theme.zoom.stepFactor)} />
          <input
            type="range" min={theme.zoom.min} max={theme.zoom.max} step={0.01} value={pixelsPerFrame}
            onChange={(e) => store.setZoom(parseFloat(e.target.value))}
            style={{ width: 120, accentColor: theme.color.accent }}
          />
          <IconBtn glyph="＋" title="Zoom in" onClick={() => store.setZoom(pixelsPerFrame * theme.zoom.stepFactor)} />
        </div>
        <div style={{ flex: "1 1 auto", minHeight: 0 }}>
          <Timeline />
        </div>
      </div>

      <Settings />
    </div>
  );
}
