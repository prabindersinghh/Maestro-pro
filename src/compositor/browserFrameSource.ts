// Browser frame source: real decoded pixels for the live preview.
//  - Still images decode via createImageBitmap.
//  - Video clips use a <video> element. Paused = seek to the clip's source time (frame-accurate
//    scrubbing). Playing = the element plays in REAL TIME (native decode, the web analog of
//    AVPlayer in Preview/VideoEngine.swift) and its live frame is drawn every animation frame —
//    no per-frame seeking, so playback is smooth. Drift beyond a threshold is nudged back.

import type { Clip } from "../model/types";
import { type FrameImage, type FrameSource, sourceConsumedIndex } from "./frameSource";

interface VideoState {
  el: HTMLVideoElement;
  ready: boolean;
  seekedTime: number;
  wantTime: number;
}

export class BrowserFrameSource implements FrameSource {
  private bitmaps = new Map<string, FrameImage>();
  private loadingImg = new Set<string>();
  private videos = new Map<string, VideoState>();
  private playing = false;
  private touched = new Set<string>();

  constructor(
    private readonly srcFor: (mediaRef: string) => string | null,
    private readonly fps: number,
    private readonly onReady: () => void,
  ) {}

  /** Enter/leave real-time playback. On stop, pause every element. */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (!playing) for (const v of this.videos.values()) { try { v.el.pause(); } catch { /* ignore */ } }
  }

  /** Diagnostics for live verification: playback state + each video element's real-time clock. */
  get diagnostics(): { playing: boolean; videos: { paused: boolean; currentTime: number; rate: number; w: number }[] } {
    return {
      playing: this.playing,
      videos: [...this.videos.values()].map((v) => ({ paused: v.el.paused, currentTime: v.el.currentTime, rate: v.el.playbackRate, w: v.el.videoWidth })),
    };
  }

  /** After compositing a frame, pause any video that wasn't drawn (playhead left the clip). */
  sweep(): void {
    if (this.playing) {
      for (const [ref, v] of this.videos) if (!this.touched.has(ref) && !v.el.paused) { try { v.el.pause(); } catch { /* ignore */ } }
    }
    this.touched.clear();
  }

  imageFor(clip: Clip, frame: number): FrameImage | null {
    const src = this.srcFor(clip.mediaRef);
    if (!src) return null;
    if (clip.mediaType === "image") return this.imageBitmap(clip.mediaRef, src);
    if (clip.mediaType === "video") return this.videoFrame(clip, src, frame);
    return null;
  }

  private imageBitmap(mediaRef: string, src: string): FrameImage | null {
    const cached = this.bitmaps.get(mediaRef);
    if (cached) return cached;
    if (!this.loadingImg.has(mediaRef)) {
      this.loadingImg.add(mediaRef);
      void (async () => {
        try {
          const bmp = await createImageBitmap(await (await fetch(src)).blob());
          this.bitmaps.set(mediaRef, { image: bmp, width: bmp.width, height: bmp.height });
          this.onReady();
        } catch {
          /* leave as tile */
        }
      })();
    }
    return null;
  }

  private timeFor(clip: Clip, frame: number): number {
    return (clip.trimStartFrame + sourceConsumedIndex(clip, frame)) / this.fps;
  }

  private videoFrame(clip: Clip, src: string, frame: number): FrameImage | null {
    let v = this.videos.get(clip.mediaRef);
    if (!v) {
      const el = document.createElement("video");
      el.muted = true;
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.playsInline = true;
      el.src = src;
      v = { el, ready: false, seekedTime: -1, wantTime: -1 };
      const state = v;
      el.addEventListener("loadeddata", () => { state.ready = true; this.seekTo(state, this.timeFor(clip, frame)); });
      el.addEventListener("seeked", () => { state.seekedTime = el.currentTime; this.onReady(); });
      this.videos.set(clip.mediaRef, v);
      el.load();
      return null;
    }
    if (!v.ready || v.el.videoWidth === 0) return null;
    const t = this.timeFor(clip, frame);
    this.touched.add(clip.mediaRef);

    if (this.playing) {
      const rate = clip.speed > 0 ? clip.speed : 1;
      if (v.el.paused) {
        try { v.el.currentTime = t; } catch { /* not seekable yet */ }
        v.el.playbackRate = rate;
        void v.el.play().catch(() => undefined);
      } else {
        if (Math.abs(v.el.currentTime - t) > 0.25) { try { v.el.currentTime = t; } catch { /* ignore */ } }
        if (v.el.playbackRate !== rate) v.el.playbackRate = rate;
      }
      return { image: v.el, width: v.el.videoWidth, height: v.el.videoHeight }; // live frame — smooth
    }

    // Paused: frame-accurate seek for scrubbing.
    if (Math.abs(v.seekedTime - t) <= 1 / this.fps) {
      return { image: v.el, width: v.el.videoWidth, height: v.el.videoHeight };
    }
    this.seekTo(v, t);
    return null;
  }

  private seekTo(v: VideoState, t: number): void {
    if (v.wantTime !== t) {
      v.wantTime = t;
      try { v.el.currentTime = t; } catch { /* not seekable yet */ }
    }
  }
}
