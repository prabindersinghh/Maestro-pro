// MCP tool executor — TS port of Agent/Tools/ToolExecutor*.swift. Dispatches the 41
// tools to the shared EditEngine + MediaLibrary. Generation/transcription/render tools
// return the faithful signed-out / "unavailable in this build" shapes (SPEC §10, §11).

import type { AnimatableProperty, ClipType } from "../model/enums";
import { isVisual } from "../model/enums";
import type { AnimPair, Clip, Crop, Keyframe, KeyframeValue, Timeline } from "../model/types";
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
import { analyzeBeats } from "../audio/beats";
import { extractPalette } from "../color/palette";
import { extractFrames, type SampleMode } from "../vision/frames";
import { transcribe, whisperAvailable, type TranscriptWord } from "../audio/transcribe";
import { generate, type GenConfig, type GenKind } from "../gen/hosted";
import { ytdlpAvailable, downloadUrl } from "../gen/download";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { publicDir, remotionDir, dataDir } from "./env";
import type { VideoCodec, VideoResolution } from "../render/renderVideo";

export interface ToolContentText { type: "text"; text: string }
// Image content block — the MCP-canonical FLAT shape {type:"image", data, mimeType} (per the MCP
// spec). Claude Code (MCP client) consumes this directly; the in-app agent translates it to the
// Anthropic nested {source:{...}} shape before forwarding to the Messages API. base64, no data: prefix.
export interface ToolContentImage { type: "image"; data: string; mimeType: string }
export type ToolContent = ToolContentText | ToolContentImage;
export interface ToolResult {
  // Invariant: the FIRST block is always text (a caption/JSON), optionally followed by image blocks.
  // Typing the head as text keeps every `content[0].text` reader valid while allowing viewable frames.
  content: [ToolContentText, ...ToolContent[]];
  isError?: boolean;
}
const ok = (text: string): ToolResult => ({ content: [{ type: "text", text }] });
const err = (text: string): ToolResult => ({ content: [{ type: "text", text }], isError: true });
const okJson = (obj: unknown): ToolResult => ok(JSON.stringify(obj));
/** Result carrying a caption + one or more viewable frames (base64 JPEG/PNG), MCP image shape. */
const okImages = (text: string, images: { media_type: string; data: string }[]): ToolResult => ({
  content: [{ type: "text", text }, ...images.map((im): ToolContentImage => ({ type: "image", data: im.data, mimeType: im.media_type }))],
});

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
  /** BYOK hosted-generation config (Fal/Replicate), set by the app via /gen-config. */
  genConfig: GenConfig | null = null;
  projectDir: string | null = null;
  /** Cached word-level transcripts by mediaRef, + the last one (for remove_words by index). */
  private transcriptCache = new Map<string, TranscriptWord[]>();
  private lastTranscript: { mediaRef: string; clipId?: string; words: TranscriptWord[] } | null = null;
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
    const path = asset ? resolveRenderMediaPath(asset.source, this.projectDir ?? ".", publicDir()) : null;
    // Asset not resolvable yet (state not seeded) — return empty WITHOUT caching, so it retries later.
    if (!path) return Promise.resolve({ samplesPerSecond: 200, peaks: [] });
    let job = this.waveformJobs.get(mediaRef);
    if (!job) {
      job = extractWaveform(path, asset?.duration ?? 0).then((wf) => { this.waveforms.set(mediaRef, wf); return wf; });
      this.waveformJobs.set(mediaRef, job);
    }
    return job;
  }

  /** Resolve a mediaRef, or a clipId's underlying mediaRef, to an absolute file path. */
  private mediaPathFor(a: Args): string | null {
    let ref = aStr(a, "mediaRef");
    const clipId = aStr(a, "clipId");
    if (!ref && clipId) ref = this.engine.clipRef(clipId)?.mediaRef;
    if (!ref) return null;
    const asset = this.media.asset(ref);
    return asset ? resolveRenderMediaPath(asset.source, this.projectDir ?? ".", publicDir()) : null;
  }

  // analyze_audio — beats/onsets/tempo of an audio or video clip's audio, in project frames, so the
  // AI can cut and keyframe on the beat. Our own energy-flux detector over bundled-FFmpeg PCM.
  private async analyzeAudio(a: Args): Promise<ToolResult> {
    const path = this.mediaPathFor(a);
    if (!path) throw new ToolFail("analyze_audio: provide a resolvable mediaRef or clipId (call get_media/get_timeline first).");
    const res = await analyzeBeats(path, this.fps);
    return okJson({
      durationSec: Number(res.durationSec.toFixed(3)),
      tempoBpm: res.tempoBpm,
      fps: this.fps,
      beatFrames: res.beatFrames,
      onsetFrames: res.onsetFrames,
      silenceRanges: res.silences,
      note: "Frames are PROJECT frames. Cut on beats with split_clips / ripple_delete_ranges; remove silenceRanges with ripple_delete_ranges for jump-cut-on-pause; keyframe punches with set_keyframes.",
    });
  }

  // see_video — extract frames from a clip/asset and RETURN THEM AS VIEWABLE IMAGES so the model can
  // actually watch the footage: identify the best moments, the subject and its position, and what's on
  // screen — then edit on content, not just rhythm/color.
  private async seeVideo(a: Args): Promise<ToolResult> {
    const path = this.mediaPathFor(a);
    if (!path) throw new ToolFail("see_video: provide a resolvable mediaRef or clipId (call get_media/get_timeline first).");
    const count = Math.max(1, Math.min(12, aInt(a, "count") ?? 6));
    const mode = (aStr(a, "mode") === "scene" ? "scene" : "interval") as SampleMode;
    const clip = aStr(a, "clipId") ? this.engine.clipRef(aStr(a, "clipId")!) : null;
    const startSec = clip ? (clip.trimStartFrame / this.fps) : undefined;
    const endSec = clip ? (clip.trimStartFrame + Math.round(clip.durationFrames * clip.speed)) / this.fps : undefined;

    const frames = await extractFrames(path, { count, mode, maxDim: aInt(a, "maxDim") ?? 512, startSec, endSec });
    if (frames.length === 0) return err("see_video: could not extract any frames from this media.");
    const label = frames.map((f, i) => `frame ${i + 1}: ${f.timeSec.toFixed(2)}s`).join(", ");
    return okImages(
      `${frames.length} frame(s) from this ${mode === "scene" ? "clip (scene changes)" : "clip (evenly sampled)"} — ${label}. ` +
      `Use what you SEE (subject, framing, action, best moments) to drive the edit.`,
      frames.map((f) => ({ media_type: f.media_type, data: f.data })),
    );
  }

  // --- Transcription (on-device whisper.cpp) — get_transcript / add_captions / remove_words ---

  private whisperMissing(): ToolResult {
    return err(
      "Transcription needs the on-device speech model. The whisper engine ships with the Maestro installer; " +
      "in a dev run set MAESTRO_WHISPER to a whisper-cli binary. On first use the language model (~142 MB) " +
      "downloads automatically. This is a setup step, not a failure.",
    );
  }

  /** Transcribe a clip/asset to word-level timestamps (frames are relative to the MEDIA, 0 = its start). */
  private async transcriptFor(mediaRef: string, path: string): Promise<TranscriptWord[]> {
    const cached = this.transcriptCache.get(mediaRef);
    if (cached) return cached;
    const t = await transcribe(path, this.fps);
    this.transcriptCache.set(mediaRef, t.words);
    return t.words;
  }

  private async getTranscript(a: Args): Promise<ToolResult> {
    if (!(await whisperAvailable())) return this.whisperMissing();
    const path = this.mediaPathFor(a);
    const mediaRef = aStr(a, "mediaRef") ?? (aStr(a, "clipId") ? this.engine.clipRef(aStr(a, "clipId")!)?.mediaRef : undefined);
    if (!path || !mediaRef) throw new ToolFail("get_transcript: provide a resolvable mediaRef or clipId.");
    const words = await this.transcriptFor(mediaRef, path);
    this.lastTranscript = { mediaRef, clipId: aStr(a, "clipId"), words };
    return okJson({
      fps: this.fps,
      wordCount: words.length,
      text: words.map((w) => w.text).join(" "),
      words: words.map((w, i) => ({ index: i, text: w.text, startMs: w.startMs, endMs: w.endMs, startFrame: w.startFrame, endFrame: w.endFrame })),
      source: `whisper.cpp (on-device)`,
      note: "startFrame/endFrame are relative to the MEDIA (0 = its start). add_captions/remove_words map these onto the clip's timeline placement automatically.",
    });
  }

  /** Map a media-relative frame to a timeline frame for a placed clip (respects trim + speed). */
  private mediaFrameToTimeline(clip: Clip, mediaFrame: number): number | null {
    const rel = (mediaFrame - clip.trimStartFrame) / (clip.speed || 1);
    if (rel < -0.5 || rel > clip.durationFrames + 0.5) return null; // outside the clip's visible range
    return clip.startFrame + Math.round(rel);
  }

  private async addCaptions(a: Args): Promise<ToolResult> {
    if (!(await whisperAvailable())) return this.whisperMissing();
    const clipId = aStr(a, "clipId") ?? this.lastTranscript?.clipId;
    if (!clipId) throw new ToolFail("add_captions: provide a clipId (the spoken clip to caption).");
    const clip = this.engine.clipRef(clipId);
    if (!clip) throw new ToolFail(`add_captions: clip ${clipId} not found.`);
    const path = this.mediaPathFor({ clipId });
    if (!path) throw new ToolFail("add_captions: clip media not resolvable.");
    const words = await this.transcriptFor(clip.mediaRef, path);

    const perCaption = Math.max(1, Math.min(8, aInt(a, "wordsPerCaption") ?? 3));
    const style = (a.textStyle as Args | undefined);
    const anim = (a.textAnimation as Args | undefined) ?? { preset: "wordReveal" };
    const specs: PlaceSpec[] = [];
    const payload: { content: string; style?: Args; anim: Args }[] = [];
    for (let i = 0; i < words.length; i += perCaption) {
      const chunk = words.slice(i, i + perCaption).map((w) => ({ w, tl0: this.mediaFrameToTimeline(clip, w.startFrame), tl1: this.mediaFrameToTimeline(clip, w.endFrame) }))
        .filter((x) => x.tl0 !== null && x.tl1 !== null);
      if (chunk.length === 0) continue;
      const start = chunk[0].tl0!;
      const end = Math.max(start + 1, chunk[chunk.length - 1].tl1!);
      const id = cryptoId();
      specs.push({ mediaRef: `text-${id}`, trackIndex: this.ensureTextTrack(), startFrame: start, durationFrames: end - start, mediaType: "text", sourceClipType: "text", id });
      payload.push({ content: chunk.map((x) => x.w.text).join(" "), style, anim });
    }
    if (specs.length === 0) return err("add_captions: no spoken words fell within the clip's range.");
    // Whisper word boundaries can overlap by a frame — clamp each caption's end to the next's start
    // so consecutive captions all survive (overlapping clips on one track would overwrite each other).
    for (let i = 0; i < specs.length - 1; i++) {
      const maxDur = specs[i + 1].startFrame - specs[i].startFrame;
      if (maxDur >= 1 && specs[i].durationFrames > maxDur) specs[i].durationFrames = maxDur;
    }
    const changed = this.engine.addClips(specs);
    specs.forEach((s, i) => {
      const c = this.engine.clipRef(s.id!);
      if (!c) return;
      c.textContent = payload[i].content;
      c.textStyle ??= defaultTextStyle();
      if (payload[i].style) Object.assign(c.textStyle, payload[i].style);
      c.textAnimation = { preset: (payload[i].anim.preset as string) ?? "wordReveal", perWordFrames: aInt(payload[i].anim, "perWordFrames") ?? 6, highlight: payload[i].anim.highlight } as Clip["textAnimation"];
      c.transform = { centerX: 0.5, centerY: 0.8, width: 0.9, height: 0.2, rotation: 0, flipHorizontal: false, flipVertical: false };
    });
    this.track(changed, "Add Captions");
    return okJson({ captions: specs.length, clipIds: specs.map((s) => s.id), fromWords: words.length });
  }

  private async removeWords(a: Args): Promise<ToolResult> {
    if (!(await whisperAvailable())) return this.whisperMissing();
    const last = this.lastTranscript;
    if (!last) throw new ToolFail("remove_words: call get_transcript first to establish the word list.");
    // Resolve the clip these words map onto (the get_transcript clipId, or the first timeline clip of that media).
    let clipId = last.clipId;
    if (!clipId) {
      for (const t of this.timeline.tracks) for (const c of t.clips) if (c.mediaRef === last.mediaRef) { clipId = c.id; break; }
    }
    if (!clipId) throw new ToolFail("remove_words: no timeline clip references the transcribed media.");
    const clip = this.engine.clipRef(clipId)!;

    // words arg: integer indices or inclusive [start,end] spans into last.words.
    const idxSpans: [number, number][] = [];
    for (const raw of aArr(a, "words")) {
      if (typeof raw === "number") idxSpans.push([raw, raw]);
      else if (Array.isArray(raw) && raw.length === 2 && raw.every((n) => typeof n === "number")) idxSpans.push([raw[0] as number, raw[1] as number]);
    }
    if (idxSpans.length === 0) throw new ToolFail("remove_words: 'words' must be transcript indices or [start,end] spans.");

    const pad = Math.round(this.fps * 0.04);
    const ranges: [number, number][] = [];
    for (const [s, e] of idxSpans) {
      const first = last.words[Math.max(0, Math.min(last.words.length - 1, s))];
      const lastW = last.words[Math.max(0, Math.min(last.words.length - 1, e))];
      const tl0 = this.mediaFrameToTimeline(clip, first.startFrame);
      const tl1 = this.mediaFrameToTimeline(clip, lastW.endFrame);
      if (tl0 === null || tl1 === null) continue;
      ranges.push([Math.max(clip.startFrame, tl0 - pad), tl1 + pad]);
    }
    if (ranges.length === 0) return err("remove_words: the requested words don't fall within the clip.");
    // Merge overlapping/adjacent ranges, then ripple-delete (word-level jump cut).
    ranges.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [ranges[0]];
    for (let i = 1; i < ranges.length; i++) {
      const prev = merged[merged.length - 1];
      if (ranges[i][0] <= prev[1]) prev[1] = Math.max(prev[1], ranges[i][1]);
      else merged.push(ranges[i]);
    }
    return this.rippleDeleteRanges({ clipId, ranges: merged, units: "frames" });
  }

  // extract_palette — dominant colours (hex + prominence) of a clip/asset, for palette-driven
  // creative + brand styling. Our own median-cut over bundled-FFmpeg RGB pixels.
  private async extractPalette(a: Args): Promise<ToolResult> {
    const path = this.mediaPathFor(a);
    if (!path) throw new ToolFail("extract_palette: provide a resolvable mediaRef or clipId.");
    const colors = Math.max(2, Math.min(12, aInt(a, "colors") ?? 6));
    const pal = await extractPalette(path, colors);
    return okJson({
      swatches: pal.swatches.map((s) => ({ hex: s.hex, rgb: s.rgb, weight: Number(s.weight.toFixed(3)) })),
      note: "Sorted by prominence. Use these for on-brand text colors (add_texts textStyle) and grading targets (apply_color).",
    });
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

  // import_from_url: download a video from a URL (YouTube, etc.) with the user's yt-dlp, import it,
  // and place it on the timeline. yt-dlp is NOT bundled — the user provides it (site-policy + size).
  private async importFromUrl(a: Args): Promise<ToolResult> {
    const url = requireStr(a, "url");
    if (!/^https?:\/\//i.test(url)) throw new ToolFail("import_from_url: url must be an http(s) link.");
    if (!(await ytdlpAvailable())) {
      return err(
        "import_from_url needs yt-dlp, which isn't installed. Install it (pip install yt-dlp, or from " +
        "github.com/yt-dlp/yt-dlp) and make sure it's on PATH, then retry. This is a setup step, not a failure.",
      );
    }
    const dir = join(dataDir(), "generated");
    await mkdir(dir, { recursive: true });
    const path = await downloadUrl(url, join(dir, `dl-${cryptoId()}.%(ext)s`));
    const imp = await this.importFromPath(path, aStr(a, "name"));
    const impData = JSON.parse(imp.content[0].text) as { assetId: string; name: string; duration: number };
    const place = aBool(a, "place") !== false;
    if (place) {
      const dur = Math.max(1, Math.round((impData.duration || 5) * this.fps));
      const trackIndex = this.ensureTrack("video");
      this.engine.addClips([{ mediaRef: impData.assetId, trackIndex, startFrame: this.currentFrame, durationFrames: dur, mediaType: "video", sourceClipType: "video" }]);
      this.track(true, "Import from URL");
    }
    return okJson({ assetId: impData.assetId, name: impData.name, url, placed: place });
  }

  // generate_title (motion graphics): render an animated title MP4 locally, import it, place it.
  private async generateTitle(a: Args): Promise<ToolResult> {
    const text = requireStr(a, "text");
    const durationSeconds = aNum(a, "durationSeconds") ?? 3;
    const dir = join(dataDir(), "generated");
    await mkdir(dir, { recursive: true });
    const id = cryptoId();
    const outputPath = join(dir, `title-${id}.mp4`);
    const { renderTitle } = await import("../motion/renderTitle");
    await renderTitle({
      text,
      subtitle: aStr(a, "subtitle"),
      preset: aStr(a, "preset") as "fadeSlideUp" | undefined,
      background: aStr(a, "background"),
      accent: aStr(a, "accent"),
      color: aStr(a, "color"),
      fontSize: aInt(a, "fontSize"),
      durationSeconds,
      width: this.timeline.width,
      height: this.timeline.height,
      fps: this.fps,
      outputPath,
    });
    const asset = this.media.addAsset({
      name: `Title: ${text.slice(0, 28)}`, type: "video", duration: durationSeconds,
      source: { kind: "external", absolutePath: outputPath },
      sourceWidth: this.timeline.width, sourceHeight: this.timeline.height, sourceFPS: this.fps, hasAudio: false,
    });
    this.stateVersion++;
    const place = aBool(a, "place") !== false;
    if (place) {
      const start = this.currentFrame;
      const dur = Math.max(1, Math.round(durationSeconds * this.fps));
      const trackIndex = this.ensureTrack("video");
      this.engine.addClips([{ mediaRef: asset.id, trackIndex, startFrame: start, durationFrames: dur, mediaType: "video", sourceClipType: "video" }]);
      this.track(true, "Generate Title");
    }
    return okJson({ assetId: asset.id, name: asset.name, frames: Math.round(durationSeconds * this.fps), width: this.timeline.width, height: this.timeline.height, placed: place });
  }

  // generate_motion (Remotion): render a complex motion-graphics template to MP4, import, place.
  private async generateMotion(a: Args): Promise<ToolResult> {
    const template = requireStr(a, "template");
    const valid = ["AnimatedIntro", "LogoReveal", "DataViz", "Transition"];
    if (!valid.includes(template)) throw new ToolFail(`unknown template '${template}'. Valid: ${valid.join(", ")}`);
    const durationSeconds = aNum(a, "durationSeconds") ?? (template === "Transition" ? 1 : 4);
    const props: Record<string, unknown> = { durationSeconds };
    for (const k of ["title", "subtitle", "accent", "label"]) { const v = aStr(a, k); if (v !== undefined) props[k] = v; }
    const bars = aArr(a, "bars");
    if (bars.length) props.bars = bars;

    const dir = join(dataDir(), "generated");
    await mkdir(dir, { recursive: true });
    const outputPath = join(dir, `motion-${cryptoId()}.mp4`);
    const { renderRemotion } = await import("../motion/renderRemotion");
    const res = await renderRemotion(template, props, outputPath, remotionDir());

    const dur = res.durationInFrames / res.fps;
    const asset = this.media.addAsset({
      name: `Motion: ${template}`, type: "video", duration: dur,
      source: { kind: "external", absolutePath: outputPath },
      sourceWidth: res.width, sourceHeight: res.height, sourceFPS: res.fps, hasAudio: false,
    });
    this.stateVersion++;
    const place = aBool(a, "place") !== false;
    if (place) {
      const trackIndex = this.ensureTrack("video");
      this.engine.addClips([{ mediaRef: asset.id, trackIndex, startFrame: this.currentFrame, durationFrames: res.durationInFrames, mediaType: "video", sourceClipType: "video" }]);
      this.track(true, "Generate Motion");
    }
    return okJson({ assetId: asset.id, name: asset.name, template, frames: res.durationInFrames, width: res.width, height: res.height, engine: "remotion", placed: place });
  }

  // generate_video / generate_image (hosted, BYOK Fal/Replicate): call the provider, download the
  // result, probe it, import it, and place it on the timeline. Same auto-import contract as the
  // local generators above — so a clip the AI generates lands on the timeline in BOTH connect paths.
  private async generateHosted(kind: GenKind, a: Args): Promise<ToolResult> {
    const cfg = this.genConfig;
    const ready = cfg && (cfg.provider === "gcp-ltx" ? !!cfg.baseUrl : !!cfg.apiKey);
    if (!ready) {
      if (cfg?.provider === "gcp-ltx") {
        return err(
          "The GPU isn't started yet. Open Settings → Generation → GPU and click Start GPU (it boots your Google Cloud LTX server). " +
          "Once it's ready, retry. This is a setup step, not a failure.",
        );
      }
      return err(
        "Generation needs your own Fal or Replicate key. Open Settings → Generation in Maestro and paste your key " +
        "(pay-per-clip on your account: ~$0.02–0.10/video, ~$0.003–0.03/image). Then retry. This is a setup step, not a failure.",
      );
    }
    const prompt = requireStr(a, "prompt");
    const durationSeconds = aNum(a, "durationSeconds") ?? (kind === "video" ? 5 : 4);
    const aspectRatio = aStr(a, "aspectRatio");

    const res = await generate(cfg, kind, prompt, { durationSeconds, aspectRatio });

    // Download to the generated/ folder so it survives as a real file the render pipeline can read.
    const dir = join(dataDir(), "generated");
    await mkdir(dir, { recursive: true });
    const ext = kind === "video" ? "mp4" : (res.url.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png");
    const outputPath = join(dir, `gen-${cryptoId()}.${ext}`);
    const dl = await fetch(res.url);
    if (!dl.ok) throw new ToolFail(`Download of generated ${kind} failed: HTTP ${dl.status}`);
    await writeFile(outputPath, Buffer.from(await dl.arrayBuffer()));

    const probe = await probeMedia(outputPath);
    const type: ClipType = kind === "video" ? "video" : "image";
    const asset = this.media.addAsset({
      name: `${kind === "video" ? "Gen video" : "Gen image"}: ${prompt.slice(0, 24)}`,
      type,
      duration: probe?.duration ?? (kind === "image" ? durationSeconds : 0),
      source: { kind: "external", absolutePath: outputPath },
      sourceWidth: probe?.width, sourceHeight: probe?.height, sourceFPS: probe?.fps,
      hasAudio: kind === "video" ? probe?.hasAudio ?? false : false,
    });
    this.stateVersion++;

    const place = aBool(a, "place") !== false;
    if (place) {
      const dur = Math.max(1, Math.round((probe?.duration && kind === "video" ? probe.duration : durationSeconds) * this.fps));
      const trackIndex = this.ensureTrack("video");
      this.engine.addClips([{ mediaRef: asset.id, trackIndex, startFrame: this.currentFrame, durationFrames: dur, mediaType: type, sourceClipType: type }]);
      this.track(true, kind === "video" ? "Generate Video" : "Generate Image");
    }
    return okJson({ assetId: asset.id, name: asset.name, kind, provider: cfg.provider, width: probe?.width, height: probe?.height, placed: place });
  }

  async execute(name: string, args: Args): Promise<ToolResult> {
    const READ_ONLY = new Set([
      "get_timeline", "get_media", "inspect_media", "get_transcript", "inspect_timeline",
      "search_media", "inspect_color", "list_folders", "list_models", "send_feedback", "export_project",
      "list_skills", "read_skill", "analyze_audio", "extract_palette", "see_video", "get_transcript",
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
      // Motion graphics (Maestro extension)
      case "generate_title": return this.generateTitle(a);
      case "generate_motion": return this.generateMotion(a);
      // Analysis + perception (Maestro extension)
      case "analyze_audio": return this.analyzeAudio(a);
      case "extract_palette": return this.extractPalette(a);
      case "see_video": return this.seeVideo(a);
      // Read
      case "get_timeline": return this.getTimeline(a);
      case "get_media": return okJson({ media: this.media.mediaRows() });
      case "inspect_media": return this.unavailable("inspect_media", "transcription/frame sampling");
      case "get_transcript": return this.getTranscript(a);
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
      case "remove_words": return this.removeWords(a);
      case "sync_audio": return this.unavailable("sync_audio", "audio cross-correlation");
      case "undo": return this.undo();
      case "apply_layout": return this.applyLayout(a);
      // Text
      case "add_texts": return this.addTexts(a);
      case "update_text": return this.updateText(a);
      case "add_captions": return this.addCaptions(a);
      // Color / effects
      case "apply_effect": return this.applyEffectOrColor(a, false);
      case "apply_color": return this.applyEffectOrColor(a, true);
      // Media library
      case "import_media": return this.importMedia(a);
      case "import_from_url": return this.importFromUrl(a);
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
      // Generation — hosted (BYOK Fal/Replicate). generate_audio stays stubbed (no cheap hosted TTS wired).
      case "generate_video": return this.generateHosted("video", a);
      case "generate_image": return this.generateHosted("image", a);
      case "generate_audio":
        return err("generate_audio is not wired in this build. Use generate_title for animated text or import audio.");
      case "upscale_media":
        return err("upscale_media is not wired in this build.");
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
        return resolveRenderMediaPath(asset.source, this.projectDir ?? ".", publicDir());
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
