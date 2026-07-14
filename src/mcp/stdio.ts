// MCP stdio transport. Speaks newline-delimited JSON-RPC over process.stdin/stdout — the framing
// used by the MCP stdio transport (NOT LSP-style Content-Length headers). This is what lets
// `claude mcp add kaestral -- npx kaestral` work as a single command: Claude Code spawns the
// process and talks JSON-RPC directly over its stdio pipes.
//
// CRITICAL invariant: stdout carries ONLY JSON-RPC response lines. Every other bit of output
// (logs, startup banners, errors) MUST go to stderr via console.error — never console.log — or
// it corrupts the stream and the client fails to parse it.
//
// We deliberately reuse McpServer.handleMessage (the same dispatch() used by the HTTP transport)
// rather than re-plumbing onto the MCP SDK's Server class, so tool-handling logic lives in exactly
// one place.

import { createInterface } from "node:readline";
import { McpServer, type JsonRpcRequest } from "./server";
import type { McpExecutor } from "./executor";

/** Run the MCP server over stdio until stdin closes. Resolves on clean shutdown. */
export function runStdio(executor: McpExecutor): Promise<void> {
  // Constructed but never start()-ed — start() binds the HTTP listener, which stdio mode doesn't use.
  const server = new McpServer(executor);

  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, terminal: false });

    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return; // ignore blank lines between messages

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // JSON-RPC parse error: id is unknown, so per spec use id: null.
        writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        return;
      }

      // Support single or batched JSON-RPC, same as the HTTP transport.
      const messages = Array.isArray(parsed) ? parsed : [parsed];
      void (async () => {
        const responses: unknown[] = [];
        for (const m of messages) {
          try {
            const reply = await server.handleMessage(m as JsonRpcRequest);
            if (reply !== null) responses.push(reply);
          } catch (e) {
            // Defensive: handleMessage already catches internally, but never let a throw kill the loop.
            responses.push({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
            });
          }
        }
        if (responses.length === 0) return; // notifications only — no response line
        // Batched request → one batched (array) response line; single request → one response line.
        writeMessage(Array.isArray(parsed) ? responses : responses[0]);
      })();
    });

    rl.on("close", () => resolve());
    process.stdin.on("error", () => resolve());
  });
}

/** Write one JSON-RPC message as a single line to stdout (the only thing allowed on stdout). */
function writeMessage(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
