import { useMemo, useRef, useState } from "react";
import { store, useEditorVersion } from "../../state/store";
import { theme, clipColor } from "../theme";
import { TimelineGeometry } from "./geometry";
import { collectTargets, findSnap, newSnapState, type SnapState } from "./snap";
import { isCompatible } from "../../model";
import { WaveformStrip } from "./waveform";
import { KeyframeLaneLabels, KeyframeLaneContent, laneProps, LANE_HEIGHT } from "./KeyframeLanes";
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
  const selClip = store.selectedClip;
  const kfBlockHeight = selClip ? (laneProps(selClip).length + 1) * LANE_HEIGHT : 0;

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerColRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);
  const [ghost, setGhost] = useState<{ clipId: string; trackIndex: number; startFrame: number } | null>(null);

  // Keyboard shortcuts (Space/S/Del/undo/redo) are handled once, globally, in Editor.tsx — this
  // component intentionally does not bind its own copy so they can't double-fire.

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
      {/* Track headers (fixed left column) — vertical scroll synced to the content */}
      <div ref={headerColRef} style={{ width: headerWidth, flex: "0 0 auto", background: theme.color.trackHeader, borderRight: `1px solid ${theme.color.border}`, overflowY: "hidden" }}>
        <div style={{ height: rulerHeight + dropZoneHeight, borderBottom: `1px solid ${theme.color.border}` }} />
        {timeline.tracks.map((t, i) => (
          <TrackHeader key={t.id} index={i} label={store.engine.trackDisplayLabel(i)} type={t.type} muted={t.muted} hidden={t.hidden} />
        ))}
        {selClip && <KeyframeLaneLabels clip={selClip} />}
      </div>

      {/* Scrollable lanes */}
      <div
        ref={scrollRef}
        onWheel={onWheel}
        onScroll={(e) => { if (headerColRef.current) headerColRef.current.scrollTop = (e.target as HTMLElement).scrollTop; }}
        style={{ flex: "1 1 auto", overflowX: "auto", overflowY: "auto", position: "relative" }}
      >
        <div
          ref={contentRef}
          style={{ position: "relative", width: contentWidth, height: laneBottom + kfBlockHeight + 20 }}
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
                  ppf={ppf}
                  selected={store.isSelected(c.id)}
                  dim={isGhostSource}
                  onPointerDown={(e) => onClipPointerDown(e, c, ti)}
                  onPointerMove={onClipPointerMove}
                  onPointerUp={onClipPointerUp}
                />
              );
            }),
          )}

          {/* Keyframe lanes for the selected clip */}
          {selClip && <KeyframeLaneContent clip={selClip} ppf={ppf} width={contentWidth} top={laneBottom} />}

          {/* Playhead */}
          <Playhead x={currentFrame * ppf} bottom={laneBottom + kfBlockHeight} />
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

function TrackHeader({ index, label, type, muted, hidden }: { index: number; label: string; type: string; muted: boolean; hidden: boolean }) {
  const off = type === "audio" ? muted : hidden;
  return (
    <div style={{ height: trackHeight, display: "flex", alignItems: "center", gap: theme.space.smMd, padding: `0 ${theme.space.mdLg}px`, borderBottom: `1px solid ${theme.color.borderPrimary}`, background: theme.color.base }}>
      <span style={{ width: 3, height: 22, borderRadius: 2, background: clipColor(type as never), opacity: off ? 0.35 : 1, flex: "0 0 auto" }} />
      <span style={{ fontSize: theme.fontSize.smMd, color: off ? theme.color.textMuted : theme.color.textPrimary, fontWeight: 600, flex: 1 }}>{label}</span>
      <button
        title={type === "audio" ? (muted ? "Unmute" : "Mute") : (hidden ? "Show" : "Hide")}
        onClick={() => store.toggleTrackFlag(index)}
        style={{ background: "transparent", border: "none", cursor: "pointer", color: off ? theme.color.textMuted : theme.color.textSecondary, fontSize: theme.fontSize.smMd, padding: 2 }}
      >
        {type === "audio" ? (muted ? "🔇" : "🔊") : (hidden ? "◌" : "◉")}
      </button>
    </div>
  );
}

// Self-contained edge-trim handle: drags horizontally, commits one trim on release.
function TrimHandle({ clipId, edge, ppf, visible }: { clipId: string; edge: "left" | "right"; ppf: number; visible: boolean }) {
  const start = useRef<{ x: number } | null>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); start.current = { x: e.clientX }; setDrag(true); }}
      onPointerMove={(e) => { if (start.current) e.stopPropagation(); }}
      onPointerUp={(e) => { e.stopPropagation(); const s = start.current; start.current = null; setDrag(false); if (s) store.trimClip(clipId, edge, (e.clientX - s.x) / ppf); }}
      style={{
        position: "absolute", top: 0, bottom: 0, [edge]: 0, width: theme.timeline.trimHandleWidth + 2,
        cursor: "ew-resize", zIndex: 4,
        background: drag ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)",
        borderLeft: edge === "left" ? "2px solid rgba(255,255,255,0.6)" : undefined,
        borderRight: edge === "right" ? "2px solid rgba(255,255,255,0.6)" : undefined,
        opacity: visible || drag ? 1 : 0, transition: "opacity 0.12s",
      }}
    />
  );
}

function ClipView(props: {
  clip: Clip; rect: { x: number; y: number; width: number; height: number }; ppf: number;
  selected: boolean; dim: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const { clip, rect, selected, dim, ppf } = props;
  const [hover, setHover] = useState(false);
  const color = clipColor(clip.mediaType);
  const label = clip.mediaType === "text"
    ? clip.textContent || "Text"
    : store.media.asset(clip.mediaRef)?.name ?? clip.mediaRef;
  const w = Math.max(2, rect.width);
  const thumbSrc = (clip.mediaType === "video" || clip.mediaType === "image") ? store.mediaSrcFor(clip.mediaRef) : null;
  return (
    <div
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", left: rect.x, top: rect.y, width: w, height: rect.height,
        background: theme.color.raised,
        border: selected ? `1.5px solid ${theme.color.selection}` : `1px solid rgba(0,0,0,0.4)`,
        borderRadius: theme.timeline.clipRadius, boxSizing: "border-box", overflow: "hidden",
        cursor: "grab", opacity: dim ? 0.6 : 1, boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
      }}
    >
      {/* color rail along the top edge (track identity) */}
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: 3, background: color }} />
      {/* filmstrip thumbnail for visual clips */}
      {thumbSrc && (clip.mediaType === "image"
        ? <img src={thumbSrc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} alt="" />
        : <video src={thumbSrc} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} muted preload="metadata" playsInline />)}
      {!thumbSrc && clip.mediaType !== "audio" && (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${color}, ${color}cc)` }} />
      )}
      {clip.mediaType === "audio" && <WaveformStrip clip={clip} fps={store.timeline.fps} width={w} height={rect.height} />}
      {/* scrim + label */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "56%", background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.55))", pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 3, fontSize: theme.fontSize.sm, color: "rgba(255,255,255,0.96)", padding: "3px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
        {label}
      </div>
      {w > 16 && <TrimHandle clipId={clip.id} edge="left" ppf={ppf} visible={selected || hover} />}
      {w > 16 && <TrimHandle clipId={clip.id} edge="right" ppf={ppf} visible={selected || hover} />}
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
