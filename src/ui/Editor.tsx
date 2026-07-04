import { useEffect, useRef, useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme } from "./theme";
import { Timeline } from "./timeline/Timeline";
import { CanvasPreview } from "../compositor/CanvasPreview";
import { Inspector } from "./Inspector";
import { MediaPanel } from "./MediaPanel";
import { exportVideoFromUI } from "./exportVideo";
import { previewAudio } from "../audio/previewAudio";

function frameToTimecode(frame: number, fps: number): string {
  const f = frame % fps;
  const totalSec = Math.floor(frame / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(m)}:${pad(s)}:${pad(f)}`;
}

function TB({ label, onClick, title }: { label: string; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: theme.color.surface, color: theme.color.text, border: `1px solid ${theme.color.border}`,
        borderRadius: theme.radius.sm, padding: "5px 10px", fontSize: 12, cursor: "pointer", fontFamily: theme.font.ui,
      }}
    >
      {label}
    </button>
  );
}

export function Editor() {
  useEditorVersion();
  const { timeline } = store;
  const { currentFrame, pixelsPerFrame, playing } = store.view;
  const floatFrame = useRef(currentFrame);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const doExport = async () => {
    setExportMsg("Exporting…");
    try {
      const r = await exportVideoFromUI("H.264", "1080p");
      setExportMsg(`Exported ${r.frames}f → ${r.outputPath}`);
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Playback loop — advances currentFrame at fps while playing, and drives preview audio.
  useEffect(() => {
    if (!playing) return;
    floatFrame.current = store.view.currentFrame;
    void previewAudio.play(store.timeline, Math.round(store.view.currentFrame), (r) => store.mediaSrcFor(r));
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      floatFrame.current += dt * timeline.fps;
      const total = store.totalFrames;
      if (floatFrame.current >= total) {
        store.setCurrentFrame(total);
        store.setPlaying(false);
        return;
      }
      store.setCurrentFrame(floatFrame.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      previewAudio.stop();
    };
  }, [playing, timeline.fps]);

  // Space toggles play/pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        store.setPlaying(!store.view.playing);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Project bridge (shared state with the MCP server) + drag-drop import.
  useEffect(() => {
    store.startBridge();
    // Browser file drop (plain webview): File objects.
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files?.length) for (const f of files) void store.bridge?.importFile(f);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    // Tauri native file drop: real disk paths.
    let unlisten: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in globalThis) {
      void import("@tauri-apps/api/webview").then(async ({ getCurrentWebview }) => {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "drop") {
            for (const p of event.payload.paths) void store.bridge?.importPath(p);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: theme.color.bg, color: theme.color.text, fontFamily: theme.font.ui }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: theme.space.sm, padding: `${theme.space.sm}px ${theme.space.md}px`, borderBottom: `1px solid ${theme.color.border}`, background: theme.color.surface }}>
        <strong style={{ fontSize: 13 }}>Maestro</strong>
        <span
          title={store.bridge?.connected ? "Project server connected (Claude can edit via MCP)" : "Project server offline — run: npm run mcp"}
          style={{ width: 8, height: 8, borderRadius: 4, background: store.bridge?.connected ? "#18b26b" : "#e0a63b", display: "inline-block" }}
        />
        <div style={{ width: 1, height: 18, background: theme.color.border, margin: `0 ${theme.space.xs}px` }} />
        <TB label={playing ? "❚❚ Pause" : "▶ Play"} title="Space" onClick={() => store.setPlaying(!playing)} />
        <TB label="Undo" title="Ctrl+Z" onClick={() => store.undo()} />
        <TB label="Redo" title="Ctrl+Shift+Z" onClick={() => store.redo()} />
        <TB label="Split" title="S" onClick={() => store.splitAtPlayhead()} />
        <TB label="Delete" title="Del" onClick={() => store.removeSelected()} />
        <div style={{ width: 1, height: 18, background: theme.color.border, margin: `0 ${theme.space.xs}px` }} />
        <TB label="−" title="Zoom out" onClick={() => store.setZoom(pixelsPerFrame / theme.zoom.stepFactor)} />
        <TB label="+" title="Zoom in" onClick={() => store.setZoom(pixelsPerFrame * theme.zoom.stepFactor)} />
        <div style={{ width: 1, height: 18, background: theme.color.border, margin: `0 ${theme.space.xs}px` }} />
        <TB label="⭳ Export MP4" title="Render H.264 via FFmpeg" onClick={doExport} />
        {exportMsg && <span style={{ fontSize: 11, color: theme.color.textDim, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{exportMsg}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: theme.font.mono, fontSize: 12, color: theme.color.textDim }}>
          {frameToTimecode(currentFrame, timeline.fps)} · f{currentFrame}
        </span>
        <span style={{ fontFamily: theme.font.mono, fontSize: 11, color: theme.color.textFaint, marginLeft: theme.space.md }}>
          {timeline.width}×{timeline.height} @ {timeline.fps}fps
        </span>
      </div>

      {/* Middle: media panel | preview | inspector */}
      <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
        <MediaPanel />
        <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center", background: theme.color.bg, minHeight: 0, padding: theme.space.lg }}>
          <CanvasPreview />
        </div>
        <Inspector />
      </div>

      {/* Timeline */}
      <div style={{ height: 320, flex: "0 0 auto", borderTop: `1px solid ${theme.color.border}` }}>
        <Timeline />
      </div>
    </div>
  );
}
