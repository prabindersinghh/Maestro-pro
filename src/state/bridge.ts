// Project bridge: the app UI syncs its store with the MCP server's shared project state, so the
// user and Claude edit the SAME project. Local edits push (debounced); Claude's MCP edits arrive
// via a 1s poll. Import goes through the server (/upload for browser Files, import_media for
// real Tauri paths), so imported media is immediately visible to both the UI and Claude.

import type { EditorStore } from "./store";

export const BRIDGE_URL = "http://127.0.0.1:19789";

export class ProjectBridge {
  connected = false;
  private lastVersion = -1;
  private applying = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private rpcId = 1;
  /** assetId → local objectURL for instant preview of freshly-uploaded files. */
  readonly objectURLs = new Map<string, string>();

  constructor(private readonly store: EditorStore) {}

  async start(): Promise<void> {
    try {
      const state = await this.fetchState();
      const serverHasContent = Array.isArray((state.timeline as { tracks?: unknown[] })?.tracks)
        && ((state.timeline as { tracks: unknown[] }).tracks.length > 0);
      if (!serverHasContent && this.store.timeline.tracks.length > 0) {
        await this.push(); // seed the server with the local (demo) project
      } else {
        this.apply(state);
      }
      this.connected = true;
    } catch {
      this.connected = false;
    }
    this.pollTimer ??= setInterval(() => void this.poll(), 1000);
    this.store.emit();
  }

  stop(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Force an immediate pull of server state (used after the in-app agent runs a tool). */
  async syncNow(): Promise<void> { await this.poll(); }

  /** Called by the store on every local edit. */
  onLocalChange(): void {
    if (this.applying) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.push(), 300);
  }

  private async fetchState(): Promise<{ version: number; timeline: unknown; media: unknown }> {
    const r = await fetch(`${BRIDGE_URL}/state`);
    if (!r.ok) throw new Error("Couldn't reach the project engine — is it still running?");
    return (await r.json()) as { version: number; timeline: unknown; media: unknown };
  }

  private async poll(): Promise<void> {
    try {
      const state = await this.fetchState();
      const wasConnected = this.connected;
      this.connected = true;
      if (state.version !== this.lastVersion) {
        this.apply(state);
      }
      if (!wasConnected) this.store.emit();
    } catch {
      if (this.connected) {
        this.connected = false;
        this.store.emit();
      }
    }
  }

  private apply(state: { version: number; timeline: unknown; media: unknown }): void {
    this.applying = true;
    try {
      this.store.applyRemoteState(state.timeline, state.media);
      this.lastVersion = state.version;
    } finally {
      this.applying = false;
    }
  }

  async push(): Promise<void> {
    try {
      const r = await fetch(`${BRIDGE_URL}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.store.serializeState()),
      });
      if (r.ok) {
        this.lastVersion = ((await r.json()) as { version: number }).version;
        this.connected = true;
      }
    } catch {
      this.connected = false;
    }
  }

  /** Import a browser File: upload bytes → server saves + probes + registers; local objectURL for instant preview. */
  async importFile(file: File): Promise<string | null> {
    const r = await fetch(`${BRIDGE_URL}/upload?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ error: "Couldn't import that file — is the project engine still running?" }))).error ?? "Couldn't import that file — is the project engine still running?");
    const { assetId } = (await r.json()) as { assetId: string };
    this.objectURLs.set(assetId, URL.createObjectURL(file));
    await this.poll(); // pull the new asset into the store now
    return assetId;
  }

  /** Import a real on-disk path (Tauri drag-drop / file picker) via the import_media MCP tool. */
  async importPath(path: string): Promise<string | null> {
    const r = await fetch(`${BRIDGE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: this.rpcId++, method: "tools/call",
        params: { name: "import_media", arguments: { source: { path } } },
      }),
    });
    if (!r.ok) throw new Error("Couldn't reach the project engine — is it still running?");
    const json = (await r.json()) as { result?: { isError?: boolean; content: { text: string }[] } };
    if (!json.result || json.result.isError) throw new Error(json.result?.content[0]?.text ?? "Couldn't import that file.");
    const { assetId } = JSON.parse(json.result.content[0].text) as { assetId: string };
    await this.poll();
    return assetId;
  }

  /** Call any MCP tool from the UI, then pull the resulting state so edits show immediately. */
  async callTool(name: string, args: unknown): Promise<Record<string, unknown>> {
    const r = await fetch(`${BRIDGE_URL}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.rpcId++, method: "tools/call", params: { name, arguments: args } }),
    });
    if (!r.ok) throw new Error("Couldn't reach the project engine — is it still running?");
    const json = (await r.json()) as { result?: { isError?: boolean; content: { text: string }[] } };
    const text = json.result?.content[0]?.text ?? "";
    if (!json.result || json.result.isError) throw new Error(text || "That request didn't go through. Please try again.");
    await this.poll();
    try { return JSON.parse(text) as Record<string, unknown>; } catch { return { text }; }
  }

  /** Save the hosted-generation BYOK config on the server (used by generate_video/image). */
  async saveGenConfig(cfg: { provider: string; apiKey: string; videoModel?: string; imageModel?: string }): Promise<void> {
    const r = await fetch(`${BRIDGE_URL}/gen-config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ error: "Couldn't save your generation settings — is the project engine still running?" }))).error ?? "Couldn't save your generation settings — is the project engine still running?");
  }

  async genConfigStatus(): Promise<{ provider: string; hasKey: boolean }> {
    const r = await fetch(`${BRIDGE_URL}/gen-config`);
    if (!r.ok) return { provider: "fal", hasKey: false };
    return (await r.json()) as { provider: string; hasKey: boolean };
  }

  // --- gcp-ltx GPU lifecycle ---
  async saveGpuConfig(cfg: { project: string; zone: string; instance: string; port: number; token?: string }): Promise<void> {
    const r = await fetch(`${BRIDGE_URL}/gpu/config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ error: "Couldn't save the GPU settings — is the project engine still running?" }))).error ?? "Couldn't save the GPU settings — is the project engine still running?");
  }
  async gpuAction(action: "start" | "stop"): Promise<{ status: string; detail?: string; baseUrl?: string }> {
    const r = await fetch(`${BRIDGE_URL}/gpu/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error((await r.json().catch(() => ({ error: `Couldn't ${action} the GPU. Please try again.` }))).error ?? `Couldn't ${action} the GPU. Please try again.`);
    return (await r.json()) as { status: string; detail?: string; baseUrl?: string };
  }
  async gpuStatus(): Promise<{ status: string; detail?: string; baseUrl?: string }> {
    const r = await fetch(`${BRIDGE_URL}/gpu/status`);
    if (!r.ok) return { status: "error", detail: "Couldn't check GPU status right now." };
    return (await r.json()) as { status: string; detail?: string; baseUrl?: string };
  }
}
