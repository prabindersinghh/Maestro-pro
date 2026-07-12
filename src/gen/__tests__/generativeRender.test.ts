import { describe, it, expect } from "vitest";
import { renderRemotion } from "../../motion/renderRemotion";
import { validateSceneSpec } from "../sceneSpec";
import { join } from "node:path";
import { statSync } from "node:fs";

const remotionDir = join(process.cwd(), "remotion");

describe("Generative render", () => {
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
});
