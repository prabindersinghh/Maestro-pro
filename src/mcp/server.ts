// MCP HTTP server. Ported from Agent/MCP/MCPHTTPServer.swift + MCPService.swift.
// Localhost-only (127.0.0.1) on 19789, POST /mcp, GET SSE keep-alive, oauth probe, and the
// three validators (origin / content-type / protocol-version). Server identity palmier-pro 1.0.0.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { stat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { ALL_TOOL_DEFS } from "./toolDefs";
import { resolveRenderMediaPath } from "../render/mediaPath";
import type { McpExecutor } from "./executor";

export const MCP_PORT = 19789;
export const MCP_HOST = "127.0.0.1";
const SERVER_INFO = { name: "palmier-pro", version: "1.0.0" };
const DEFAULT_PROTOCOL = "2025-06-18";
const SUPPORTED_PROTOCOLS = new Set(["2025-06-18", "2025-03-26", "2024-11-05", DEFAULT_PROTOCOL]);

const SERVER_INSTRUCTIONS =
  "Palmier Pro MCP server (Windows port). Call get_timeline at the start of a session. " +
  "Generation and transcription tools are stubbed in this build (canGenerate is false).";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const RESOURCES = [
  { name: "Video Models", uri: "palmier://models/video", description: "Available AI video generation models", mimeType: "application/json" },
  { name: "Image Models", uri: "palmier://models/image", description: "Available AI image generation models", mimeType: "application/json" },
];

export class McpServer {
  private server: Server | null = null;
  constructor(
    private readonly executor: McpExecutor,
    private readonly port: number = MCP_PORT,
    private readonly host: string = MCP_HOST,
  ) {}

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
      ? resolveRenderMediaPath(asset.source, this.executor.projectDir ?? ".", join(process.cwd(), "public"))
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
          if (uri === "palmier://models/video" || uri === "palmier://models/image") {
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
