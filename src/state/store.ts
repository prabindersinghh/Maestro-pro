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

const lsGet = (k: string): string | null => { try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; } catch { return null; } };
const lsSet = (k: string, v: string): void => { try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch { /* ignore */ } };

// AI generation (LTX / Fal / Replicate) is a HIDDEN, future paid-tier feature. It is OFF by default so
// the shipping UI has NO Generate button or panel. Enable it only for internal testing via either:
//   • a build env var:  VITE_MAESTRO_GEN=1   (dev / a private build)
//   • the console:       window.store.enableGenDev(true)   (persists in localStorage)
const envGen = (() => { try { return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MAESTRO_GEN === "1"; } catch { return false; } })();
const genDevDefault = envGen || lsGet("kaestral.genDev") === "1";

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
  /** App preferences (export defaults, AI connection, UI). Not part of the .palmier project. */
  settings = {
    exportCodec: "H.264", exportResolution: "1080p", showSettings: false, showGenerate: false,
    /** Hidden dev flag: when false (default) there is NO generation UI anywhere in the app. */
    genDevMode: genDevDefault,
    /** "Pro / AI features — join the waitlist" (visible; gauges demand without exposing generation). */
    showWaitlist: false,
    waitlistJoined: lsGet("kaestral.waitlist") === "1",
    apiKey: lsGet("kaestral.apiKey") ?? "",
    model: lsGet("kaestral.model") ?? "claude-sonnet-5",
    connectMode: (lsGet("kaestral.connectMode") as "choose" | "inapp" | "claudecode") ?? "choose",
    showChat: false,
    // Hosted-generation BYOK (Fal/Replicate/gcp-ltx). The key persists locally and is pushed to the server.
    genProvider: (lsGet("kaestral.genProvider") as "fal" | "replicate" | "gcp-ltx") ?? "fal",
    genKey: lsGet("kaestral.genKey") ?? "",
    // gcp-ltx GPU VM lifecycle config (your own LTX server on a Google Cloud GPU).
    gpuProject: lsGet("kaestral.gpuProject") ?? "",
    gpuZone: lsGet("kaestral.gpuZone") ?? "us-central1-a",
    gpuInstance: lsGet("kaestral.gpuInstance") ?? "ltx-gpu",
    gpuPort: Number(lsGet("kaestral.gpuPort") ?? "8000"),
    /** First-run onboarding: shown once, then persisted so it never reappears. */
    onboarded: lsGet("kaestral.onboarded") === "1",
    /** Discoverable keyboard-shortcuts cheat-sheet ("?" key or toolbar button). */
    showShortcuts: false,
  };
  /** True once there are unsaved changes since the last save/export — drives the close-guard. */
  dirty = false;
  private listeners = new Set<() => void>();
  private version = 0;
  /** Transient status messages shown as toasts (transitions added, import errors, …). */
  toasts: { id: number; text: string; kind: "info" | "error" }[] = [];
  private toastSeq = 0;

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

  /** Flag that the project has unsaved changes (called from content-mutating ops). Cleared on save/export. */
  markDirty(): void { this.dirty = true; }
  /** Clear the unsaved-changes flag (called after a successful export/save). */
  clearDirty(): void { this.dirty = false; }

  /** Show a transient toast; auto-dismisses. */
  toast(text: string, kind: "info" | "error" = "info"): void {
    const id = ++this.toastSeq;
    this.toasts = [...this.toasts, { id, text, kind }];
    this.version++;
    for (const l of this.listeners) l();
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.version++;
      for (const l of this.listeners) l();
    }, kind === "error" ? 6000 : 3500);
  }

  // --- project bridge (shared state with the MCP server) ---
  bridge: ProjectBridge | null = null;

  startBridge(): void {
    if (this.bridge) return;
    this.bridge = new ProjectBridge(this);
    void this.bridge.start().then(() => this.pushGenConfig());
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
  openWaitlist(open: boolean): void { this.settings.showWaitlist = open; this.emit(); }
  openShortcuts(open: boolean): void { this.settings.showShortcuts = open; this.emit(); }
  /** Mark first-run onboarding as complete so it never shows again. Safe to call more than once. */
  completeOnboarding(): void {
    if (this.settings.onboarded) return;
    this.settings.onboarded = true;
    lsSet("kaestral.onboarded", "1");
    this.emit();
  }
  /** Join the Pro/AI-features waitlist. POSTs to VITE_WAITLIST_URL if set; else signals a mailto fallback. */
  async joinWaitlist(email: string): Promise<{ ok: boolean; mode: "posted" | "mailto" | "error"; detail?: string }> {
    const url = ((): string => { try { return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_WAITLIST_URL ?? ""; } catch { return ""; } })();
    const markJoined = () => { this.settings.waitlistJoined = true; lsSet("kaestral.waitlist", "1"); this.emit(); };
    if (url) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "kaestral-pro-waitlist" }) });
        if (r.ok) { markJoined(); return { ok: true, mode: "posted" }; }
        return { ok: false, mode: "error", detail: `Server returned ${r.status}. Try again in a moment.` };
      } catch (e) { return { ok: false, mode: "error", detail: e instanceof Error ? e.message : String(e) }; }
    }
    markJoined();
    return { ok: true, mode: "mailto" }; // no endpoint configured — the modal opens the user's mail client
  }
  /** No-op unless the hidden generation dev flag is on — so nothing can open the Generate panel in the shipping UI. */
  openGenerate(open: boolean): void { if (!this.settings.genDevMode) return; this.settings.showGenerate = open; this.emit(); }
  /** Toggle the hidden generation dev flag (console-only: window.store.enableGenDev(true)). Persists locally. */
  enableGenDev(on: boolean): void {
    this.settings.genDevMode = on;
    lsSet("kaestral.genDev", on ? "1" : "0");
    if (!on) this.settings.showGenerate = false;
    this.emit();
    // eslint-disable-next-line no-console
    console.info(`[kaestral] generation dev mode ${on ? "ENABLED — Generate button now visible in Media panel" : "disabled — no generation UI"}.`);
  }
  openChat(open: boolean): void { this.settings.showChat = open; this.emit(); }
  setApiKey(k: string): void { this.settings.apiKey = k; lsSet("kaestral.apiKey", k); this.emit(); }
  setModel(m: string): void { this.settings.model = m; lsSet("kaestral.model", m); this.emit(); }
  setConnectMode(m: "choose" | "inapp" | "claudecode"): void { this.settings.connectMode = m; lsSet("kaestral.connectMode", m); this.emit(); }
  /** Pull the latest server state now (after the in-app agent runs a tool) so edits show instantly. */
  async syncNow(): Promise<void> { await this.bridge?.syncNow(); }

  // --- hosted generation (BYOK) ---
  setGenProvider(p: "fal" | "replicate" | "gcp-ltx"): void { this.settings.genProvider = p; lsSet("kaestral.genProvider", p); this.emit(); void this.pushGenConfig(); }
  /** Save the generation key locally + push it to the server so generate_video/image can use it. */
  async saveGenKey(key: string): Promise<void> {
    this.settings.genKey = key; lsSet("kaestral.genKey", key);
    await this.bridge?.saveGenConfig({ provider: this.settings.genProvider, apiKey: key });
    this.emit();
  }
  /** Re-push the current provider config (called on startup + provider change) so the server has it. */
  async pushGenConfig(): Promise<void> {
    await this.bridge?.saveGenConfig({ provider: this.settings.genProvider, apiKey: this.settings.genKey });
  }

  // --- gcp-ltx GPU lifecycle (start/stop the LTX VM) ---
  gpuState: { status: string; detail?: string; baseUrl?: string } = { status: "stopped" };
  setGpuField(k: "gpuProject" | "gpuZone" | "gpuInstance", v: string): void { this.settings[k] = v; lsSet(`kaestral.${k}`, v); this.emit(); }
  setGpuPort(v: number): void { this.settings.gpuPort = v; lsSet("kaestral.gpuPort", String(v)); this.emit(); }
  /** Push the VM config to the server (project/zone/instance/port + token=genKey). */
  async saveGpuConfig(): Promise<void> {
    await this.bridge?.saveGpuConfig({ project: this.settings.gpuProject, zone: this.settings.gpuZone, instance: this.settings.gpuInstance, port: this.settings.gpuPort, token: this.settings.genKey });
  }
  async startGpu(): Promise<void> { await this.saveGpuConfig(); this.gpuState = await this.bridge!.gpuAction("start"); this.emit(); this.pollGpu(); }
  async stopGpu(): Promise<void> { this.gpuState = await this.bridge!.gpuAction("stop"); this.emit(); this.pollGpu(); }
  private gpuPollTimer: ReturnType<typeof setInterval> | null = null;
  /** Poll GPU status until it settles (ready/stopped/error), so the button + label stay live. */
  private pollGpu(): void {
    if (this.gpuPollTimer) return;
    this.gpuPollTimer = setInterval(async () => {
      try {
        this.gpuState = await this.bridge!.gpuStatus();
        this.emit();
        if (["ready", "stopped", "error"].includes(this.gpuState.status)) { clearInterval(this.gpuPollTimer!); this.gpuPollTimer = null; }
      } catch { /* keep polling */ }
    }, 4000);
  }
  /** Run a generation tool (generate_video/generate_image) from the UI; result auto-imports+places. */
  async generate(kind: "video" | "image", prompt: string, opts: { aspectRatio?: string; durationSeconds?: number } = {}): Promise<Record<string, unknown>> {
    if (!this.bridge) throw new Error("Not connected to the Kaestral server.");
    return this.bridge.callTool(kind === "video" ? "generate_video" : "generate_image", { prompt, ...opts });
  }
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
    this.markDirty();
    this.emit();
  }

  /** Toggle a track's mute (audio) or hidden (visual) flag. */
  toggleTrackFlag(trackIndex: number): void {
    const t = this.timeline.tracks[trackIndex];
    if (!t) return;
    if (t.type === "audio") t.muted = !t.muted;
    else t.hidden = !t.hidden;
    this.markDirty();
    this.emit();
  }

  /** Auto-insert transitions at every hard cut (cross-dissolve where possible, else dip-to-black). */
  addTransitionsAtCuts(durationSeconds = 0.5): number {
    const frames = Math.max(1, Math.round(durationSeconds * this.timeline.fps));
    const n = this.engine.addTransitionsAtCuts(frames);
    if (n > 0) { this.markDirty(); this.emit(); }
    return n;
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
    this.markDirty();
    this.emit();
  }

  /** Trim a clip's left/right edge by a project-frame delta (drag handles); one undo step. */
  trimClip(clipId: string, edge: "left" | "right", deltaFrames: number): void {
    if (Math.round(deltaFrames) === 0) return;
    if (this.engine.commitTrim(clipId, edge, Math.round(deltaFrames), true)) { this.markDirty(); this.emit(); }
  }

  moveClip(clipId: string, toTrack: number, toFrame: number): void {
    if (this.engine.moveClips([{ clipId, toTrack, toFrame }])) { this.markDirty(); this.emit(); }
  }
  removeSelected(): void {
    const ids = [...this.view.selectedClipIds];
    if (ids.length && this.engine.removeClips(ids)) {
      this.view.selectedClipIds = new Set();
      this.markDirty();
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
      this.markDirty();
      this.emit();
    }
  }
  undo(): void {
    if (this.engine.undo() !== null) { this.markDirty(); this.emit(); }
  }
  redo(): void {
    if (this.engine.redo() !== null) { this.markDirty(); this.emit(); }
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
    this.markDirty();
    this.emit();
  }

  /** Stamp a keyframe for `property` at `atFrame` (default playhead) on the selected clip. */
  stampKeyframe(property: AnimatableProperty, atFrame?: number): void {
    const clip = this.selectedClip;
    if (!clip) return;
    const f = Math.round(atFrame ?? this.view.currentFrame);
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
    this.markDirty();
    this.emit();
  }

  clearKeyframes(property: AnimatableProperty): void {
    const clip = this.selectedClip;
    if (!clip) return;
    this.engine.setKeyframes(clip.id, property, []);
    this.markDirty();
    this.emit();
  }

  /** Clip-relative keyframes for a property on a clip (for the timeline lanes). */
  keyframesOf(clip: Clip, property: AnimatableProperty): { frame: number; value: KeyframeValue; interpolationOut: "smooth" }[] {
    const t = clip[PROP_TO_KEY[property]] as { keyframes: { frame: number; value: KeyframeValue; interpolationOut: "smooth" }[] } | undefined;
    return t?.keyframes ?? [];
  }

  private writeKeyframes(clipId: string, property: AnimatableProperty, kfs: { frame: number; value: KeyframeValue; interpolationOut: "smooth" }[]): void {
    this.engine.setKeyframes(clipId, property, kfs.map((k) => ({ frame: k.frame, value: k.value, interpolationOut: k.interpolationOut })));
    this.markDirty();
    this.emit();
  }

  /** Delete one keyframe (clip-relative frame) from a property track. */
  deleteKeyframe(clipId: string, property: AnimatableProperty, frame: number): void {
    const clip = this.engine.findClip(clipId);
    if (!clip) return;
    const c = this.timeline.tracks[clip.trackIndex].clips[clip.clipIndex];
    this.writeKeyframes(clipId, property, this.keyframesOf(c, property).filter((k) => k.frame !== frame));
  }

  /** Move one keyframe from `fromFrame` to `toFrame` (clip-relative), replacing any at the target. */
  moveKeyframe(clipId: string, property: AnimatableProperty, fromFrame: number, toFrame: number): void {
    if (fromFrame === toFrame) return;
    const clip = this.engine.findClip(clipId);
    if (!clip) return;
    const c = this.timeline.tracks[clip.trackIndex].clips[clip.clipIndex];
    const max = Math.max(0, c.durationFrames - 1);
    const dest = Math.max(0, Math.min(max, Math.round(toFrame)));
    const moved = this.keyframesOf(c, property).filter((k) => k.frame !== dest);
    const target = moved.find((k) => k.frame === fromFrame);
    if (!target) return;
    target.frame = dest;
    moved.sort((a, b) => a.frame - b.frame);
    this.writeKeyframes(clipId, property, moved);
  }

  /** Grade the selected clips (mirrors apply_color, merge). */
  applyColor(patch: ColorArgs): void {
    const ids = new Set(this.view.selectedClipIds);
    if (ids.size === 0) return;
    this.engine.mutateClips(ids, (c) => applyColorGrade(c, patch, false), "Apply Color");
    this.markDirty();
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
    this.markDirty();
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
