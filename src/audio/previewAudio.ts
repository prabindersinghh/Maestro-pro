// Preview audio playback — the Web Audio equivalent of CompositionBuilder's audio mix
// (Preview/CompositionBuilder.swift): each unmuted audio-track clip is scheduled with its source
// trim offset, speed (playbackRate), static volume, and linear head/tail fades, aligned to the
// playhead. AVFoundation's AVMutableAudioMix on macOS → BufferSourceNode+GainNode here.

import type { Timeline } from "../model/types";
import { endFrame } from "../model/helpers";

type SrcFor = (mediaRef: string) => string | null;

export class PreviewAudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Map<string, Promise<AudioBuffer | null>>();
  private active: AudioBufferSourceNode[] = [];

  private ensureCtx(): AudioContext {
    this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return this.ctx;
  }

  private async buffer(mediaRef: string, srcFor: SrcFor): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(mediaRef);
    if (cached) return cached;
    let job = this.decoding.get(mediaRef);
    if (!job) {
      const src = srcFor(mediaRef);
      job = (async () => {
        if (!src) return null;
        try {
          const bytes = await (await fetch(src)).arrayBuffer();
          const buf = await this.ensureCtx().decodeAudioData(bytes);
          this.buffers.set(mediaRef, buf);
          return buf;
        } catch {
          return null; // no audio track / undecodable → silent (matches offline handling)
        }
      })();
      this.decoding.set(mediaRef, job);
    }
    return job;
  }

  /** Schedule every audible audio clip from `fromFrame` onward, aligned to the playhead. */
  async play(timeline: Timeline, fromFrame: number, srcFor: SrcFor): Promise<void> {
    const ctx = this.ensureCtx();
    await ctx.resume();
    this.stop();
    const fps = Math.max(1, timeline.fps);
    const fromSec = fromFrame / fps;
    const t0 = ctx.currentTime + 0.06; // small lead so all clips align to one clock

    for (const track of timeline.tracks) {
      if (track.type !== "audio" || track.muted) continue;
      for (const clip of track.clips) {
        if (clip.volume <= 0 || endFrame(clip) <= fromFrame) continue;
        const buf = await this.buffer(clip.mediaRef, srcFor);
        if (!buf) continue;

        const speed = clip.speed > 0 ? clip.speed : 1;
        const clipStartSec = clip.startFrame / fps;
        const outStartFrame = Math.max(fromFrame, clip.startFrame);
        const when = t0 + Math.max(0, clipStartSec - fromSec);
        const offsetSec = clip.trimStartFrame / fps + Math.max(0, (outStartFrame - clip.startFrame) / fps) * speed;
        const outRemainSec = (endFrame(clip) - outStartFrame) / fps;
        if (outRemainSec <= 0) continue;
        const srcDurSec = outRemainSec * speed;

        const gain = ctx.createGain();
        const v = clip.volume;
        gain.gain.setValueAtTime(v, when);
        const fadeInSec = clip.fadeInFrames / fps;
        const fadeOutSec = clip.fadeOutFrames / fps;
        const clipOutSec = clip.durationFrames / fps;
        const elapsedSec = (outStartFrame - clip.startFrame) / fps;
        if (fadeInSec > 0 && elapsedSec < fadeInSec) {
          const startGain = v * (elapsedSec / fadeInSec);
          gain.gain.setValueAtTime(startGain, when);
          gain.gain.linearRampToValueAtTime(v, when + (fadeInSec - elapsedSec));
        }
        if (fadeOutSec > 0) {
          const fadeStart = when + Math.max(0, (clipOutSec - fadeOutSec) - elapsedSec);
          gain.gain.setValueAtTime(v, fadeStart);
          gain.gain.linearRampToValueAtTime(0, when + outRemainSec);
        }

        const node = ctx.createBufferSource();
        node.buffer = buf;
        node.playbackRate.value = speed;
        node.connect(gain).connect(ctx.destination);
        node.start(when, Math.min(offsetSec, buf.duration), Math.min(srcDurSec, Math.max(0, buf.duration - offsetSec)));
        this.active.push(node);
      }
    }
  }

  stop(): void {
    for (const n of this.active) { try { n.stop(); } catch { /* already stopped */ } }
    this.active = [];
  }

  /** Diagnostics: number of scheduled sources + audio-clock state (for live verification). */
  get diagnostics(): { activeSources: number; ctxState: string | null; ctxTime: number | null } {
    return { activeSources: this.active.length, ctxState: this.ctx?.state ?? null, ctxTime: this.ctx?.currentTime ?? null };
  }

  /** Warm the decode cache so the first Play has sound immediately. */
  prime(timeline: Timeline, srcFor: SrcFor): void {
    for (const t of timeline.tracks) {
      if (t.type !== "audio" || t.muted) continue;
      for (const c of t.clips) void this.buffer(c.mediaRef, srcFor);
    }
  }
}

export const previewAudio = new PreviewAudioEngine();

// Dev-only handle for live e2e verification (audio itself can only be judged by ear).
if (import.meta.env.DEV) {
  (globalThis as unknown as { previewAudio?: PreviewAudioEngine }).previewAudio = previewAudio;
}
