import { useRef, useState } from "react";
import { store, useEditorVersion } from "../state/store";
import { theme, clipColor, sectionLabelStyle } from "./theme";
import type { ClipType } from "../model/enums";

function fmtDuration(seconds: number): string {
  if (!seconds) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const inTauri = (): boolean => "__TAURI_INTERNALS__" in globalThis;

// A 16:9 media thumbnail: real first frame for video, the image for image, a tinted ♪ tile for audio.
function MediaThumb({ assetId, type }: { assetId: string; type: ClipType }) {
  const src = store.mediaSrcFor(assetId);
  const box: React.CSSProperties = { width: "100%", aspectRatio: "16 / 9", background: "#000", display: "block", objectFit: "cover" };
  if (type === "image" && src) return <img src={src} style={box} alt="" />;
  if (type === "video" && src) return <video src={src} style={box} muted preload="metadata" playsInline />;
  return (
    <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", background: `${clipColor(type)}22` }}>
      <span style={{ fontSize: 22, color: clipColor(type) }}>{type === "audio" ? "♪" : type === "text" ? "T" : "▦"}</span>
    </div>
  );
}

export function MediaPanel() {
  useEditorVersion();
  const assets = store.media.assets;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const importPaths = async (paths: string[]) => {
    for (const p of paths) {
      setBusy(p.split(/[/\\]/).pop() ?? p);
      try { await store.bridge?.importPath(p); } catch (e) { setBusy(`Failed: ${e instanceof Error ? e.message : e}`); return; }
    }
    setBusy(null);
  };

  const importFiles = async (files: FileList | File[]) => {
    for (const f of files) {
      setBusy(f.name);
      try { await store.bridge?.importFile(f); } catch (e) { setBusy(`Failed: ${e instanceof Error ? e.message : e}`); return; }
    }
    setBusy(null);
  };

  const onImportClick = async () => {
    if (inTauri()) {
      try {
        const dialog = await import("@tauri-apps/plugin-dialog");
        const picked = await dialog.open({
          multiple: true,
          filters: [{ name: "Media", extensions: ["mp4", "mov", "m4v", "mp3", "wav", "aac", "m4a", "flac", "png", "jpg", "jpeg", "tiff", "webp"] }],
        });
        if (picked) await importPaths(Array.isArray(picked) ? picked : [picked]);
        return;
      } catch {
        /* fall through to the browser input */
      }
    }
    fileRef.current?.click();
  };

  return (
    <div style={{ width: 244, flex: "0 0 auto", background: theme.color.surface, borderRight: `1px solid ${theme.color.borderPrimary}`, overflowY: "auto", fontFamily: theme.font.ui, display: "flex", flexDirection: "column" }}>
      <div style={{ height: theme.timeline.panelHeaderHeight, display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${theme.space.lg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.raised, flex: "0 0 auto" }}>
        <span style={sectionLabelStyle}>Media</span>
        <div style={{ display: "flex", gap: theme.space.xs }}>
          <button
            onClick={() => store.openGenerate(true)}
            title="Generate media with AI (open backend — see Strategy)"
            style={{ background: theme.color.base, color: theme.color.textSecondary, border: `1px solid ${theme.color.borderSubtle}`, borderRadius: theme.radius.sm, padding: "3px 9px", fontSize: theme.fontSize.sm, cursor: "pointer", fontFamily: theme.font.ui }}
          >
            ✨ Generate
          </button>
          <button
            onClick={onImportClick}
            title="Import media files (or drag files anywhere into the window)"
            style={{ background: theme.color.prominent, color: theme.color.textPrimary, border: `1px solid ${theme.color.borderPrimary}`, borderRadius: theme.radius.sm, padding: "3px 10px", fontSize: theme.fontSize.sm, cursor: "pointer", fontFamily: theme.font.ui }}
          >
            ＋ Import
          </button>
        </div>
        <input
          ref={fileRef} type="file" multiple accept="video/*,audio/*,image/*" style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.length) void importFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      <div style={{ padding: theme.space.mdLg, flex: "1 1 auto" }}>
        {busy && <div style={{ fontSize: theme.fontSize.sm, color: theme.color.textSecondary, marginBottom: theme.space.smMd, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Importing {busy}…</div>}
        {!store.bridge?.connected && (
          <div style={{ fontSize: theme.fontSize.xs, color: "#e0a63b", marginBottom: theme.space.smMd, lineHeight: 1.4 }}>
            Project server offline — import & Claude sync unavailable. Run: npm run mcp
          </div>
        )}
        {assets.length === 0 && <div style={{ color: theme.color.textMuted, fontSize: theme.fontSize.smMd, lineHeight: 1.5 }}>Drop a video, image, or audio file here — or click ＋ Import.</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: theme.space.smMd }}>
          {assets.map((a) => (
            <div
              key={a.id}
              title={`Add ${a.name} at the playhead`}
              onClick={() => store.addMediaToTimeline(a.id)}
              onMouseEnter={() => setHoverId(a.id)} onMouseLeave={() => setHoverId((h) => (h === a.id ? null : h))}
              style={{ borderRadius: theme.radius.sm, background: theme.color.raised, border: `1px solid ${hoverId === a.id ? theme.color.borderPrimary : theme.color.borderSubtle}`, cursor: "pointer", overflow: "hidden" }}
            >
              <MediaThumb assetId={a.id} type={a.type as ClipType} />
              <div style={{ padding: `${theme.space.xs}px ${theme.space.sm}px` }}>
                <div style={{ fontSize: theme.fontSize.sm, color: theme.color.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                <div style={{ fontSize: theme.fontSize.xxs, color: theme.color.textMuted, fontFamily: theme.font.mono }}>{a.type} · {fmtDuration(a.duration)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
