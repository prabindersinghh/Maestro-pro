---
name: Promo / ad video
description: Build a short promo or ad from a product/topic — hook, 2–4 benefit beats, and a clear call-to-action — using titles, captions, music, and pacing. Use for "make a promo / ad / product video".
---

# Promo / ad video

Follow the `build-in-maestro` house rule — build it on the timeline, export from Maestro. A promo is a tight persuasive arc, not a montage. Keep it 15–30s unless told otherwise.

## The arc
1. **Hook (0–3s)** — the problem or the wow. Open on the strongest shot (use `see_video` to find it) or a bold claim as a title (`generate_title`, `popIn`). Never open slow.
2. **Benefit beats (3–20s)** — 2–4 short segments, each ONE benefit: a shot + a 3–5 word caption naming the benefit. New visual event every ~2–3s (cut, zoom punch, caption change). Use `add_texts` for the benefit call-outs, `set_keyframes` scale for punch-ins.
3. **Proof (optional)** — a stat, a logo, a quick testimonial line. `generate_motion` DataViz for a number, or a bold-boxed caption.
4. **Call-to-action (last 3–5s)** — one clear instruction: "Get it at …", "Link in bio", "Try free". A title card (`generate_title`, brand color) that holds long enough to read.

## Make it feel produced
- **Music** on the whole thing; cut/punch on the beat (`beat-sync-cutting` → `analyze_audio`).
- **One look** — a consistent grade (`apply_color`) and palette-matched graphics (`extract_palette`).
- **One type system** — a bold display face for the hook/CTA, a clean face for benefit captions (`creative-director`).
- **Motion** — nothing static; Ken Burns on stills, punches on emphasis.

## Format
- If it's for social, run `platform-delivery` for the right aspect (usually 9:16) + captions.
- Keep the brand/product name on screen at the hook AND the CTA.

## Checklist
- [ ] Hook lands in 3s (visual + claim)
- [ ] Each beat = one benefit, one caption
- [ ] Music + beat-synced cuts
- [ ] Cohesive grade + type + palette
- [ ] A single, unmissable CTA at the end
- [ ] Built on the timeline; exported via `export_project`

Tell the user the arc you built (hook → beats → CTA) and the length, and ask if the CTA/claims are right before finalizing.
