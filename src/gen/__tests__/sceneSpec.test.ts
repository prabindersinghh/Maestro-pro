// src/gen/__tests__/sceneSpec.test.ts
import { describe, it, expect } from "vitest";
import { validateSceneSpec } from "../sceneSpec";
import { join } from "node:path";

const minimal = {
  meta: { aspect: "16:9", fps: 30 },
  beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Hi" } }] }],
};

describe("validateSceneSpec", () => {
  it("accepts a minimal valid spec and fills defaults", () => {
    const r = validateSceneSpec(minimal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.meta.brand).toBe("kaestral");          // default
      expect(r.spec.beats[0].layers[0].opacity).toBe(1);   // default
    }
  });

  it("rejects an unknown element with the offending path", () => {
    const bad = { ...minimal, beats: [{ durationInFrames: 60, layers: [{ element: "foo", props: {} }] }] };
    const r = validateSceneSpec(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/beats\[0\]\.layers\[0\]\.element/);
  });

  it("clamps out-of-range numbers instead of failing", () => {
    const big = { ...minimal, beats: [{ durationInFrames: 99999, layers: [{ element: "text", props: { text: "x" }, opacity: 5 }] }] };
    const r = validateSceneSpec(big);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.beats[0].durationInFrames).toBe(600);  // clamp max
      expect(r.spec.beats[0].layers[0].opacity).toBe(1);   // clamp max
    }
  });

  it("rejects a non-brand, non-hex color with the path", () => {
    const bad = { ...minimal, beats: [{ durationInFrames: 60, background: { kind: "solid", accent: "javascript:alert(1)" }, layers: [{ element: "text", props: { text: "x" } }] }] };
    const r = validateSceneSpec(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/accent/);
  });

  it("requires at least one beat", () => {
    const r = validateSceneSpec({ meta: { aspect: "16:9", fps: 30 }, beats: [] });
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    const bad = { ...minimal, wat: "nope" };
    const r = validateSceneSpec(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^\$: unknown field 'wat'/);
  });

  it("rejects an unknown field inside a nested layer", () => {
    const bad = {
      ...minimal,
      beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Hi" }, oppacity: 0.5 }] }],
    };
    const r = validateSceneSpec(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/beats\[0\]\.layers\[0\]: unknown field 'oppacity'/);
  });

  it("rejects a non-string brand", () => {
    const bad = { ...minimal, meta: { aspect: "16:9", fps: 30, brand: { nope: true } } };
    const r = validateSceneSpec(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^meta\.brand/);
  });

  describe("media-path allowlist (opts.allowedMediaPaths)", () => {
    const allowedPath = join(process.cwd(), "public", "sample-image.png");
    const outsidePath = join(process.cwd(), "..", "somewhere-else", "evil.png");

    const specWithImage = (src: string) => ({
      meta: { aspect: "16:9", fps: 30 },
      beats: [
        {
          durationInFrames: 60,
          layers: [
            { element: "text", props: { text: "Hi" } },
            { element: "image", props: { src } },
          ],
        },
      ],
    });

    it("rejects an image src NOT in allowedMediaPaths, naming the exact path", () => {
      const r = validateSceneSpec(specWithImage(outsidePath), { allowedMediaPaths: [allowedPath] });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toMatch(/beats\[0\]\.layers\[1\]\.props\.src/);
        expect(r.error).toMatch(/not in project media/);
      }
    });

    it("accepts an image src that IS in allowedMediaPaths", () => {
      const r = validateSceneSpec(specWithImage(allowedPath), { allowedMediaPaths: [allowedPath] });
      expect(r.ok).toBe(true);
    });

    it("accepts case-insensitive/normalized path matches on the allowlist", () => {
      const upper = allowedPath.toUpperCase();
      const r = validateSceneSpec(specWithImage(upper), { allowedMediaPaths: [allowedPath] });
      expect(r.ok).toBe(true);
    });

    it("skips the media-path check entirely when opts is absent (back-compat)", () => {
      const r = validateSceneSpec(specWithImage(outsidePath));
      expect(r.ok).toBe(true);
    });

    it("applies the same check to video and screenMock elements", () => {
      const videoSpec = {
        meta: { aspect: "16:9", fps: 30 },
        beats: [{ durationInFrames: 60, layers: [{ element: "video", props: { src: outsidePath } }] }],
      };
      const screenMockSpec = {
        meta: { aspect: "16:9", fps: 30 },
        beats: [{ durationInFrames: 60, layers: [{ element: "screenMock", props: { src: outsidePath } }] }],
      };
      const rv = validateSceneSpec(videoSpec, { allowedMediaPaths: [allowedPath] });
      const rs = validateSceneSpec(screenMockSpec, { allowedMediaPaths: [allowedPath] });
      expect(rv.ok).toBe(false);
      expect(rs.ok).toBe(false);
    });

    it("ignores non-string / empty src (nothing to check)", () => {
      const spec = {
        meta: { aspect: "16:9", fps: 30 },
        beats: [{ durationInFrames: 60, layers: [{ element: "image", props: { src: "" } }] }],
      };
      const r = validateSceneSpec(spec, { allowedMediaPaths: [allowedPath] });
      expect(r.ok).toBe(true);
    });
  });
});
