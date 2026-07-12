import { describe, it, expect } from "vitest";
import { renderRemotion } from "../../motion/renderRemotion";
import { validateSceneSpec } from "../sceneSpec";
import { join } from "node:path";
import { statSync } from "node:fs";

const sampleImagePath = join(process.cwd(), "public", "sample-image.png");

const remotionDir = join(process.cwd(), "remotion");

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
});
