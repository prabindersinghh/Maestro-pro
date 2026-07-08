// Assemble everything the packaged app needs to run with NO Node/npm/tsx/FFmpeg on the user's
// machine, into src-tauri/resources/ (bundled by Tauri as read-only app resources):
//   node.exe, ffmpeg.exe, ffprobe.exe, dist-server/*.cjs, public/, remotion/ (source only),
//   node_modules/@napi-rs/canvas (native).
import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "src-tauri", "resources");

function which(bin) {
  try { return execFileSync("where", [bin], { encoding: "utf8" }).split(/\r?\n/).find(Boolean)?.trim(); }
  catch { return null; }
}
const mb = (p) => (existsSync(p) ? (statSync(p).size / 1e6).toFixed(0) : "?");

rmSync(res, { recursive: true, force: true });
mkdirSync(res, { recursive: true });

// 1) Node runtime (the exe running this script).
copyFileSync(process.execPath, path.join(res, "node.exe"));

// 2) FFmpeg + ffprobe.
const ffmpeg = process.env.FFMPEG_SRC || which("ffmpeg");
const ffprobe = process.env.FFPROBE_SRC || which("ffprobe");
if (!ffmpeg || !ffprobe) throw new Error("ffmpeg/ffprobe not found on PATH — set FFMPEG_SRC / FFPROBE_SRC.");
copyFileSync(ffmpeg, path.join(res, "ffmpeg.exe"));
copyFileSync(ffprobe, path.join(res, "ffprobe.exe"));

// 3) Bundled server + render CLI.
cpSync(path.join(root, "dist-server"), path.join(res, "dist-server"), { recursive: true });

// 4) Bundled sample media (served + demo).
cpSync(path.join(root, "public"), path.join(res, "public"), { recursive: true });

// 5) Native canvas package (external in the bundle).
cpSync(path.join(root, "node_modules", "@napi-rs", "canvas"), path.join(res, "node_modules", "@napi-rs", "canvas"), { recursive: true });

// 6) Remotion workspace SOURCE only (node_modules installed on first use into the writable data dir).
cpSync(path.join(root, "remotion"), path.join(res, "remotion"), {
  recursive: true,
  filter: (src) => !/[\\/](node_modules|\.bundle-cache)([\\/]|$)/.test(src),
});

console.log("resources assembled:");
console.log(`  node.exe     ${mb(path.join(res, "node.exe"))} MB`);
console.log(`  ffmpeg.exe   ${mb(path.join(res, "ffmpeg.exe"))} MB`);
console.log(`  ffprobe.exe  ${mb(path.join(res, "ffprobe.exe"))} MB`);
console.log(`  + dist-server, public, @napi-rs/canvas, remotion(source)`);
