# Tool-Surface Audit — Kaestral MCP (50 tools)

Audited every tool in `src/mcp/toolDefs.ts` (`TOOL_DEFS` [41 frozen] + `SKILL_TOOL_DEFS` [2] + `MOTION_TOOL_DEFS` [3] +
`ANALYSIS_TOOL_DEFS` [4]) against its real handler in `src/mcp/executor.ts`, cross-checking schema claims against
what the code actually does. Of 50 tools: **34 DEEP** (already give an LLM what it needs), **10 QUICK-WIN** description/
schema-doc edits were applied directly (below), **6 DEEPER-LATER** items need real handler work (one is a load-bearing
correctness bug in `add_captions`, not just shallowness), and **8 MISSING TOOLS** were identified — the highest-impact
being the total absence of any way to read back a rendered/composited timeline frame (as opposed to raw source
media), which blocks an LLM from ever self-critiquing its own finished work without a full export.

Context that shapes this audit: this is a Windows port of a macOS app. Five tools (`search_media`, `inspect_color`,
`sync_audio`, `generate_audio`, `upscale_media`) are hard stubs in this build — they unconditionally return a
"not available, don't retry" error regardless of arguments — even though their schemas describe full capability
(faithful to the macOS reference contract, per the frozen-41 note at the top of the file). This is intentional per
the file's own comments, but the descriptions didn't tell the LLM *in advance*, costing a wasted round-trip every
time one is attempted; that's now fixed (see Quick Wins).

## Bucket table

| Tool | Bucket | Verdict |
|---|---|---|
| get_timeline | DEEP | Rich, tells the LLM the compaction rules and the canGenerate gate. |
| get_media | DEEP | Simple and sufficient; correctly framed as the source of all mediaRefs. |
| inspect_media | DEEP | Clear ffprobe-vs-see_video-vs-transcript boundary. |
| get_transcript | DEEP | Explains frame semantics and on-device sourcing well. |
| inspect_timeline | DEEP | Clear complement to get_timeline (human-readable vs compact). |
| search_media | QUICK-WIN (applied) | Description now flags it's a stub in this build. |
| add_clips | DEEP | Overwrite semantics and auto-track behavior are explicit. |
| insert_clips | DEEP | Ripple semantics (sync-locked/linked tracks) are explicit. |
| remove_clips | DEEP | Link-group behavior stated. |
| remove_tracks | DEEP | Index-shift and cross-track link caveat stated. |
| move_clips | DEEP | Overlap and link-follow behavior stated. |
| apply_layout | QUICK-WIN (applied) | Slot names per layout now inline — was previously discoverable only via a failed call's error message. |
| set_clip_properties | DEEP | Propagation-vs-per-clip distinction is explicit and correct. |
| set_keyframes | QUICK-WIN (applied) | Per-property row shape (position/scale/crop arities) now documented instead of opaque `{type:"array"}`. |
| split_clips | DEEP | Two modes and link-regroup behavior stated. |
| ripple_delete_ranges | DEEP | Mode exclusivity and sync-lock refusal stated. |
| remove_words | DEEP | Descript-style word cutting well explained, ties to get_transcript indices. |
| sync_audio | QUICK-WIN (applied) | Description now flags it's a stub in this build. |
| undo | DEEP | Scope limitation (assistant-only, single-step) is explicit. |
| add_texts | DEEP | Clear default-track behavior; defers to add_captions correctly. |
| update_text | DEEP | Clear, though see add_captions note re: a parallel schema/handler mismatch risk (checked — update_text's handler path for content is fine). |
| add_captions | DEEPER-LATER | See below — most of the schema's flat fields are silently dropped by the handler. |
| apply_effect | QUICK-WIN (applied) | `type` is now a closed enum (was a free string with one example) — the 9 valid non-color effect ids. |
| apply_color | DEEP | Exhaustive, well-labelled color-science surface (wheels, curves, hue curves, LUT). |
| inspect_color | QUICK-WIN (applied) | Description now flags it's a stub in this build. |
| import_media | DEEP | Mutually-exclusive source union is explicit. |
| list_folders | DEEP | Trivial, sufficient. |
| create_folder | DEEP | Single-vs-batch shape documented. |
| move_to_folder | DEEP | Single-vs-batch shape documented. |
| rename_media | DEEP | Single-vs-batch shape documented. |
| rename_folder | DEEP | Single-vs-batch shape documented. |
| delete_media | DEEP | Cascade-to-timeline behavior stated. |
| delete_folder | DEEP | Cascade behavior stated. |
| export_project | DEEP | Mode enum well scoped; format targets (Premiere/Resolve) named. |
| set_project_settings | QUICK-WIN (applied) | Clarified `9:14` is a real deliberate preset and that `quality`/`aspectRatio` are independent knobs. |
| list_models | DEEP | Clear signed-out-shape caveat, correctly instructs "always call before generate_*". |
| generate_video | DEEP | BYOK cost/undo caveats explicit; rich reference-media inputs (start/end frame, source video, ref image/video/audio). |
| generate_image | DEEP | Same caveats; reference-image input covered. |
| generate_audio | QUICK-WIN (applied) | Description now flags it's unwired in this build, points to alternatives. |
| upscale_media | QUICK-WIN (applied) | Description now flags it's unwired in this build. |
| send_feedback | DEEP | Paraphrase-only constraint is explicit and important; correctly scoped as low-frequency. |
| list_skills | DEEP | Small, correct, discoverability tool. |
| read_skill | DEEP | Correctly frames skills as "how a pro uses the tools," not literal instructions. |
| generate_title | DEEP | Preset enum, background modes, and place-vs-import all explicit. |
| generate_motion | DEEP | Per-template prop contract (bars, label, accent) is unusually well specified for an LLM. |
| compose_motion | DEEP | Exceptionally rich — SceneSpec shape, element/animation enums, easing model, validator-loop contract are all spelled out. The gold-standard description in this file. |
| analyze_audio | DEEP | Beat/onset/silence framing tied directly to which downstream tools to call. |
| extract_palette | DEEP | Clear prominence-sort framing and downstream tool pointers. |
| import_from_url | DEEP | yt-dlp dependency and failure framing explicit. |
| see_video | DEEP | Interval-vs-scene modes and purpose (edit on content) are clear — but see MISSING TOOLS: this only ever reads *source* media, never the composited timeline. |

Counts: **DEEP = 34**, **QUICK-WIN (applied) = 10**, **DEEPER-LATER = 1 tool called out in the table** (`add_captions`)
**+ 5 more detailed below that aren't 1:1 with a table row** (they're capability gaps inside otherwise-DEEP or
QUICK-WIN tools), **MISSING = 8 new tools proposed**.

## QUICK WINS APPLIED

All edits are description/enum-documentation only — no handler logic, no new tools, no required-param changes,
no schema changes that could break an existing valid caller (all added enum values are supersets/restatements of
what the handler already accepts).

1. **`apply_layout`** — appended the slot-name map for all 9 layouts (`full→[main]`, `side_by_side→[left,right]`,
   `pip_*→[main,inset]`, `grid_2x2→[top_left,top_right,bottom_left,bottom_right]`, `main_sidebar→[main,sidebar]`,
   `three_up→[left,center,right]`) directly into the description. Previously an LLM had to guess slot names or
   burn a failed call to read them off the error message (`slotById` lookup throws `'${slotId}' is not a slot...
   Slots: ...`).
2. **`apply_effect`** — changed `type` from a bare `str()` with one example (`"e.g. stylize.glow"`) to a closed
   `enumStr` of the actual 9 non-color effect ids sourced from `CANONICAL_ORDER` in `src/model/effectStack.ts`
   (`detail.clarity`, `key.chroma`, `blur.gaussian`, `blur.sharpen`, `blur.noiseReduction`, `blur.motion`,
   `stylize.grain`, `stylize.vignette`, `stylize.glow`). Previously the LLM had no way to discover the other 8
   valid values short of trial and error; now every value is enumerated up front.
3. **`set_keyframes`** — the `keyframes` param was documented only as `{type:"array"}` with no shape info per
   property. Added the concrete row arity per property to both the description and the field doc: volume/opacity/
   rotation → `[frame, value, interp?]`; position/scale → `[frame, a, b, interp?]`; crop → `[frame, top, right,
   bottom, left, interp?]`. Sourced from `parseKeyframeRow` in `executor.ts`, which was previously undocumented.
4. **`set_project_settings`** — clarified that `9:14` is a genuine, deliberate preset (1080×1680, a tall-social
   crop distinct from `9:16`) rather than a typo an LLM might "correct," and that `quality` and `aspectRatio` are
   independent knobs (not mutually exclusive like `aspectRatio` vs explicit width/height).
5. **`search_media`**, **`sync_audio`**, **`inspect_color`**, **`generate_audio`**, **`upscale_media`** — each
   description now states plainly that the tool is a stub / not wired in this Windows build and points to the
   nearest working alternative (e.g. `see_video`/`get_transcript` instead of `search_media`; `generate_title` or
   `import_media` instead of `generate_audio`). Previously an LLM would only discover this after spending a full
   call and getting back a runtime error — now it can route around them from the tool description alone, saving
   a round trip every session that would otherwise attempt one of these five.

No test needed adjustment: `src/mcp/__tests__/*.ts` assert tool *names* and JSON-Schema *shape* (`type === "object"`),
never description substrings, except `artDirectionSkill.test.ts`'s check that `"art-direction"` appears within the
first 4000 chars of the `compose_motion` block — untouched, since `compose_motion` was already DEEP and not edited.

`npx tsc --noEmit` → exit 0. `npx vitest run src/mcp` → 8 files, 40/40 tests passed, both before and after edits.

## DEEPER-LATER

Genuinely shallow spots that need real handler/executor changes (not just doc edits), roughly ordered by impact:

1. **`add_captions` — schema/handler parameter mismatch (correctness bug, not just shallowness).** The schema
   advertises 13 top-level fields an LLM would reasonably set per-call: `centerX`, `centerY`, `textCase`,
   `censorProfanity`, `maxWords`, all 8 `textStyleProps` (`fontName`, `fontSize`, `isBold`, `isItalic`, `color`,
   `alignment`, `borderColor`, `backgroundColor`), `animation`, `highlightColor`. The handler (`addCaptions` in
   `executor.ts:210`) reads only `clipIds`, and two *nested* objects it never documents in the schema: `a.textStyle`
   (an arbitrary object merged wholesale via `Object.assign`) and `a.textAnimation` (reads `.preset`,
   `.perWordFrames`, `.highlight`), plus `wordsPerCaption` (not in the schema at all — the schema's equivalent is
   the unused `maxWords`). Net effect: an LLM that follows the documented schema (e.g. passes `fontSize: 48,
   color: "#fff", animation: "wordReveal", maxWords: 4`) has every one of those fields silently ignored; captions
   render with `defaultTextStyle()` and a hardcoded `wordReveal`/6-frame default regardless. This is the single
   highest-value fix in this audit — captions are used in nearly every short-form edit. Effort: small-to-medium —
   either (a) make the handler read the flat, already-documented fields (matches the pattern every other
   text-styling tool in this file uses — `add_texts`/`update_text` spread `textStyleProps` flat) and drop the dead
   `textStyle`/`textAnimation`/`wordsPerCaption`/`maxWords` inconsistency, or (b) restructure the schema to nested
   `textStyle`/`textAnimation` objects and fix `maxWords`→`wordsPerCaption`. Path (a) is less invasive since it
   matches every sibling tool's convention. ~2-4 hours including a regression test (none currently exercises styled
   captions at all).
2. **`apply_effect` params are per-type opaque.** Only `blur.gaussian.radius` and `stylize.vignette.amount` have
   confirmed param names (via `effectFilter.ts`'s canvas-preview switch and `effectStack.test.ts`); the other 7
   effect types (`detail.clarity`, `key.chroma`, `blur.sharpen`, `blur.noiseReduction`, `blur.motion`,
   `stylize.grain`, `stylize.glow`) have no discoverable param schema anywhere in this port — `applyEffectStack`
   accepts an arbitrary `Record<string, number>` and passes it straight through with no validation, so params for
   these 7 are effectively guesswork for an LLM (and untested / possibly not rendered by any compositor path in this
   Windows build at all). Did not document invented param names as a "quick win" since that risks lying to the
   LLM. Needs: confirm (or add) real per-type param names and clamped ranges in the compositor, then document them
   type-by-type (an object union keyed by `type`, JSON-Schema `oneOf`/`if-then` on `type`). Medium effort (needs a
   compositor audit per effect type, ~1 day).
3. **`apply_color` LUT path.** `lut.path` requires an absolute filesystem path to a `.cube` file with zero
   discovery tool — an LLM has no way to know what LUTs exist on the user's machine or in the project. Not
   fixable by doc edit alone (needs either a `list_luts`-style capability or accepting a `mediaRef` to an imported
   LUT asset). Small-medium effort.
4. **`inspect_color` / `sync_audio` / `search_media` / `generate_audio` / `upscale_media` remain non-functional**
   in this Windows build. The quick-win only added an advance warning; making them real is out of scope for a
   docs pass (ffprobe-based scopes for inspect_color, audio cross-correlation for sync_audio, an on-device
   embedding index for search_media, a TTS/music provider wire-up for generate_audio, an upscaler model wire-up).
   Large effort each, tracked already as "Windows port phase 1" stubs per the file's own comments.
5. **`export_project` has no progress/streaming feedback.** For a multi-minute 4K render, the tool call blocks
   synchronously with no intermediate signal, and there's no way to check status or cancel from another tool call
   mid-render. Not urgent (single-shot exports are typically short in test contexts) but will matter for real
   timelines. Medium effort (needs an async job pattern the LLM can poll, mirroring the "returns placeholder ID
   immediately" pattern already used by generate_*).
6. **`set_project_settings` re-fit behavior is unobservable.** The description says "existing clips are re-fitted"
   on a resolution/fps change but the tool's response is just a one-line confirmation string (`"Project settings
   updated (...)"`) — an LLM can't tell what actually happened to existing transforms/crops without a follow-up
   `get_timeline` call. Not broken, just a thin response; could return a `changed` summary (clip count re-fitted)
   for free once someone touches this handler for other reasons. Small effort, bundle with another change.

## MISSING TOOLS

Ranked by impact on an LLM trying to produce premium, self-checked work.

1. **`render_frame` / `preview_timeline`** (highest impact). *There is currently no way to read back a composited
   frame of the actual timeline* — every perception tool (`see_video`, `inspect_media`, `inspect_color` even if it
   worked) only ever looks at *raw source media*, never the timeline after grades, effects, layouts, text/caption
   overlays, and motion compositions are baked together. The only way to see the real composited result is
   `export_project(mode:'video')`, a full (potentially multi-minute) render to a file with no return of any visual
   content — the LLM gets a path, not pixels. This means an LLM authoring a `compose_motion` scene, a caption
   style, a color grade, or a layout has **no way to self-critique its own finished work** before telling the user
   it's done — it is flying blind on exactly the thing it's being graded on. Proposed: `render_frame({ atFrame? |
   atSeconds?, clipId? (render just one clip's composited output), maxDim? })` → returns one or more JPEG/PNG
   image blocks (same `ToolContentImage` shape `see_video` already uses) of the actual composited canvas at that
   playhead position, reusing the existing render/compositor pipeline (`renderVideo`/canvas compositor) for a
   single frame instead of a full export. This is the single most valuable addition an LLM-driven "hands" story
   could get — closes the perceive→act→verify loop that today only closes for *raw footage*, never for *the
   edit itself*.
2. **`measure_legibility` / safe-area & contrast check.** No tool measures whether burned-in text/captions sit
   inside a title-safe margin, whether a caption's color has enough contrast against the (possibly moving)
   background behind it, or whether two overlapping text layers collide. Grep across `src/` turns up zero
   safe-area/title-safe concept anywhere in the model. For 9:16 social content (a huge share of what this editor
   is aimed at, per `9:14`/`9:16` presets and the reel-workflow test) this is exactly the kind of thing a junior
   editor gets wrong and a senior one checks automatically. Proposed: `inspect_legibility({ clipId | atFrame })` →
   returns each text/caption box's normalized rect, whether it's within a configurable safe-margin (default 5-10%),
   and a rough foreground/background contrast estimate sampled from the composited frame (pairs naturally with
   #1's render pipeline). Depends on #1 existing (or duplicates its render step).
3. **`duplicate_clip` / `version_composition`.** There is no way to non-destructively branch: an LLM that wants to
   try two color grades, two caption styles, or two `compose_motion` variants for the user to compare must either
   overwrite (losing the original) or manually reconstruct a duplicate via `add_clips`+`set_clip_properties`+
   `apply_color` one field at a time (lossy — e.g. keyframe tracks and effect stacks aren't copyable through the
   public tool surface at all today; `set_keyframes` only *replaces*, `apply_effect`/`apply_color` only *merge*).
   Proposed: `duplicate_clip({ clipIds, toTrack?, toFrame? })` returning new clip ids with the full clip state
   (transform, effects, keyframe tracks, text style) cloned — the timeline-native complement to `move_clips`.
   High value for "show me two options" workflows, which are extremely common in a premium editing context.
4. **`get_render_status` / async export polling.** `export_project(mode:'video')` blocks the whole tool call for
   the entire render. There's no way to kick off a render and keep doing other things (or report progress to the
   user) the way `generate_video`/`generate_image` already do with their placeholder-ID pattern. Proposed either
   make `export_project` return immediately with a job id + `get_render_status(jobId)` poll tool, or at minimum
   add a `progress` callback surfaced as periodic tool-adjacent notifications. Medium-high value for any non-trivial
   timeline.
5. **`list_luts` / LUT discovery.** Companion to DEEPER-LATER #3 above — `apply_color`'s `lut.path` requires an
   absolute path with no way to enumerate what's available (bundled, project-local, or previously imported). A
   `list_luts()` tool (or extending `import_media` to accept `.cube` as a first-class type surfaced back through
   `get_media`) would close this gap cheaply.
6. **`get_word_timing` / per-word caption timing override.** `add_captions` groups words into chunks
   (`wordsPerCaption`, itself undocumented per DEEPER-LATER #1) and computes each chunk's on-screen window purely
   from transcript timestamps; there is no tool to override an individual word's hold duration (e.g. holding a
   punchline word an extra beat) short of manually finding and editing the resulting text clip's `durationFrames`
   post-hoc with `set_clip_properties`, which doesn't handle the per-word highlight timing inside a caption group
   at all (that's driven by `textAnimation.perWordFrames`, a single uniform value for the whole clip). A premium
   caption pass (the kind that hand-times emphasis) has no lever for this today. Proposed: extend
   `update_text`/`add_captions` with a documented `wordTimings: [{word, startFrame, durationFrames}]` override — but
   this is really a MISSING capability at the model layer (`Clip.textAnimation` only stores one `perWordFrames`
   scalar today), so it's listed here rather than as a QUICK-WIN.
7. **`get_beat_grid` / music-synced layout helper beyond `analyze_audio`.** `analyze_audio` returns beat/onset/
   silence frames for cutting, and `compose_motion` accepts `meta.beatMarkers` for its own scenes, but there's no
   single tool that reconciles the two — e.g. "given this music clip and this sequence of B-roll clips, propose
   cut points on `add_clips`/`split_clips` calls that land exactly on downbeats." Today the LLM has to do that
   arithmetic itself from `analyze_audio`'s raw frame arrays every time. Lower priority than 1-4 since it's a
   convenience wrapper over an existing capability, not a new one, but worth noting as a recurring pattern in the
   reel/beat-sync skills.
8. **`get_project_history` / edit log beyond single-step `undo`.** `undo` only reverts the assistant's *most
   recent* edit and refuses if the user touched the timeline since; there's no way for the LLM to see a list of
   its own recent actions (what it named each undo step, e.g. "Apply Color", "Add Captions") to decide *which*
   step to revert, or to revert N steps back in one call. For a long agentic session doing many edits, "undo the
   caption pass but keep the color grade I did after it" is currently impossible — `undo` is strictly LIFO,
   single-step. Proposed: `get_edit_history()` (list of the assistant's tracked action names, newest first) +
   an optional `steps` param on `undo`. Medium value, lower urgency than 1-4.
