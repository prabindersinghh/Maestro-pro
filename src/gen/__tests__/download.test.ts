import { describe, it, expect } from "vitest";
import { ytdlpAvailable } from "../download";
import { McpExecutor } from "../../mcp/executor";

describe("import_from_url (yt-dlp)", () => {
  it("ytdlpAvailable is false when the binary path is bogus", async () => {
    expect(await ytdlpAvailable("definitely-not-a-real-binary-xyz")).toBe(false);
  });

  it("import_from_url rejects a non-URL", async () => {
    const ex = new McpExecutor();
    const r = await ex.execute("import_from_url", { url: "not a url" });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/http\(s\) link/);
  });

  it("import_from_url gives a clear install message when yt-dlp is missing", async () => {
    // Force the missing path regardless of the host machine.
    const prev = process.env.MAESTRO_YTDLP;
    process.env.MAESTRO_YTDLP = "definitely-not-a-real-binary-xyz";
    try {
      const ex = new McpExecutor();
      const r = await ex.execute("import_from_url", { url: "https://example.com/video.mp4" });
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toMatch(/yt-dlp/);
      expect(r.content[0].text).toMatch(/install/i);
    } finally {
      if (prev === undefined) delete process.env.MAESTRO_YTDLP; else process.env.MAESTRO_YTDLP = prev;
    }
  });
});
