// Proves `claude mcp add kaestral -- npx kaestral` actually works: spawns the REAL bundled
// dist-server/server.cjs (the artifact npx kaestral ships and runs) in its default stdio mode,
// speaks newline-delimited JSON-RPC over its stdin/stdout, and asserts stdout carries ONLY valid
// JSON-RPC — no banners, no stray logs.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SERVER_CJS = join(__dirname, "..", "..", "..", "dist-server", "server.cjs");

describe("Stage-C: MCP stdio transport (npx kaestral default mode)", () => {
  if (!existsSync(SERVER_CJS)) {
    it.skip("dist-server/server.cjs missing — run `npm run bundle:server` first", () => {});
    return;
  }

  let child: ChildProcessWithoutNullStreams;
  let stderrBuf = "";
  const stdoutLines: string[] = [];
  let rl: ReturnType<typeof createInterface>;
  let nextId = 1;

  beforeAll(() => {
    child = spawn(process.execPath, [SERVER_CJS], { stdio: ["pipe", "pipe", "pipe"] });
    child.stderr.on("data", (d) => { stderrBuf += d.toString("utf8"); });
    rl = createInterface({ input: child.stdout, terminal: false });
    rl.on("line", (line) => stdoutLines.push(line));
  });

  afterAll(() => {
    child.kill();
  });

  function send(msg: unknown): void {
    child.stdin.write(JSON.stringify(msg) + "\n");
  }

  /** Wait until stdoutLines has at least `count` entries, or time out. */
  async function waitForLines(count: number, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    while (stdoutLines.length < count) {
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${count} stdout line(s); got ${stdoutLines.length}. stderr so far: ${stderrBuf}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it("initialize handshake returns kaestral 1.0.0 over stdout, with clean framing", async () => {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    await waitForLines(1);

    const line = stdoutLines[0];
    // Every line must be parseable JSON — no banner text, no partial output.
    const parsed = JSON.parse(line);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBe(id);
    expect(parsed.result.serverInfo).toEqual({ name: "kaestral", version: "1.0.0" });
    expect(parsed.result.capabilities.tools).toBeDefined();
  });

  it("tools/list returns the full tool array (50 tools) over stdout", async () => {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method: "tools/list", params: {} });
    await waitForLines(2);

    const parsed = JSON.parse(stdoutLines[1]);
    expect(parsed.id).toBe(id);
    const names = parsed.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_timeline");
    expect(names).toContain("read_skill");
    expect(names).toContain("generate_motion");
    expect(names).toContain("analyze_audio");
    expect(parsed.result.tools.length).toBe(50);
  });

  it("a notification (no id) produces no stdout line", async () => {
    const linesBefore = stdoutLines.length;
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    // Give the loop a moment to (not) respond.
    await new Promise((r) => setTimeout(r, 250));
    expect(stdoutLines.length).toBe(linesBefore);
  });

  it("a malformed line yields a JSON-RPC parse error (-32700), not a crash", async () => {
    const linesBefore = stdoutLines.length;
    child.stdin.write("not json at all\n");
    await waitForLines(linesBefore + 1);

    const parsed = JSON.parse(stdoutLines[linesBefore]);
    expect(parsed.id).toBeNull();
    expect(parsed.error.code).toBe(-32700);
  });

  it("the process is still alive and every stdout line so far is valid JSON-RPC (no stray logging)", () => {
    expect(child.exitCode).toBeNull();
    for (const line of stdoutLines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const msg = JSON.parse(line);
      expect(msg.jsonrpc).toBe("2.0");
    }
  });
});
