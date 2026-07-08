// In-app agent (Option A) — ported in spirit from Palmier's Agent/Panel + Agent/Clients/
// AnthropicClient.swift. Runs the Claude tool-use loop directly from the webview: the LLM call goes
// to the Anthropic Messages API (BYOK, dangerous-direct-browser-access), and every tool_use is
// executed against the SAME local MCP server the app is synced to — so edits (and generated clips)
// appear live on the timeline.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type Role = "user" | "assistant";
export interface ContentBlock { type: string; [k: string]: unknown }
export interface Msg { role: Role; content: string | ContentBlock[] }

interface ToolDef { name: string; description: string; input_schema: unknown }

const SYSTEM = `You are the editing assistant inside Maestro, an AI-native video editor (a Windows port of Palmier Pro). You edit the user's timeline by calling tools. Always call get_timeline at the start of a task to see the current state, then make the edits. When the user asks for a title/intro/logo reveal/data-viz/transition, use generate_title (simple text) or generate_motion (complex motion graphics) — they render a real clip and place it on the timeline automatically. For their own uploaded media, use add_clips to place it. Keep replies short; let the edits speak. After editing, briefly say what you did.`;

export interface AgentCallbacks {
  onMessages: (messages: Msg[], thinking: boolean) => void;
  onToolCall: (name: string) => void;
  afterTool: () => void; // hook to force a UI/state sync after each tool runs
}

export class MaestroAgent {
  messages: Msg[] = [];
  private tools: ToolDef[] | null = null;
  running = false;

  constructor(
    private readonly cfg: { apiKey: () => string; model: () => string; mcpBase: string },
    private readonly cb: AgentCallbacks,
  ) {}

  reset(): void { this.messages = []; this.cb.onMessages(this.messages, false); }

  private async loadTools(): Promise<ToolDef[]> {
    if (this.tools) return this.tools;
    const r = await this.rpc("tools/list", {});
    this.tools = (r.tools as { name: string; description: string; inputSchema: unknown }[]).map((t) => ({
      name: t.name, description: t.description, input_schema: t.inputSchema,
    }));
    return this.tools;
  }

  private async rpc(method: string, params: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.cfg.mcpBase}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(JSON.stringify(j.error));
    return j.result;
  }

  private async callTool(name: string, input: unknown): Promise<string> {
    const r = await this.rpc("tools/call", { name, arguments: input });
    const content = (r.content as { text?: string }[]) ?? [];
    return content.map((c) => c.text ?? "").join("\n") || "(no output)";
  }

  private async callAnthropic(tools: ToolDef[]): Promise<{ content: ContentBlock[]; stop_reason: string }> {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.cfg.apiKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: this.cfg.model(), max_tokens: 4096, system: SYSTEM, tools, messages: this.messages }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 400)}`);
    }
    const j = await res.json();
    return { content: j.content as ContentBlock[], stop_reason: j.stop_reason as string };
  }

  /** Run one user turn to completion (chains tool calls until the model stops). */
  async send(userText: string, attachments: ContentBlock[] = []): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const tools = await this.loadTools();
      const userContent: ContentBlock[] = [...attachments, { type: "text", text: userText }];
      this.messages.push({ role: "user", content: userContent });
      this.cb.onMessages(this.messages, true);

      for (let guard = 0; guard < 24; guard++) {
        const resp = await this.callAnthropic(tools);
        this.messages.push({ role: "assistant", content: resp.content });
        this.cb.onMessages(this.messages, true);

        const toolUses = resp.content.filter((c) => c.type === "tool_use");
        if (toolUses.length === 0) break;

        const results: ContentBlock[] = [];
        for (const tu of toolUses) {
          this.cb.onToolCall(tu.name as string);
          let text: string;
          try { text = await this.callTool(tu.name as string, tu.input); }
          catch (e) { text = `Error: ${e instanceof Error ? e.message : String(e)}`; }
          results.push({ type: "tool_result", tool_use_id: tu.id as string, content: text });
          this.cb.afterTool(); // pull the new server state into the UI live
        }
        this.messages.push({ role: "user", content: results });
        this.cb.onMessages(this.messages, true);
      }
    } finally {
      this.running = false;
      this.cb.onMessages(this.messages, false);
    }
  }
}
