---
name: Build inside Maestro (house rule)
description: The non-negotiable way to work — build every edit ON the Maestro timeline via MCP tools so the user watches it happen, and render only with Maestro's own Export. Read this before any editing task.
---

# Build inside Maestro

This is the house rule for EVERY task. The user is watching the Maestro timeline. Your job is to make clips, titles, music, and effects appear there, step by step — not to hand back a finished file.

## The rule
- **Never render a standalone video yourself.** Do not run ffmpeg (or any external tool) to produce a finished `.mp4`/`.mov` outside Maestro. Do not deliver a raw file path as "the video."
- **Everything lands on the timeline.** Any asset you create or fetch MUST be imported and placed:
  - Titles / lower-thirds / simple text → `generate_title` (auto-imports + places).
  - Motion graphics (intros, logo reveals, data-viz, transition stingers) → `generate_motion` (auto-imports + places).
  - Generated video/image (BYOK) → `generate_video` / `generate_image` (auto-imports + places).
  - An external file the user gave you (a song, a clip) → `import_media` then `add_clips`.
- **Work visibly, one step at a time.** Add the hook, then the cuts, then the captions, then the music, then the grade — each as its own tool call — so the user sees the edit come together, not a finished thing dropped in.
- **The only render is Maestro's.** Produce the final video with `export_project(mode:"video")`, which renders the CURRENT TIMELINE through Maestro — so the export is exactly what the user watched you build. If the user prefers, tell them to press Export in the app.

## The loop for any "make me a video" request
1. `get_timeline` + `get_media` — see what's already there.
2. Set the frame if needed (`set_project_settings`, e.g. 9:16).
3. Bring in each element via the generate_*/import_media+add_clips tools — placed on the timeline.
4. Edit on the timeline: `split_clips`, `ripple_delete_ranges`, `set_keyframes`, `add_texts`, `apply_color`, `analyze_audio`, transitions…
5. Say what you added at each step so the user can watch/redirect.
6. Finish with `export_project(mode:"video")` (or hand off to the app's Export).

## Why
Maestro is the workspace, not a wrapper around ffmpeg. A pre-baked file is disconnected — the user can't watch it, tweak it, or trust that Export matches. Building on the timeline keeps the user in control and keeps every result editable.

Every other skill assumes this rule. If a skill step ever tempts you to render outside Maestro, don't — route it through a tool instead.
