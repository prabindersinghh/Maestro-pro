// Render a Remotion composition to MP4 by id + input props. Invoked by the Kaestral server
// (generate_motion). Bundles once and caches the bundle in .bundle-cache for fast repeat renders;
// ensureBrowser() fetches the headless Chromium on first use.
//
//   node render.mjs <CompositionId> '<props-json>' <output.mp4>

import { bundle } from "@remotion/bundler";
import { selectComposition, renderMedia, ensureBrowser } from "@remotion/renderer";
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [, , compId, propsJson, outArg, scaleArg] = process.argv;
if (!compId || !outArg) {
  console.error("usage: node render.mjs <CompositionId> '<props-json>' <output.mp4> [scale]");
  process.exit(2);
}
const inputProps = propsJson ? JSON.parse(propsJson) : {};
const outputLocation = path.resolve(outArg);
// Optional resolution scale: 1 = native 1080p (fast, the user-facing default), 2 = 4K/UHD
// (2x each axis — slower, offered as an option). Clamped to [1, 2]; compositions are authored at
// 1080p and scaled up at render time so no layout/type math changes with resolution.
const renderScale = Math.max(1, Math.min(2, Number(scaleArg) || 1));

// Media/image/screenMock layers (Task 8) carry `props.src` as an absolute filesystem path
// (pre-validated against the project's media allowlist by validateSceneSpec). Neither Remotion's
// <Img> nor <OffthreadVideo> can load a bare absolute path directly: <Img> resolves it to a
// browser file:// navigation, which chrome-headless-shell's stripped network stack rejects
// (net::ERR_UNKNOWN_URL_SCHEME) even with disableWebSecurity; <OffthreadVideo>'s proxy server only
// accepts http(s) URLs or `data:` URIs (see downloadAsset in @remotion/renderer), never a raw OS
// path either. The one input format BOTH primitives support with no browser network stack
// involved at all is a `data:` URI — so we inline any such `src` here, at the single Node-side
// choke point BEFORE the spec ever reaches the browser-rendered bundle. This runs once per render
// (not per-frame), so the cost is one file read + base64 encode per referenced asset.
const MEDIA_SRC_ELEMENTS = new Set(["video", "image", "screenMock"]);
const MIME_BY_EXT = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
};

function inlineMediaSrcs(spec) {
  if (!spec || !Array.isArray(spec.beats)) return spec;
  for (const beat of spec.beats) {
    if (!Array.isArray(beat.layers)) continue;
    for (const layer of beat.layers) {
      if (!MEDIA_SRC_ELEMENTS.has(layer.element)) continue;
      const src = layer.props && layer.props.src;
      if (typeof src !== "string" || src === "" || src.startsWith("data:") || /^https?:\/\//i.test(src)) continue;
      if (!existsSync(src)) continue; // fail loud downstream (missing file), not here
      const ext = path.extname(src).toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
      const size = statSync(src).size;
      // Guard against inlining huge files into the render's inputProps JSON (memory/perf) — large
      // videos should be trimmed/transcoded upstream rather than base64-inlined whole.
      const MAX_INLINE_BYTES = 25 * 1024 * 1024;
      if (size > MAX_INLINE_BYTES) continue;
      const b64 = readFileSync(src).toString("base64");
      layer.props.src = `data:${mime};base64,${b64}`;
    }
  }
  return spec;
}
if (inputProps && inputProps.spec) inlineMediaSrcs(inputProps.spec);

async function getServeUrl() {
  // Cache the webpack bundle so only the first render pays the bundling cost.
  const cacheDir = path.join(__dirname, ".bundle-cache");
  const marker = path.join(cacheDir, "serveUrl.txt");
  const entryHashPath = path.join(cacheDir, "entry.txt");
  const entryPoint = path.join(__dirname, "src", "index.ts");
  if (existsSync(marker) && existsSync(readFileSync(marker, "utf8")) && existsSync(entryHashPath)) {
    return readFileSync(marker, "utf8");
  }
  mkdirSync(cacheDir, { recursive: true });
  const serveUrl = await bundle({ entryPoint, outDir: path.join(cacheDir, "bundle") });
  writeFileSync(marker, serveUrl);
  writeFileSync(entryHashPath, "1");
  return serveUrl;
}

const chromiumOptions = { gl: "angle" };

await ensureBrowser();
const serveUrl = await getServeUrl();
const composition = await selectComposition({ serveUrl, id: compId, inputProps, chromiumOptions });
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation,
  inputProps,
  scale: renderScale, // 1 = 1080p (default), 2 = 4K — see renderScale above
  // headless Chromium flags that are robust across machines (incl. no-GPU Windows CI/VMs)
  chromiumOptions,
});

console.log(JSON.stringify({
  outputLocation,
  scale: renderScale,
  durationInFrames: composition.durationInFrames,
  width: composition.width,
  height: composition.height,
  fps: composition.fps,
}));
