# Kaestral MCP tools

Kaestral runs an MCP server that exposes the full editor as tool calls. This doc has two parts:
**Connect** (how to point a client at it) and **Capability audit** (what each tool actually does
right now). For exact machine-readable schemas (input params, types, enums), see the source of
truth: [`src/mcp/toolDefs.ts`](../src/mcp/toolDefs.ts) — specifically `ALL_TOOL_DEFS`.

## Connect

Kaestral supports two MCP transports. Both expose the identical tool set and dispatch logic.

### stdio (recommended — one command, zero config)
```bash
claude mcp add kaestral -- npx kaestral
claude
```
Claude Code spawns `npx kaestral` itself and speaks newline-delimited JSON-RPC over its
stdin/stdout. There's no port, no separate process to manage, and nothing to configure.

### HTTP (for a long-lived engine, or the desktop app's own connection)
```bash
npx kaestral --http     # starts the local editor engine on http://127.0.0.1:19789/mcp
claude mcp add --transport http kaestral http://127.0.0.1:19789/mcp
claude
```
Use this if you want the engine running independently of any single `claude` session (e.g. also
driving it from the in-app chat), or you're integrating a client that only speaks HTTP. The
desktop app always uses this transport internally, bound to `127.0.0.1:19789`.

Both modes accept an optional `.palmier` project directory as an extra arg
(`npx kaestral "C:/path/to/My Project.palmier"`) to load an existing project instead of starting
empty.

Requires **FFmpeg + ffprobe on PATH**. The whisper transcription model (~142 MB) downloads on
first use.

## Capability audit

What Claude can actually do over MCP right now. Categories: **✅ fully wired**
(real behavior), **🟡 partial**, **⛔ stubbed** (needs infra not in this build), **🔒 signed-out by
design** (Palmier's closed cloud). Verified live over the running MCP server unless noted.

Advertised: **50 tools** = the frozen **41** parity tools + **2** Kaestral Skills extensions
(`list_skills`, `read_skill`) + **3** motion-graphics extensions (`generate_title`,
`generate_motion`, `compose_motion`) + **4** analysis/perception extensions (`analyze_audio`,
`extract_palette`, `import_from_url`, `see_video`). Exact count is enforced by a test
(`src/mcp/__tests__/server.test.ts`) against `ALL_TOOL_DEFS.length` in `src/mcp/toolDefs.ts`.

### Tool categories (one-line purpose each)

| Category | Tools | Purpose |
|---|---|---|
| Read / inspect | `get_timeline`, `get_media`, `inspect_media`, `get_transcript`, `inspect_timeline`, `search_media` | Read current project/timeline/media state before editing. |
| Timeline edit | `add_clips`, `insert_clips`, `remove_clips`, `remove_tracks`, `move_clips`, `apply_layout`, `set_clip_properties`, `set_keyframes`, `split_clips`, `ripple_delete_ranges`, `remove_words`, `sync_audio`, `undo` | Cut, place, and arrange clips on the timeline. |
| Text / captions | `add_texts`, `update_text`, `add_captions` | Add and style on-screen text and word-timed captions. |
| Color / effects | `apply_effect`, `apply_color`, `inspect_color` | Grade and apply non-color effects (blur, key, stylize). |
| Media library | `import_media`, `list_folders`, `create_folder`, `move_to_folder`, `rename_media`, `rename_folder`, `delete_media`, `delete_folder` | Manage the project's media assets and folders. |
| Project / misc | `export_project`, `set_project_settings`, `list_models` | Export, configure project settings, and list generation models. |
| Generation (signed-out shape) | `generate_video`, `generate_image`, `generate_audio`, `upscale_media` | AI generation/upscale — return Palmier's signed-out shape in this build. |
| Feedback | `send_feedback` | Report an agent limitation or bug. |
| Skills extension | `list_skills`, `read_skill` | Discover and load Kaestral's editing playbooks (skills). |
| Motion graphics extension | `generate_title`, `generate_motion`, `compose_motion` | Generate titles, template motion graphics, and bespoke generative scenes. |
| Analysis / perception extension | `analyze_audio`, `extract_palette`, `import_from_url`, `see_video` | Beat/silence detection, palette extraction, URL import, and frame vision. |

Full input schemas (types, required fields, enums) for every tool above live in
[`src/mcp/toolDefs.ts`](../src/mcp/toolDefs.ts) as `TOOL_DEFS`, `SKILL_TOOL_DEFS`,
`MOTION_TOOL_DEFS`, and `ANALYSIS_TOOL_DEFS` (combined as `ALL_TOOL_DEFS`).

## ✅ Fully wired (27)
| Tool | Notes / evidence |
|------|------|
| get_timeline | full timeline JSON (verified) |
| get_media | media rows (verified) |
| add_clips | places clips + auto linked-audio for video-with-audio (verified real-footage export) |
| insert_clips | ripple insert |
| remove_clips | verified |
| remove_tracks | verified |
| move_clips | verified |
| split_clips | verified |
| set_clip_properties | speed/volume/opacity/transform/blend |
| set_keyframes | **verified live**: "Set 2 keyframes on opacity", kf count = 2 in timeline (rows are `[frame,value,interp?]`) |
| ripple_delete_ranges | verified (cut real footage over MCP) |
| undo | assistant-scoped undo |
| add_texts | **verified live**: created a text clip |
| update_text | **verified live**: "Updated 1 text clip" (takes `clipIds`) |
| apply_color | **verified live in-app**: exposure +2 → preview pixel brightened to white |
| apply_effect | effect stack |
| apply_layout | **NEWLY WIRED + verified**: `side_by_side` computed correct cover-crop transforms |
| import_media | ffprobe metadata (verified: real mp4/png) |
| list_folders / create_folder / move_to_folder / rename_folder / delete_folder | folder CRUD |
| rename_media / delete_media | media CRUD |
| export_project | XMEML / FCPXML / .palmier / **H.264·H.265·ProRes video** (verified real-footage MP4) |
| set_project_settings | fps/size/etc |
| send_feedback | records |

## 🟡 Partial / could be extended
| Tool | State | To finish |
|------|-------|-----------|
| list_models | returns signed-out shape `{models:[],loaded:false}` | real once ③ generation backend lands |
| inspect_timeline | ⛔ stub | could render+sample a frame (compositor exists) — not yet |
| inspect_color | ⛔ stub | could sample the graded frame — not yet |
| inspect_media | ⛔ stub | dims/duration are available via ffprobe; transcription is not |

## ⛔ Stubbed — need on-device ML not in this build (honest)
| Tool | Blocked on |
|------|-----------|
| get_transcript, add_captions, remove_words | word-level transcription (whisper / ElevenLabs Scribe) — **arrives with STRATEGY ①** |
| search_media | semantic/embedding search |
| sync_audio | audio cross-correlation (Palmier's AudioSyncCorrelator is portable; not yet) |

Returning `"…not available in this build"` is a deliberate, documented stub — not a failure.

## 🔒 Signed-out by design (Palmier's closed paid cloud)
`generate_video`, `generate_image`, `generate_audio`, `upscale_media` — return the signed-out shape.
**STRATEGY ③** replaces these with a free/open generator (LTX-2 local, or Fal/Replicate hosted).

## 🧩 Kaestral Skills extensions (beyond the frozen 41)
| Tool | Notes |
|------|------|
| list_skills | **verified live**: lists palmier-skills (color-grading, ugc-editing, ugc-photo-prompts, ugc-video-prompts) |
| read_skill | **verified live**: `read_skill('color-grading')` → real 8,474-char body |
