# Kaestral — MCP registry submission prep

Prep notes for submitting Kaestral to the official MCP registry
([modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)). This is a
staging doc, not the submission itself — verify current schema/process details against the
registry repo before filing, since both move.

## Server identity

| Field | Value |
|---|---|
| Server name | `kaestral` |
| Wire identity (`serverInfo` in MCP `initialize`) | `{ "name": "kaestral", "version": "1.0.0" }` |
| npm package | [`kaestral`](https://www.npmjs.com/package/kaestral) |
| Homepage / repo | https://github.com/prabindersinghh/Kaestral-pro |
| License | GPL-3.0-or-later |
| Version | 1.0.0 |

## Description

**One-line:** The AI-operated video editor for Windows — cut, caption, grade, and export a real
timeline by prompt, over MCP.

**Paragraph:** Kaestral is a full non-linear video editor for Windows that exposes its entire
editing surface as MCP tools, so an LLM (Claude Code, or any MCP-speaking client) can operate it
directly: read the timeline and media library, cut and arrange clips, transcribe speech on-device
and cut by word, detect beats and silences, apply color grades and effects, generate titles and
motion graphics, and export to H.264/H.265/ProRes or interchange formats (Premiere XMEML, Resolve
FCPXML). Every action lands on a real, still-editable multi-track project — not a black-box
render. It is a GPLv3 Windows port of Palmier Pro (macOS).

## Install / run / connect

Install/run command:
```bash
npx kaestral
```

Connect command (one step — the whole point of this transport):
```bash
claude mcp add kaestral -- npx kaestral
```

Transport: **stdio** (default). Claude Code (or any MCP client that spawns a stdio server) runs
`npx kaestral` as a child process and speaks newline-delimited JSON-RPC over its stdin/stdout.
stdout carries only JSON-RPC; all logs go to stderr.

An HTTP transport also exists (`npx kaestral --http`, matching
`claude mcp add --transport http kaestral http://127.0.0.1:19789/mcp`) — used by the Kaestral
desktop app to talk to its own bundled engine, and available for clients that prefer HTTP. The
registry submission should list **stdio** as the primary/default transport since that's what
`npx kaestral` runs without flags.

## Prerequisites

- **FFmpeg + ffprobe on PATH.** Required for media probing, transcoding, and export. Not bundled;
  the server surfaces a clear error if missing rather than failing silently.
- **Node.js** (to run via `npx`). No other runtime install step.
- The bundled whisper.cpp transcription model (~142 MB) downloads on first use of a
  transcription-dependent tool (`get_transcript`, `add_captions`, `remove_words`).
- Windows is the primary target platform for this build (macOS is on the roadmap for the upstream
  Palmier Pro project, not yet for this port).

## Tool count and categories

**50 tools** total, in 11 categories. See [MCP-TOOLS.md](./MCP-TOOLS.md) for the full breakdown
with one-line purposes, and [`src/mcp/toolDefs.ts`](../src/mcp/toolDefs.ts) (`ALL_TOOL_DEFS`) for
exact machine-readable schemas.

| Category | Count |
|---|---|
| Read / inspect | 6 |
| Timeline edit | 13 |
| Text / captions | 3 |
| Color / effects | 3 |
| Media library | 8 |
| Project / misc | 3 |
| Generation (signed-out shape in this build) | 4 |
| Feedback | 1 |
| Skills extension | 2 |
| Motion graphics extension | 3 |
| Analysis / perception extension | 4 |
| **Total** | **50** |

## Example `server.json` manifest (draft)

The registry's manifest schema is still evolving; treat field names below as best-effort based on
the publicly documented shape at the time of writing, and **verify every field against the current
registry schema before submitting** (fields marked below are the ones most likely to need
adjustment).

```json
{
  "name": "io.github.prabindersinghh/kaestral",
  "description": "The AI-operated video editor for Windows — cut, caption, grade, and export a real timeline by prompt, over MCP.",
  "repository": {
    "url": "https://github.com/prabindersinghh/Kaestral-pro",
    "source": "github"
  },
  "version": "1.0.0",
  "license": "GPL-3.0-or-later",
  "packages": [
    {
      "registry_name": "npm",
      "name": "kaestral",
      "version": "1.0.0",
      "runtime_hint": "node",
      "runtime_arguments": [],
      "package_arguments": [],
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

Notes / open questions to resolve before filing (verify against current registry schema):
- **`name` namespacing**: the registry uses a reverse-DNS-ish namespace tied to a verified GitHub
  org/user (`io.github.<owner>/<name>` at the time of writing) — confirm the exact convention and
  that `prabindersinghh` is the correct owner segment.
  - `packages[].runtime_hint` — confirm whether `"node"` is still the expected value for an
  npm/npx-run stdio server, or whether the field has been renamed/removed.
- `packages[].transport` — confirm the current registry schema's way of declaring a package
  defaults to stdio (some schema drafts express this implicitly for npm packages rather than via
  an explicit `transport` object).
- Whether the registry wants a separate manifest entry for the HTTP transport (`--http` mode), or
  whether registry entries are expected to be single-transport (stdio, in this case) with HTTP
  mentioned only in the description/README.
- Whether `homepage` is a top-level manifest field or derived from `repository.url`.
- Icon/logo asset requirements, if any, for the registry listing.

## Links for the submission

- Homepage / repo: https://github.com/prabindersinghh/Kaestral-pro
- npm package: https://www.npmjs.com/package/kaestral
- License: [LICENSE](../LICENSE) (GPL-3.0-or-later), attribution in [NOTICE.md](../NOTICE.md)
- Tool docs: [MCP-TOOLS.md](./MCP-TOOLS.md)
