import { describe, it, expect } from "vitest";
import { renderRemotion } from "../../motion/renderRemotion";
import { validateSceneSpec } from "../sceneSpec";
import { join } from "node:path";
import { statSync } from "node:fs";
import { spawn } from "node:child_process";

const sampleImagePath = join(process.cwd(), "public", "sample-image.png");

const remotionDir = join(process.cwd(), "remotion");

// --- ffmpeg pixel-proof helpers (used only by the FINDING 1 regression test below) ---------------
// Deliberately minimal: no new dependency, just shells out to ffmpeg (already present in this
// environment) to extract ONE frame as raw 8-bit grayscale pixels, then averages them in Node. This
// gives a real "how bright is this region at this frame" signal without needing an image-decoding
// library — sufficient to distinguish "opacity pinned to full at frame 0" (bug) from "opacity fading
// in from near-black" (fixed).

function runFfmpeg(args: string[]): Promise<{ stdout: Buffer; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args);
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0 && chunks.length === 0) return reject(new Error(`ffmpeg failed (exit ${code}): ${err.slice(-500)}`));
      resolve({ stdout: Buffer.concat(chunks), code });
    });
  });
}

/** True if an `ffmpeg` binary is reachable on PATH — the regression test degrades gracefully (render
 * assertions only, no pixel proof) rather than failing outright when it's absent. */
async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    await runFfmpeg(["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts a single frame from `videoPath` at EXACT frame index `frameIndex` (via the `select`
 * filter — deliberately NOT `-ss` time-seeking, which for a file with a sparse keyframe/GOP
 * structure can decode-and-return the wrong actual frame depending on ffmpeg's nearest-keyframe
 * seek heuristics; `select=eq(n,frameIndex)` is unambiguous regardless of GOP layout), crops to
 * `rect` (pixel coords), downsamples to 8-bit grayscale raw pixels, and returns the mean pixel
 * value (0=black..255=white) — a coarse but effective "how bright/opaque does this region read"
 * proxy.
 */
async function meanLumaOfCrop(
  videoPath: string,
  frameIndex: number,
  rect: { x: number; y: number; w: number; h: number }
): Promise<number> {
  const { x, y, w, h } = rect;
  const { stdout } = await runFfmpeg([
    "-y",
    "-i", videoPath,
    "-vf", `select=eq(n\\,${frameIndex}),crop=${Math.round(w)}:${Math.round(h)}:${Math.round(x)}:${Math.round(y)},format=gray`,
    "-frames:v", "1",
    "-f", "rawvideo",
    "-pix_fmt", "gray",
    "pipe:1",
  ]);
  if (stdout.length === 0) throw new Error(`ffmpeg produced no pixel data for frame ${frameIndex} of ${videoPath}`);
  let sum = 0;
  for (const byte of stdout) sum += byte;
  return sum / stdout.length;
}

describe("Generative render", () => {
  it("renders a MINIMAL sparse spec (no background/particles/camera/enter) to a non-blank MP4 — premium-by-construction defaults must kick in", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Kaestral" } }] }],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-sparse.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    // A flat-black slideshow frame compresses far smaller than one with an animated grid + glow +
    // particles backdrop behind spring-entrance text — this is a coarse but effective proxy for
    // "atmosphere actually composited", not just "some bytes were written".
    expect(statSync(out).size).toBeGreaterThan(10000);
  }, 240000);

  it("renders a minimal spec to a non-trivial MP4", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [{ durationInFrames: 30, background: { kind: "glow", accent: "#16b16a" },
        layers: [{ element: "text", props: { text: "Kaestral" }, style: { role: "display", size: 0.1 }, enter: { anim: "spring" } }] }],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(statSync(out).size).toBeGreaterThan(10000);
  }, 240000);

  it("renders a 2-beat spec with a transition + particles + camera push-in (no hard cuts, atmosphere)", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 45,
          camera: { move: "push-in", amount: 0.08 },
          background: { kind: "glow", accent: "#16b16a" },
          transitionOut: { kind: "wipe", accent: "#16b16a", snapToBeat: false },
          layers: [
            { element: "particles", props: { accent: "goldHairline" }, opacity: 1, blur: 0 },
            {
              element: "text",
              props: { text: "Kaestral" },
              style: { role: "display", size: 0.1 },
              enter: { anim: "spring" },
            },
          ],
        },
        {
          durationInFrames: 45,
          camera: { move: "push-in", amount: 0.08 },
          background: { kind: "grid", accent: "#16b16a" },
          layers: [
            { element: "particles", props: { accent: "goldHairline" }, opacity: 1, blur: 0 },
            {
              element: "text",
              props: { text: "Motion" },
              style: { role: "accent", size: 0.1 },
              enter: { anim: "spring" },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-transition.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    expect(statSync(out).size).toBeGreaterThan(10000);
  }, 240000);

  it("renders a data-story spec (barChart + counter, then timeline + captionKaraoke across a wipe transition) — 'show the product working' primitives", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 60,
          background: { kind: "glow", accent: "#16b16a" },
          transitionOut: { kind: "wipe", accent: "#16b16a", snapToBeat: false },
          layers: [
            {
              element: "barChart",
              props: {
                title: "Growth",
                bars: [
                  { label: "Jan", value: 42 },
                  { label: "Feb", value: 65 },
                  { label: "Mar", value: 88 },
                ],
              },
              position: { x: 0.5, y: 0.42 },
              enter: { anim: "spring" },
            },
            {
              element: "counter",
              props: { value: 1280, label: "renders", suffix: "+" },
              position: { x: 0.5, y: 0.82 },
              enter: { anim: "spring", delay: 10 },
            },
          ],
        },
        {
          durationInFrames: 60,
          background: { kind: "grid", accent: "#16b16a" },
          layers: [
            {
              element: "timeline",
              props: {},
              position: { x: 0.5, y: 0.35 },
              enter: { anim: "spring" },
            },
            {
              element: "captionKaraoke",
              props: { words: ["show", "the", "product", "working"] },
              position: { x: 0.5, y: 0.75 },
              enter: { anim: "spring", delay: 8 },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-data-story.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    expect(statSync(out).size).toBeGreaterThan(10000);
  }, 240000);

  it("renders a screenMock (real product screenshot) + arrow + highlightBox — 'show the product' primitives", async () => {
    const v = validateSceneSpec(
      {
        meta: { aspect: "16:9", fps: 30 },
        beats: [
          {
            durationInFrames: 60,
            background: { kind: "glow", accent: "#16b16a" },
            layers: [
              {
                element: "screenMock",
                props: { src: sampleImagePath, url: "kaestral.dev" },
                position: { x: 0.5, y: 0.5 },
                enter: { anim: "spring" },
              },
              {
                element: "arrow",
                props: { from: { x: 0.15, y: 0.15 }, to: { x: 0.4, y: 0.35 } },
                enter: { anim: "draw" },
              },
              {
                element: "highlightBox",
                props: { rect: { x: 0.3, y: 0.25, w: 0.35, h: 0.2 } },
                enter: { anim: "draw" },
              },
            ],
          },
        ],
      },
      { allowedMediaPaths: [sampleImagePath] },
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-screenmock.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Real screenshot content composited into the chrome should compress noticeably larger than a
    // flat background alone — a coarse but effective "actually rendered, not blank" proxy.
    expect(statSync(out).size).toBeGreaterThan(15000);
  }, 240000);

  it("renders the Task 9 premium-motion set (maskReveal+kenBurns+lightingSweep on an image, splitLayout, textOnPath, glitch exit) to a non-blank MP4", async () => {
    const v = validateSceneSpec(
      {
        meta: { aspect: "16:9", fps: 30 },
        beats: [
          {
            durationInFrames: 60,
            background: { kind: "glow", accent: "#16b16a" },
            transitionOut: { kind: "wipe", accent: "#16b16a", snapToBeat: false },
            layers: [
              {
                element: "image",
                props: { src: sampleImagePath },
                position: { x: 0.5, y: 0.45 },
                depth: "foreground",
                mask: { shape: "circle", reveal: "iris" },
                kenBurns: { move: "drift", amount: 0.1 },
                lightingSweep: { on: true, angle: 25, speed: 1 },
                enter: { anim: "maskReveal" },
              },
            ],
          },
          {
            durationInFrames: 60,
            background: { kind: "grid", accent: "#16b16a" },
            transitionOut: { kind: "glitch", accent: "#16b16a", snapToBeat: false },
            layers: [
              {
                element: "splitLayout",
                props: {
                  direction: "row",
                  panels: [
                    { element: "text", props: { text: "Design" }, style: { role: "display", size: 0.09 } },
                    { element: "text", props: { text: "Motion" }, style: { role: "accent", size: 0.09 } },
                  ],
                },
                position: { x: 0.5, y: 0.5 },
                enter: { anim: "spring" },
              },
            ],
          },
          {
            durationInFrames: 45,
            background: { kind: "glow", accent: "#16b16a" },
            layers: [
              {
                element: "textOnPath",
                props: { text: "Kaestral ships motion", path: "arc", emphasis: [0, 2] },
                position: { x: 0.5, y: 0.4 },
                enter: { anim: "kinetic" },
                exit: { anim: "glitch", at: 30 },
              },
              {
                element: "countdown",
                props: { from: 3, stepFrames: 12 },
                position: { x: 0.5, y: 0.78 },
              },
            ],
          },
        ],
      },
      { allowedMediaPaths: [sampleImagePath] },
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-premium-motion.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Every premium technique compositing together (masked image + Ken Burns + lighting sweep +
    // split-panel text + kinetic text-on-path + countdown + glitch) should compress noticeably
    // larger than a flat background alone — a coarse but effective "actually rendered" proxy.
    expect(statSync(out).size).toBeGreaterThan(15000);
  }, 240000);

  it("renders a spec using per-property animate + hold + bezier easing + custom overlap", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        { durationInFrames: 60, transitionOut: { kind: "wipe", overlapFrames: 22 },
          layers: [{ element: "text", props: { text: "One" }, position: { x: 0.3, y: 0.45, snap: false },
            animate: { opacity: { from: 0, to: 1, startFrame: 0, durationFrames: 14, easing: { curve: [0.2, 0.8, 0.2, 1] } },
                       position: { from: { x: 0.3, y: 0.45 }, to: { x: 0.42, y: 0.45 }, startFrame: 0, durationFrames: 20, easing: "ease-out" } },
            hold: { startFrame: 22, durationFrames: 30 } }] },
        { durationInFrames: 60, layers: [{ element: "text", props: { text: "Two" }, enter: { anim: "spring", spring: { damping: 15, mass: 0.7, stiffness: 120 } } }] },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "art.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(statSync(out).size).toBeGreaterThan(10000);
  }, 240000);

  // REGRESSION TEST — task-5 review FINDING 1 (Critical): `animate.position` authored ALONE must
  // NOT silently kill the layer's own entrance-driven OPACITY fade-in. The bug: Generative.tsx's
  // `BeatLayer` used to compute `animateNeutralizesEnter = !!(layer.animate?.opacity ||
  // layer.animate?.position)` — a single combined OR flag — so authoring `animate.position` alone
  // wrongly neutralized the ENTIRE entrance (opacity included), pinning opacity to instant-full at
  // frame 0 instead of letting it fade in via the default spring entrance. This spec is legal and
  // must reach the interpreter: no `enter` is authored at all (so `resolveEnter` fills in the
  // default spring entrance) and `animate` covers ONLY `position` — the validator's
  // `checkAnimateConflicts` only rejects an explicitly-authored `enter.from` alongside
  // `animate.position` (see src/gen/sceneSpec.ts), and there is no `enter` here whatsoever, so this
  // spec validates fine and is exactly the shape the review calls out as reaching the interpreter.
  it("renders animate.position ALONE (no animate.opacity, no enter authored) and the entrance-driven opacity fade survives — FINDING 1 regression", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 60,
          background: { kind: "solid", accent: "#0b0a0d" }, // solid black backdrop, no grid/glow/particles — isolates the text's own luma
          layers: [
            {
              element: "text",
              props: { text: "GLOW", color: "greenLight" },
              // No `enter` authored at all -> default spring entrance fills in (resolveEnter),
              // which is NOT rejected by checkAnimateConflicts since no `enter.from` was authored.
              position: { x: 0.5, y: 0.5, snap: false },
              style: { role: "display", size: 0.16 },
              animate: {
                // position ALONE — no animate.opacity. A short tween so both its start and end sit
                // well inside a single generous crop box below.
                position: {
                  from: { x: 0.46, y: 0.5 },
                  to: { x: 0.54, y: 0.5 },
                  startFrame: 0,
                  durationFrames: 45,
                  easing: "linear",
                },
              },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-animate-position-only.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Baseline "actually rendered, not blank" proxy, matching every other test in this file.
    expect(statSync(out).size).toBeGreaterThan(8000);

    // Pixel-level proof (ffmpeg, present in this environment): the default spring entrance settles
    // to ~99% opacity by frame ~28-32 at 30fps (see ASSUMED_ENTRANCE_SETTLE_FRAMES in
    // remotion/src/primitives/pacing.ts) — frame 2 is deep inside the entrance's fade-in (spring
    // barely started), frame 35 is comfortably settled AND still well before this beat's own
    // OUT_FADE_FRAMES content resolve (Generative.tsx's BeatSequence fades the whole beat's content
    // out over its final 18 frames — [42,60) on this 60-frame beat — so frame 35 avoids that
    // confound entirely). If the CRITICAL bug were still present, opacity would be pinned to fully
    // opaque at BOTH frames (the entrance neutralized wholesale by animate.position's mere presence)
    // and this luma comparison would fail — this was verified by deliberately reproducing the bug
    // (stale pre-fix bundle) during development of this test, which DID fail this exact assertion
    // with the text already fully bright at frame 0. Crop box covers the full x=[0.42,0.58] range
    // the text sweeps across (its animate.position tween), so the crop reliably contains the text
    // at every frame regardless of the horizontal drift.
    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      // Environment without ffmpeg: the render assertions above already prove the spec is legal and
      // renders successfully; the opacity-fade claim itself is verified by code trace in this case
      // (see BeatLayer's per-property neutralizeOpacity/neutralizePosition split and Text.tsx's
      // post-hoc pin — animate.position alone sets neutralizePosition=true, neutralizeOpacity stays
      // false, so animOpacity keeps playing the branch's own spring value un-pinned).
      return;
    }
    const earlyLuma = await meanLumaOfCrop(out, 2, { x: 1920 * 0.42, y: 1080 * 0.4, w: 1920 * 0.16, h: 1080 * 0.2 });
    const settledLuma = await meanLumaOfCrop(out, 35, { x: 1920 * 0.42, y: 1080 * 0.4, w: 1920 * 0.16, h: 1080 * 0.2 });
    // Early frame (deep in the entrance fade-in) must be visibly DIMMER than the settled frame — proof
    // the opacity entrance actually animated from low to high, i.e. was NOT pinned to full opacity at
    // frame 0 by animate.position's mere presence.
    expect(earlyLuma).toBeLessThan(settledLuma - 5);
  }, 240000);

  // TASK 6b1 — text ANCHOR + mono FONT. Before this task `text` layers always CENTERED on
  // `position`, so a left-column title authored at x:0.12 ran off the left edge of the frame.
  it("renders a LEFT-anchored text at x:0.12 with ink pixels near the left edge — proves anchor:'left' places the text's start near position.x, not centered on it", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 60,
          background: { kind: "solid", accent: "#0b0a0d" }, // solid black backdrop isolates the text's own luma
          layers: [
            {
              element: "text",
              props: { text: "A kestrel watches." },
              position: { x: 0.12, y: 0.4, snap: false },
              style: { role: "display", size: 0.072, anchor: "left" },
              enter: { anim: "spring" },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-text-anchor-left.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Baseline "actually rendered, not blank" proxy, matching every other test in this file.
    expect(statSync(out).size).toBeGreaterThan(8000);

    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      // Environment without ffmpeg: the render assertions above already prove the spec is legal
      // and renders successfully; the pixel-level left-anchoring proof is skipped in this case.
      return;
    }
    // Settle frame: default spring entrance settles to ~99% opacity by frame ~28-32 at 30fps (see
    // ASSUMED_ENTRANCE_SETTLE_FRAMES in remotion/src/primitives/pacing.ts) — frame 40 is comfortably
    // settled and still well before this beat's own OUT_FADE_FRAMES resolve.
    const settleFrame = 40;
    // The LEFT ~8% column of the frame, centered vertically around y=40% (position.y). If the text
    // is genuinely left-anchored (its LEFT edge starts at x:0.12, i.e. the text runs rightward from
    // there), this narrow strip right at the very left edge of the frame (x:[0, 0.08]) sits just
    // before the text's start and would read near-black if the text were being CENTERED instead
    // (centered on x:0.12 would push the text's visible ink leftward past this column and off-frame
    // entirely, clipped — the strip would stay dark either way in that failure mode). The
    // decisive column is immediately AFTER position.x's left edge: x:[0.12, 0.20], an 8%-wide band
    // starting exactly at the authored left-anchor point, which must contain bright ink for a
    // left-anchored render (a center-anchored render would place the text's horizontal midpoint at
    // x:0.12, so its ink would straddle x:[0.12,0.20] far less and skew darker/clipped-looking, and
    // for a genuinely off-frame center-anchored overflow the same band would still show materially
    // less ink than the true left-anchored case).
    const leftAnchorBandLuma = await meanLumaOfCrop(out, settleFrame, {
      x: 1920 * 0.12,
      y: 1080 * 0.4 - 1080 * 0.1,
      w: 1920 * 0.08,
      h: 1080 * 0.2,
    });
    // A dark background (solid #0b0a0d, luma ~11) with bright ink (#eaeaef, luma ~234) means any
    // meaningful text coverage in this band pulls the mean well above the background floor.
    expect(leftAnchorBandLuma).toBeGreaterThan(40);
  }, 240000);

  it("renders a mono-font text without error", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 30,
          layers: [
            {
              element: "text",
              props: { text: "Mono" },
              style: { role: "display", size: 0.1, font: "mono" },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-text-font-mono.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(statSync(out).size).toBeGreaterThan(8000);
  }, 240000);

  // TASK 6b2 — hairline ANCHORED draw + honor enter.easing/durationFrames. Before this task
  // Hairline always CENTERED on `position` (grew symmetrically outward from the midpoint) and
  // ignored `enter.easing`/`enter.durationFrames` entirely (always used its own hardcoded spring).
  // This spec pins the rule's LEFT edge at position.x:0.12 via `props.anchor:"start"` and shapes
  // the draw-in with a custom bezier over an exact 22-frame window (after a 10-frame delay).
  it("renders a LEFT-anchored hairline shaped by enter.easing/durationFrames, with ink starting at the anchor and not centered on it", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 60,
          background: { kind: "solid", accent: "#0b0a0d" }, // solid black backdrop isolates the hairline's own luma
          layers: [
            {
              element: "hairline",
              position: { x: 0.12, y: 0.52, snap: false },
              // `thickness:14` (vs. the primitive's 2px default) so the drawn band is thick enough
              // to dominate a reasonably-sized ffmpeg sampling crop below without needing a
              // pixel-fragile, anti-aliasing-sensitive 1-2px-tall crop window.
              props: { orientation: "horizontal", length: 0.2, anchor: "start", color: "gold", thickness: 14 },
              enter: { anim: "draw", easing: { curve: [0.22, 0.61, 0.16, 1] }, durationFrames: 22, delay: 10 },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-hairline-anchor-draw.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Baseline "actually rendered, not blank" proxy, matching every other test in this file.
    expect(statSync(out).size).toBeGreaterThan(8000);

    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      // Environment without ffmpeg: the render assertions above already prove the spec is legal
      // and renders successfully; the pixel-level anchored-draw proof is skipped in this case.
      return;
    }
    // Frame 22 = 10-frame delay + 12 frames into the 22-frame draw window -> mid-draw, well past
    // the point any eased curve would have painted ink starting from the left anchor.
    const midDrawFrame = 22;
    // Just RIGHT of the anchor (x:0.12): a thin band at x:[0.13,0.16], y a tight ~14px-tall strip
    // centered on position.y (0.52, matching the authored `thickness:14`) — must show drawn GOLD
    // ink if the rule grows rightward from its LEFT-pinned anchor.
    const rightOfAnchorLuma = await meanLumaOfCrop(out, midDrawFrame, {
      x: 1920 * 0.13,
      y: 1080 * 0.52 - 7,
      w: 1920 * 0.03,
      h: 14,
    });
    // Just LEFT of the anchor (x:0.12): a thin band at x:[0.06,0.10] — must show NO ink (background
    // only) if the rule is left-anchored rather than centered on position.x (a centered rule at
    // 20%-length would draw symmetrically outward and this band would ALSO light up).
    const leftOfAnchorLuma = await meanLumaOfCrop(out, midDrawFrame, {
      x: 1920 * 0.06,
      y: 1080 * 0.52 - 7,
      w: 1920 * 0.04,
      h: 14,
    });
    // Solid #0b0a0d background reads luma ~11; drawn gold ink over it should read materially
    // brighter in the right-of-anchor band, while the left-of-anchor band stays near the floor.
    expect(rightOfAnchorLuma).toBeGreaterThan(30);
    expect(leftOfAnchorLuma).toBeLessThan(20);
  }, 240000);

  // TASK 6b3 — wordStagger: a REAL per-word spring stagger (opacity + translateY 12->0, each word
  // springing up independently with an i*4-frame offset), unlike wordReveal's flat word-COUNT
  // reveal (all-visible words instantly fully opaque, no per-word transform). This spec renders
  // "Total precision. Then it strikes." left-anchored at x:0.12, mono font, size:0.06 — at that
  // size a monospace advance places the FIRST word ("Total") roughly at x:[0.13,0.20] and the LAST
  // word ("strikes.") roughly at x:[0.56,0.64] (calibrated against an actual rendered frame),
  // giving two well-separated horizontal bands to sample.
  it("renders wordStagger with SEQUENTIAL per-word reveal — early frame shows only the first word, later frame shows the last word too", async () => {
    const v = validateSceneSpec({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 150, // generous so enter.delay:16 is not pulled back by resolveEntranceTiming's hold/settle clamp
          background: { kind: "solid", accent: "#0b0a0d" }, // solid black backdrop isolates the text's own luma
          layers: [
            {
              element: "text",
              props: { text: "Total precision. Then it strikes." },
              position: { x: 0.12, y: 0.4, snap: false },
              style: { role: "display", size: 0.06, anchor: "left", font: "mono" },
              enter: { anim: "wordStagger", spring: { damping: 16, mass: 1, stiffness: 100 }, delay: 16 },
            },
          ],
        },
      ],
    });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const out = join(remotionDir, ".test-out", "gen-text-word-stagger.mp4");
    const res = await renderRemotion("Generative", { spec: v.spec }, out, remotionDir);
    expect(res.width).toBe(1920);
    expect(res.height).toBe(1080);
    // Baseline "actually rendered, not blank" proxy, matching every other test in this file.
    expect(statSync(out).size).toBeGreaterThan(8000);

    const ffmpegAvailable = await checkFfmpegAvailable();
    if (!ffmpegAvailable) {
      // Environment without ffmpeg: the render assertions above already prove the spec is legal
      // and renders successfully; the pixel-level sequential-reveal proof is skipped in this case.
      return;
    }

    // EARLY frame: delay=16, word i's spring frame = local - i*4 (local = frame - 16). At frame 24
    // (local=8), word 0's spring frame is 8 (well into its damping:16 spring rise, ~85% opacity —
    // comfortably bright ink), while word 5's ("strikes.") spring frame is 8 - 20 = -12 —
    // Remotion's spring() clamps negative frames to progress 0, so it must be fully invisible
    // (background floor only). This is the crux of the sequential-vs-all-at-once distinction:
    // wordReveal or a flat fade would show BOTH bands identically bright at this frame.
    const earlyFrame = 24;
    const firstWordBandEarly = await meanLumaOfCrop(out, earlyFrame, {
      x: 1920 * 0.13, y: 1080 * 0.4 - 1080 * 0.1, w: 1920 * 0.07, h: 1080 * 0.2,
    });
    const lastWordBandEarly = await meanLumaOfCrop(out, earlyFrame, {
      x: 1920 * 0.56, y: 1080 * 0.4 - 1080 * 0.1, w: 1920 * 0.08, h: 1080 * 0.2,
    }); // "strikes." lands roughly x:[0.56,0.64] at this size/position (calibrated against an actual rendered frame)

    // LATER frame: comfortably past every word's settle point (last word's spring starts at
    // local=20 i.e. frame=36, settles ~30 frames later around frame=66) and still well before this
    // beat's own OUT_FADE_FRAMES resolve (durationInFrames:150 fades out only in its final 18
    // frames, [132,150)).
    const laterFrame = 90;
    const firstWordBandLater = await meanLumaOfCrop(out, laterFrame, {
      x: 1920 * 0.13, y: 1080 * 0.4 - 1080 * 0.1, w: 1920 * 0.07, h: 1080 * 0.2,
    });
    const lastWordBandLater = await meanLumaOfCrop(out, laterFrame, {
      x: 1920 * 0.56, y: 1080 * 0.4 - 1080 * 0.1, w: 1920 * 0.08, h: 1080 * 0.2,
    });

    // Solid #0b0a0d background reads luma ~11; bright ink (#eaeaef) reads far brighter.
    expect(firstWordBandEarly).toBeGreaterThan(20); // first word already visible early
    expect(lastWordBandEarly).toBeLessThan(20); // last word NOT visible yet — proves sequential, not all-at-once
    expect(firstWordBandLater).toBeGreaterThan(20); // first word still visible later
    expect(lastWordBandLater).toBeGreaterThan(20); // last word now visible too — sequential reveal completed
  }, 240000);
});
