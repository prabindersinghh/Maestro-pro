// On-device speech transcription with WORD-LEVEL timestamps via a bundled whisper.cpp CLI.
// Pipeline: bundled FFmpeg → 16 kHz mono s16le WAV → whisper-cli (-ml 1 = one word per segment, the
// key to word timings) → parse the JSON → words in ms + project frames. Model weights download on
// first use (keeps the installer small). CPU (OpenBLAS) build — no GPU/CUDA required. whisper.cpp is
// MIT (ggml authors); the ggml Whisper weights on HuggingFace are MIT too.

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { ffmpegBin, whisperBin, modelsDir } from "../mcp/env";

export interface TranscriptWord { text: string; startMs: number; endMs: number; startFrame: number; endFrame: number }
export interface Transcript { words: TranscriptWord[]; text: string; durationMs: number; source: string }

const MODEL_URL = (m: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${m}.bin`;
const MIN_MODEL_BYTES = 20_000_000; // sanity floor so a truncated download isn't treated as valid

function run(bin: string, args: string[], onLine?: (s: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d: Buffer) => { out += d.toString(); onLine?.(d.toString()); });
    p.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out + err) : reject(new Error(`${bin} exited ${code}: ${err.slice(0, 300)}`))));
  });
}

/** Ensure ggml-<model>.bin exists locally; download it on first use. Returns the absolute path. */
export async function ensureModel(model = "base.en"): Promise<string> {
  const dir = modelsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `ggml-${model}.bin`);
  const ok = await stat(path).then((s) => s.size >= MIN_MODEL_BYTES).catch(() => false);
  if (ok) return path;
  const res = await fetch(MODEL_URL(model));
  if (!res.ok || !res.body) throw new Error(`Model download failed (${res.status}) for ggml-${model}.bin. Check your connection.`);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(path);
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]).pipe(ws).on("finish", () => resolve()).on("error", reject);
  });
  const size = (await stat(path)).size;
  if (size < MIN_MODEL_BYTES) { await rm(path, { force: true }); throw new Error("Model download was incomplete; please retry."); }
  return path;
}

/** Whether a bundled whisper binary is present (so callers can degrade gracefully). */
export async function whisperAvailable(): Promise<boolean> {
  return stat(whisperBin()).then((s) => s.isFile()).catch(() => false);
}

interface WhisperJson { transcription?: { offsets?: { from: number; to: number }; text?: string }[] }

/** Pure parser: whisper.cpp -oj JSON (with -ml 1, one word per segment) → words in ms + frames. */
export function parseWhisperJson(json: WhisperJson, fps: number, baseMs = 0): TranscriptWord[] {
  const words: TranscriptWord[] = [];
  for (const seg of json.transcription ?? []) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    const startMs = (seg.offsets?.from ?? 0) + baseMs;
    const endMs = Math.max(startMs, (seg.offsets?.to ?? startMs) + baseMs);
    words.push({ text, startMs, endMs, startFrame: Math.round((startMs / 1000) * fps), endFrame: Math.round((endMs / 1000) * fps) });
  }
  return words;
}

/**
 * Transcribe a media file's speech to word-level timestamps.
 * @param fps project fps for the frame fields; startSec/endSec optionally limit to a range.
 */
export async function transcribe(
  mediaPath: string,
  fps: number,
  opts: { model?: string; language?: string; startSec?: number; endSec?: number; onProgress?: (s: string) => void } = {},
): Promise<Transcript> {
  const model = opts.model ?? "base.en";
  const language = opts.language ?? (model.endsWith(".en") ? "en" : "auto");
  const modelPath = await ensureModel(model);
  const dir = await mkdtemp(join(tmpdir(), "maestro-stt-"));
  const wav = join(dir, "stt.wav");
  const outBase = join(dir, "stt");
  try {
    // 1) FFmpeg → 16 kHz mono s16le WAV (optionally a sub-range).
    const pre: string[] = ["-v", "error"];
    if (opts.startSec != null) pre.push("-ss", opts.startSec.toFixed(3));
    if (opts.endSec != null && opts.startSec != null) pre.push("-t", (opts.endSec - opts.startSec).toFixed(3));
    await run(ffmpegBin(), [...pre, "-i", mediaPath, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", "-vn", "-y", wav]);

    // 2) whisper-cli → JSON with one word per segment (-ml 1 -sow → word-level timestamps).
    await run(whisperBin(), ["-m", modelPath, "-f", wav, "-oj", "-of", outBase, "-ml", "1", "-sow", "-l", language, "-nt"], opts.onProgress);

    // 3) Parse stt.json.
    const raw = await readFile(`${outBase}.json`, "utf8");
    const words = parseWhisperJson(JSON.parse(raw), fps, (opts.startSec ?? 0) * 1000);
    const durationMs = words.length ? words[words.length - 1].endMs : 0;
    return { words, text: words.map((w) => w.text).join(" "), durationMs, source: `whisper.cpp/${model} (on-device)` };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
