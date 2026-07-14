# Step 4 report — MCP stdio transport, tool count reconciliation, docs, registry prep

## Status
DONE. All deliverables implemented, tested, and committed.

## Commit
`fa149802a5f01556fb2f620519a510dfc49ab850`
"feat(mcp): stdio transport so npx kaestral is one-command; reconcile tool count; MCP + registry docs"

Files: README.md, bin/kaestral.mjs, docs/MCP-TOOLS.md, docs/MCP-REGISTRY.md (new),
src/mcp/main.ts, src/mcp/server.ts, src/mcp/stdio.ts (new), src/mcp/__tests__/stdio.test.ts (new).
dist-server/ is gitignored (build artifact) — not committed, rebuilt locally and verified.

## Stdio implementation: hand-rolled, not the SDK Server class

Reused the existing `dispatch()` rather than re-plumbing onto `@modelcontextprotocol/sdk`'s
`Server`/`StdioServerTransport`. Made `dispatch` reachable via a new public method
`McpServer.handleMessage(msg): Promise<unknown|null>` (src/mcp/server.ts) that just calls the same
private `dispatch()` — zero duplication of the tool-handling switch. `JsonRpcRequest` is now
exported so stdio.ts can type against it.

New `src/mcp/stdio.ts` exports `runStdio(executor): Promise<void>`: constructs `new McpServer(executor)`
(never calls `.start()`, so no HTTP port is bound), reads `process.stdin` via `node:readline` in line
mode, JSON-parses each line, feeds it to `handleMessage`, and writes `JSON.stringify(response) + "\n"`
to `process.stdout`. Notifications (id undefined) produce no output. Parse errors return
`{jsonrpc:"2.0", id:null, error:{code:-32700, message:"Parse error"}}` without crashing the loop.
Batched (array) JSON-RPC is supported symmetrically with the HTTP path. `rl.on("close")` resolves the
promise for clean exit on stdin EOF.

Why hand-rolled: the SDK's `Server` class expects handlers registered against its own tool-call
abstraction, which would mean re-registering all 50 tools a second way and risking drift from the
HTTP path's `dispatch()`. Piping the SDK's `StdioServerTransport` directly into the existing
hand-rolled dispatch isn't a clean fit either — it's designed to pair with the SDK's own `Server`,
not an arbitrary JSON-RPC function. A ~15-line readline loop over the *same* dispatch function is
lower risk and guarantees the two transports can never disagree on tool behavior.

`src/mcp/main.ts`: default (no flag) = stdio via `runStdio(executor)`; `--http` = the existing
`McpServer.start()` HTTP path, unchanged. The optional `.palmier` project-dir positional arg works
in both modes (`--http` is filtered out before reading the dir arg). No stdout writes in stdio mode
outside stdio.ts's JSON-RPC lines — the startup line goes to `console.error`.

`bin/kaestral.mjs`: default `npx kaestral` now runs stdio mode (no flag passed to server.cjs);
`npx kaestral --http` runs HTTP mode (flag forwarded). All human-readable hints
(`console.error`) go to stderr in both modes; the child inherits stdio so its own stdout discipline
(clean JSON-RPC only in stdio mode) is what matters, and that was verified directly.

## Stdio test result — clean stdout confirmed end-to-end

`src/mcp/__tests__/stdio.test.ts` spawns the real built `dist-server/server.cjs` (stdio mode, no
args) as a child process and drives it over real stdin/stdout pipes:
- `initialize` → valid response, `serverInfo` exactly `{name:"kaestral", version:"1.0.0"}`,
  `capabilities.tools` present. PASS.
- `tools/list` → returns all 50 tools including `get_timeline`, `read_skill`, `generate_motion`,
  `analyze_audio`. PASS.
- A notification (`notifications/initialized`, no `id`) → produces zero stdout lines. PASS.
- A malformed (non-JSON) stdin line → yields `{id:null, error:{code:-32700}}` on stdout without
  killing the process. PASS.
- Final assertion: every stdout line emitted during the whole test is valid parseable JSON-RPC
  (`jsonrpc:"2.0"`) — no banner text, no stray console.log output. PASS.

I additionally manually spawned `bin/kaestral.mjs` (the actual `npx kaestral` entry point, not just
server.cjs) with piped stdio and sent a raw `initialize` over stdin: stdout contained exactly one
JSON-RPC line (kaestral 1.0.0), and all human text ("Kaestral engine starting (stdio)… connect
with: claude mcp add kaestral -- npx kaestral") landed on stderr. Then manually verified
`bin/kaestral.mjs --http` still serves HTTP on 127.0.0.1:19789/mcp exactly as before (200 OK,
correct JSON-RPC body) — HTTP mode is unchanged/unbroken.

`npx vitest run src/mcp`: **9 test files, 45 tests, all passed** (the 8 pre-existing suites +
the new stdio suite), ~11-12s.

## Reconciled tool count: 50

`ALL_TOOL_DEFS` = `TOOL_DEFS` (41, frozen parity contract) + `SKILL_TOOL_DEFS` (2:
list_skills, read_skill) + `MOTION_TOOL_DEFS` (3: generate_title, generate_motion, compose_motion)
+ `ANALYSIS_TOOL_DEFS` (4: analyze_audio, extract_palette, import_from_url, see_video) = **50**.
Verified by grep count of `name: "` entries in toolDefs.ts (50) and by the existing
`server.test.ts` assertion `tools.length).toBe(50)`, which was already correct — only the docs
disagreed.

Updated to say "50" (not "48+" and not "43"):
- README.md — "48+ MCP tools" → "50 MCP tools" (with a link to docs/MCP-TOOLS.md), and "MCP server
  exposing 48+ tools" → "exposing 50 tools" in the "How it works" section.
- docs/MCP-TOOLS.md — "43 tools" → "50 tools", with the full 41+2+3+4 breakdown spelled out and a
  pointer to the test that enforces it.

**NOT touched (explicitly out of scope per task):** landing/index.html — it very likely still says
"48+ MCP tools" or similar and should be updated to "50" by whichever task owns that file.

## MCP docs quality pass (docs/MCP-TOOLS.md)

Added a "Connect" section at the top with both transports: the one-step stdio quickstart
(`claude mcp add kaestral -- npx kaestral`) as the recommended path, and the HTTP two-step
(`npx kaestral --http` + `claude mcp add --transport http ...`) for the desktop-app / long-lived-engine
case. Added a "Tool categories" table (11 categories, one-line purpose each, all 50 tools named) and
a pointer to `src/mcp/toolDefs.ts` (`ALL_TOOL_DEFS`) as the canonical schema source. Left the existing
capability audit (✅/🟡/⛔/🔒 tables) intact — it was already good, just re-titled/re-numbered under
a "Capability audit" heading rather than rewritten.

## Registry submission prep

Created `docs/MCP-REGISTRY.md`: server name (`kaestral`), one-line + paragraph description, npm
package name, install/run (`npx kaestral`), connect command, transport (stdio, default; HTTP noted
as secondary/desktop-app use), prerequisites (FFmpeg/ffprobe on PATH, Node for npx, whisper model
download-on-first-use), homepage, license (GPL-3.0-or-later), tool count/category table matching
MCP-TOOLS.md, and a draft `server.json` manifest.

**Flagged as uncertain / needs verification against the live registry schema before filing** (I did
not fabricate these, I marked them explicitly in the doc):
- Exact `name` namespacing convention (drafted as `io.github.prabindersinghh/kaestral` — reverse-DNS-ish
  tied to a verified GitHub owner; confirm this is still current).
- Whether `packages[].runtime_hint` is still a live field name.
- Whether `packages[].transport` is the correct way to declare stdio, or whether that's implicit
  for npm packages in the current schema.
- Whether the registry expects one manifest entry per package or supports declaring both stdio and
  HTTP transports for the same server.
- Whether `homepage` is a top-level manifest field.

## Build/verify results
- `npx tsc --noEmit` → exit 0, no errors.
- `npx vitest run src/mcp` → 9 files / 45 tests, all green (includes new stdio suite).
- `npm run bundle:server` → succeeded, `dist-server/server.cjs` (331.5kb) and `renderCli.cjs`
  rebuilt and used by the stdio test + manual verification.

## The one-command connect string that now works
```
claude mcp add kaestral -- npx kaestral
```
Verified live: Claude Code (or any stdio-spawning MCP client) running this will spawn `npx kaestral`,
which runs `bin/kaestral.mjs` → `dist-server/server.cjs` with no flag → stdio mode by default →
clean JSON-RPC on stdout, ready to handshake immediately. `npx kaestral --http` +
`claude mcp add --transport http kaestral http://127.0.0.1:19789/mcp` remains available and unchanged
for the desktop app / HTTP-preferring clients.
