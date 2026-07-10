import { describe, it, expect } from "vitest";
import { parseWhisperJson } from "../transcribe";

// Shape of whisper.cpp -oj output with -ml 1 (one word per segment), offsets in ms.
const JFK_JSON = {
  transcription: [
    { offsets: { from: 0, to: 1020 }, text: " And" },
    { offsets: { from: 1020, to: 1660 }, text: " so" },
    { offsets: { from: 1660, to: 3290 }, text: " my" },
    { offsets: { from: 3290, to: 5410 }, text: " fellow" },
    { offsets: { from: 5410, to: 8190 }, text: " Americans," },
    { offsets: { from: 0, to: 0 }, text: "  " }, // blank/padding segment → dropped
  ],
};

describe("parseWhisperJson — word-level timestamps", () => {
  it("maps whisper word segments to trimmed words in ms + project frames", () => {
    const words = parseWhisperJson(JFK_JSON, 30);
    expect(words.length).toBe(5); // blank dropped
    expect(words[0]).toMatchObject({ text: "And", startMs: 0, endMs: 1020, startFrame: 0, endFrame: 31 });
    expect(words[3]).toMatchObject({ text: "fellow", startFrame: 99, endFrame: 162 });
    // words are non-decreasing in time
    for (let i = 1; i < words.length; i++) expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].startMs);
  });

  it("applies a base offset (sub-range transcription) to every timestamp", () => {
    const words = parseWhisperJson(JFK_JSON, 30, 2000); // clip started 2s into the media
    expect(words[0].startMs).toBe(2000);
    expect(words[0].startFrame).toBe(60);
  });

  it("returns [] for empty/garbage input", () => {
    expect(parseWhisperJson({}, 30)).toEqual([]);
    expect(parseWhisperJson({ transcription: [] }, 30)).toEqual([]);
  });
});
