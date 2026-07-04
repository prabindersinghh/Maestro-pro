// Timeline waveform strip. Fetches an asset's peak envelope (0=loud, 1=silence — the
// WaveformExtractor.swift contract) from the project server once, caches it, and draws the clip's
// visible source window as mirrored bars.

import { useEffect, useRef, useState } from "react";
import { BRIDGE_URL } from "../../state/bridge";
import type { Clip } from "../../model/types";

interface Envelope { samplesPerSecond: number; peaks: number[] }
const cache = new Map<string, Envelope>();
const NONE: Envelope = { samplesPerSecond: 200, peaks: [] };

// Only a non-empty envelope is cached; an empty result (server not seeded / still extracting) is
// returned uncached so the caller can retry.
async function fetchOnce(mediaRef: string): Promise<Envelope> {
  const hit = cache.get(mediaRef);
  if (hit) return hit;
  try {
    const r = await fetch(`${BRIDGE_URL}/waveform/${encodeURIComponent(mediaRef)}`);
    const e: Envelope = r.ok ? await r.json() : NONE;
    if (e.peaks.length > 0) cache.set(mediaRef, e);
    return e;
  } catch {
    return NONE;
  }
}

export function WaveformStrip({ clip, fps, width, height }: { clip: Clip; fps: number; width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [env, setEnv] = useState<Envelope | null>(cache.get(clip.mediaRef) ?? null);

  useEffect(() => {
    let live = true;
    let tries = 0;
    const attempt = async () => {
      const e = await fetchOnce(clip.mediaRef);
      if (!live) return;
      if (e.peaks.length > 0) { setEnv(e); return; }
      if (tries++ < 12) setTimeout(attempt, 1200); // wait out seeding/extraction
    };
    void attempt();
    return () => { live = false; };
  }, [clip.mediaRef]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !env || env.peaks.length === 0 || width < 2) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(width * dpr));
    cv.height = Math.max(1, Math.floor(height * dpr));
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(255,255,255,0.55)";

    // Map the clip's visible source window (trim + speed) onto the peak array.
    const sps = env.samplesPerSecond;
    const startIdx = (clip.trimStartFrame / fps) * sps;
    const consumedIdx = ((clip.durationFrames * (clip.speed > 0 ? clip.speed : 1)) / fps) * sps;
    const mid = height / 2;
    const cols = Math.max(1, Math.floor(width));
    for (let x = 0; x < cols; x++) {
      const i = Math.floor(startIdx + (consumedIdx * x) / cols);
      const peak = env.peaks[Math.min(env.peaks.length - 1, Math.max(0, i))] ?? 1;
      const amp = (1 - peak) * (mid - 1); // 0=loud → full height, 1=silence → flat
      ctx.fillRect(x, mid - amp, 1, amp * 2);
    }
  }, [env, width, height, clip.trimStartFrame, clip.durationFrames, clip.speed, fps]);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width, height, pointerEvents: "none" }} />;
}
