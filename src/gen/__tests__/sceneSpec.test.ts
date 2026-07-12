// src/gen/__tests__/sceneSpec.test.ts
import { describe, it, expect } from "vitest";
import { validateSceneSpec } from "../sceneSpec";

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
});
