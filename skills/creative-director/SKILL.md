---
name: Creative director (palette, grade, type)
description: Give a clip or project a cohesive designed look — extract the palette, build a color grade, and choose on-brand type and captions.
---

# Creative director

Follow the `build-in-maestro` house rule: apply every grade, title, and graphic ON the Maestro timeline via tools so the user sees the look develop; never render a standalone file; finish with `export_project(mode:"video")`.

Make it look intentional, not raw. Three layers: color, palette-driven graphics, and typography. Ground every choice in the footage's actual colors.

## 1. Read the palette
- Call `extract_palette` on the hero clip (or the whole project's key clip) via `mediaRef`/`clipId`. You get hex swatches sorted by prominence with weights.
- Treat the top 2–3 swatches as the project's palette. Use them for text color, accent bars, backgrounds, and grade targets so graphics feel native to the footage.
- For a brand: if the user gives brand hex values, prefer those for graphics/text and grade the footage toward (or in complement to) them.

## 2. Grade for a look (`apply_color`)
Build the grade in this order (all via `apply_color`, which merges):
- **Balance first:** fix exposure (`exposure`), set black/white points (`blacks`,`whites`), neutralize or intentionally push `temperature`/`tint`.
- **Contrast + separation:** a gentle S-curve via `masterCurve` (e.g. lift the toe, roll the shoulder), plus `contrast`.
- **Color identity:** push shadows/highlights with the wheels (`shadowsHue`/`shadowsAmount`, `highsHue`/`highsAmount`) — classic looks: teal shadows + warm highlights (orange-teal), or a cool cinematic wash. Use `saturation`/`vibrance` sparingly.
- **Targeted tweaks:** `hueCurves` to shift a specific hue (e.g. make skin warmer, sky bluer).
- If the user supplies a `.cube` LUT, apply it via `lut` and dial `strength`.
Grade consistently across clips so cuts don't jump. `inspect_color` is not available in this build — judge by the preview and keep moves subtle.

## 3. Typography + captions
- Pick a type system: ONE display face for hooks/titles (bold, high-impact) and ONE clean face for captions/body. Pair contrast (a strong display + a neutral sans) rather than two similar fonts.
- Size for the format: at 1080p vertical, hook text ~90–120px, captions ~60–80px. Use `add_texts`/`update_text` `textStyle` (fontName, fontSize, isBold, color, background box, border, shadow, alignment).
- Color the type from the palette (step 1) or the brand. Ensure contrast against the footage — add a background box or shadow/outline for legibility.
- For motion, use the animation presets tastefully (see `caption-styles`).

## 4. Composition
- Respect the safe area for 9:16 (keep key elements out of the top/bottom UI zones).
- Use `apply_layout` for multi-source moments (side_by_side, pip_*) but keep the hero shot full most of the time.
- Add subtle motion (Ken Burns via `set_keyframes` scale/position) so static shots breathe.

## Deliver
State the palette you pulled, the grade you built (in words), and the type choices — so the user can accept or redirect. Keep the whole look cohesive: same grade family, same 2 fonts, palette-driven accents.
