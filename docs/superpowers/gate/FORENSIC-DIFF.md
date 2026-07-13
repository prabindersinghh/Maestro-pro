# Forensic diff vs hero-demo — the last 60→85→100 craft closure (ranked)

The gate films prove Kaestral's ENGINE gives a prompting user premium output. Bar: indistinguishable
from hero-demo in craft. This is the ranked delta list from a frame-by-frame + source-value diff, and
the fix applied for each. ALL fixes are in the ENGINE (every user render benefits) except the two
spec-level restraint edits noted.

| # | Delta (mechanism) | hero exact | was | fix | cost |
|---|---|---|---|---|---|
| 1 | Display text scale-pop | translateY 22→0, NO scale | spring/default added scale 0.94→1 | removed scale from spring+default Text; `from:scale` gentled 0.85→0.92 | HIGH |
| 2 | Beat resolve (out-fade) | outFade last 18f | none on cut/last beat | content out-fade 18f on cut-ending + final beat | HIGH |
| 3 | Transition overlap | ~20f languid | 14f abrupt | TRANSITION_FRAMES 14→20 | MED-HIGH |
| 4 | Entrance settle estimate | springs settle ~30f | pacing assumed 20f | ASSUMED_ENTRANCE_SETTLE_FRAMES 20→30 | MED |
| 6 | Headline over-styling | straight display lines | arc textOnPath | straightened launch headline to 2-line thesis (spec) | MED |
| 7 | Emphasis color | single bright green | alternated green/gold (muddy) | TextOnPath emphasis → greenHi always | MED |
| 8 | Restraint / element count | 2 lines + underline | 3-4 + hairline + particles | trimmed gate specs to hero restraint (spec) | MED |
| 5,9,10 | glow peak / type / grid | 0.27 / 800·-1.5 / 0.5·0.10·72px | matched | no change | NONE |

## PixiJS verdict (honest)
NOT added. Every ranked delta is CRAFT (easing, fade timing, overlap, settle estimate, color,
restraint) — none needs shaders or GPU particles. hero-demo itself uses zero PixiJS (pure Remotion
spring/interpolate). Adding a second engine days before launch would add risk and close NONE of these
deltas. The gap was craft; craft was fixed.

## Resolution (user-facing engine default)
- render.mjs takes an optional scale arg: 1 = 1080p (DEFAULT, fast), 2 = 4K/UHD (opt-in).
- Measured on this machine (data-story, 372f / 12.4s film): 1080p = 43s, 4K = 125s (~2.9× slower).
- 1080p is the default for a good prompt-to-video experience; 4K is available when the user wants it.
