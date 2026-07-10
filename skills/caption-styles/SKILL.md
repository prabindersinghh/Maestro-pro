---
name: Trending caption styles
description: Apply modern short-form caption looks — word-pop, karaoke highlight, bold-boxed, typewriter — sized and placed for 9:16.
---

# Trending caption styles

Follow the `build-in-maestro` house rule: add captions as real text clips ON the Maestro timeline via `add_texts`/`update_text` (the user watches them appear); never burn captions into a standalone file outside Maestro. The final video comes from `export_project(mode:"video")`.

Captions drive retention (most short-form is watched muted). Maestro renders and animates text via `add_texts`/`update_text` with `textStyle` + a `textAnimation` preset. Below are the looks that read as "modern short-form" and exactly how to build each.

## Placement + sizing (do this for all styles)
- Vertical (9:16): place captions in the LOWER-MIDDLE, above the platform UI safe zone (roughly 12–20% up from the bottom). Hooks go TOP third.
- 2–5 words per screen. Never a full paragraph. Break long lines.
- Size at 1080p: captions ~60–80px, hooks ~90–120px. Bold. High legibility.
- Always ensure contrast: a background box OR a thick outline/shadow so text survives any footage.

## Styles (pick to match the vibe)

### 1. Word-pop (energetic, most common)
- `textAnimation` preset `wordPop` (or `wordReveal` for a smoother reveal).
- `textStyle`: bold, white fill, thin dark outline (border) + soft shadow. No box, or a subtle one.
- Each word pops in on its beat — pair with `beat-sync-cutting` for perfect timing.

### 2. Karaoke highlight (the word being said lights up)
- `textAnimation` preset `highlightPop` or `highlightBlock`.
- `highlightPop`: the active word scales + tints to an accent color. `highlightBlock`: a colored box sweeps behind the active word.
- Set the accent from the palette (`extract_palette`) or brand. Great for "read-along" energy.

### 3. Bold-boxed (clean, punchy, brand-safe)
- `textStyle` with `background.enabled` = a solid box (brand or palette color), white bold text, `popIn` animation.
- Reads well on busy footage; strong for hooks and CTAs.

### 4. Typewriter (suspense / storytelling)
- `textAnimation` preset `typewriter`. Text types out char-by-char.
- Use for a slow reveal, a quote, or a build-up line. Pair with a calmer section.

### 5. Slide-up lower-third (informational)
- `textAnimation` `slideUp` (or `wordSlide`), left-aligned, smaller, with a subtle bar.
- For names/titles/context rather than spoken captions.

## Timing captions to speech
- Maestro does not transcribe audio on-device in this build (`add_captions`/`get_transcript` are unavailable). To time captions to the words:
  - If the user provides the transcript (or per-word timings), place each caption clip at the right frames.
  - Otherwise, add call-out captions at the key moments (hook, punchline, CTA) rather than a full running caption track, and tell the user that word-accurate auto-captioning needs a transcript.

## Apply
Use `add_texts` to create the caption clips (they land on a dedicated text track), set `textStyle` + `textAnimation`, then `update_text` to refine wording/timing. Keep ONE caption style consistent across the video.
