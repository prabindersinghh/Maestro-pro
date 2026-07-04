// A representative in-memory project so the editor has real, decodable content on first launch.
// Visual clips reference REAL bundled media in public/ (served for the preview and resolvable on
// disk for the render), so opening the app shows actual footage — not placeholder tiles.

import { MediaLibrary } from "../mcp/mediaLibrary";
import { defaultClip, defaultTrack, defaultTimeline, defaultTextStyle } from "../model/defaults";
import type { Clip, Timeline } from "../model/types";

function clip(over: {
  id: string; mediaRef: string; start: number; dur: number;
  mediaType?: Clip["mediaType"]; trimStart?: number;
}): Clip {
  const c = defaultClip({
    mediaRef: over.mediaRef, startFrame: over.start, durationFrames: over.dur, id: over.id,
    mediaType: over.mediaType ?? "video",
  });
  if (over.trimStart) c.trimStartFrame = over.trimStart;
  return c;
}

export function demoProject(): { timeline: Timeline; media: MediaLibrary } {
  const media = new MediaLibrary();
  // Real bundled media (public/ → served in dev + Tauri, on disk for the render).
  media.addAsset({ id: "a-video", name: "Sample Clip.mp4", type: "video", duration: 6, source: { kind: "external", absolutePath: "/sample-video.mp4" }, sourceWidth: 640, sourceHeight: 360, sourceFPS: 30, hasAudio: false });
  media.addAsset({ id: "a-image", name: "Logo.png", type: "image", duration: 6, source: { kind: "external", absolutePath: "/sample-image.png" }, sourceWidth: 600, sourceHeight: 600 });
  media.addAsset({ id: "a-music", name: "Music Bed.m4a", type: "audio", duration: 12, source: { kind: "external", absolutePath: "/sample-audio.m4a" }, hasAudio: true });

  // Title (text) — top track.
  const title = clip({ id: "c-title", mediaRef: "text-title", start: 0, dur: 150, mediaType: "text" });
  title.textContent = "Maestro";
  title.textStyle = { ...defaultTextStyle(), fontSize: 84 };
  title.transform = { centerX: 0.5, centerY: 0.82, width: 0.9, height: 0.2, rotation: 0, flipHorizontal: false, flipVertical: false };

  // Logo image as a bottom-right picture-in-picture inset.
  const logo = clip({ id: "c-logo", mediaRef: "a-image", start: 0, dur: 180, mediaType: "image" });
  logo.transform = { centerX: 0.82, centerY: 0.22, width: 0.22, height: 0.22, rotation: 0, flipHorizontal: false, flipVertical: false };

  // Main footage (full frame) — the animated gradient clip, twice (a cut at 90).
  const heroA = clip({ id: "c-hero-a", mediaRef: "a-video", start: 0, dur: 90 });
  const heroB = clip({ id: "c-hero-b", mediaRef: "a-video", start: 90, dur: 90, trimStart: 90 });

  const music = clip({ id: "c-music", mediaRef: "a-music", start: 0, dur: 300, mediaType: "audio" });

  return {
    timeline: {
      ...defaultTimeline(),
      fps: 30,
      width: 1280,
      height: 720,
      settingsConfigured: true,
      tracks: [
        { ...defaultTrack("text", "t-title"), clips: [title] },
        { ...defaultTrack("video", "t-overlay"), clips: [logo] },
        { ...defaultTrack("video", "t-main"), clips: [heroA, heroB] },
        { ...defaultTrack("audio", "t-music"), clips: [music] },
      ],
    },
    media,
  };
}
