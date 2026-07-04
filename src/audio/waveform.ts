// Waveform peak envelope — ported from Audio/WaveformExtractor.swift. Same contract:
// ~200 samples/sec (capped at 240k samples total), mono peak per hop, normalized against a
// −50 dB noise floor where 0 = loud and 1 = silence. Decode via ffmpeg → float32 PCM.

import { spawn } from "node:child_process";

export const SAMPLES_PER_SECOND = 200;
export const NOISE_FLOOR_DB = -50;
export const MAX_SAMPLES = 240_000;
const DECODE_RATE = 8000;

export interface WaveformEnvelope {
  samplesPerSecond: number;
  peaks: number[];
}

function normalized(peak: number): number {
  if (peak <= 0) return 1;
  const db = 20 * Math.log10(peak);
  const clamped = Math.min(0, Math.max(NOISE_FLOOR_DB, db));
  return clamped / NOISE_FLOOR_DB;
}

/** Extract the peak envelope of a media file's audio track (empty peaks if none). */
export function extractWaveform(path: string, durationSeconds: number, ffmpegPath = "ffmpeg"): Promise<WaveformEnvelope> {
  const span = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 60;
  const rate = Math.min(SAMPLES_PER_SECOND, MAX_SAMPLES / span);
  const hopSize = Math.max(1, Math.round(DECODE_RATE / rate));

  return new Promise((resolve) => {
    const ff = spawn(ffmpegPath, [
      "-v", "error", "-i", path, "-map", "a:0",
      "-ac", "1", "-ar", String(DECODE_RATE), "-f", "f32le", "-",
    ], { stdio: ["ignore", "pipe", "ignore"] });

    const peaks: number[] = [];
    let carryPeak = 0;
    let carryCount = 0;
    let leftover: Buffer = Buffer.alloc(0);

    ff.stdout.on("data", (chunk: Buffer) => {
      const buf: Buffer = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      leftover = Buffer.from(buf.subarray(usable));
      for (let i = 0; i < usable; i += 4) {
        const mag = Math.abs(buf.readFloatLE(i));
        if (mag > carryPeak) carryPeak = mag;
        carryCount++;
        if (carryCount === hopSize) {
          peaks.push(Math.round(normalized(carryPeak) * 1000) / 1000);
          carryPeak = 0;
          carryCount = 0;
        }
      }
    });
    ff.on("error", () => resolve({ samplesPerSecond: rate, peaks: [] }));
    ff.on("close", () => {
      if (carryCount > 0) peaks.push(Math.round(normalized(carryPeak) * 1000) / 1000);
      resolve({ samplesPerSecond: rate, peaks });
    });
  });
}
