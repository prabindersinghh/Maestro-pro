---
name: B-roll planner
description: Plan and place B-roll cutaways over an A-roll talking track — from the media library or generated (BYOK).
---

# B-roll planner

Follow the `build-in-maestro` house rule: every cutaway is placed ON the Maestro timeline via tools, and any b-roll you generate is imported + placed (`generate_video`/`generate_image` auto-place; external files via `import_media` + `add_clips`) — never assembled into a standalone file. Finish with `export_project(mode:"video")`.

B-roll hides cuts, illustrates the point, and adds visual variety. Goal: overlay relevant cutaways on top of the A-roll at the right moments.

## 1. Understand the A-roll
- `get_timeline` for the main (A-roll) clips; `get_media` for what's already in the library.
- Identify the moments that need visual support: a concept mentioned, a slow stretch, a place/object referenced, or a cut you want to hide.
- **Know what's said:** call `get_transcript` on the A-roll → word-level text + timestamps. Now you can place a cutaway exactly when a topic is mentioned (e.g. B-roll of coffee the moment "coffee" is said).
- **Know what's shown:** `see_video` on the A-roll (and on library clips) to read the actual content — so your cutaways match the subject and don't clash with what's on screen.

## 2. Choose B-roll for each moment
Two sources:
- **Library:** pick clips/images from `get_media` whose names/metadata match the moment. `search_media` (semantic) isn't available, so match on names + your understanding of the content.
- **Generated (BYOK):** if the user has a Fal/Replicate key set, `generate_video` or `generate_image` a cutaway to order (e.g. "close-up of coffee being poured, cinematic"). It auto-imports and places. Tell the user this costs per clip.

## 3. Place it as an overlay
- Put B-roll on a video track ABOVE the A-roll so it covers the picture while the A-roll AUDIO keeps playing (mute the B-roll clip's audio via `set_clip_properties` volume 0, or it's silent already).
- `add_clips` / `insert_clips` the B-roll at the target frames; length ~1.5–3s per cutaway.
- Keep the A-roll's voice continuous underneath — B-roll should never cut the audio.

## 4. Make it feel intentional
- A quick cross-dissolve IN and OUT (or a straight cut for energy) — see the transitions action.
- Add subtle motion (Ken Burns via `set_keyframes` scale/position) to stills.
- Match the grade: `extract_palette` + `apply_color` so B-roll doesn't clash with the A-roll look.

## 5. Rhythm
- Don't blanket the whole video in B-roll — alternate A-roll (face/connection) and B-roll (illustration). A cutaway every time a new concept appears is a good default.
- On music-led sections, place B-roll changes on the beat (`beat-sync-cutting`).

## Deliver
List each moment, the B-roll you placed (library vs generated), and why. Flag anything that needed a transcript/topic you didn't have.
