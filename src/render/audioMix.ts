// Export audio mix — audio-clip semantics from the model (trim in PROJECT frames, speed, static
// volume, linear head/tail fades; muted tracks silent), realized as an FFmpeg filter graph:
// per clip atrim → atempo(speed) → volume → afade in/out → adelay, then amix. Mirrors what
// CompositionBuilder assembles with AVFoundation on macOS. Keyframed audio volume is not mixed
// (matches FCPXMLExporter, which drops it) — noted in UPGRADES.

import type { Clip, Timeline } from "../model/types";
import { endFrame } from "../model/helpers";
import { rawVolumeAt } from "../model/clipSampling";

export interface AudioMixInput {
  path: string;
  filter: string; // per-input chain, expects label [aN]
}

export interface AudioMixPlan {
  inputs: string[];          // file paths, in ffmpeg input order (after the video pipe)
  filterComplex: string;     // full -filter_complex value producing [aout]
}

/**
 * FFmpeg volume step for a clip: a keyframed volume track becomes a piecewise-linear GAIN envelope
 * `volume='…':eval=frame` (dB→linear via rawVolumeAt, so it matches the preview at each keyframe);
 * otherwise the static volume. `t` is the clip's output time (0…outDurSec, after atrim/atempo).
 */
export function volumeStep(clip: Clip, fps: number, outDurSec: number): string | null {
  const kfs = clip.volumeTrack?.keyframes ?? [];
  if (kfs.length === 0) return Math.abs(clip.volume - 1) > 1e-6 ? `volume=${clip.volume.toFixed(6)}` : null;

  const pts = [...kfs].sort((a, b) => a.frame - b.frame)
    .map((k) => ({ t: Math.max(0, Math.min(outDurSec, k.frame / fps)), g: rawVolumeAt(clip, clip.startFrame + k.frame) }))
    .filter((p, i, arr) => i === 0 || p.t !== arr[i - 1].t);
  if (pts.length === 1) return `volume=${pts[0].g.toFixed(6)}`;

  // Build nested piecewise-linear expression, back to front. Commas are protected by single quotes.
  let expr = pts[pts.length - 1].g.toFixed(6); // hold after the last keyframe
  for (let i = pts.length - 2; i >= 0; i--) {
    const a = pts[i], b = pts[i + 1];
    const ramp = `(${a.g.toFixed(6)}+(${(b.g - a.g).toFixed(6)})*(t-${a.t.toFixed(6)})/${(b.t - a.t || 1).toFixed(6)})`;
    expr = `if(lt(t,${b.t.toFixed(6)}),${ramp},${expr})`;
  }
  expr = `if(lt(t,${pts[0].t.toFixed(6)}),${pts[0].g.toFixed(6)},${expr})`;
  return `volume='${expr}':eval=frame`;
}

/** atempo only accepts [0.5, 100] per stage — chain stages for slower speeds. */
export function atempoChain(speed: number): string {
  if (Math.abs(speed - 1) < 1e-6) return "";
  const stages: number[] = [];
  let s = speed;
  while (s < 0.5) {
    stages.push(0.5);
    s /= 0.5;
  }
  stages.push(Math.min(100, s));
  return stages.map((x) => `atempo=${x.toFixed(6)}`).join(",");
}

/** Build the audio mix for a timeline, or null when nothing is audible. */
export function buildAudioMix(
  timeline: Timeline,
  mediaPath: (mediaRef: string) => string | null,
): AudioMixPlan | null {
  const fps = Math.max(1, timeline.fps);
  const inputs: string[] = [];
  const chains: string[] = [];
  const labels: string[] = [];

  for (const track of timeline.tracks) {
    if (track.type !== "audio" || track.muted) continue;
    for (const clip of track.clips) {
      if (clip.durationFrames <= 0 || clip.volume <= 0) continue;
      const path = mediaPath(clip.mediaRef);
      if (!path) continue;

      const idx = inputs.length + 1; // input 0 is the piped video
      inputs.push(path);
      const trimStartSec = clip.trimStartFrame / fps;
      const outDurSec = clip.durationFrames / fps;
      const srcConsumedSec = (clip.durationFrames * clip.speed) / fps;
      const delayMs = Math.round((clip.startFrame / fps) * 1000);
      const fadeInSec = clip.fadeInFrames / fps;
      const fadeOutSec = clip.fadeOutFrames / fps;

      const steps: string[] = [
        `atrim=start=${trimStartSec.toFixed(6)}:end=${(trimStartSec + srcConsumedSec).toFixed(6)}`,
        "asetpts=PTS-STARTPTS",
      ];
      const tempo = atempoChain(clip.speed);
      if (tempo) steps.push(tempo);
      const vstep = volumeStep(clip, fps, outDurSec);
      if (vstep) steps.push(vstep);
      if (fadeInSec > 0) steps.push(`afade=t=in:st=0:d=${fadeInSec.toFixed(6)}`);
      if (fadeOutSec > 0) steps.push(`afade=t=out:st=${Math.max(0, outDurSec - fadeOutSec).toFixed(6)}:d=${fadeOutSec.toFixed(6)}`);
      steps.push(`adelay=${delayMs}:all=1`);

      const label = `a${idx}`;
      chains.push(`[${idx}:a]${steps.join(",")}[${label}]`);
      labels.push(`[${label}]`);
    }
  }

  if (inputs.length === 0) return null;
  const mix = labels.length === 1
    ? `${labels[0]}anull[aout]`
    : `${labels.join("")}amix=inputs=${labels.length}:normalize=0[aout]`;
  return { inputs, filterComplex: [...chains, mix].join(";") };
}

/** Timeline length in seconds (clamps the mixed audio to the video). */
export function timelineSeconds(timeline: Timeline): number {
  let max = 0;
  for (const t of timeline.tracks) for (const c of t.clips) max = Math.max(max, endFrame(c));
  return max / Math.max(1, timeline.fps);
}
