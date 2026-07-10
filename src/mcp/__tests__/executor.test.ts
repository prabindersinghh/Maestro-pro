import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpExecutor } from "../executor";
import { TOOL_DEFS } from "../toolDefs";
import { nodePackageFS } from "../../project/nodeFs";
import type { Track } from "../../model/types";

function videoTrack(id = "t0"): Track {
  return { id, type: "video", muted: false, hidden: false, syncLocked: true, clips: [] };
}
function seed(ex: McpExecutor): void {
  ex.media.addAsset({ id: "vid1", name: "clip.mp4", type: "video", duration: 10, source: { kind: "external", absolutePath: "/x.mp4" }, hasAudio: false });
  ex.engine.timeline.tracks.push(videoTrack());
}

describe("Stage-C: tool registry (frozen contract)", () => {
  it("registers exactly 41 tools, unique names, no read_skill", () => {
    expect(TOOL_DEFS.length).toBe(41);
    expect(new Set(TOOL_DEFS.map((t) => t.name)).size).toBe(41);
    expect(TOOL_DEFS.find((t) => t.name === "read_skill")).toBeUndefined();
    for (const t of TOOL_DEFS) expect(t.inputSchema.type).toBe("object");
  });

  it("includes the frozen set of names", () => {
    const names = new Set(TOOL_DEFS.map((t) => t.name));
    for (const n of ["get_timeline", "add_clips", "ripple_delete_ranges", "set_keyframes", "undo", "export_project", "list_models"]) {
      expect(names.has(n)).toBe(true);
    }
  });
});

describe("Stage-C: executor edit flow over the engine", () => {
  it("get_timeline → add_clips → ripple_delete_ranges → undo", async () => {
    const ex = new McpExecutor();
    seed(ex);

    const gt = await ex.execute("get_timeline", {});
    expect(gt.isError).toBeFalsy();
    const tl = JSON.parse(gt.content[0].text);
    expect(tl.canGenerate).toBe(false);
    expect(tl.tracks[0].label).toBe("V1");
    expect(tl.totalFrames).toBe(0);

    const add = await ex.execute("add_clips", { entries: [{ mediaRef: "vid1", trackIndex: 0, startFrame: 0, durationFrames: 100 }] });
    expect(add.isError).toBeFalsy();
    expect(ex.timeline.tracks[0].clips.length).toBe(1);

    const rip = await ex.execute("ripple_delete_ranges", { trackIndex: 0, ranges: [[10, 30]], units: "frames" });
    expect(rip.isError).toBeFalsy();
    expect(ex.timeline.tracks[0].clips.reduce((s, c) => s + c.durationFrames, 0)).toBe(80);

    const un = await ex.execute("undo", {});
    expect(un.isError).toBeFalsy();
    expect(ex.timeline.tracks[0].clips.reduce((s, c) => s + c.durationFrames, 0)).toBe(100);
  });

  it("add_clips derives duration from source when omitted (seconds × fps − trims)", async () => {
    const ex = new McpExecutor();
    seed(ex); // asset duration 10s, fps 30 → 300 project frames
    await ex.execute("add_clips", { entries: [{ mediaRef: "vid1", trackIndex: 0, startFrame: 0, trimStartFrame: 30 }] });
    expect(ex.timeline.tracks[0].clips[0].durationFrames).toBe(270);
  });

  it("set_keyframes stores clip-relative dB volume with interpolation", async () => {
    const ex = new McpExecutor();
    seed(ex);
    await ex.execute("add_clips", { entries: [{ mediaRef: "vid1", trackIndex: 0, startFrame: 0, durationFrames: 48 }] });
    const clipId = ex.timeline.tracks[0].clips[0].id;
    const r = await ex.execute("set_keyframes", { clipId, property: "volume", keyframes: [[0, 0], [24, -6, "linear"]] });
    expect(r.isError).toBeFalsy();
    const kfs = ex.engine.clipRef(clipId)!.volumeTrack!.keyframes;
    expect(kfs.map((k) => [k.frame, k.value])).toEqual([[0, 0], [24, -6]]);
    expect(kfs[1].interpolationOut).toBe("linear");
  });
});

describe("Stage-C: stub shapes (SPEC §10/§11)", () => {
  it("generate_video/image ask for a BYOK key when none is set (no fake clip)", async () => {
    const ex = new McpExecutor();
    for (const t of ["generate_video", "generate_image"]) {
      const r = await ex.execute(t, { prompt: "x" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/Fal or Replicate key/);
    }
    // generate_audio + upscale stay unwired.
    const au = await ex.execute("generate_audio", { prompt: "x" });
    expect(au.isError).toBe(true);
    expect(au.content[0].text).toMatch(/not wired/);
    const up = await ex.execute("upscale_media", { mediaRef: "x" });
    expect(up.isError).toBe(true);
    expect(up.content[0].text).toMatch(/not wired/);
  });

  it("list_models returns {models:[],loaded:false}", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("list_models", {});
    expect(JSON.parse(r.content[0].text)).toEqual({ models: [], loaded: false });
  });

  it("still-stubbed tools report unavailable (structured, not a crash)", async () => {
    const ex = new McpExecutor();
    for (const t of ["inspect_timeline", "search_media", "inspect_media"]) {
      const r = await ex.execute(t, {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/not available in this build/);
    }
  });

  it("transcription tools ask for the whisper setup when the model/binary isn't present", async () => {
    const ex = new McpExecutor();
    for (const t of ["get_transcript", "add_captions"]) {
      const r = await ex.execute(t, {});
      expect(r.isError).toBe(true);
      // Either the whisper setup message (no binary) or a clear arg error — never a crash.
      expect(r.content[0].text).toMatch(/whisper|transcription|clipId|mediaRef/i);
    }
  });
});

describe("Stage-D (pure): export_project interchange modes", () => {
  it("mode:xml and mode:fcpxml write valid files; palmier works; video reports Stage D", async () => {
    const root = mkdtempSync(join(tmpdir(), "palmier-exp-"));
    const ex = new McpExecutor({ fs: nodePackageFS(), projectDir: root });
    ex.media.addAsset({ id: "v", name: "v.mp4", type: "video", duration: 5, source: { kind: "external", absolutePath: "/tmp/v.mp4" }, hasAudio: false });
    ex.engine.timeline.tracks.push(videoTrack());
    await ex.execute("add_clips", { entries: [{ mediaRef: "v", trackIndex: 0, startFrame: 0, durationFrames: 50 }] });

    const xml = await ex.execute("export_project", { mode: "xml", outputPath: join(root, "o.xml") });
    expect(xml.isError).toBeFalsy();
    expect(readFileSync(join(root, "o.xml"), "utf8")).toContain('<xmeml version="4">');

    const fcp = await ex.execute("export_project", { mode: "fcpxml", outputPath: join(root, "o.fcpxml") });
    expect(fcp.isError).toBeFalsy();
    expect(readFileSync(join(root, "o.fcpxml"), "utf8")).toContain('<fcpxml version="1.10">');

    const pal = await ex.execute("export_project", { mode: "palmier", outputPath: join(root, "P.palmier") });
    expect(pal.isError).toBeFalsy();
    expect(readFileSync(join(root, "P.palmier", "project.json"), "utf8")).toContain('"fps"');
    // mode:video renders via FFmpeg — covered end-to-end in src/render/__tests__/render.test.ts.
  });
});
