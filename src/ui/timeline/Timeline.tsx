import { useEffect, useMemo, useRef, useState } from "react";
import { store, useEditorVersion } from "../../state/store";
import { theme, clipColor } from "../theme";
import { TimelineGeometry } from "./geometry";
import { collectTargets, findSnap, newSnapState, type SnapState } from "./snap";
import { isCompatible } from "../../model";
import { WaveformStrip } from "./waveform";
import type { Clip } from "../../model/types";

const { rulerHeight, dropZoneHeight, trackHeight, headerWidth } = theme.timeline;

function frameToTimecode(frame: number, fps: number): string {
  const f = frame % fps;
  const totalSec = Math.floor(frame / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return f === 0 ? `${m}:${pad(s)}` : `${m}:${pad(s)}:${pad(f)}`;
}

function chooseMajorFrames(ppf: number, fps: number): number {
  const minPx = 76;
  for (const f of [1, 2, 5, 10, 15]) if (f * ppf >= minPx) return f;
  for (const sec of [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]) {
    const f = sec * fps;
    if (f * ppf >= minPx) return f;
  }
  return 3600 * fps;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  clientY: number;
  contentTop: number;
  clip: Clip;
  origTrack: number;
  origStart: number;
  snap: SnapState;
  moved: boolean;
}

export function Timeline() {
  useEditorVersion();
  const { timeline } = store;
  const { pixelsPerFrame: ppf, currentFrame } = store.view;
  const fps = timeline.fps;

  const trackHeights = timeline.tracks.map(() => trackHeight);
  const geo = useMemo(() => new TimelineGeometry(ppf, trackHeights, 0, rulerHeight, dropZoneHeight), [ppf, trackHeights.length]);
  const laneBottom = geo.laneBottom();
  const totalFrames = store.totalFrames;
  const contentWidth = Math.max((totalFrames + fps * 4) * ppf, 1200);

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);
  const [ghost, setGhost] = useState<{ clipId: string; trackIndex: number; startFrame: number } | null>(null);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); return; }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); store.removeSelected(); return; }
      if (e.key.toLowerCase() === "s") { store.splitAtPlayhead(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const localX = (clientX: number): number => {
    const rect = contentRef.current?.getBoundingClientRect();
    return clientX - (rect?.left ?? 0);
  };

  const movePlayheadTo = (clientX: number) => {
    const frame = Math.max(0, Math.round(localX(clientX) / ppf));
    const targets = collectTargets(timeline.tracks);
    const snap = findSnap({ position: frame, targets, state: newSnapState(), pixelsPerFrame: ppf });
    store.setCurrentFrame(snap?.frame ?? frame);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const cursorFrame = localX(e.clientX) / ppf;
      const factor = e.deltaY < 0 ? theme.zoom.stepFactor : 1 / theme.zoom.stepFactor;
      const nextPpf = Math.max(theme.zoom.min, Math.min(theme.zoom.max, ppf * factor));
      store.setZoom(nextPpf);
      // keep cursor frame roughly under the pointer
      if (scrollRef.current) scrollRef.current.scrollLeft = cursorFrame * nextPpf - (e.clientX - (contentRef.current?.getBoundingClientRect().left ?? 0));
    } else if (Math.abs(e.deltaX) < Math.abs(e.deltaY) && scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  // Clip drag.
  const onClipPointerDown = (e: React.PointerEvent, clip: Clip, trackIndex: number) => {
    e.stopPropagation();
    store.select(clip.id, e.shiftKey);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rect = contentRef.current?.getBoundingClientRect();
    dragRef.current = {
      pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY,
      contentTop: rect?.top ?? 0, clip, origTrack: trackIndex, origStart: clip.startFrame,
      snap: newSnapState(), moved: false,
    };
  };

  const onClipPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dxFrames = Math.round((e.clientX - d.clientX) / ppf);
    if (dxFrames !== 0 || Math.abs(e.clientY - d.clientY) > 3) d.moved = true;
    let newStart = Math.max(0, d.origStart + dxFrames);
    // Snap start and end edges to other clips.
    const targets = collectTargets(timeline.tracks, { excludeClipIds: new Set([d.clip.id]) });
    const snap = findSnap({ position: newStart, probeOffsets: [0, d.clip.durationFrames], targets, state: d.snap, pixelsPerFrame: ppf });
    if (snap) newStart = snap.frame - snap.probeOffset;
    newStart = Math.max(0, newStart);
    const localY = e.clientY - d.contentTop;
    const targetTrack = Math.max(0, Math.min(geo.trackCount - 1, geo.trackAt(localY)));
    setGhost({ clipId: d.clip.id, trackIndex: targetTrack, startFrame: newStart });
  };

  const onClipPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const g = ghost;
    setGhost(null);
    if (d.moved && g) {
      const destType = timeline.tracks[g.trackIndex]?.type;
      const srcType = timeline.tracks[d.origTrack]?.type;
      const track = destType && srcType && isCompatible(destType, srcType) ? g.trackIndex : d.origTrack;
      store.moveClip(d.clip.id, track, g.startFrame);
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", background: theme.color.panel, fontFamily: theme.font.ui, userSelect: "none" }}>
      {/* Track headers (fixed left column) */}
      <div style={{ width: headerWidth, flex: "0 0 auto", background: theme.color.trackHeader, borderRight: `1px solid ${theme.color.border}` }}>
        <div style={{ height: rulerHeight + dropZoneHeight, borderBottom: `1px solid ${theme.color.border}` }} />
        {timeline.tracks.map((t, i) => (
          <TrackHeader key={t.id} label={store.engine.trackDisplayLabel(i)} type={t.type} muted={t.muted} hidden={t.hidden} />
        ))}
      </div>

      {/* Scrollable lanes */}
      <div
        ref={scrollRef}
        onWheel={onWheel}
        style={{ flex: "1 1 auto", overflowX: "auto", overflowY: "hidden", position: "relative" }}
      >
        <div
          ref={contentRef}
          style={{ position: "relative", width: contentWidth, height: laneBottom + 20 }}
          onPointerDown={(e) => { if (e.button === 0) movePlayheadTo(e.clientX); }}
        >
          {/* Ruler */}
          <Ruler width={contentWidth} ppf={ppf} fps={fps} />

          {/* Track lanes */}
          {timeline.tracks.map((t, i) => (
            <div
              key={t.id}
              style={{
                position: "absolute", left: 0, top: geo.trackY(i), width: contentWidth, height: geo.trackHeight(i),
                background: i % 2 === 0 ? theme.color.trackBg : theme.color.trackBgAlt,
                borderBottom: `1px solid ${theme.color.border}`, opacity: (t.type === "audio" ? t.muted : t.hidden) ? 0.5 : 1,
              }}
            />
          ))}

          {/* Clips */}
          {timeline.tracks.map((t, ti) =>
            t.clips.map((c) => {
              const isGhostSource = ghost?.clipId === c.id;
              const drawTrack = isGhostSource ? ghost!.trackIndex : ti;
              const drawStart = isGhostSource ? ghost!.startFrame : c.startFrame;
              const r = geo.clipRect({ ...c, startFrame: drawStart }, drawTrack);
              return (
                <ClipView
                  key={c.id}
                  clip={c}
                  rect={r}
                  selected={store.isSelected(c.id)}
                  dim={isGhostSource}
                  onPointerDown={(e) => onClipPointerDown(e, c, ti)}
                  onPointerMove={onClipPointerMove}
                  onPointerUp={onClipPointerUp}
                />
              );
            }),
          )}

          {/* Playhead */}
          <Playhead x={currentFrame * ppf} bottom={laneBottom} />
        </div>
      </div>
    </div>
  );
}

function Ruler({ width, ppf, fps }: { width: number; ppf: number; fps: number }) {
  const major = chooseMajorFrames(ppf, fps);
  const minor = Math.max(1, Math.round(major / 5));
  const ticks: React.ReactElement[] = [];
  const maxFrame = Math.ceil(width / ppf);
  for (let f = 0; f <= maxFrame; f += minor) {
    const isMajor = f % major === 0;
    const x = f * ppf;
    ticks.push(
      <div key={f} style={{ position: "absolute", left: x, bottom: 0, width: 1, height: isMajor ? 10 : 5, background: theme.color.rulerTick }} />,
    );
    if (isMajor) {
      ticks.push(
        <div key={`l${f}`} style={{ position: "absolute", left: x + 3, top: 3, fontSize: 10, color: theme.color.textDim, fontFamily: theme.font.mono }}>
          {frameToTimecode(f, fps)}
        </div>,
      );
    }
  }
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height: rulerHeight, background: theme.color.ruler, borderBottom: `1px solid ${theme.color.border}` }}>
      {ticks}
    </div>
  );
}

function TrackHeader({ label, type, muted, hidden }: { label: string; type: string; muted: boolean; hidden: boolean }) {
  const off = type === "audio" ? muted : hidden;
  return (
    <div style={{ height: trackHeight, display: "flex", alignItems: "center", gap: theme.space.sm, padding: `0 ${theme.space.md}px`, borderBottom: `1px solid ${theme.color.border}` }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: clipColor(type as never), opacity: off ? 0.4 : 1 }} />
      <span style={{ fontSize: 12, color: off ? theme.color.textFaint : theme.color.text, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function ClipView(props: {
  clip: Clip; rect: { x: number; y: number; width: number; height: number };
  selected: boolean; dim: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const { clip, rect, selected, dim } = props;
  const color = clipColor(clip.mediaType);
  const label = clip.mediaType === "text"
    ? clip.textContent || "Text"
    : store.media.asset(clip.mediaRef)?.name ?? clip.mediaRef;
  const w = Math.max(2, rect.width);
  return (
    <div
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      style={{
        position: "absolute", left: rect.x, top: rect.y, width: w, height: rect.height,
        background: `linear-gradient(180deg, ${color}, ${color}cc)`,
        border: selected ? `2px solid ${theme.color.selection}` : `1px solid rgba(0,0,0,0.35)`,
        borderRadius: theme.timeline.clipRadius, boxSizing: "border-box", overflow: "hidden",
        cursor: "grab", opacity: dim ? 0.6 : 1, boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }}
    >
      {clip.mediaType === "audio" && <WaveformStrip clip={clip} fps={store.timeline.fps} width={w} height={rect.height} />}
      <div style={{ position: "relative", fontSize: 11, color: "rgba(255,255,255,0.95)", padding: "3px 6px", whiteSpace: "nowrap", textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}>
        {label}
      </div>
    </div>
  );
}

function Playhead({ x, bottom }: { x: number; bottom: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: 0, height: bottom, pointerEvents: "none", zIndex: 5 }}>
      <div style={{ position: "absolute", left: -5, top: 0, width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: `7px solid ${theme.color.playhead}` }} />
      <div style={{ position: "absolute", left: 0, top: 0, width: 1.5, height: bottom, background: theme.color.playhead }} />
    </div>
  );
}
