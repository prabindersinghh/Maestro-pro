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

  describe("style.anchor / style.font", () => {
    it("accepts anchor:left + font:mono and returns them", () => {
      const spec = {
        ...minimal,
        beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Hi" }, style: { role: "display", size: 0.072, anchor: "left", font: "mono" } }] }],
      };
      const r = validateSceneSpec(spec);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.spec.beats[0].layers[0].style?.anchor).toBe("left");
        expect(r.spec.beats[0].layers[0].style?.font).toBe("mono");
      }
    });

    it("rejects a bad anchor enum value with a clear message", () => {
      const spec = {
        ...minimal,
        beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Hi" }, style: { role: "display", size: 0.072, anchor: "middle" } }] }],
      };
      const r = validateSceneSpec(spec);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/beats\[0\]\.layers\[0\]\.style\.anchor/);
    });

    it("defaults anchor to center and font to sans when style is present but partial", () => {
      const spec = {
        ...minimal,
        beats: [{ durationInFrames: 60, layers: [{ element: "text", props: { text: "Hi" }, style: { role: "display", size: 0.05 } }] }],
      };
      const r = validateSceneSpec(spec);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.spec.beats[0].layers[0].style?.anchor).toBe("center");
        expect(r.spec.beats[0].layers[0].style?.font).toBe("sans");
      }
    });
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

  describe("enter/exit/transitionOut expansion (durationFrames, spring, overlapFrames, easing)", () => {
    // helper to build a one-layer spec with a given layer
    const specWith = (layer: object, beatExtra: object = {}) => ({
      meta: { aspect: "16:9", fps: 30 },
      beats: [{ durationInFrames: 90, layers: [{ element: "text", props: { text: "Hi" }, ...layer }], ...beatExtra }],
    });

    it("enter accepts a bezier curve + durationFrames + spring, clamped", () => {
      const r = validateSceneSpec(specWith({ enter: { anim: "spring", easing: { curve: [0.2, 1.6, 0.3, 1] }, durationFrames: 18, spring: { damping: 15, mass: 0.7, stiffness: 100 } } }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        const e = r.spec.beats[0].layers[0].enter!;
        expect(e.easing).toEqual({ curve: [0.2, 1.6, 0.3, 1] });
        expect(e.durationFrames).toBe(18);
        expect(e.spring).toEqual({ damping: 15, mass: 0.7, stiffness: 100 });
      }
    });

    it("exit accepts fade + durationFrames; transitionOut accepts overlapFrames", () => {
      const r = validateSceneSpec(specWith({ exit: { anim: "fade", at: 70, durationFrames: 16 } }, { transitionOut: { kind: "wipe", overlapFrames: 22 } }));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.spec.beats[0].layers[0].exit!.durationFrames).toBe(16);
        expect(r.spec.beats[0].transitionOut!.overlapFrames).toBe(22);
      }
    });

    it("rejects an unknown enter key with the path", () => {
      const r = validateSceneSpec(specWith({ enter: { anim: "spring", wobble: 5 } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/enter/);
    });

    it("layer accepts explicit hold {startFrame,durationFrames} clamped", () => {
      const r = validateSceneSpec(specWith({ hold: { startFrame: 20, durationFrames: 45 } }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.spec.beats[0].layers[0].hold).toEqual({ startFrame: 20, durationFrames: 45 });
    });
    it("position.snap defaults true and can be set false", () => {
      const a = validateSceneSpec(specWith({ position: { x: 0.28, y: 0.4 } }));
      const b = validateSceneSpec(specWith({ position: { x: 0.28, y: 0.4, snap: false } }));
      expect(a.ok && a.spec.beats[0].layers[0].position.snap).toBe(true);
      expect(b.ok && b.spec.beats[0].layers[0].position.snap).toBe(false);
    });

    it("accepts a per-property animate block (opacity + position on their own curves)", () => {
      const r = validateSceneSpec(specWith({
        animate: {
          opacity: { from: 0, to: 1, startFrame: 0, durationFrames: 16, easing: "ease-out" },
          position: { from: { x: 0.3, y: 0.5 }, to: { x: 0.5, y: 0.5 }, startFrame: 4, durationFrames: 20, easing: { curve: [0.2, 0.8, 0.2, 1] } },
        },
      }));
      expect(r.ok).toBe(true);
    });
    it("REJECTS animate.opacity + enter.anim:fade with a message naming both", () => {
      const r = validateSceneSpec(specWith({
        enter: { anim: "fade" },
        animate: { opacity: { from: 0, to: 1, startFrame: 0, durationFrames: 12, easing: "linear" } },
      }));
      expect(r.ok).toBe(false);
      if (!r.ok) { expect(r.error).toMatch(/animate\.opacity/); expect(r.error).toMatch(/enter/); }
    });
    it("REJECTS an unknown animate property key", () => {
      const r = validateSceneSpec(specWith({ animate: { skew: { from: 0, to: 1, startFrame: 0, durationFrames: 8, easing: "linear" } } }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/animate/);
    });

    // TASK 6b3 — per-word spring stagger reveal anim.
    it("accepts enter.anim:'wordStagger'", () => {
      const r = validateSceneSpec(specWith({ enter: { anim: "wordStagger", spring: { damping: 16, mass: 1, stiffness: 100 }, delay: 16 } }));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.spec.beats[0].layers[0].enter!.anim).toBe("wordStagger");
    });
  });
});
