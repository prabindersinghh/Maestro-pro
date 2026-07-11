---
name: Platform delivery
description: Package the finished edit for each platform — Reels/TikTok/Shorts (9:16), feed (1:1), YouTube (16:9) — with the right aspect, safe areas, duration, and captions, then export from Maestro.
---

# Platform delivery

Follow the `build-in-maestro` house rule. This skill takes a FINISHED edit and delivers a version tuned for a specific platform. Each platform has different rules; match them, then export.

## 1. Pick the target(s)
Ask which platform(s) the user wants. Common specs:

| Platform | Aspect | Ideal length | Notes |
|---|---|---|---|
| TikTok / Reels / Shorts | **9:16** | 15–60s (hook in 3s) | captions on; keep key content out of the top ~12% (handle) and bottom ~18% (caption bar / CTA) |
| Instagram feed | **1:1** or 4:5 | ≤ 60s | subject centered; text safe from the crop |
| YouTube | **16:9** | any | title card + thumbnail-worthy opening frame |
| YouTube Shorts | **9:16** | ≤ 60s | same as Reels |

## 2. Set the frame
- `set_project_settings` with the target `aspectRatio` (9:16 / 1:1 / 16:9) and `quality: "1080p"`.
- Reframe existing clips so the subject stays in frame: `apply_layout` full + fill (center-crop), or `set_clip_properties` scale/position. Use `see_video` to check the subject actually sits inside the safe area after the crop.

## 3. Respect the safe areas
- 9:16: keep captions/logos out of the top ~12% and bottom ~18% (platform UI covers them). Place captions in the lower-middle, hooks in the top third.
- 1:1 / 4:5: keep the subject and any text away from the crop edges.

## 4. Trim to the platform's sweet spot
- If the edit is too long for the platform, tighten with `remove_words` (filler) + `ripple_delete_ranges` (pauses/tangents) rather than a hard chop — keep the story intact.
- Hook in the first 3s regardless of platform.

## 5. Captions + branding pass
- Captions on for muted viewing (`add_captions`, word-accurate). Keep them inside the safe area.
- A consistent look via `apply_color` / a title from `generate_title`. Match the palette (`extract_palette`).

## 6. Export one file per platform
- `export_project(mode:"video")` renders the current timeline. To deliver multiple platforms, do them in sequence: set 9:16 → export → set 1:1 → re-fit → export, etc. Tell the user each file as it's produced.

## Deliver
List each platform version you produced, the aspect/length, and anything that needed a re-fit (e.g. a landscape shot cropped to 9:16). Never leave key content under the platform UI zones.
