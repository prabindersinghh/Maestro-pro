// MCP HTTP server. Ported from Agent/MCP/MCPHTTPServer.swift + MCPService.swift.
// Localhost-only (127.0.0.1) on 19789, POST /mcp, GET SSE keep-alive, oauth probe, and the
// three validators (origin / content-type / protocol-version). Server identity kaestral 1.0.0.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { ALL_TOOL_DEFS } from "./toolDefs";
import { resolveRenderMediaPath } from "../render/mediaPath";
import { publicDir } from "./env";
import { DEFAULT_MODELS as DEFAULT_GEN_MODELS } from "../gen/hosted";
import { startVm, stopVm, gpuState as probeGpu, type GpuConfig, type GpuState } from "../gen/gcp";
import type { McpExecutor } from "./executor";

export const MCP_PORT = 19789;
export const MCP_HOST = "127.0.0.1";
// The MCP server identifies as "kaestral". (The on-disk project format is still ".palmier" — that's a
// data-format contract for opening existing projects, independent of this wire name.)
const SERVER_INFO = { name: "kaestral", version: "1.0.0" };
const DEFAULT_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = new Set(["2025-06-18", "2025-03-26", "2024-11-05", DEFAULT_PROTOCOL]);

const SERVER_INSTRUCTIONS =
  "Kaestral MCP server (AI-native video editor).\n" +
  " core rule — BUILD INSIDE KAESTRAL, never bypass it: every editing action MUST go through these MCP " +
  "tools so the result appears on the user's Kaestral timeline as you work. NEVER run ffmpeg (or any " +
  "external tool) yourself to produce a finished standalone video file, and never hand the user a raw " +
  "file path as the deliverable. If you create an asset (a motion clip, a title, a score, an image), it " +
  "MUST be imported and placed on the timeline: use generate_motion / generate_title / generate_video / " +
  "generate_image (they auto-import + place), or import_media then add_clips for an external file. The " +
  "ONLY way to produce a final video is export_project(mode:'video'), which renders the CURRENT TIMELINE " +
  "through Kaestral — so the export is exactly what the user watched you build. Work step by step and " +
  "visibly: add clips, titles, music, effects one tool call at a time.\n" +
  "Call get_timeline at the start of a session. Before editing footage you don't understand, PERCEIVE it: " +
  "see_video returns real frames you can SEE (best moments, subject, framing); get_transcript returns " +
  "word-level speech timestamps (on-device whisper). Then add_captions makes word-accurate captions and " +
  "remove_words cuts specific spoken words. generate_video/generate_image run on hosted providers " +
  "(Fal/Replicate) when the user has added their key in Settings → Generation; generate_title/generate_motion " +
  "render locally and always work. For a task that matches a skill, read_skill first and follow it. " +
  "For any motion-graphics / film / title-sequence work (compose_motion), read_skill('art-direction') FIRST — " +
  "it teaches how to art-direct at a premium level (decision process, optical composition, rhythm, restraint, the physics of premium motion) so the result reads as designed, not templated.";

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const RESOURCES = [
  { name: "Video Models", uri: "kaestral://models/video", description: "Available AI video generation models", mimeType: "application/json" },
  { name: "Image Models", uri: "kaestral://models/image", description: "Available AI image generation models", mimeType: "application/json" },
];

export class McpServer {
  private server: Server | null = null;
  // gcp-ltx GPU lifecycle (start/stop the user's LTX VM). Client-side fast path; the on-VM idle
  // watchdog is the real credit guard. baseUrl is pushed into genConfig when the VM is ready.
  private gpuConfig: GpuConfig | null = null;
  private gpuState: GpuState = { status: "stopped" };
  constructor(
    private readonly executor: McpExecutor,
    private readonly port: number = MCP_PORT,
    private readonly host: string = MCP_HOST,
  ) {}

  private setGpuBaseUrl(baseUrl?: string): void {
    if (this.executor.genConfig?.provider === "gcp-ltx") this.executor.genConfig.baseUrl = baseUrl;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => void this.handle(req, res));
      this.server.on("error", reject);
      // Bind to IPv4 loopback only so the server is never reachable from the LAN.
      this.server.listen(this.port, this.host, () => resolve());
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server = null;
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/.well-known/oauth-protected-resource") {
      return sendJson(res, 200, { resource: `http://127.0.0.1:${this.port}` });
    }

    // --- Project bridge (app ⇄ server shared state; NOT part of the MCP contract) ---
    if ((req.method ?? "").toUpperCase() === "OPTIONS") {
      res.writeHead(204, CORS).end();
      return;
    }
    if (path === "/state" && req.method === "GET") {
      return sendJson(res, 200, this.executor.getState(), CORS);
    }
    if (path === "/state" && req.method === "POST") {
      try {
        const body = JSON.parse((await readBodyBuffer(req)).toString("utf8"));
        const version = this.executor.setState(body.timeline, body.media);
        return sendJson(res, 200, { version }, CORS);
      } catch (e) {
        return sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) }, CORS);
      }
    }
    // Hosted-generation BYOK config. GET reports whether a key is set (never returns the key);
    // POST sets provider/apiKey/models so generate_video/image work from BOTH connect paths.
    if (path === "/gen-config" && req.method === "GET") {
      const c = this.executor.genConfig;
      // gcp-ltx is "ready" when it has a server URL (set when the GPU starts); Fal/Replicate need a key.
      const ready = c?.provider === "gcp-ltx" ? !!c?.baseUrl : !!c?.apiKey;
      return sendJson(res, 200, { provider: c?.provider ?? "fal", hasKey: ready, baseUrl: c?.baseUrl, videoModel: c?.videoModel, imageModel: c?.imageModel }, CORS);
    }
    if (path === "/gen-config" && req.method === "POST") {
      try {
        const b = JSON.parse((await readBodyBuffer(req)).toString("utf8")) as { provider?: string; apiKey?: string; videoModel?: string; imageModel?: string; baseUrl?: string };
        const provider = b.provider === "replicate" ? "replicate" : b.provider === "gcp-ltx" ? "gcp-ltx" : "fal";
        const key = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
        const baseUrl = typeof b.baseUrl === "string" ? b.baseUrl.trim() : "";
        // gcp-ltx is configured when it has a server URL (or a key alone, so it persists before the VM starts).
        const configured = provider === "gcp-ltx" ? !!(baseUrl || key) : !!key;
        this.executor.genConfig = configured
          ? { provider, apiKey: key, baseUrl: baseUrl || undefined, videoModel: b.videoModel?.trim() || DEFAULT_GEN_MODELS[provider].video, imageModel: b.imageModel?.trim() || DEFAULT_GEN_MODELS[provider].image }
          : null;
        return sendJson(res, 200, { ok: true, provider, hasKey: configured }, CORS);
      } catch (e) {
        return sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) }, CORS);
      }
    }
    // --- GPU lifecycle (gcp-ltx): the app's one-click Start/Stop for the LTX VM. ---
    if (path === "/gpu/config" && req.method === "POST") {
      try {
        const b = JSON.parse((await readBodyBuffer(req)).toString("utf8")) as Partial<GpuConfig>;
        if (!b.project || !b.zone || !b.instance) return sendJson(res, 400, { error: "project, zone, and instance are required" }, CORS);
        this.gpuConfig = { project: b.project, zone: b.zone, instance: b.instance, port: b.port || 8000, token: b.token };
        return sendJson(res, 200, { ok: true }, CORS);
      } catch (e) {
        return sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) }, CORS);
      }
    }
    if (path === "/gpu/status" && req.method === "GET") {
      if (!this.gpuConfig) return sendJson(res, 200, { status: "stopped", detail: "no GPU configured" }, CORS);
      if (this.gpuState.status === "starting" || this.gpuState.status === "stopping") return sendJson(res, 200, this.gpuState, CORS);
      try { this.gpuState = await probeGpu(this.gpuConfig); this.setGpuBaseUrl(this.gpuState.status === "ready" ? this.gpuState.baseUrl : undefined); }
      catch (e) { this.gpuState = { status: "error", detail: e instanceof Error ? e.message : String(e) }; }
      return sendJson(res, 200, this.gpuState, CORS);
    }
    if (path === "/gpu/start" && req.method === "POST") {
      if (!this.gpuConfig) return sendJson(res, 400, { error: "Configure the GPU first (project/zone/instance)." }, CORS);
      if (this.gpuState.status === "starting") return sendJson(res, 200, this.gpuState, CORS);
      this.gpuState = { status: "starting", detail: "starting…" };
      // Kick off the boot+wait in the background; the UI polls /gpu/status. Never block the request.
      void startVm(this.gpuConfig, undefined, (s) => { this.gpuState = { status: "starting", detail: s }; })
        .then((baseUrl) => { this.gpuState = { status: "ready", baseUrl }; this.setGpuBaseUrl(baseUrl); })
        .catch((e) => { this.gpuState = { status: "error", detail: e instanceof Error ? e.message : String(e) }; });
      return sendJson(res, 202, this.gpuState, CORS);
    }
    if (path === "/gpu/stop" && req.method === "POST") {
      if (!this.gpuConfig) return sendJson(res, 400, { error: "no GPU configured" }, CORS);
      this.gpuState = { status: "stopping", detail: "stopping…" };
      this.setGpuBaseUrl(undefined);
      void stopVm(this.gpuConfig)
        .then(() => { this.gpuState = { status: "stopped" }; })
        .catch((e) => { this.gpuState = { status: "error", detail: e instanceof Error ? e.message : String(e) }; });
      return sendJson(res, 202, this.gpuState, CORS);
    }
    if (path === "/upload" && req.method === "POST") {
      try {
        const name = decodeURIComponent(new URL(req.url ?? "/", "http://x").searchParams.get("name") ?? "upload.bin");
        const bytes = await readBodyBuffer(req);
        const dir = this.executor.projectDir ? join(this.executor.projectDir, "media") : join(tmpdir(), "palmier-media");
        await mkdir(dir, { recursive: true });
        const safe = name.replace(/[^\w.\- ]/g, "_");
        const dest = join(dir, `${Date.now()}-${safe}`);
        await writeFile(dest, bytes);
        const result = await this.executor.importFromPath(dest, name);
        res.writeHead(result.isError ? 400 : 200, { "Content-Type": "application/json", ...CORS });
        res.end(result.content[0].text.startsWith("{") ? result.content[0].text : JSON.stringify({ error: result.content[0].text }));
        return;
      } catch (e) {
        return sendJson(res, 400, { error: e instanceof Error ? e.message : String(e) }, CORS);
      }
    }
    if (path.startsWith("/media/") && req.method === "GET") {
      return this.serveMedia(req, res, decodeURIComponent(path.slice("/media/".length)));
    }
    if (path.startsWith("/waveform/") && req.method === "GET") {
      const wf = await this.executor.waveformFor(decodeURIComponent(path.slice("/waveform/".length)));
      return sendJson(res, 200, wf, CORS);
    }

    if (path !== "/mcp" && path !== "/") {
      res.writeHead(404).end();
      return;
    }
    if ((req.method ?? "GET").toUpperCase() === "GET") {
      // SSE keep-alive stream.
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
      res.write(": connected\n\n");
      return;
    }

    // POST: validation pipeline (origin → content-type → protocol version). CORS on every response
    // so the in-app chat (webview on :1420) can call /mcp directly, same as CLI clients.
    const originErr = validateOrigin(req);
    if (originErr) return sendJson(res, 403, rpcError(null, -32600, originErr), CORS);
    const ctErr = validateContentType(req);
    if (ctErr) return sendJson(res, 415, rpcError(null, -32600, ctErr), CORS);
    const pvErr = validateProtocol(req);
    if (pvErr) return sendJson(res, 400, rpcError(null, -32600, pvErr), CORS);

    let body: string;
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, rpcError(null, -32700, "Failed to read request body"), CORS);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return sendJson(res, 400, rpcError(null, -32700, "Parse error"), CORS);
    }

    // Support single or batched JSON-RPC.
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    const responses: unknown[] = [];
    for (const m of messages) {
      const reply = await this.dispatch(m as JsonRpcRequest);
      if (reply !== null) responses.push(reply);
    }
    if (responses.length === 0) {
      res.writeHead(202, CORS).end(); // notifications only
      return;
    }
    return sendJson(res, 200, Array.isArray(parsed) ? responses : responses[0], CORS);
  }

  /** Stream a media asset's bytes to the webview (preview source). Supports Range for seeking. */
  private async serveMedia(req: IncomingMessage, res: ServerResponse, assetId: string): Promise<void> {
    const asset = this.executor.media.asset(assetId);
    const path = asset
      ? resolveRenderMediaPath(asset.source, this.executor.projectDir ?? ".", publicDir())
      : null;
    if (!path) {
      res.writeHead(404, CORS).end();
      return;
    }
    let size: number;
    try {
      size = (await stat(path)).size;
    } catch {
      res.writeHead(404, CORS).end();
      return;
    }
    const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? parseInt(range[1], 10) : Math.max(0, size - parseInt(range[2], 10));
      const end = range[1] && range[2] ? Math.min(parseInt(range[2], 10), size - 1) : size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}`, ...CORS }).end();
        return;
      }
      res.writeHead(206, {
        "Content-Type": type, "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", ...CORS,
      });
      createReadStream(path, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes", ...CORS });
    createReadStream(path).pipe(res);
  }

  /**
   * Handle one JSON-RPC message and return a JSON-RPC response, or null for notifications.
   * Public entry point shared by both transports: the HTTP handler above and the stdio loop
   * (stdio.ts) both funnel through this so tool-handling logic is never duplicated.
   */
  async handleMessage(msg: JsonRpcRequest): Promise<unknown | null> {
    return this.dispatch(msg);
  }

  /** Returns a JSON-RPC response, or null for notifications. */
  private async dispatch(msg: JsonRpcRequest): Promise<unknown | null> {
    const { id, method } = msg;
    const params = msg.params ?? {};
    const isNotification = id === undefined;
    try {
      switch (method) {
        case "initialize": {
          const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL;
          const skillBlock = await this.executor.skills.promptBlock().catch(() => "");
          return rpcOk(id, {
            protocolVersion: SUPPORTED_PROTOCOLS.has(requested) ? requested : DEFAULT_PROTOCOL,
            capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions: skillBlock ? `${SERVER_INSTRUCTIONS}\n\n${skillBlock}` : SERVER_INSTRUCTIONS,
          });
        }
        case "notifications/initialized":
        case "notifications/cancelled":
          return null;
        case "ping":
          return rpcOk(id, {});
        case "tools/list":
          return rpcOk(id, { tools: ALL_TOOL_DEFS });
        case "tools/call": {
          const name = String(params.name ?? "");
          const args = (params.arguments as Record<string, unknown>) ?? {};
          const result = await this.executor.execute(name, args);
          return rpcOk(id, result);
        }
        case "resources/list":
          return rpcOk(id, { resources: RESOURCES });
        case "resources/read": {
          const uri = String(params.uri ?? "");
          if (uri === "kaestral://models/video" || uri === "kaestral://models/image") {
            return rpcOk(id, { contents: [{ uri, mimeType: "application/json", text: "[]" }] });
          }
          return rpcError(id ?? null, -32602, `Unknown resource: ${uri}`);
        }
        default:
          if (isNotification) return null;
          return rpcError(id ?? null, -32601, `Method not found: ${method}`);
      }
    } catch (e) {
      if (isNotification) return null;
      return rpcError(id ?? null, -32603, e instanceof Error ? e.message : String(e));
    }
  }
}

// --- validators (MCPHTTPServer.swift validation pipeline) ---

function validateOrigin(req: IncomingMessage): string | null {
  const origin = header(req, "origin");
  if (!origin) return null; // CLI clients send no Origin — allowed.
  try {
    const host = new URL(origin).hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") return null;
  } catch {
    /* fall through */
  }
  return "Origin not allowed (localhost only).";
}

function validateContentType(req: IncomingMessage): string | null {
  const ct = header(req, "content-type") ?? "";
  return ct.includes("application/json") ? null : "Content-Type must be application/json.";
}

function validateProtocol(req: IncomingMessage): string | null {
  const v = header(req, "mcp-protocol-version");
  if (!v) return null; // absent is allowed (e.g. the initialize request itself).
  return SUPPORTED_PROTOCOLS.has(v) ? null : `Unsupported MCP-Protocol-Version: ${v}`;
}

// --- helpers ---

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 8 * 1024 * 1024) reject(new Error("body too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/** Binary-safe body reader (uploads; up to 1 GB, matching import_media's documented cap). */
function readBodyBuffer(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024 * 1024) reject(new Error("body too large (max 1 GB)"));
      else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** CORS for the project-bridge endpoints (the app UI on :1420 talks to this server). */
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
};

const MIME: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".aac": "audio/aac", ".m4a": "audio/mp4", ".flac": "audio/flac",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".tiff": "image/tiff", ".webp": "image/webp",
};

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text), ...extraHeaders });
  res.end(text);
}

function rpcOk(id: JsonRpcRequest["id"], result: unknown): unknown {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcError(id: string | number | null, code: number, message: string): unknown {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
