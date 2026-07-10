// Runtime paths — overridable by env so the packaged app can point at bundled binaries/resources
// (set by the Tauri shell). In dev they fall back to PATH / the project layout.
import { join } from "node:path";

export const ffmpegBin = (): string => process.env.MAESTRO_FFMPEG || "ffmpeg";
export const ffprobeBin = (): string => process.env.MAESTRO_FFPROBE || "ffprobe";
/** Bundled/served media root (sample media + generated). */
export const publicDir = (): string => process.env.MAESTRO_PUBLIC_DIR || join(process.cwd(), "public");
/** The Remotion workspace (source; node_modules may be installed on first use). */
export const remotionDir = (): string => process.env.MAESTRO_REMOTION_DIR || join(process.cwd(), "remotion");
/** Writable working dir for generated clips + uploads (must be user-writable when packaged). */
export const dataDir = (): string => process.env.MAESTRO_DATA_DIR || process.cwd();
/** Bundled skill library (Maestro's own editing playbooks). Packaged: resources/skills; dev: ./skills. */
export const skillsDir = (): string => process.env.MAESTRO_SKILLS_DIR || join(process.cwd(), "skills");
/** Bundled whisper.cpp CLI (local transcription). Packaged: resources/whisper (set via MAESTRO_WHISPER); dev: ./vendor/whisper. */
export const whisperBin = (): string => process.env.MAESTRO_WHISPER || join(process.cwd(), "vendor", "whisper", process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
/** Writable dir for downloaded Whisper model weights (download-on-first-use). */
export const modelsDir = (): string => process.env.MAESTRO_MODELS_DIR || join(dataDir(), "models");
