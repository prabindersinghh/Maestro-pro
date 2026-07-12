#!/usr/bin/env node
// `npx kaestral` — starts the Kaestral editor engine (the MCP server) so Claude Code can drive it:
//   npx kaestral
//   claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
// Requires FFmpeg + ffprobe on PATH. The whisper model (~142 MB) downloads on first transcription.
// Optionally pass a .palmier project path to load it.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url))); // bin/.. = package root
const server = join(pkgRoot, "dist-server", "server.cjs");
if (!existsSync(server)) {
  console.error("kaestral: bundled server missing (dist-server/server.cjs). This shouldn't happen in a published package.");
  process.exit(1);
}

// Point the server at the resources shipped inside the package + a writable data dir.
const dataDir = process.env.KAESTRAL_DATA_DIR || join(homedir(), ".kaestral");
mkdirSync(dataDir, { recursive: true });

const env = {
  ...process.env,
  MAESTRO_PUBLIC_DIR: process.env.MAESTRO_PUBLIC_DIR || join(pkgRoot, "public"),
  MAESTRO_REMOTION_DIR: process.env.MAESTRO_REMOTION_DIR || join(pkgRoot, "remotion"),
  MAESTRO_SKILLS_DIR: process.env.MAESTRO_SKILLS_DIR || join(pkgRoot, "skills"),
  MAESTRO_WHISPER: process.env.MAESTRO_WHISPER || join(pkgRoot, "vendor", "whisper", process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"),
  MAESTRO_MODELS_DIR: process.env.MAESTRO_MODELS_DIR || join(dataDir, "models"),
  MAESTRO_DATA_DIR: dataDir,
  // FFmpeg/ffprobe are expected on PATH; override with MAESTRO_FFMPEG / MAESTRO_FFPROBE if needed.
};

console.error("Kaestral engine starting… connect with:\n  claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp\n");
const child = spawn(process.execPath, [server, ...process.argv.slice(2)], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
