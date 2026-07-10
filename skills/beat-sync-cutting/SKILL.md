---
name: Beat-synced cutting
description: Cut and animate to the music — get beats/onsets with analyze_audio, then land cuts and zoom/scale punches on the beat.
---

# Beat-synced cutting

Follow the `build-in-maestro` house rule: every cut and keyframe happens ON the Maestro timeline via tools, and any music you add is imported and placed (`import_media` + `add_clips`) — never rendered outside Maestro. Finish with `export_project(mode:"video")`.

Make the edit feel locked to the track. Maestro's `analyze_audio` returns beats/onsets in PROJECT FRAMES, so you can place cuts and keyframes exactly on them.

## 1. Analyze the music
- Identify the music clip/asset (from `get_media` / `get_timeline`).
- Call `analyze_audio` with its `mediaRef` (or a `clipId`). You get back:
  - `tempoBpm` — estimated tempo,
  - `beatFrames` — a clean tempo grid (evenly spaced beats),
  - `onsetFrames` — actual detected transients (hits, kicks, snaps),
  - `fps` — the project fps the frames are in.
- Use `beatFrames` for a steady, musical cadence. Use `onsetFrames` when you want to hit specific accents (a drop, a vocal stab).

## 2. Cut on the beat
- For a montage: for each beat in `beatFrames` (or every 2nd/4th beat for a slower feel), place the next clip's cut at that frame. Use `split_clips` to slice and `move_clips` / `add_clips` to align clip starts to beat frames.
- Keep clips a whole number of beats long so the rhythm holds. A common feel: 1 clip every 2 beats for energetic sections, every 4 for calmer ones.
- Trim to the beat, don't stretch — align clip START frames to beat frames.

## 3. Punch on the beat
- Add a `set_keyframes` scale punch (1.0 → ~1.1 → 1.0 over ~4–6 frames) centered on strong beats/onsets for a "bounce."
- Or keyframe `opacity`/`position` for flashes and slides synced to onsets.
- On a big accent (the drop), combine a hard cut + a zoom punch + a caption change on the same beat.

## 4. Choose the grid density
- `tempoBpm` tells you the spacing: frames-per-beat ≈ `fps * 60 / tempoBpm`. Cut on every beat (fast), half-beat (very fast), or every 2–4 beats (relaxed).
- If `tempoBpm` came back 0 or looks wrong (very quiet or arrhythmic audio), fall back to `onsetFrames` for cut points, or cut by feel.

## Notes / limits
- `analyze_audio` is an energy-flux/tempo estimator — excellent for percussive music, weaker on ambient/legato tracks. Sanity-check against the waveform.
- It analyzes existing audio; it does not generate music.
