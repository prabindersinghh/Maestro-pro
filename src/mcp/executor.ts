// MCP tool executor — TS port of Agent/Tools/ToolExecutor*.swift. Dispatches the 41
// tools to the shared EditEngine + MediaLibrary. Generation/transcription/render tools
// return the faithful signed-out / "unavailable in this build" shapes (SPEC §10, §11).

import type { AnimatableProperty, ClipType } from "../model/enums";
import { isVisual } from "../model/enums";
import type { AnimPair, Crop, Keyframe, KeyframeValue, Timeline } from "../model/types";
import { defaultTrack, defaultClip, defaultTextStyle } from "../model/defaults";
import { LAYOUTS, LAYOUT_NAMES, layoutPlacement, type LayoutFit, type LayoutSlot } from "../model/layout";
import { EditEngine, type InsertSpec, type MoveSpec, type PlaceSpec } from "../engine/editEngine";
import { buildGetTimelineOutput } from "./getTimelineOutput";
import { MediaLibrary } from "./mediaLibrary";
import { writeProjectPackage, type PackageFS } from "../project/package";
import { exportXMEML, exportFCPXML, libraryResolver } from "../export";
import { applyColorGrade, applyEffectStack, type ColorArgs, type EffectSpec } from "../model/effectStack";
import { resolveRenderMediaPath } from "../render/mediaPath";
import { encodeTimeline, decodeTimeline } from "../model/codec";
import { encodeManifest, decodeManifest } from "../model/media";
import { probeMedia } from "./probe";
import { SkillStore } from "./skills";
import { extractWaveform, type WaveformEnvelope } from "../audio/waveform";
import { join } from "node:path";
import type { VideoCodec, VideoResolution } from "../render/renderVideo";

export interface ToolContentText { type: "text"; text: string }
export interface ToolResult {
  content: ToolContentText[];
  isError?: boolean;
}
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const err = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const okJson = (obj: unknown): ToolResult => ok(JSON.stringify(obj));

// --- arg helpers (mirror the Swift dict extension) ---
type Args = Record<string, unknown>;
const aStr = (a: Args, k: string): string | undefined => (typeof a[k] === "string" && a[k] !== "" ? (a[k] as string) : undefined);
const aInt = (a: Args, k: string): number | undefined => (typeof a[k] === "number" ? Math.trunc(a[k] as number) : undefined);
const aNum = (a: Args, k: string): number | undefined => (typeof a[k] === "number" ? (a[k] as number) : undefined);
const aBool = (a: Args, k: string): boolean | undefined => (typeof a[k] === "boolean" ? (a[k] as boolean) : undefined);
const aArr = (a: Args, k: string): unknown[] => (Array.isArray(a[k]) ? (a[k] as unknown[]) : []);
const aStrArr = (a: Args, k: string): string[] => aArr(a, k).filter((x): x is string => typeof x === "string");

class ToolFail extends Error {}
const requireStr = (a: Args, k: string): string => {
  const v = aStr(a, k);
  if (v === undefined) throw new ToolFail(`Missing required argument: ${k}`);
  return v;
};

export class McpExecutor {
  readonly engine: EditEngine;
  readonly media: MediaLibrary;
  currentFrame = 0;
  canGenerate = false; // Windows port: no cloud account (SPEC §10)
  projectDir: string | null = null;
  private fs: PackageFS | null;
  private agentUndo: string[] = [];

  constructor(opts: { timeline?: Timeline; media?: MediaLibrary; fs?: PackageFS; projectDir?: string } = {}) {
    this.engine = new EditEngine(opts.timeline ?? { fps: 30, width: 1920, height: 1080, settingsConfigured: false, tracks: [] });
    this.media = opts.media ?? new MediaLibrary();
    this.fs = opts.fs ?? null;
    this.projectDir = opts.projectDir ?? null;
  }

  get timeline(): Timeline {
    return this.engine.timeline;
  }

  /** Bumped on every state mutation (edits, media, setState) — drives the UI sync bridge. */
  stateVersion = 0;

  private waveforms = new Map<string, WaveformEnvelope>();
  private waveformJobs = new Map<string, Promise<WaveformEnvelope>>();

  /** Peak-envelope waveform for an asset (cached; computed on first request). Empty if no audio. */
  waveformFor(mediaRef: string): Promise<WaveformEnvelope> {
    const cached = this.waveforms.get(mediaRef);
    if (cached) return Promise.resolve(cached);
    const asset = this.media.asset(mediaRef);
    const path = asset ? resolveRenderMediaPath(asset.source, this.projectDir ?? ".", join(process.cwd(), "public")) : null;
    // Asset not resolvable yet (state not seeded) — return empty WITHOUT caching, so it retries later.
    if (!path) return Promise.resolve({ samplesPerSecond: 200, peaks: [] });
    let job = this.waveformJobs.get(mediaRef);
    if (!job) {
      job = extractWaveform(path, asset?.duration ?? 0).then((wf) => { this.waveforms.set(mediaRef, wf); return wf; });
      this.waveformJobs.set(mediaRef, job);
    }
    return job;
  }

  getState(): { version: number; timeline: unknown; media: unknown; projectDir: string | null } {
    return {
      version: this.stateVersion,
      timeline: encodeTimeline(this.timeline),
      media: encodeManifest(this.media.toManifest()),
      projectDir: this.projectDir,
    };
  }

  /** Replace the whole project state (UI push). */
  setState(timelineJson: unknown, manifestJson: unknown): number {
    this.engine.timeline = decodeTimeline(timelineJson);
    const manifest = decodeManifest(manifestJson);
    this.media.folders = manifest.folders;
    this.media.assets = manifest.entries.map((e) => ({
      id: e.id, name: e.name, type: e.type, duration: e.duration, source: e.source,
      folderId: e.folderId, sourceWidth: e.sourceWidth, sourceHeight: e.sourceHeight,
      sourceFPS: e.sourceFPS, hasAudio: e.hasAudio, generationStatus: e.generationStatus,
    }));
    this.stateVersion++;
    return this.stateVersion;
  }

  /** Import a real on-disk media file with ffprobe metadata. Shared by import_media and /upload. */
  async importFromPath(path: string, name?: string, folderId?: string): Promise<ToolResult> {
    const type = MediaLibrary.inferType(path);
    if (!type) throw new ToolFail(`import: unsupported media type for ${path}`);
    const probe = await probeMedia(path);
    const asset = this.media.addAsset({
      name: name ?? path.split(/[/\\]/).pop() ?? "Imported asset",
      type,
      duration: probe?.duration ?? 0,
      source: { kind: "external", absolutePath: path },
      folderId,
      sourceWidth: probe?.width,
      sourceHeight: probe?.height,
      sourceFPS: probe?.fps,
      hasAudio: type === "audio" ? true : probe?.hasAudio ?? false,
    });
    this.stateVersion++;
    return okJson({ assetId: asset.id, name: asset.name, type: asset.type, duration: asset.duration });
  }

  async execute(name: string, args: Args): Promise<ToolResult> {
    const READ_ONLY = new Set([
      "get_timeline", "get_media", "inspect_media", "get_transcript", "inspect_timeline",
      "search_media", "inspect_color", "list_folders", "list_models", "send_feedback", "export_project",
      "list_skills", "read_skill",
    ]);
    try {
      const result = await this.run(name, args ?? {});
      if (!result.isError && !READ_ONLY.has(name)) this.stateVersion++;
      return result;
    } catch (e) {
      if (e instanceof ToolFail) return err(e.message);
      return err(e instanceof Error ? e.message : String(e));
    }
  }

  readonly skills = new SkillStore();

  private async run(name: string, a: Args): Promise<ToolResult> {
    switch (name) {
      // Skills (Maestro extension — Palmier Agent/Skills over MCP)
      case "list_skills": return okJson({ skills: (await this.skills.catalog()).map((s) => ({ id: s.id, name: s.name, description: s.description })) });
      case "read_skill": {
        const id = requireStr(a, "id");
        const body = await this.skills.body(id);
        return body ? ok(body) : err(`Unknown skill: ${id}. Call list_skills to see available skills.`);
      }
      // Read
      case "get_timeline": return this.getTimeline(a);
      case "get_media": return okJson({ media: this.media.mediaRows() });
      case "inspect_media": return this.unavailable("inspect_media", "transcription/frame sampling");
      case "get_transcript": return this.unavailable("get_transcript", "on-device transcription");
      case "inspect_timeline": return this.unavailable("inspect_timeline", "compositing/render");
      case "search_media": return this.unavailable("search_media", "on-device semantic/transcript search");
      case "inspect_color": return this.unavailable("inspect_color", "compositing/render");
      // Edit
      case "add_clips": return this.addClips(a);
      case "insert_clips": return this.insertClips(a);
      case "remove_clips": return this.removeClips(a);
      case "remove_tracks": return this.removeTracks(a);
      case "move_clips": return this.moveClips(a);
      case "split_clips": return this.splitClips(a);
      case "set_clip_properties": return this.setClipProperties(a);
      case "set_keyframes": return this.setKeyframes(a);
      case "ripple_delete_ranges": return this.rippleDeleteRanges(a);
      case "remove_words": return this.unavailable("remove_words", "on-device transcription");
      case "sync_audio": return this.unavailable("sync_audio", "audio cross-correlation");
      case "undo": return this.undo();
      case "apply_layout": return this.applyLayout(a);
      // Text
      case "add_texts": return this.addTexts(a);
      case "update_text": return this.updateText(a);
      case "add_captions": return this.unavailable("add_captions", "on-device transcription");
      // Color / effects
      case "apply_effect": return this.applyEffectOrColor(a, false);
      case "apply_color": return this.applyEffectOrColor(a, true);
      // Media library
      case "import_media": return this.importMedia(a);
      case "list_folders": return okJson({ folders: this.media.folders });
      case "create_folder": return this.createFolder(a);
      case "move_to_folder": return this.moveToFolder(a);
      case "rename_media": return this.renameMedia(a);
      case "rename_folder": return this.renameFolder(a);
      case "delete_media": return this.deleteMedia(a);
      case "delete_folder": return this.deleteFolder(a);
      // Project / misc
      case "export_project": return this.exportProject(a);
      case "set_project_settings": return this.setProjectSettings(a);
      case "list_models": return okJson({ models: [], loaded: false }); // signed-out shape
      case "send_feedback": return ok("Feedback recorded.");
      // Generation — stub (signed-out)
      case "generate_video":
      case "generate_image":
      case "generate_audio":
        return err("Generation requires signing in to Palmier. Tell the user to sign in.");
      case "upscale_media":
        return err("Upscale requires signing in to Palmier. Tell the user to sign in.");
      default:
        return err(`Unknown tool: ${name}`);
    }
  }

  private unavailable(tool: string, feature: string): ToolResult {
    return err(`${tool}: ${feature} is not available in this build (Windows port phase 1). This is a known stub, not a failure — do not retry.`);
  }

  private get fps(): number {
    return this.timeline.fps;
  }

  /** Records an edit's action name so `undo` can revert only the assistant's edits. */
  private track(changed: boolean, name: string): void {
    if (changed) this.agentUndo.push(name);
  }

  // ---- Read ----

  private getTimeline(a: Args): ToolResult {
    const out = buildGetTimelineOutput(this.timeline, {
      startFrame: aInt(a, "startFrame"),
      endFrame: aInt(a, "endFrame"),
      currentFrame: this.currentFrame,
      canGenerate: this.canGenerate,
      trackLabel: (i) => this.engine.trackDisplayLabel(i),
    });
    return okJson(out);
  }

  // ---- Edit ----

  /** Ensures a track of `type` exists; returns its index (creating at the zone edge). */
  private ensureTrack(type: ClipType): number {
    const existing = this.timeline.tracks.findIndex((t) => (type === "audio" ? t.type === "audio" : isVisual(t.type)));
    if (existing >= 0) return existing;
    if (type === "audio") {
      this.timeline.tracks.push(defaultTrack("audio"));
      return this.timeline.tracks.length - 1;
    }
    this.timeline.tracks.unshift(defaultTrack(type));
    return 0;
  }

  /** Text/captions get a DEDICATED text track (above visuals) so they overlay video, not overwrite it. */
  private ensureTextTrack(): number {
    const existing = this.timeline.tracks.findIndex((t) => t.type === "text");
    if (existing >= 0) return existing;
    this.timeline.tracks.unshift(defaultTrack("text"));
    return 0;
  }

  private sourceDurationProjectFrames(assetDuration: number): number {
    return Math.max(1, Math.round(assetDuration * this.fps));
  }

  private addClips(a: Args): ToolResult {
    const entries = aArr(a, "entries");
    if (entries.length === 0) throw new ToolFail("add_clips: entries is required");
    const anySpecify = entries.some((e) => aInt(e as Args, "trackIndex") !== undefined);
    const allSpecify = entries.every((e) => aInt(e as Args, "trackIndex") !== undefined);
    if (anySpecify && !allSpecify) throw new ToolFail("add_clips: set trackIndex on every entry or none.");

    const specs: PlaceSpec[] = [];
    for (const raw of entries) {
      const e = raw as Args;
      const mediaRef = requireStr(e, "mediaRef");
      const asset = this.media.asset(mediaRef);
      if (!asset) throw new ToolFail(`add_clips: media asset not found: ${mediaRef}`);
      const startFrame = aInt(e, "startFrame");
      if (startFrame === undefined) throw new ToolFail("add_clips: startFrame is required");
      const trimStart = aInt(e, "trimStartFrame") ?? 0;
      const trimEnd = aInt(e, "trimEndFrame");
      const durArg = aInt(e, "durationFrames");
      if (durArg !== undefined && trimEnd !== undefined) throw new ToolFail("add_clips: durationFrames and trimEndFrame are mutually exclusive");
      const srcTotal = this.sourceDurationProjectFrames(asset.duration);
      const durationFrames = durArg ?? Math.max(1, srcTotal - trimStart - (trimEnd ?? 0));
      const trackIndex = allSpecify ? aInt(e, "trackIndex")! : this.ensureTrack(isVisual(asset.type) ? "video" : "audio");
      const linkGroupId = asset.type === "video" && asset.hasAudio ? cryptoId() : undefined;
      specs.push({
        mediaRef, trackIndex, startFrame, durationFrames,
        mediaType: asset.type, sourceClipType: asset.type,
        trimStartFrame: trimStart, trimEndFrame: trimEnd ?? 0, linkGroupId,
      });
      // Auto linked-audio for a video-with-audio placed on a visual track.
      if (linkGroupId) {
        const audioTrack = this.ensureTrack("audio");
        specs.push({
          mediaRef, trackIndex: audioTrack, startFrame, durationFrames,
          mediaType: "audio", sourceClipType: "video",
          trimStartFrame: trimStart, trimEndFrame: trimEnd ?? 0, linkGroupId,
        });
      }
    }
    const changed = this.engine.addClips(specs);
    this.track(changed, "Add Clips");
    return okJson({ added: specs.length, clips: specs.map((s) => ({ mediaRef: s.mediaRef, startFrame: s.startFrame, durationFrames: s.durationFrames })) });
  }

  private insertClips(a: Args): ToolResult {
    const trackIndex = aInt(a, "trackIndex");
    const atFrame = aInt(a, "atFrame");
    if (trackIndex === undefined || atFrame === undefined) throw new ToolFail("insert_clips: trackIndex and atFrame are required");
    const specs: InsertSpec[] = aArr(a, "entries").map((raw) => {
      const e = raw as Args;
      const mediaRef = requireStr(e, "mediaRef");
      const asset = this.media.asset(mediaRef);
      if (!asset) throw new ToolFail(`insert_clips: media asset not found: ${mediaRef}`);
      const trimStart = aInt(e, "trimStartFrame") ?? 0;
      const trimEnd = aInt(e, "trimEndFrame");
      const durArg = aInt(e, "durationFrames");
      const srcTotal = this.sourceDurationProjectFrames(asset.duration);
      return {
        mediaRef, mediaType: asset.type,
        durationFrames: durArg ?? Math.max(1, srcTotal - trimStart - (trimEnd ?? 0)),
        trimStartFrame: trimStart, trimEndFrame: trimEnd ?? 0,
      };
    });
    const changed = this.engine.insertClips(specs, trackIndex, atFrame);
    this.track(changed, "Insert Clips");
    return okJson({ inserted: specs.length });
  }

  private removeClips(a: Args): ToolResult {
    const ids = aStrArr(a, "clipIds");
    const changed = this.engine.removeClips(ids);
    this.track(changed, "Remove Clips");
    return ok(changed ? `Removed ${ids.length} clip(s) (with link groups).` : "No matching clips.");
  }

  private removeTracks(a: Args): ToolResult {
    const idx = aArr(a, "trackIndexes").map((x) => Math.trunc(x as number));
    const changed = this.engine.removeTracks(idx);
    this.track(changed, "Remove Tracks");
    return ok(changed ? `Removed ${idx.length} track(s).` : "No matching tracks.");
  }

  private moveClips(a: Args): ToolResult {
    const moves: MoveSpec[] = aArr(a, "moves").map((raw) => {
      const m = raw as Args;
      return { clipId: requireStr(m, "clipId"), toTrack: aInt(m, "toTrack"), toFrame: aInt(m, "toFrame") };
    });
    const changed = this.engine.moveClips(moves);
    this.track(changed, "Move Clips");
    return ok(changed ? `Moved ${moves.length} clip(s).` : "No clips moved.");
  }

  private splitClips(a: Args): ToolResult {
    const splitsArg = aArr(a, "splits");
    const trackIndex = aInt(a, "trackIndex");
    let rights: string[] = [];
    if (splitsArg.length > 0) {
      const splits = splitsArg.map((raw) => {
        const s = raw as Args;
        return { clipId: requireStr(s, "clipId"), atFrame: aInt(s, "atFrame") ?? 0 };
      });
      rights = this.engine.splitClips(splits);
    } else if (trackIndex !== undefined) {
      rights = this.engine.splitTrackAt(trackIndex, aArr(a, "frames").map((x) => Math.trunc(x as number)));
    } else {
      throw new ToolFail("split_clips: pass either 'splits' or 'trackIndex'+'frames'");
    }
    this.track(rights.length > 0, "Split Clips");
    return okJson({ newClipIds: rights });
  }

  private setClipProperties(a: Args): ToolResult {
    const clipIds = aStrArr(a, "clipIds");
    if (clipIds.length === 0) throw new ToolFail("set_clip_properties: clipIds is required");
    const ids = new Set(clipIds);
    const partners = this.engine.timingPartners(ids);
    let changed = false;

    // Timing changes propagate to non-text linked partners.
    if (aNum(a, "speed") !== undefined) {
      const targets = [...ids, ...[...partners].filter((p) => this.engine.clipRef(p)?.mediaType !== "text")];
      changed = this.engine.setClipSpeed(targets, aNum(a, "speed")!) || changed;
    }
    if (aInt(a, "trimStartFrame") !== undefined || aInt(a, "trimEndFrame") !== undefined) {
      const edits = [...ids, ...[...partners].filter((p) => this.engine.clipRef(p)?.mediaType !== "text")]
        .map((id) => {
          const c = this.engine.clipRef(id)!;
          return {
            clipId: id,
            trimStartFrame: aInt(a, "trimStartFrame") ?? c.trimStartFrame,
            trimEndFrame: aInt(a, "trimEndFrame") ?? c.trimEndFrame,
          };
        });
      changed = this.engine.trimClips(edits) || changed;
    }

    // Per-clip fields (do not propagate).
    const perClip: Args = {};
    for (const k of ["volume", "opacity", "durationFrames", "blendMode", "transform"]) if (a[k] !== undefined) perClip[k] = a[k];
    if (Object.keys(perClip).length) {
      changed = this.engine.mutateClips(ids, (c) => {
        if (aNum(perClip, "volume") !== undefined) { c.volume = aNum(perClip, "volume")!; c.volumeTrack = undefined; }
        if (aNum(perClip, "opacity") !== undefined) { c.opacity = aNum(perClip, "opacity")!; c.opacityTrack = undefined; }
        if (aInt(perClip, "durationFrames") !== undefined) c.durationFrames = aInt(perClip, "durationFrames")!;
        const bm = aStr(perClip, "blendMode");
        if (bm !== undefined) c.blendMode = bm === "normal" ? undefined : (bm as typeof c.blendMode);
        const t = perClip.transform as Args | undefined;
        if (t) {
          for (const f of ["centerX", "centerY", "width", "height"] as const) if (aNum(t, f) !== undefined) c.transform[f] = aNum(t, f)!;
          if (aBool(t, "flipHorizontal") !== undefined) c.transform.flipHorizontal = aBool(t, "flipHorizontal")!;
          if (aBool(t, "flipVertical") !== undefined) c.transform.flipVertical = aBool(t, "flipVertical")!;
        }
      }, "Change Clip Property") || changed;
    }
    this.track(changed, "Change Clip Property");
    return ok(`Updated ${clipIds.length} clip(s).`);
  }

  private setKeyframes(a: Args): ToolResult {
    const clipId = requireStr(a, "clipId");
    const property = requireStr(a, "property") as AnimatableProperty;
    const rows = aArr(a, "keyframes");
    const kfs = rows.map((r) => parseKeyframeRow(property, r as unknown[]));
    const changed = this.engine.setKeyframes(clipId, property, kfs);
    this.track(changed, "Set Keyframes");
    return ok(`Set ${kfs.length} keyframe(s) on ${property}.`);
  }

  private rippleDeleteRanges(a: Args): ToolResult {
    const rangesRaw = aArr(a, "ranges");
    if (rangesRaw.length === 0) throw new ToolFail("ripple_delete_ranges: ranges is required");
    const units = aStr(a, "units") ?? "frames";
    const trackIndex = aInt(a, "trackIndex");
    const clipId = aStr(a, "clipId");

    if (trackIndex !== undefined) {
      if (units !== "frames") throw new ToolFail("ripple_delete_ranges: trackIndex mode requires units 'frames'");
      const ranges = rangesRaw.map((r) => ({ start: (r as number[])[0], end: (r as number[])[1] }));
      const ignore = aArr(a, "ignoreSyncLockedTracks").map((x) => Math.trunc(x as number));
      const out = this.engine.rippleDeleteRangesOnTrack(trackIndex, ranges, ignore);
      if (!out.ok) return err(out.reason);
      this.track(true, "Ripple Delete");
      return okJson(out.report);
    }
    if (clipId !== undefined) {
      const loc = this.engine.findClip(clipId);
      if (!loc) throw new ToolFail(`ripple_delete_ranges: clip not found: ${clipId}`);
      const clip = this.engine.clipRef(clipId)!;
      const toFrames = (v: number): number =>
        units === "seconds" ? clip.startFrame + Math.round((v * this.fps - clip.trimStartFrame) / Math.max(clip.speed, 0.0001)) : v;
      const ranges = rangesRaw.map((r) => {
        const [s, e] = r as number[];
        return { start: Math.max(clip.startFrame, toFrames(s)), end: Math.min(clip.startFrame + clip.durationFrames, toFrames(e)) };
      });
      const out = this.engine.rippleDeleteRangesOnTrack(loc.trackIndex, ranges);
      if (!out.ok) return err(out.reason);
      this.track(true, "Ripple Delete");
      return okJson(out.report);
    }
    throw new ToolFail("ripple_delete_ranges: pass exactly one of trackIndex or clipId");
  }

  private undo(): ToolResult {
    const expected = this.agentUndo[this.agentUndo.length - 1];
    if (!expected) return err("No assistant edit to undo this session. The user's own edits are theirs to undo.");
    const name = this.engine.undo();
    if (name === null) return err("Nothing to undo.");
    this.agentUndo.pop();
    return ok(`Undid: ${expected}. Re-read with get_timeline before editing again.`);
  }

  // apply_layout (ToolExecutor+Layout.swift): assign clips to a named layout's slots; the
  // cover-crop solver (model/layout.ts) sets each transform + crop so it fills its region.
  private applyLayout(a: Args): ToolResult {
    const layoutName = requireStr(a, "layout");
    const slots = LAYOUTS[layoutName];
    if (!slots) throw new ToolFail(`unknown layout '${layoutName}'. Valid: ${LAYOUT_NAMES.join(", ")}`);
    const fit = (aStr(a, "fit") ?? "fill") as LayoutFit;
    if (fit !== "fill" && fit !== "fit") throw new ToolFail("apply_layout: fit must be 'fill' or 'fit'");
    const slotArgs = aArr(a, "slots").map((s) => s as Args);
    if (slotArgs.length === 0) throw new ToolFail("apply_layout needs a non-empty 'slots' array");

    const slotById = new Map(slots.map((s) => [s.id, s]));
    const anchorPos: Record<string, [number, number]> = {
      center: [0.5, 0.5], top: [0.5, 0], bottom: [0.5, 1], left: [0, 0.5], right: [1, 0.5],
      top_left: [0, 0], top_right: [1, 0], bottom_left: [0, 1], bottom_right: [1, 1],
    };
    const seen = new Set<string>();
    let usesMedia = false, usesClip = false;
    const entries: { slot: LayoutSlot; mediaRef?: string; clipIds?: string[]; ax: number; ay: number }[] = [];
    for (const s of slotArgs) {
      const slotId = requireStr(s, "slot");
      const slot = slotById.get(slotId);
      if (!slot) throw new ToolFail(`'${slotId}' is not a slot of '${layoutName}'. Slots: ${slots.map((x) => x.id).join(", ")}`);
      if (seen.has(slotId)) throw new ToolFail(`duplicate slot '${slotId}'`);
      seen.add(slotId);
      const mediaRef = aStr(s, "mediaRef");
      const clipIds = aStrArr(s, "clipIds");
      const hasClips = clipIds.length > 0;
      if ((mediaRef !== undefined) === hasClips) throw new ToolFail(`slot '${slotId}': provide exactly one of 'mediaRef' or 'clipIds'`);
      const named = aStr(s, "anchor");
      const ax = aNum(s, "anchorX") ?? (named ? anchorPos[named]?.[0] : undefined) ?? 0.5;
      const ay = aNum(s, "anchorY") ?? (named ? anchorPos[named]?.[1] : undefined) ?? 0.5;
      usesMedia ||= mediaRef !== undefined;
      usesClip ||= hasClips;
      entries.push({ slot, mediaRef, clipIds: hasClips ? clipIds : undefined, ax, ay });
    }
    const missing = slots.filter((s) => !seen.has(s.id)).map((s) => s.id);
    if (missing.length) throw new ToolFail(`layout '${layoutName}' needs every slot filled. Missing: ${missing.join(", ")}`);
    if (usesMedia && usesClip) throw new ToolFail("apply_layout: don't mix 'mediaRef' and 'clipIds' — all new (mediaRef) or all existing (clipIds).");

    const cW = this.timeline.width, cH = this.timeline.height;
    const summaries: string[] = [];

    if (usesMedia) {
      const startFrame = aInt(a, "startFrame") ?? 0;
      const duration = aInt(a, "durationFrames");
      if (duration === undefined || duration < 1) throw new ToolFail("apply_layout placing new clips requires durationFrames >= 1.");
      // Pre-validate assets (no throwing inside the commit).
      for (const e of entries) {
        const asset = this.media.asset(e.mediaRef!);
        if (!asset) throw new ToolFail(`slot '${e.slot.id}': asset not found: ${e.mediaRef}`);
        if (asset.type !== "video" && asset.type !== "image") throw new ToolFail(`slot '${e.slot.id}': asset is ${asset.type}; layout slots take video or image.`);
      }
      const changed = this.engine.run("Apply Layout", () => {
        const trackIdBySlot = new Map<string, string>();
        for (const slot of [...slots].sort((x, y) => x.z - y.z)) {
          const t = defaultTrack("video");
          this.timeline.tracks.unshift(t);
          trackIdBySlot.set(slot.id, t.id);
        }
        for (const e of entries) {
          const asset = this.media.asset(e.mediaRef!)!;
          const tIdx = this.timeline.tracks.findIndex((t) => t.id === trackIdBySlot.get(e.slot.id));
          const p = layoutPlacement(asset.sourceWidth, asset.sourceHeight, cW, cH, e.slot.rect, fit, e.ax, e.ay);
          const clip = defaultClip({ mediaRef: e.mediaRef!, startFrame, durationFrames: duration, mediaType: asset.type, sourceClipType: asset.type });
          clip.transform = p.transform;
          clip.crop = p.crop;
          this.timeline.tracks[tIdx].clips.push(clip);
          summaries.push(`${e.slot.id} → ${clip.id}`);
        }
      });
      this.track(changed, "Apply Layout");
    } else {
      // Re-layout existing clips. Pre-resolve + validate.
      const resolved: { slot: LayoutSlot; clip: import("../model/types").Clip; ax: number; ay: number }[] = [];
      for (const e of entries) {
        for (const cid of e.clipIds!) {
          let found: import("../model/types").Clip | undefined;
          for (const t of this.timeline.tracks) { const c = t.clips.find((x) => x.id === cid); if (c) { found = c; break; } }
          if (!found) throw new ToolFail(`slot '${e.slot.id}': clip not found: ${cid}`);
          if (found.mediaType !== "video" && found.mediaType !== "image") throw new ToolFail(`slot '${e.slot.id}': clip ${cid} is ${found.mediaType}; layout applies to video/image clips.`);
          resolved.push({ slot: e.slot, clip: found, ax: e.ax, ay: e.ay });
        }
      }
      const changed = this.engine.run("Apply Layout", () => {
        for (const r of resolved) {
          const asset = this.media.asset(r.clip.mediaRef);
          const p = layoutPlacement(asset?.sourceWidth, asset?.sourceHeight, cW, cH, r.slot.rect, fit, r.ax, r.ay);
          r.clip.transform = p.transform;
          r.clip.crop = p.crop;
          r.clip.positionTrack = undefined;
          r.clip.scaleTrack = undefined;
          r.clip.rotationTrack = undefined;
          r.clip.cropTrack = undefined;
          summaries.push(`${r.slot.id} → ${r.clip.id}`);
        }
      });
      this.track(changed, "Apply Layout");
    }

    return okJson({ layout: layoutName, fit, slots: summaries });
  }

  private addTexts(a: Args): ToolResult {
    const entries = aArr(a, "entries");
    if (entries.length === 0) throw new ToolFail("add_texts: entries is required");
    const allSpecify = entries.every((e) => aInt(e as Args, "trackIndex") !== undefined);
    const specs: PlaceSpec[] = [];
    const contents: string[] = [];
    for (const raw of entries) {
      const e = raw as Args;
      const startFrame = aInt(e, "startFrame");
      const durationFrames = aInt(e, "durationFrames");
      const content = aStr(e, "content");
      if (startFrame === undefined || durationFrames === undefined || content === undefined) {
        throw new ToolFail("add_texts: each entry needs startFrame, durationFrames, content");
      }
      const trackIndex = allSpecify ? aInt(e, "trackIndex")! : this.ensureTextTrack();
      const id = cryptoId();
      specs.push({ mediaRef: `text-${id}`, trackIndex, startFrame, durationFrames, mediaType: "text", sourceClipType: "text", id });
      contents.push(content);
    }
    const changed = this.engine.addClips(specs);
    // Attach text content + a default style/placement so it renders (drawText needs both).
    specs.forEach((s, i) => {
      const c = this.engine.clipRef(s.id!);
      if (!c) return;
      c.textContent = contents[i];
      c.textStyle ??= defaultTextStyle();
      // Caption-friendly default: lower third, centered.
      c.transform = { centerX: 0.5, centerY: 0.82, width: 0.9, height: 0.2, rotation: 0, flipHorizontal: false, flipVertical: false };
    });
    this.track(changed, "Add Text");
    return okJson({ added: specs.length, clipIds: specs.map((s) => s.id) });
  }

  private updateText(a: Args): ToolResult {
    const clipIds = aStrArr(a, "clipIds");
    const content = aStr(a, "content");
    if (clipIds.length === 0) throw new ToolFail("update_text: clipIds (or captionGroupId) required");
    const changed = this.engine.mutateClips(new Set(clipIds), (c) => {
      if (content !== undefined) c.textContent = content;
    }, "Update Text");
    this.track(changed, "Update Text");
    return ok(`Updated ${clipIds.length} text clip(s).`);
  }

  private applyEffectOrColor(a: Args, isColor: boolean): ToolResult {
    const clipIds = aStrArr(a, "clipIds");
    if (clipIds.length === 0) throw new ToolFail("clipIds is required");
    const ids = new Set(clipIds);
    const specs: EffectSpec[] = aArr(a, "effects").map((raw) => {
      const e = raw as Args;
      return { type: aStr(e, "type") ?? "", params: (e.params as Record<string, number>) ?? {}, enabled: aBool(e, "enabled") };
    });
    const changed = this.engine.mutateClips(ids, (c) => {
      if (isColor) applyColorGrade(c, a as unknown as ColorArgs, aBool(a, "reset") ?? false);
      else applyEffectStack(c, specs, aStrArr(a, "remove"));
    }, isColor ? "Apply Color" : "Apply Effect");
    this.track(changed, isColor ? "Apply Color" : "Apply Effect");
    return ok(`${isColor ? "Graded" : "Applied effects to"} ${clipIds.length} clip(s).`);
  }

  // ---- Media library ----

  private async importMedia(a: Args): Promise<ToolResult> {
    const source = a.source as Args | undefined;
    if (!source) throw new ToolFail("import_media: source is required");
    const path = aStr(source, "path");
    const url = aStr(source, "url");
    const bytes = aStr(source, "bytes");
    let name = aStr(a, "name");
    let type: ClipType | undefined;
    let src: { kind: "external"; absolutePath: string } | { kind: "project"; relativePath: string };
    if (path) {
      return this.importFromPath(path, name, aStr(a, "folderId"));
    } else if (url) {
      type = aStr(source, "mimeType") ? mimeToType(aStr(source, "mimeType")!) : MediaLibrary.inferType(url);
      name = name ?? url.split("/").pop() ?? "Imported asset";
      src = { kind: "external", absolutePath: url };
    } else if (bytes) {
      type = mimeToType(aStr(source, "mimeType") ?? "");
      name = name ?? "Imported asset";
      src = { kind: "project", relativePath: `media/${name}` };
    } else {
      throw new ToolFail("import_media: source must set exactly one of url, path, or bytes");
    }
    if (!type) throw new ToolFail("import_media: unsupported or unknown media type");
    const asset = this.media.addAsset({ name, type, duration: 0, source: src, folderId: aStr(a, "folderId"), hasAudio: type === "video" });
    return okJson({ assetId: asset.id, name: asset.name, type: asset.type });
  }

  private createFolder(a: Args): ToolResult {
    const entries = aArr(a, "entries");
    if (entries.length > 0) {
      const created = entries.map((raw) => {
        const e = raw as Args;
        const f = { id: cryptoId(), name: requireStr(e, "name"), parentFolderId: aStr(e, "parentFolderId") };
        this.media.folders.push(f);
        return f;
      });
      return okJson({ folders: created });
    }
    const f = { id: cryptoId(), name: requireStr(a, "name"), parentFolderId: aStr(a, "parentFolderId") };
    this.media.folders.push(f);
    return okJson(f);
  }

  private moveToFolder(a: Args): ToolResult {
    const apply = (assetIds: string[], folderId?: string): void => {
      for (const id of assetIds) {
        const asset = this.media.asset(id);
        if (asset) asset.folderId = folderId;
      }
    };
    const entries = aArr(a, "entries");
    if (entries.length > 0) {
      for (const raw of entries) apply(aStrArr(raw as Args, "assetIds"), aStr(raw as Args, "folderId"));
    } else {
      apply(aStrArr(a, "assetIds"), aStr(a, "folderId"));
    }
    return ok("Moved.");
  }

  private renameMedia(a: Args): ToolResult {
    const entries = aArr(a, "entries");
    const rename = (ref: string, name: string): void => {
      const asset = this.media.asset(ref);
      if (asset) asset.name = name;
    };
    if (entries.length > 0) for (const raw of entries) rename(requireStr(raw as Args, "mediaRef"), requireStr(raw as Args, "name"));
    else rename(requireStr(a, "mediaRef"), requireStr(a, "name"));
    return ok("Renamed.");
  }

  private renameFolder(a: Args): ToolResult {
    const entries = aArr(a, "entries");
    const rename = (fid: string, name: string): void => {
      const f = this.media.folder(fid);
      if (f) f.name = name;
    };
    if (entries.length > 0) for (const raw of entries) rename(requireStr(raw as Args, "folderId"), requireStr(raw as Args, "name"));
    else rename(requireStr(a, "folderId"), requireStr(a, "name"));
    return ok("Renamed.");
  }

  private deleteMedia(a: Args): ToolResult {
    const ids = new Set(aStrArr(a, "assetIds"));
    this.media.removeAssets(ids);
    // Remove clips referencing deleted assets.
    const clipIds = this.timeline.tracks.flatMap((t) => t.clips).filter((c) => ids.has(c.mediaRef)).map((c) => c.id);
    if (clipIds.length) this.engine.removeClips(clipIds, { expandLinks: false });
    this.track(true, "Delete Media");
    return ok(`Deleted ${ids.size} asset(s).`);
  }

  private deleteFolder(a: Args): ToolResult {
    const folderIds = new Set(aStrArr(a, "folderIds"));
    const assetIds = new Set(this.media.assets.filter((x) => x.folderId && folderIds.has(x.folderId)).map((x) => x.id));
    this.media.folders = this.media.folders.filter((f) => !folderIds.has(f.id));
    this.media.removeAssets(assetIds);
    const clipIds = this.timeline.tracks.flatMap((t) => t.clips).filter((c) => assetIds.has(c.mediaRef)).map((c) => c.id);
    if (clipIds.length) this.engine.removeClips(clipIds, { expandLinks: false });
    return ok(`Deleted ${folderIds.size} folder(s).`);
  }

  // ---- Project / misc ----

  private async exportProject(a: Args): Promise<ToolResult> {
    const mode = aStr(a, "mode") ?? "video";
    const codec = (aStr(a, "codec") ?? "H.264") as VideoCodec;
    const ext = mode === "palmier" ? "palmier" : mode === "xml" ? "xml" : mode === "fcpxml" ? "fcpxml" : codec === "ProRes" ? "mov" : "mp4";
    const outPath = aStr(a, "outputPath") ?? `${this.projectDir ?? "."}/export.${ext}`;

    if (mode === "palmier") {
      if (!this.fs) return err("export_project: no filesystem bound in this context.");
      await writeProjectPackage(this.fs, outPath, {
        timeline: this.timeline,
        manifest: this.media.toManifest(),
        manifestUnreadable: false,
        generationLogRaw: null,
      });
      return okJson({ mode, outputPath: outPath, status: "written" });
    }
    if (mode === "xml" || mode === "fcpxml") {
      if (!this.fs) return err("export_project: no filesystem bound in this context.");
      const resolver = libraryResolver(this.media, this.projectDir ?? undefined);
      const xml = mode === "xml" ? exportXMEML(this.timeline, resolver) : exportFCPXML(this.timeline, resolver);
      await this.fs.writeText(outPath, xml);
      return okJson({ mode, outputPath: outPath, status: "written" });
    }
    // video: rasterize the composited frames and encode with FFmpeg. Renders inline (a port
    // deviation from the macOS background render — the file is ready when this returns).
    const { renderVideo } = await import("../render/renderVideo");
    const result = await renderVideo(this.timeline, {
      outputPath: outPath,
      codec,
      resolution: (aStr(a, "resolution") ?? "Match Timeline") as VideoResolution,
      mediaName: (r) => this.media.asset(r)?.name ?? r,
      mediaPath: (r) => {
        const asset = this.media.asset(r);
        if (!asset) return null;
        return resolveRenderMediaPath(asset.source, this.projectDir ?? ".", join(process.cwd(), "public"));
      },
    });
    return okJson({
      mode: "video", codec: result.codec, outputPath: result.outputPath,
      frames: result.frames, size: `${result.width}x${result.height}`, status: "rendered",
    });
  }

  private setProjectSettings(a: Args): ToolResult {
    let changed = false;
    const fps = aInt(a, "fps");
    const width = aInt(a, "width");
    const height = aInt(a, "height");
    if (fps !== undefined && fps !== this.timeline.fps) { this.timeline.fps = fps; changed = true; }
    if (width !== undefined) { this.timeline.width = width; changed = true; }
    if (height !== undefined) { this.timeline.height = height; changed = true; }
    const preset: Record<string, [number, number]> = {
      "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:3": [1440, 1080], "2.4:1": [1920, 800], "9:14": [1080, 1680],
    };
    const ar = aStr(a, "aspectRatio");
    if (ar && preset[ar]) { [this.timeline.width, this.timeline.height] = preset[ar]; changed = true; }
    this.timeline.settingsConfigured = true;
    return ok(changed ? `Project settings updated (${this.timeline.width}x${this.timeline.height} @ ${this.timeline.fps}fps).` : "No changes.");
  }
}

function cryptoId(): string {
  return crypto.randomUUID();
}

function mimeToType(mime: string): ClipType | undefined {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return undefined;
}

/** Parse a set_keyframes row [frame, ...values, interp?] for a property. */
function parseKeyframeRow(property: AnimatableProperty, row: unknown[]): Keyframe<KeyframeValue> {
  const nums = row.filter((x) => typeof x === "number") as number[];
  const interp = (row.find((x) => typeof x === "string") as string | undefined) ?? "smooth";
  const interpolationOut = (["linear", "hold", "smooth"].includes(interp) ? interp : "smooth") as Keyframe<KeyframeValue>["interpolationOut"];
  const frame = nums[0] ?? 0;
  let value: KeyframeValue;
  switch (property) {
    case "position": value = { a: nums[1] ?? 0, b: nums[2] ?? 0 } satisfies AnimPair; break;
    case "scale": value = { a: nums[1] ?? 1, b: nums[2] ?? 1 } satisfies AnimPair; break;
    case "crop": value = { top: nums[1] ?? 0, right: nums[2] ?? 0, bottom: nums[3] ?? 0, left: nums[4] ?? 0 } satisfies Crop; break;
    default: value = nums[1] ?? 0; // volume (dB), opacity, rotation
  }
  return { frame, value, interpolationOut };
}
