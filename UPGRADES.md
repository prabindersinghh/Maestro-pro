# UPGRADES — the honest gap to real Palmier

Phase-1 hit **architectural + format + MCP parity** and now shows/exports **real footage**. But it is
NOT yet as complete as macOS Palmier as a day-to-day editor. This is the straight list of what still
makes it feel less finished, **ranked by how much each matters for it feeling like a real editor** —
not a green checkmark. Severity: 🔴 dealbreaker · 🟠 clearly missing · 🟡 polish.

## Ranked gap to "a real editor"

1. 🔴 **Smooth video playback.** The preview decodes real pixels via `<video>` *seeking* — crisp for
   scrubbing and stills, but pressing **Play** stutters because every frame issues a seek. Real Palmier
   plays back smoothly and in real time. **Fix:** WebCodecs `VideoDecoder` with a decoded-frame queue
   (and audio-clock sync). This is the single biggest "doesn't feel real yet" gap.

2. ✅ **Audio — DONE (core).** Waveforms render on audio clips (peak envelope ported from
   `Audio/WaveformExtractor.swift`), the preview plays sound (Web Audio mix mirroring
   `CompositionBuilder`'s per-clip trim/speed/volume/fades), and the FFmpeg export muxes a real audio
   stream (verified −21 dB, not silence). Video+audio imports create a linked audio clip
   (`placeClip`). **Remaining:** keyframed *volume* curves aren't mixed yet (static volume + fades are;
   matches the FCPXML exporter's current limitation); scrubbing while playing doesn't re-sync the audio
   clock; whole-file decode for preview (fine for now, streaming later); no audio meters/gain UI.

3. 🟠 **Bring in your OWN media (UI).** The app ships real bundled demo media and the MCP `import_media`
   works, but the media panel's add/import flow for *your* files (file picker, drag-and-drop from
   Explorer, and making them persist in the project) isn't wired to disk in the app yet. Opening an
   existing `.palmier` and relinking its media is also not in the UI.

4. 🟠 **Exact color / effects rendering.** `apply_color`/`apply_effect` store the full effect stack and
   export it to FCPXML, and the preview approximates the common knobs (exposure/contrast/saturation/
   temperature/blur) with canvas filters — but **LUTs, curves, colour wheels, hue curves, vignette/
   glow/grain are not pixel-exact** in preview or export. A heavy grade won't look right. **Fix:** port
   the Core-Image kernels to WGSL/WebGL shaders (preview) + FFmpeg filters (export).

5. 🟠 **Transitions.** No cross-dissolves or transitions between clips in the UI or the composited
   preview (single-sided fades do export to XMEML). Real editors have a transitions bin.

6. 🟠 **Timeline power tools.** Missing: trim handles (drag clip edges), razor tool, ripple/roll trim,
   multi-clip drag, snapping indicators, and keyframe lanes in the timeline. Today you can move/select/
   split/delete and set properties in the inspector, but hands-on trimming feels basic vs Premiere.

7. 🟡 **Text richness.** Text renders (font/size/colour/alignment/shadow/multi-line) but uses a
   system-font fallback (no embedded Inter/Geist/etc.), and per-word caption animations + outline/
   background boxes aren't fully rendered. Captions depend on transcription (below).

8. 🟡 **Render performance & long clips.** The export extracts video frames to temp PNGs then re-loads
   them — fine for short clips, slow + disk-heavy for long/4K footage. **Fix:** stream-decode.

9. 🟡 **Packaging.** The app's **Export MP4** spawns `node --import tsx` (works in `tauri dev`); a
   *packaged* build needs a bundled renderer sidecar (Node or pure-Rust) + the sample media as bundled
   resources. No installer / auto-updater yet.

10. 🟡 **Project management UX.** No Home screen, recent-projects, autosave, or save/open dialogs; the
    app boots straight into a demo project.

11. 🟡 **On-device intelligence (stubbed, honest).** `get_transcript`, `add_captions`, `search_media`,
    `remove_words`, `sync_audio`, and `inspect_media` transcription return "unavailable in this build".
    **Fix:** whisper.cpp (transcription) + transformers.js/SigLIP (search) + audio cross-correlation.

12. ⛔ **Generative AI** — permanently out of scope (proprietary Palmier cloud). Tools return the
    signed-out shape by design; not a gap to close.

## Standing hard gate
- **Parity sign-off vs a real macOS `.palmier`.** The round-trip golden file is hand-authored from the
  Swift structs (a real gate, not a self-check), but a genuine macOS-saved package hasn't been diffed.
  Drop one into `fixtures/` and I'll reconcile `MediaSource` shape + `Date` encoding and promote it.

---

## What already works (so the list above is in context)
- Real `.palmier` load/save (semantic round-trip vs the source-derived golden fixture).
- Headless edit engine (ripple/sync-lock/linked-A/V/trim-in-project-frames/clip-relative keyframes).
- MCP server, **41 tools**, on 127.0.0.1:19789 — Claude can drive the timeline and export.
- XMEML (Premiere) + FCPXML (Resolve/FCP) + `.palmier` exporters.
- Timeline UI, inspector, media panel; frame-accurate compositor (transform/crop/opacity/blend/
  keyframes/text) with **real decoded video + image pixels** in preview AND export.
- H.264 / H.265 / ProRes render via FFmpeg (real footage, ffprobe-verified).
