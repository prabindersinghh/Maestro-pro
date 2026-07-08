import { describe, it, expect } from "vitest";
import { generate, DEFAULT_MODELS } from "../hosted";

describe("hosted generation", () => {
  it("refuses without a key (no network call)", async () => {
    await expect(generate({ provider: "fal", apiKey: "", videoModel: "m", imageModel: "m" }, "video", "x"))
      .rejects.toThrow(/No generation API key/);
  });

  it("has sane default models for both providers", () => {
    expect(DEFAULT_MODELS.fal.image).toContain("flux");
    expect(DEFAULT_MODELS.replicate.video).toContain("ltx");
  });
});
