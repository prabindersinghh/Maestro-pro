# Maestro MCP tools — capability audit

What Claude can actually do over MCP right now (`127.0.0.1:19789/mcp`). Categories: **✅ fully wired**
(real behavior), **🟡 partial**, **⛔ stubbed** (needs infra not in this build), **🔒 signed-out by
design** (Palmier's closed cloud). Verified live over the running MCP server unless noted.

Advertised: **43 tools** = the frozen **41** parity tools + **2** Maestro Skills extensions
(`read_skill`, `list_skills`).

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

## 🧩 Maestro Skills extensions (beyond the frozen 41)
| Tool | Notes |
|------|------|
| list_skills | **verified live**: lists palmier-skills (color-grading, ugc-editing, ugc-photo-prompts, ugc-video-prompts) |
| read_skill | **verified live**: `read_skill('color-grading')` → real 8,474-char body |
