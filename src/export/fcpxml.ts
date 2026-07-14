// FCPXML exporter → DaVinci Resolve / Final Cut Pro. Ported from Export/FCPXMLExporter.swift.
// Transports: placement/trims, speed (timeMap), lane order, enabled; text + font/size/color/
// alignment; position/scale/rotation/flip (+kf); crop; opacity (+kf); static volume.
// Does NOT: keyframed audio volume/fades, text bg/border, crop kf, title rotation/scale, color/effects, lottie.

import type { Clip, TextStyle, Timeline, Transform } from "../model/types";
import { sourceDurationFrames as clipSourceDurationFrames } from "../model/helpers";
import { keyframeFrames, rawOpacityAt, rotationAt, sizeAt, transformAt, dbFromLinear, interpolationAt } from "../model/clipSampling";
import { isVisual } from "../model/enums";
import { render, type XmlNode } from "./xmlTree";
import { fileURLString, type ExportEntry, type ExportMediaResolver } from "./resolver";

export type FCPXMLVersion = "1.10" | "1.11" | "1.12" | "1.13" | "1.14";
export const FCPXML_DEFAULT_VERSION: FCPXMLVersion = "1.10";

// FCPXMLNode ≡ XmlNode (attributes-first, matches the Swift FCPXMLNode struct).
type Node = XmlNode;
const n = (name: string, attributes: [string, string][] = [], children: Node[] = []): Node => ({ name, attributes, children });
const nt = (name: string, attributes: [string, string][], text: string): Node => ({ name, attributes, text, children: [] });
const renderNode = (node: Node): string => render(node, 0);

function secondsToFrame(seconds: number, fps: number): number {
  return Math.trunc(seconds * fps);
}
function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y !== 0) { [x, y] = [y, x % y]; }
  return Math.max(1, x);
}
function formatNumber(value: number): string {
  const rounded = Math.round(value * 10000) / 10000;
  if (Number.isInteger(rounded)) return String(rounded === 0 ? 0 : rounded);
  let s = rounded.toFixed(4);
  while (s.endsWith("0")) s = s.slice(0, -1);
  if (s.endsWith(".")) s = s.slice(0, -1);
  return s;
}

interface EmittableClip { clip: Clip; lane: number; enabled: boolean }
interface MediaResource {
  mediaRef: string;
  assetId: string;
  formatId: string | null;
  compoundId: string | null;
  entry: ExportEntry;
  path: string;
  durationFrames: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export function exportFCPXML(timeline: Timeline, resolver: ExportMediaResolver, version: FCPXMLVersion = FCPXML_DEFAULT_VERSION): string {
  return new Builder(timeline, resolver, version).build();
}

class Builder {
  private readonly fps: number;
  private readonly seqWidth: number;
  private readonly seqHeight: number;
  private readonly sequenceFormatId = "r1";
  private readonly titleEffectId = "titleBasic";
  private resourceIndex = new Map<string, number>();
  private resources: MediaResource[] = [];
  private nextTextStyleId = 1;
  private linkedAudioForVideo = new Map<string, Clip>();
  private redundantAudioClipIds = new Set<string>();

  constructor(private readonly timeline: Timeline, private readonly resolver: ExportMediaResolver, private readonly version: FCPXMLVersion) {
    this.fps = Math.max(1, timeline.fps);
    this.seqWidth = timeline.width;
    this.seqHeight = timeline.height;
  }

  build(): string {
    const clips = this.emittableClips();
    this.collectResources(clips);
    this.indexLinkedPairs(clips);
    const hasTitles = clips.some((c) => c.clip.mediaType === "text");
    const root = n("fcpxml", [["version", this.version]], [
      this.resourcesNode(hasTitles),
      this.libraryNode(clips),
    ]);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE fcpxml>\n' + renderNode(root);
  }

  private indexLinkedPairs(clips: EmittableClip[]): void {
    const byGroup = new Map<string, { videos: EmittableClip[]; audios: EmittableClip[] }>();
    for (const item of clips) {
      const g = item.clip.linkGroupId;
      if (!g) continue;
      const bucket = byGroup.get(g) ?? { videos: [], audios: [] };
      if (item.clip.mediaType === "video" || item.clip.mediaType === "image") bucket.videos.push(item);
      else if (item.clip.mediaType === "audio") bucket.audios.push(item);
      byGroup.set(g, bucket);
    }
    for (const { videos, audios } of byGroup.values()) {
      if (videos.length !== 1 || audios.length !== 1) continue;
      const v = videos[0].clip, a = audios[0].clip;
      if (v.mediaRef === a.mediaRef && videos[0].enabled === audios[0].enabled &&
          v.startFrame === a.startFrame && v.durationFrames === a.durationFrames &&
          v.trimStartFrame === a.trimStartFrame && Math.abs(v.speed - a.speed) < 0.0001) {
        this.linkedAudioForVideo.set(v.id, a);
        this.redundantAudioClipIds.add(a.id);
      }
    }
  }

  private resourcesNode(hasTitles: boolean): Node {
    const children: Node[] = [
      n("format", [
        ["id", this.sequenceFormatId],
        ["name", this.sequenceFormatName(this.seqWidth, this.seqHeight, this.fps)],
        ["frameDuration", this.frameDuration(this.fps)],
        ["width", `${this.seqWidth}`],
        ["height", `${this.seqHeight}`],
        ["colorSpace", "1-1-1 (Rec. 709)"],
      ]),
    ];
    if (hasTitles) {
      children.push(n("effect", [
        ["id", this.titleEffectId],
        ["name", "Basic Title"],
        ["uid", ".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"],
      ]));
    }
    for (const r of this.resources) { const f = this.formatNode(r); if (f) children.push(f); }
    for (const r of this.resources) children.push(this.assetNode(r));
    for (const r of this.resources) { const c = this.compoundClipNode(r); if (c) children.push(c); }
    return n("resources", [], children);
  }

  private compoundClipNode(resource: MediaResource): Node | null {
    if (!resource.compoundId) return null;
    const dur = this.time(resource.durationFrames);
    let innerClip: Node;
    if (resource.hasAudio) {
      innerClip = n("asset-clip", [
        ["ref", resource.assetId], ["name", resource.entry.name], ["duration", dur],
        ["start", "0s"], ["offset", "0s"], ["format", resource.formatId ?? this.sequenceFormatId],
      ]);
    } else {
      const video = n("video", [["ref", resource.assetId], ["duration", dur], ["start", "0s"], ["offset", "0s"]]);
      innerClip = n("clip", [
        ["name", resource.entry.name], ["duration", dur], ["start", "0s"], ["offset", "0s"],
        ["format", resource.formatId ?? this.sequenceFormatId],
      ], [video]);
    }
    const sequence = n("sequence", [
      ["format", resource.formatId ?? this.sequenceFormatId], ["duration", dur], ["tcStart", "0s"], ["tcFormat", "NDF"],
    ], [n("spine", [], [innerClip])]);
    return n("media", [["id", resource.compoundId], ["name", resource.entry.name]], [sequence]);
  }

  private libraryNode(clips: EmittableClip[]): Node {
    return n("library", [], [n("event", [["name", "Kaestral Export"]], [this.projectNode(clips)])]);
  }

  private projectNode(clips: EmittableClip[]): Node {
    const total = this.totalFrames();
    const duration = this.time(total);
    const spine: Node = total > 0
      ? n("spine", [], [n("gap", [["name", "Timeline"], ["offset", "0s"], ["start", "0s"], ["duration", duration]], this.storyNodes(clips))])
      : n("spine");
    return n("project", [["name", "Timeline Export"]], [
      n("sequence", [
        ["format", this.sequenceFormatId], ["duration", duration], ["tcStart", "0s"], ["tcFormat", "NDF"],
        ["audioLayout", "stereo"], ["audioRate", "48k"],
      ], [spine]),
    ]);
  }

  private storyNodes(clips: EmittableClip[]): Node[] {
    return clips
      .filter((item) => !this.redundantAudioClipIds.has(item.clip.id))
      .sort((a, b) => (a.clip.startFrame !== b.clip.startFrame ? a.clip.startFrame - b.clip.startFrame : a.lane - b.lane))
      .map((item) => (item.clip.mediaType === "text" ? this.titleNode(item) : item.clip.mediaType === "lottie" ? null : this.assetClipNode(item)))
      .filter((x): x is Node => x !== null);
  }

  private assetClipNode(item: EmittableClip): Node | null {
    const clip = item.clip;
    const idx = this.resourceIndex.get(clip.mediaRef);
    if (idx === undefined) return null;
    const resource = this.resources[idx];

    if (clip.mediaType !== "audio" && resource.compoundId) {
      const linkedAudio = this.linkedAudioForVideo.get(clip.id);
      const attrs: [string, string][] = [
        ["ref", resource.compoundId], ["name", this.resolver.displayName(clip.mediaRef)],
        ["lane", `${item.lane}`], ["offset", this.time(clip.startFrame)], ["start", this.clipStart(clip)],
        ["duration", this.time(clip.durationFrames)], ["enabled", item.enabled ? "1" : "0"],
      ];
      if (!linkedAudio) attrs.push(["srcEnable", "video"]);
      return n("ref-clip", attrs, compact([
        this.timeMapNode(clip, resource.durationFrames),
        n("adjust-conform", [["type", "fit"]]),
        this.cropNode(clip),
        this.transformNode(clip),
        this.blendNode(clip),
        linkedAudio ? this.volumeNode(linkedAudio) : null,
      ]));
    }

    if (clip.mediaType === "audio" && resource.compoundId) {
      const attrs: [string, string][] = [
        ["ref", resource.compoundId], ["name", this.resolver.displayName(clip.mediaRef)],
        ["lane", `${item.lane}`], ["offset", this.time(clip.startFrame)], ["start", this.clipStart(clip)],
        ["duration", this.time(clip.durationFrames)], ["enabled", item.enabled ? "1" : "0"], ["srcEnable", "audio"],
      ];
      return n("ref-clip", attrs, compact([this.timeMapNode(clip, resource.durationFrames), this.volumeNode(clip)]));
    }

    const attrs: [string, string][] = [
      ["ref", resource.assetId], ["name", this.resolver.displayName(clip.mediaRef)],
      ["lane", `${item.lane}`], ["offset", this.time(clip.startFrame)], ["start", this.clipStart(clip)],
      ["duration", this.time(clip.durationFrames)], ["enabled", item.enabled ? "1" : "0"],
    ];
    return n("asset-clip", attrs, compact([this.timeMapNode(clip, resource.durationFrames), this.volumeNode(clip)]));
  }

  private titleNode(item: EmittableClip): Node | null {
    const clip = item.clip;
    if (!clip.textContent) return null;
    const style = clip.textStyle ?? defaultTextStyleLite();
    const styleId = `textStyle${this.nextTextStyleId++}`;
    const textNodes: Node[] = [
      n("text", [], [nt("text-style", [["ref", styleId]], clip.textContent)]),
      n("text-style-def", [["id", styleId]], [n("text-style", this.textStyleAttributes(style))]),
    ];
    textNodes.push(...this.titleTransformNodes(clip.transform));
    const blend = this.blendNode(clip);
    if (blend) textNodes.push(blend);
    return n("title", [
      ["ref", this.titleEffectId], ["name", clip.textContent], ["lane", `${item.lane}`],
      ["offset", this.time(clip.startFrame)], ["start", "0s"], ["duration", this.time(clip.durationFrames)],
      ["enabled", item.enabled ? "1" : "0"],
    ], textNodes);
  }

  private blendNode(clip: Clip): Node | null {
    const frames = keyframeFrames(clip, "opacity");
    if (!(clip.opacity < 0.9995 || frames.length > 0)) return null;
    const children: Node[] = [];
    if (frames.length > 0) {
      children.push(this.keyframeParam("amount", formatNumber(clip.opacity), clip, "opacity", frames, (f) => formatNumber(rawOpacityAt(clip, f))));
    }
    return n("adjust-blend", [["amount", formatNumber(clip.opacity)]], children);
  }

  private transformNode(clip: Clip): Node | null {
    const t = clip.transform;
    const posFrames = keyframeFrames(clip, "position");
    const rotFrames = keyframeFrames(clip, "rotation");
    const scaleFrames = keyframeFrames(clip, "scale");
    const base = this.scaleValue(t.width, t.height, clip);
    const moved = Math.abs(t.centerX - 0.5) > 0.0005 || Math.abs(t.centerY - 0.5) > 0.0005;
    const rotated = Math.abs(t.rotation) > 0.005;
    const scaled = base !== "1 1";
    if (!(moved || rotated || scaled || posFrames.length || rotFrames.length || scaleFrames.length)) return null;

    const attrs: [string, string][] = [["scale", base]];
    if (rotated || rotFrames.length) attrs.push(["rotation", formatNumber(-t.rotation)]);
    attrs.push(["anchor", "0 0"], ["position", this.positionValue(t)]);

    const params: Node[] = [];
    if (scaleFrames.length) {
      params.push(this.keyframeParam("scale", base, clip, "scale", scaleFrames, (f) => {
        const s = sizeAt(clip, f);
        return this.scaleValue(s.width, s.height, clip);
      }));
    }
    if (posFrames.length) {
      params.push(this.keyframeParam("position", this.positionValue(t), clip, "position", posFrames, (f) => this.positionValue(transformAt(clip, f))));
    }
    if (rotFrames.length) {
      params.push(this.keyframeParam("rotation", formatNumber(-t.rotation), clip, "rotation", rotFrames, (f) => formatNumber(-rotationAt(clip, f))));
    }
    return n("adjust-transform", attrs, params);
  }

  private scaleValue(width: number, height: number, clip: Clip): string {
    let sx = width, sy = height;
    const entry = this.resolver.entry(clip.mediaRef);
    if (entry && entry.sourceWidth && entry.sourceHeight && entry.sourceWidth > 0 && entry.sourceHeight > 0) {
      const sourceAspect = entry.sourceWidth / entry.sourceHeight;
      const frameAspect = this.seqWidth / this.seqHeight;
      const fitW = sourceAspect >= frameAspect ? 1.0 : sourceAspect / frameAspect;
      const fitH = sourceAspect >= frameAspect ? frameAspect / sourceAspect : 1.0;
      sx = width / fitW;
      sy = height / fitH;
    }
    if (clip.transform.flipHorizontal) sx = -sx;
    if (clip.transform.flipVertical) sy = -sy;
    return `${formatNumber(sx)} ${formatNumber(sy)}`;
  }

  private keyframeParam(name: string, base: string, clip: Clip, property: "opacity" | "scale" | "position" | "rotation", frames: number[], value: (f: number) => string): Node {
    const keyframes = [...frames].sort((a, b) => a - b).map((f) => {
      const attrs: [string, string][] = [["time", this.keyframeTime(f, clip)]];
      if (interpolationAt(clip, property, f) === "linear") attrs.push(["curve", "linear"]);
      attrs.push(["value", value(f)]);
      return n("keyframe", attrs);
    });
    return n("param", [["name", name], ["value", base]], [n("keyframeAnimation", [], keyframes)]);
  }

  private keyframeTime(f: number, clip: Clip): string {
    if (Math.abs(clip.speed - 1.0) <= 0.001) return this.time(f - clip.startFrame);
    const { p, q } = this.rationalSpeed(clip.speed);
    const num = clip.trimStartFrame * q + (f - clip.startFrame) * p;
    return this.rationalTime(num, this.fps * p);
  }

  private cropNode(clip: Clip): Node | null {
    const c = clip.crop;
    if (c.left === 0 && c.top === 0 && c.right === 0 && c.bottom === 0) return null;
    return n("adjust-crop", [["mode", "trim"]], [
      n("trim-rect", [
        ["top", formatNumber(c.top * 100)], ["right", formatNumber(c.right * 100)],
        ["bottom", formatNumber(c.bottom * 100)], ["left", formatNumber(c.left * 100)],
      ]),
    ]);
  }

  private volumeNode(clip: Clip): Node | null {
    if (Math.abs(clip.volume - 1.0) <= 0.0005) return null;
    return n("adjust-volume", [["amount", formatNumber(dbFromLinear(clip.volume))]]);
  }

  private clipStart(clip: Clip): string {
    if (Math.abs(clip.speed - 1.0) <= 0.001) return this.time(clip.trimStartFrame);
    const { p, q } = this.rationalSpeed(clip.speed);
    return this.rationalTime(clip.trimStartFrame * q, this.fps * p);
  }

  private timeMapNode(clip: Clip, mediaFrames: number): Node | null {
    if (Math.abs(clip.speed - 1.0) <= 0.001 || mediaFrames <= 0) return null;
    const { p, q } = this.rationalSpeed(clip.speed);
    return n("timeMap", [["frameSampling", "floor"]], [
      n("timept", [["time", "0s"], ["value", "0s"], ["interp", "linear"]]),
      n("timept", [["time", this.rationalTime(mediaFrames * q, this.fps * p)], ["value", this.time(mediaFrames)], ["interp", "linear"]]),
    ]);
  }

  private rationalSpeed(speed: number): { p: number; q: number } {
    let best = { p: 1, q: 1 }, bestErr = Infinity;
    for (let q = 1; q <= 1000; q++) {
      const p = Math.round(speed * q);
      if (p <= 0) continue;
      const err = Math.abs(speed - p / q);
      if (err < bestErr) { best = { p, q }; bestErr = err; if (err === 0) break; }
    }
    return best;
  }

  private rationalTime(num: number, den: number): string {
    if (num === 0) return "0s";
    const g = gcd(Math.abs(num), Math.abs(den));
    const nn = num / g, d = den / g;
    return d === 1 ? `${nn}s` : `${nn}/${d}s`;
  }

  private collectResources(clips: EmittableClip[]): void {
    interface Caps { mediaRefs: string[]; hasVideo: boolean; hasAudio: boolean; duration: number; entry: ExportEntry; path: string }
    const order: string[] = [];
    const caps = new Map<string, Caps>();
    for (const item of clips) {
      const clip = item.clip;
      if (clip.mediaType === "text" || clip.mediaType === "lottie") continue;
      const entry = this.resolver.entry(clip.mediaRef);
      const path = this.resolver.resolvePath(clip.mediaRef);
      if (!entry || !path) continue;
      const key = path;
      const duration = this.sourceDurationFramesFor(entry, clip);
      const isVis = clip.mediaType !== "audio";
      const isAud = clip.mediaType === "audio" || (clip.mediaType === "video" && entry.hasAudio === true);
      let c = caps.get(key);
      if (!c) { c = { mediaRefs: [], hasVideo: false, hasAudio: false, duration: 0, entry, path }; order.push(key); }
      if (!c.mediaRefs.includes(clip.mediaRef)) c.mediaRefs.push(clip.mediaRef);
      c.hasVideo = c.hasVideo || isVis;
      c.hasAudio = c.hasAudio || isAud;
      c.duration = Math.max(c.duration, duration);
      caps.set(key, c);
    }
    for (const key of order) {
      const c = caps.get(key);
      if (!c) continue;
      const id = this.resources.length + 1;
      for (const ref of c.mediaRefs) this.resourceIndex.set(ref, this.resources.length);
      this.resources.push({
        mediaRef: c.mediaRefs[0] ?? c.entry.id,
        assetId: `asset${id}`,
        formatId: c.hasVideo ? `r${id + 1}` : null,
        compoundId: c.hasVideo ? `media${id}` : null,
        entry: c.entry, path: c.path, durationFrames: c.duration, hasVideo: c.hasVideo, hasAudio: c.hasAudio,
      });
    }
  }

  private formatNode(resource: MediaResource): Node | null {
    if (!resource.formatId) return null;
    const width = resource.entry.sourceWidth ?? this.seqWidth;
    const height = resource.entry.sourceHeight ?? this.seqHeight;
    const rawFPS = resource.entry.sourceFPS ?? this.fps;
    return n("format", [
      ["id", resource.formatId], ["name", this.videoFormatName(width, height, rawFPS)],
      ["frameDuration", this.frameDuration(rawFPS)], ["width", `${width}`], ["height", `${height}`],
      ["colorSpace", "1-1-1 (Rec. 709)"],
    ]);
  }

  private assetNode(resource: MediaResource): Node {
    const attrs: [string, string][] = [
      ["id", resource.assetId], ["name", resource.entry.name], ["start", "0s"], ["duration", this.time(resource.durationFrames)],
    ];
    if (resource.hasVideo) {
      attrs.push(["hasVideo", "1"], ["videoSources", "1"]);
      if (resource.formatId) attrs.push(["format", resource.formatId]);
    }
    if (resource.hasAudio) attrs.push(["hasAudio", "1"], ["audioSources", "1"], ["audioChannels", "2"], ["audioRate", "48000"]);
    return n("asset", attrs, [n("media-rep", [["kind", "original-media"], ["src", fileURLString(resource.path)]])]);
  }

  private sourceDurationFramesFor(entry: ExportEntry, clip: Clip): number {
    const manifestFrames = Math.max(0, secondsToFrame(entry.duration, this.fps));
    return Math.max(manifestFrames, clipSourceDurationFrames(clip));
  }

  private emittableClips(): EmittableClip[] {
    const visualTrackCount = this.timeline.tracks.filter((t) => isVisual(t.type)).length;
    let visualOrdinal = 0, audioOrdinal = 0;
    const clips: EmittableClip[] = [];
    for (const track of this.timeline.tracks) {
      let lane: number, enabled: boolean;
      if (isVisual(track.type)) { lane = visualTrackCount - visualOrdinal; enabled = !track.hidden; visualOrdinal++; }
      else if (track.type === "audio") { lane = -(audioOrdinal + 1); enabled = !track.muted; audioOrdinal++; }
      else continue;
      for (const clip of track.clips.filter((c) => this.isEmittable(c)).sort((a, b) => a.startFrame - b.startFrame)) {
        clips.push({ clip, lane, enabled });
      }
    }
    return clips;
  }

  private isEmittable(clip: Clip): boolean {
    if (clip.durationFrames <= 0) return false;
    if (clip.mediaType === "text") return !!clip.textContent;
    if (clip.mediaType === "lottie") return false;
    return this.resolver.resolvePath(clip.mediaRef) !== undefined;
  }

  private time(frames: number): string {
    if (frames === 0) return "0s";
    const divisor = gcd(Math.abs(frames), this.fps);
    const numerator = frames / divisor;
    const denominator = this.fps / divisor;
    return denominator === 1 ? `${numerator}s` : `${numerator}/${denominator}s`;
  }

  private videoFormatName(width: number, height: number, rawFPS: number): string {
    return this.recognizedVideoFormatName(width, height, rawFPS) ?? `FFVideoFormat${width}x${height}p${this.formatRateSuffix(rawFPS)}`;
  }
  private sequenceFormatName(width: number, height: number, rawFPS: number): string {
    return this.recognizedVideoFormatName(width, height, rawFPS) ?? "FFVideoFormatRateUndefined";
  }
  private recognizedVideoFormatName(width: number, height: number, rawFPS: number): string | null {
    const rate = this.formatRateSuffix(rawFPS);
    if (width === 1280 && height === 720) return `FFVideoFormat720p${rate}`;
    if (width === 1920 && height === 1080) return `FFVideoFormat1080p${rate}`;
    if (width === 3840 && height === 2160) return `FFVideoFormat3840x2160p${rate}`;
    if (width === 4096 && height === 2160) return `FFVideoFormat4096x2160p${rate}`;
    return null;
  }
  private formatRateSuffix(rawFPS: number): string {
    const rounded = Math.max(1, Math.round(rawFPS));
    const ntscRate = (rounded * 1000) / 1001;
    if (Math.abs(rawFPS - ntscRate) < Math.abs(rawFPS - rounded)) {
      const fps100 = Math.round(ntscRate * 100);
      return `${Math.floor(fps100 / 100)}${String(fps100 % 100).padStart(2, "0")}`;
    }
    return `${rounded}`;
  }
  private frameDuration(rawFPS: number): string {
    const rounded = Math.max(1, Math.round(rawFPS));
    const ntscRate = (rounded * 1000) / 1001;
    if (Math.abs(rawFPS - ntscRate) < Math.abs(rawFPS - rounded)) return `1001/${rounded * 1000}s`;
    return `1/${rounded}s`;
  }

  private colorString(color: { r: number; g: number; b: number; a: number }): string {
    return `${formatNumber(color.r)} ${formatNumber(color.g)} ${formatNumber(color.b)} ${formatNumber(color.a)}`;
  }

  private textStyleAttributes(style: TextStyle): [string, string][] {
    const family = fontFamilyFallback(style.fontName);
    const face = fontFaceFallback(style.isBold, style.isItalic);
    const fontSize = style.fontSize * style.fontScale;
    return [
      ["font", family], ["fontFace", face], ["fontSize", formatNumber(fontSize)],
      ["fontColor", this.colorString(style.color)], ["alignment", style.alignment],
    ];
  }

  private titleTransformNodes(transform: Transform): Node[] {
    return [
      n("adjust-conform", [["type", "fit"]]),
      n("adjust-transform", [["scale", "1 1"], ["anchor", "0 0"], ["position", this.positionValue(transform)]]),
    ];
  }

  private positionValue(transform: Transform): string {
    const unit = this.seqHeight / 100.0;
    const x = ((transform.centerX - 0.5) * this.seqWidth) / unit;
    const y = ((0.5 - transform.centerY) * this.seqHeight) / unit;
    return `${formatNumber(x)} ${formatNumber(y)}`;
  }

  private totalFrames(): number {
    let max = 0;
    for (const t of this.timeline.tracks) for (const c of t.clips) max = Math.max(max, c.startFrame + c.durationFrames);
    return max;
  }
}

function compact(nodes: (Node | null)[]): Node[] {
  return nodes.filter((x): x is Node => x !== null);
}
function fontFamilyFallback(fontName: string): string {
  return fontName.split("-", 1)[0] || fontName;
}
function fontFaceFallback(isBold: boolean, isItalic: boolean): string {
  if (isBold && isItalic) return "Bold Italic";
  if (isBold) return "Bold";
  if (isItalic) return "Italic";
  return "Regular";
}
function defaultTextStyleLite(): TextStyle {
  return {
    fontName: "Helvetica-Bold", fontSize: 96, fontScale: 1, isBold: true, isItalic: false,
    color: { r: 1, g: 1, b: 1, a: 1 }, alignment: "center",
    shadow: { enabled: true, color: { r: 0, g: 0, b: 0, a: 0.6 }, offsetX: 0, offsetY: -2, blur: 6 },
    background: { enabled: false, color: { r: 0, g: 0, b: 0, a: 0.6 } },
    border: { enabled: false, color: { r: 0, g: 0, b: 0, a: 1 } },
  };
}
