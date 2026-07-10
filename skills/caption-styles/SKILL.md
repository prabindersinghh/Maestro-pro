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

## Timing captions to speech (automatic)
- `add_captions` transcribes the clip on-device (whisper) and lays word-accurate caption clips automatically. Give it the spoken clip's `clipId`, a `wordsPerCaption` (2–4 for karaoke feel), and the `textStyle` + `textAnimation` you want (e.g. `highlightPop` for karaoke, `wordPop` for energy). Each caption lands at the exact frames the words are spoken.
- Prefer this over hand-placing text for spoken captions — it's word-accurate. For NON-spoken call-outs (a hook line, a CTA), use `add_texts` directly.
- To see the words first (to pick a hook line or edit wording), call `get_transcript`.

## Apply
For spoken captions: `add_captions(clipId, wordsPerCaption, textStyle, textAnimation)`. For manual call-outs: `add_texts` (lands on a dedicated text track), then `update_text` to refine. Keep ONE caption style consistent across the video.
