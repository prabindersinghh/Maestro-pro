// URL → file download via yt-dlp. Maestro does NOT bundle yt-dlp (large + site-policy sensitive); it
// shells the user's own yt-dlp if present, else returns a clear install message. Idea from youtube-dl
// (Unlicense / public domain); this is our own thin wrapper. Enables importing a clip from a URL
// (YouTube, etc.) straight onto the timeline.

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, basename, join } from "node:path";

export const ytdlpBin = (): string => process.env.MAESTRO_YTDLP || "yt-dlp";

/** True if a yt-dlp binary is runnable on PATH (or MAESTRO_YTDLP). */
export function ytdlpAvailable(ytdlp = ytdlpBin()): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(ytdlp, ["--version"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Download `url` using the output template (e.g. ".../dl-abc.%(ext)s"), merging to mp4.
 * Returns the actual file yt-dlp wrote.
 */
export async function downloadUrl(url: string, outTemplate: string, ytdlp = ytdlpBin()): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const args = ["-f", "bv*+ba/b", "--no-playlist", "--merge-output-format", "mp4", "-o", outTemplate, url];
    const p = spawn(ytdlp, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    p.on("error", (e) => reject(new Error(`yt-dlp couldn't start: ${e.message}. Install yt-dlp and put it on PATH.`)));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`yt-dlp exited ${code}: ${err.slice(0, 300)}`))));
  });
  // Find what it wrote (template resolves %(ext)s to the real container).
  const dir = dirname(outTemplate);
  const stem = basename(outTemplate).replace(/\.%\(ext\)s$/, "");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.startsWith(stem));
  if (files.length === 0) throw new Error("yt-dlp finished but produced no file.");
  // prefer the merged mp4 if present
  const mp4 = files.find((f) => f.endsWith(".mp4"));
  return join(dir, mp4 ?? files[0]);
}
