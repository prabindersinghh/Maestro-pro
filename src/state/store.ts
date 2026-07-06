// Editor store: one shared EditEngine + MediaLibrary + view state, exposed to React via
// useSyncExternalStore. All timeline mutations go through the engine (one engine, two front-ends).

import { useSyncExternalStore } from "react";
import { EditEngine, type PlaceSpec } from "../engine/editEngine";
import { MediaLibrary } from "../mcp/mediaLibrary";
import { clampZoom } from "../ui/timeline/geometry";
import { theme } from "../ui/theme";
import { endFrame } from "../model/helpers";
import { rawOpacityAt, rotationAt, sizeAt, topLeftAt, cropAt } from "../model/clipSampling";
import { sampleTrack } from "../model/helpers";
import { isVisual, type AnimatableProperty } from "../model/enums";
import { applyColorGrade, type ColorArgs } from "../model/effectStack";
import { encodeTimeline, decodeTimeline } from "../model/codec";
import { encodeManifest, decodeManifest } from "../model/media";
import { ProjectBridge, BRIDGE_URL } from "./bridge";
import type { Clip, KeyframeValue, Timeline } from "../model/types";
import { demoProject } from "./demoProject";

const PROP_TO_KEY: Record<AnimatableProperty, keyof Clip> = {
  opacity: "opacityTrack", position: "positionTrack", scale: "scaleTrack",
  rotation: "rotationTrack", crop: "cropTrack", volume: "volumeTrack",
};

export interface ClipPatch {
  speed?: number;
  volume?: number;
  opacity?: number;
  blendMode?: Clip["blendMode"];
  transform?: Partial<Clip["transform"]>;
  fadeInFrames?: number;
  fadeOutFrames?: number;
}

export interface ViewState {
  currentFrame: number;
  selectedClipIds: Set<string>;
  pixelsPerFrame: number;
  scrollX: number;
  playing: boolean;
}

export class EditorStore {
  engine: EditEngine;
  media: MediaLibrary;
  view: ViewState;
  /** App preferences (export defaults, UI). Not part of the .palmier project. */
  settings = { exportCodec: "H.264", exportResolution: "1080p", showSettings: false, showGenerate: false };
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(timeline: Timeline, media: MediaLibrary) {
    this.engine = new EditEngine(timeline);
    this.media = media;
    this.view = {
      currentFrame: 0,
      selectedClipIds: new Set(),
      pixelsPerFrame: theme.timeline.pixelsPerFrame,
      scrollX: 0,
      playing: false,
    };
  }

  get timeline(): Timeline {
    return this.engine.timeline;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): number => this.version;
  emit(): void {
    this.version++;
    this.bridge?.onLocalChange();
    for (const l of this.listeners) l();
  }

  // --- project bridge (shared state with the MCP server) ---
  bridge: ProjectBridge | null = null;

  startBridge(): void {
    if (this.bridge) return;
    this.bridge = new ProjectBridge(this);
    void this.bridge.start();
  }

  serializeState(): { timeline: unknown; media: unknown } {
    return { timeline: encodeTimeline(this.timeline), media: encodeManifest(this.media.toManifest()) };
  }

  /** Replace local state from the server (Claude's edits arriving). Does NOT push back. */
  applyRemoteState(timelineJson: unknown, manifestJson: unknown): void {
    this.engine.timeline = decodeTimeline(timelineJson);
    const manifest = decodeManifest(manifestJson);
    this.media.folders = manifest.folders;
    this.media.assets = manifest.entries.map((e) => ({
      id: e.id, name: e.name, type: e.type, duration: e.duration, source: e.source,
      folderId: e.folderId, sourceWidth: e.sourceWidth, sourceHeight: e.sourceHeight,
      sourceFPS: e.sourceFPS, hasAudio: e.hasAudio, generationStatus: e.generationStatus,
    }));
    // drop selections that no longer exist
    const ids = new Set(this.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id)));
    this.view.selectedClipIds = new Set([...this.view.selectedClipIds].filter((id) => ids.has(id)));
    this.version++;
    for (const l of this.listeners) l(); // notify WITHOUT triggering a push
  }

  /** Preview URL for an asset: fresh-upload objectURL → served/web path → bridge media stream. */
  mediaSrcFor(mediaRef: string): string | null {
    const local = this.bridge?.objectURLs.get(mediaRef);
    if (local) return local;
    const asset = this.media.asset(mediaRef);
    if (!asset) return null;
    if (asset.source.kind === "external") {
      const p = asset.source.absolutePath;
      if (/^https?:\/\//.test(p) || p.startsWith("/")) return p;
    }
    return this.bridge?.connected ? `${BRIDGE_URL}/media/${encodeURIComponent(mediaRef)}` : null;
  }

  get totalFrames(): number {
    let max = 0;
    for (const t of this.timeline.tracks) for (const c of t.clips) max = Math.max(max, endFrame(c));
    return max;
  }

  // --- view state ---
  setCurrentFrame(f: number): void {
    this.view.currentFrame = Math.max(0, Math.round(f));
    this.emit();
  }
  setZoom(ppf: number): void {
    this.view.pixelsPerFrame = clampZoom(ppf);
    this.emit();
  }
  setScrollX(x: number): void {
    this.view.scrollX = Math.max(0, x);
    this.emit();
  }
  setPlaying(p: boolean): void {
    this.view.playing = p;
    this.emit();
  }

  openSettings(open: boolean): void { this.settings.showSettings = open; this.emit(); }
  openGenerate(open: boolean): void { this.settings.showGenerate = open; this.emit(); }
  setExportDefaults(p: { codec?: string; resolution?: string }): void {
    if (p.codec) this.settings.exportCodec = p.codec;
    if (p.resolution) this.settings.exportResolution = p.resolution;
    this.emit();
  }
  /** Change project fps/size (set_project_settings). Reflows nothing; affects render + preview. */
  setProjectSettings(p: { fps?: number; width?: number; height?: number }): void {
    this.engine.run("Project Settings", () => {
      if (p.fps && p.fps > 0) this.timeline.fps = Math.round(p.fps);
      if (p.width && p.width > 0) this.timeline.width = Math.round(p.width);
      if (p.height && p.height > 0) this.timeline.height = Math.round(p.height);
      this.timeline.settingsConfigured = true;
    });
    this.emit();
  }

  /** Toggle a track's mute (audio) or hidden (visual) flag. */
  toggleTrackFlag(trackIndex: number): void {
    const t = this.timeline.tracks[trackIndex];
    if (!t) return;
    if (t.type === "audio") t.muted = !t.muted;
    else t.hidden = !t.hidden;
    this.emit();
  }

  // --- selection ---
  select(id: string | null, additive = false): void {
    if (id === null) this.view.selectedClipIds = new Set();
    else if (additive) {
      const next = new Set(this.view.selectedClipIds);
      next.has(id) ? next.delete(id) : next.add(id);
      this.view.selectedClipIds = next;
    } else {
      this.view.selectedClipIds = new Set([id]);
    }
    this.emit();
  }
  isSelected(id: string): boolean {
    return this.view.selectedClipIds.has(id);
  }

  // --- engine ops (each already one undo step) ---
  /** Edit the selected text clip's content / style / animation (mirrors update_text). */
  editText(patch: { content?: string; style?: Partial<Clip["textStyle"] & object>; animation?: Partial<Clip["textAnimation"] & object> }): void {
    const ids = new Set(this.view.selectedClipIds);
    if (ids.size === 0) return;
    this.engine.mutateClips(ids, (c) => {
      if (c.mediaType !== "text") return;
      if (patch.content !== undefined) c.textContent = patch.content;
      if (patch.style && c.textStyle) Object.assign(c.textStyle, patch.style);
      if (patch.animation) {
        c.textAnimation = { preset: "none", perWordFrames: 3, ...c.textAnimation, ...patch.animation } as Clip["textAnimation"];
      }
    }, "Edit Text");
    this.emit();
  }

  /** Trim a clip's left/right edge by a project-frame delta (drag handles); one undo step. */
  trimClip(clipId: string, edge: "left" | "right", deltaFrames: number): void {
    if (Math.round(deltaFrames) === 0) return;
    if (this.engine.commitTrim(clipId, edge, Math.round(deltaFrames), true)) this.emit();
  }

  moveClip(clipId: string, toTrack: number, toFrame: number): void {
    if (this.engine.moveClips([{ clipId, toTrack, toFrame }])) this.emit();
  }
  removeSelected(): void {
    const ids = [...this.view.selectedClipIds];
    if (ids.length && this.engine.removeClips(ids)) {
      this.view.selectedClipIds = new Set();
    }
    this.emit();
  }
  splitAtPlayhead(): void {
    const f = this.view.currentFrame;
    const splits = [...this.view.selectedClipIds]
      .map((id) => this.engine.clipRef(id))
      .filter((c): c is NonNullable<typeof c> => !!c && f > c.startFrame && f < endFrame(c))
      .map((c) => ({ clipId: c.id, atFrame: f }));
    if (splits.length) {
      this.engine.splitClips(splits);
      this.emit();
    }
  }
  undo(): void {
    if (this.engine.undo() !== null) this.emit();
  }
  redo(): void {
    if (this.engine.redo() !== null) this.emit();
  }

  get selectedClip(): Clip | null {
    const id = [...this.view.selectedClipIds][0];
    return id ? this.engine.clipRef(id) : null;
  }

  /** Edit selected clips (mirrors set_clip_properties: per-clip fields + speed). */
  editSelected(patch: ClipPatch): void {
    const ids = new Set(this.view.selectedClipIds);
    if (ids.size === 0) return;
    if (patch.speed !== undefined) this.engine.setClipSpeed([...ids], patch.speed);
    const perClip = patch.volume !== undefined || patch.opacity !== undefined || patch.blendMode !== undefined
      || patch.transform || patch.fadeInFrames !== undefined || patch.fadeOutFrames !== undefined;
    if (perClip) {
      this.engine.mutateClips(ids, (c) => {
        if (patch.volume !== undefined) { c.volume = patch.volume; c.volumeTrack = undefined; }
        if (patch.opacity !== undefined) { c.opacity = patch.opacity; c.opacityTrack = undefined; }
        if (patch.blendMode !== undefined) c.blendMode = patch.blendMode === "normal" ? undefined : patch.blendMode;
        if (patch.transform) Object.assign(c.transform, patch.transform);
        if (patch.fadeInFrames !== undefined) c.fadeInFrames = Math.max(0, Math.round(patch.fadeInFrames));
        if (patch.fadeOutFrames !== undefined) c.fadeOutFrames = Math.max(0, Math.round(patch.fadeOutFrames));
      }, "Change Clip Property");
    }
    this.emit();
  }

  /** Stamp a keyframe for `property` at the playhead on the selected clip (mirrors set_keyframes). */
  stampKeyframe(property: AnimatableProperty): void {
    const clip = this.selectedClip;
    if (!clip) return;
    const f = this.view.currentFrame;
    if (!(f >= clip.startFrame && f < endFrame(clip))) return;
    const offset = f - clip.startFrame;
    const key = PROP_TO_KEY[property];
    const existing = ((clip[key] as { keyframes: { frame: number; value: KeyframeValue; interpolationOut: "smooth" }[] } | undefined)?.keyframes ?? [])
      .filter((k) => k.frame !== offset)
      .map((k) => ({ frame: k.frame, value: k.value, interpolationOut: k.interpolationOut }));

    let value: KeyframeValue;
    switch (property) {
      case "opacity": value = rawOpacityAt(clip, f); break;
      case "rotation": value = rotationAt(clip, f); break;
      case "position": { const tl = topLeftAt(clip, f); value = { a: tl.x, b: tl.y }; break; }
      case "scale": { const s = sizeAt(clip, f); value = { a: s.width, b: s.height }; break; }
      case "crop": value = cropAt(clip, f); break;
      case "volume": value = clip.volumeTrack ? sampleTrack(clip.volumeTrack, offset, 0) : 0; break;
    }
    existing.push({ frame: offset, value, interpolationOut: "smooth" });
    this.engine.setKeyframes(clip.id, property, existing);
    this.emit();
  }

  clearKeyframes(property: AnimatableProperty): void {
    const clip = this.selectedClip;
    if (!clip) return;
    this.engine.setKeyframes(clip.id, property, []);
    this.emit();
  }

  /** Grade the selected clips (mirrors apply_color, merge). */
  applyColor(patch: ColorArgs): void {
    const ids = new Set(this.view.selectedClipIds);
    if (ids.size === 0) return;
    this.engine.mutateClips(ids, (c) => applyColorGrade(c, patch, false), "Apply Color");
    this.emit();
  }

  /** Add a media asset as a clip at the playhead (create/target a compatible track). */
  /** Find an audio track whose [start,end) is free, else create one at the bottom (resolveOrCreateAudioTrack). */
  private resolveOrCreateAudioTrack(startFrame: number, duration: number): number {
    const end = startFrame + duration;
    const free = this.timeline.tracks.findIndex(
      (t) => t.type === "audio" && !t.clips.some((c) => c.startFrame < end && endFrame(c) > startFrame),
    );
    if (free >= 0) return free;
    this.engine.timeline.tracks.push({
      id: `t-${Date.now()}`, type: "audio", muted: false, hidden: false, syncLocked: true, clips: [],
    });
    return this.timeline.tracks.length - 1;
  }

  // placeClip (EditorViewModel.swift): a video with audio dropped on a video track creates a
  // linkGroupId'd video clip PLUS a linked audio clip on an audio track, so it moves/exports as one.
  addMediaToTimeline(assetId: string): void {
    const asset = this.media.asset(assetId);
    if (!asset) return;
    const want = asset.type === "audio" ? "audio" : "video";
    let trackIndex = this.timeline.tracks.findIndex((t) => t.type === asset.type);
    if (trackIndex < 0) trackIndex = this.timeline.tracks.findIndex((t) => (want === "audio" ? t.type === "audio" : isVisual(t.type)));
    if (trackIndex < 0) {
      this.engine.timeline.tracks[want === "audio" ? "push" : "unshift"]({
        id: `t-${Date.now()}`, type: want, muted: false, hidden: false, syncLocked: true, clips: [],
      });
      trackIndex = want === "audio" ? this.timeline.tracks.length - 1 : 0;
    }
    const start = this.view.currentFrame;
    const dur = Math.max(1, Math.round(asset.duration * this.timeline.fps));

    const targetIsVideo = this.timeline.tracks[trackIndex].type === "video";
    const shouldLink = targetIsVideo && asset.type === "video" && asset.hasAudio === true;
    const specs: PlaceSpec[] = [{
      mediaRef: assetId, trackIndex, startFrame: start, durationFrames: dur,
      mediaType: asset.type, sourceClipType: asset.type,
    }];
    if (shouldLink) {
      const linkGroupId = `lg-${Date.now()}`;
      specs[0].linkGroupId = linkGroupId;
      const audioTrackIndex = this.resolveOrCreateAudioTrack(start, dur);
      specs.push({
        mediaRef: assetId, trackIndex: audioTrackIndex, startFrame: start, durationFrames: dur,
        mediaType: "audio", sourceClipType: asset.type, linkGroupId,
      });
    }
    this.engine.addClips(specs);
    this.emit();
  }
}

const demo = demoProject();
export const store = new EditorStore(demo.timeline, demo.media);

// Dev-only handle for debugging / e2e (not bundled behavior in production).
if (import.meta.env.DEV) {
  (globalThis as unknown as { store?: EditorStore }).store = store;
}

/** Subscribe a component to store changes. */
export function useEditorVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
