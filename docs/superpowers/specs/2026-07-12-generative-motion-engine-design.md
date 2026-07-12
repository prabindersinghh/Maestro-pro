# Kaestral Generative Motion Engine — Design Spec

**Date:** 2026-07-12
**Branch:** `main` (this is a v1 launch blocker, not deferred Pro work)
**Status:** Approved design → implementation

## Goal

Make Kaestral's **own agent brain** design **premium, bespoke** motion-graphics videos from scratch —
not pick from the 4 fixed Remotion templates — rendered to MP4 and placed on the timeline. Output must
match or beat the hand-authored `HeroDemo.tsx` / `CondenseReel.tsx` quality bar. User's mandate: the
product ships in days and must create high-quality video with **no help from me**, using its own
mechanism, not generic templates.

## Non-negotiables

- **Safe:** the agent NEVER writes executable code. It emits a validated declarative **SceneSpec**
  (JSON). A single trusted renderer interprets it. No `eval`, no arbitrary `.tsx`, no code-exec hole.
- **Robust, and FAIL LOUD:** invalid spec → precise validation error → agent retries with a corrected
  spec. Render failure → a clear error the agent can act on → retry. A template fallback is used ONLY
  after retries are exhausted, and is **explicitly labelled as a fallback** in the tool result — never
  a silent substitution. A bad spec can never crash or hang the app, but it also never quietly passes
  off a generic template as the bespoke film. (Silent fallback would hide quality failures during the
  quality gate — exactly when they must be visible.)
- **Premium by construction:** brand tokens + deep primitives so output reads as *designed*, not
  *assembled*. The quality gate (below) enforces this with real rendered output the user judges.

## Architecture (approved)

```
Agent (Kaestral's brain)
   │  designs a video as a SceneSpec (JSON)
   ▼
compose_motion  (new MCP tool)  ──►  validate SceneSpec (closed-enum schema + clamps + token allowlist)
   │                                      │ invalid → clear error → agent RETRIES with corrected spec
   ▼                                      │ valid
Generative.tsx  (ONE trusted component)   │
   │   interprets spec → primitives  ◄────┘   never eval'd; a fixed interpreter over bounded data
   ▼
render.mjs (existing pipeline) ──► MP4 ──► import + place on timeline
   │  on render failure → clear error → agent RETRIES; template fallback ONLY after retries exhausted,
   │  and always LABELLED as a fallback (never silent)
```

### Four isolated, independently-testable units

1. **SceneSpec schema + validator** — `src/gen/sceneSpec.ts`. Pure. The contract. Tested with plain JSON.
2. **Primitives library** — `remotion/src/primitives/`. Deep set of animated building blocks. Frame-tested.
3. **Generative composition (interpreter)** — `remotion/src/compositions/Generative.tsx`. Reads a
   SceneSpec, lays out beats → layers → animations via the primitive registry. No arbitrary code.
4. **`compose_motion` tool + executor wiring** — `src/mcp/toolDefs.ts` + `src/mcp/executor.ts`.
   Validate → render via `render.mjs` → import/place → template fallback on failure.

## SceneSpec shape (the contract)

Beat-based timeline of layered elements. Every `element`, animation, camera, background, transition,
and style role is a **closed enum**; numbers are **clamped**; colors validated against a **brand-token
allowlist** + hex check. Unknown field → validation error. No free-form CSS, no code, no URLs
(media paths are validated to be inside the project's media set).

```jsonc
{
  "meta": { "aspect": "16:9" | "9:16" | "1:1", "fps": 30, "brand": "kaestral",
            "beatMarkers": [12, 30, 48]   // OPTIONAL frame indices from analyze_audio (beat-sync)
  },
  "beats": [
    {
      "durationInFrames": 75,                        // clamped 8..600
      "camera": { "move": "push-in"|"pan-left"|"pan-right"|"rack"|"parallax"|"none", "amount": 0.08 },
      "background": { "kind": "grid"|"glow"|"parallax"|"solid", "accent": "<brand token or allowed hex>" },
      "layers": [
        {
          "element": "text"|"textOnPath"|"video"|"image"|"screenMock"|"waveform"|"timeline"|"logo"
                   |"shape"|"hairline"|"barChart"|"lineChart"|"areaChart"|"counter"
                   |"captionKaraoke"|"particles"|"arrow"|"highlightBox"|"pointerLine"|"spotlightDim"
                   |"splitLayout"|"gridLayout"|"countdown",   // layouts nest child layers
          "props": { /* element-specific, all bounded (see primitives) */ },
          "position": { "x": 0.5, "y": 0.5 },        // normalized 0..1, clamped
          "opacity": 1.0,                            // 0..1
          "blur": 0,                                 // px, clamped 0..24 (depth)
          "depth": "foreground"|"mid"|"background",  // drives DepthOfField focus-pull ordering
          "mask": { "shape": "circle"|"pill"|"rect"|"logo"|"wipe", "reveal": "left"|"up"|"iris"|"none" },
          "motionBlur": true,                        // directional blur + trails on fast motion
          "kenBurns": { "move": "push"|"drift"|"zoom"|"none", "amount": 0.08 },  // for image/video
          "lightingSweep": { "on": false, "angle": 20, "speed": 1 },
          "enter": { "anim": "spring"|"typewriter"|"wordReveal"|"kinetic"|"draw"|"fade"|"collapse"|"maskReveal",
                     "easing": "ease-out"|"spring"|"linear", "delay": 0, "from": "below"|"left"|"scale",
                     "snapToBeat": false },
          "exit":  { "anim": "fade"|"collapse"|"glitch"|"none", "at": 60 },
          "style": { "role": "display"|"accent"|"muted", "size": 0.09 }   // tokens, not raw CSS
        }
      ],
      "transitionOut": { "kind": "wipe"|"dissolve"|"push"|"glitch"|"rgbSplit"|"cut", "accent": "<token>",
                         "snapToBeat": false }
      // Note: mask/depth/motionBlur/kenBurns/lightingSweep are per-LAYER modifiers (above), applied by
      // the interpreter to whatever element the layer holds — not standalone elements themselves.
    }
  ]
}
```

**Expressive room (all bounded):** per-layer `opacity`, `blur`, normalized `position`, per-animation
`easing`. **Beat-sync:** `meta.beatMarkers` + `snapToBeat` align animations/transitions to the music —
a differentiator, ~free since `analyze_audio` already exists.

## Primitives library (where v1 quality lives) — `remotion/src/primitives/`

Each is a small, focused, frame-testable component. All support `opacity`/`blur`/`position`/`easing`.

**Text (5 modes):** `Text` — spring, typewriter (+caret), wordReveal (staggered), kinetic (per-word
emphasis), karaoke (highlight on time/beat). Roles display/accent/muted; optional draw-in underline.

**Media (show the real product):**
- `Video` — a project clip playing inside a composed frame; device/browser chrome framing;
  scale/position/mask/corner-radius.
- `Image` — screenshot/logo with reveal + parallax drift.
- `ScreenMock` — a browser/app window frame (traffic-light chrome, URL bar) to drop a screenshot into.

**Callout / annotation (every "look here"):** `Arrow`, `HighlightBox`, `PointerLine`,
`SpotlightDim` (dim all but one region).

**Data (animated, count-up):** `BarChart`, `LineChart` (draw-on), `AreaChart` (fill sweep),
`Counter` (count-up). Staggered entrance, token colors, optional labels.

**Signal / editor motifs (instrument identity):** `Waveform` (filler-flag + collapse), `Timeline`
(ruler + growing tracks + sweeping playhead), `LogoMark` (three-bar mark assembling), `CaptionKaraoke`.

**Form & structure:** `Shape` (rect/pill/circle/line, spring/draw), `Hairline` (gold/white rules that
draw in), `Grid` (drifting), `GlowField` (kestrel-eye bloom).

**Atmosphere & motion:** `Particles` (drifting nodes + connecting lines — constellation motif),
transition primitives (wipe/dissolve/push/glitch/cut), `Camera` wrapper (push-in/pan/rack/parallax).

**Premium-motion set (built NOW — this is what reads as "designed", not "assembled"):**
- `Mask` / `Reveal` — shape-masked reveals: text revealed through a moving wipe shape; video/image
  revealed through a circle, pill, or the logo mark as a mask. (`maskShape`, `revealDirection`.)
- `SplitLayout` / `GridLayout` — multi-panel composition: side-by-side, 2×2, filmstrip, so the agent
  builds complex frames, not just stacked layers. (Panels are themselves layers.)
- `DepthOfField` — blur-behind / focus-pull between layers so a camera rack-focus actually reads
  (foreground sharp, background blurred, focus shifts over the beat).
- `MotionBlur` / `Trails` — directional blur + trailing ghosts on fast-moving elements. The single
  biggest amateur-vs-premium tell; applied to any layer with fast `position`/scale motion.
- `TextOnPath` / kinetic typography — text that arcs along a path, scales, and lands as a composition
  (not a centered line). (`path`: arc/wave/diagonal; per-word transforms.)
- `LightingSweep` — a specular light pass across a surface/text (the Apple-product-shot "expensive"
  feel). (`angle`, `speed`, `softness`.)
- `KenBurns` — slow push/drift/zoom on images and video, so static assets never feel static.
- `Stinger` accents — `Countdown` (3·2·1), `Glitch` / `RGBSplit` bursts for launch-film energy.

**Brand tokens (single source, `remotion/src/primitives/tokens.ts`):** black `#0b0a0d` · green
`#16b16a`/`#1fce7e` · gold hairline `rgba(201,162,39,.55)` · white hairline `rgba(255,255,255,.10)` ·
slate `#484852`/`#2b2931` · Geist / Geist-Mono type roles.

**Depth principle:** because every primitive honors `opacity`/`blur`/`position`/`easing`/camera, the
agent composes layered, camera-moved, beat-timed frames that read as designed. If a generated video
looks templated, that's the signal to enrich the primitive set — the quality gate enforces it.

## PixiJS — post-launch Pro enhancement (design for it now)

The renderer interprets the SceneSpec through a **primitive registry** (`element name → component`).
PixiJS-backed primitives (real GPU particles, shaders, scene-graph depth) later register under the
**same element names** with no schema change and no agent change — a drop-in upgrade, no rewrite.
**PixiJS integration will be added post-launch as a Pro enhancement, with proper testing** (it is NOT
on the v1 critical path). Recorded here and in the Pro-tier spec.

## MCP tool: `compose_motion`

- Input: a `SceneSpec` (validated). Optional `place` (default true), `durationSeconds` derived from beats.
- Flow: validate → `renderRemotion("Generative", { spec }, out, remotionDir)` → import asset → place on
  timeline.
- **Fail loud, retry, never silent-substitute:**
  - Validation error → return the precise offending path so the agent self-corrects and retries.
  - Render error → return a clear, actionable error so the agent retries with a fixed spec.
  - A template fallback is attempted ONLY after retries are exhausted, and the tool result carries an
    explicit `fallback: true` + reason so the user/agent KNOWS a bespoke render failed. The result
    never presents a template as if it were the generated film.
- Coexists with `generate_motion` (the 4 templates stay as an explicit simple path, not a silent net).

## Error handling

- **Validation:** closed-enum + clamp + token allowlist in `sceneSpec.ts`; returns `{ ok:false, error }`
  with the exact offending path. Never throws into the render.
- **Render:** wrapped; timeout; failure → clear actionable error → agent retries; a labelled template
  fallback only after retries are exhausted. The tool result ALWAYS tells the truth about what was
  produced (`fallback: true/false`) — a template is never passed off as the generated film.
- **Media:** `video`/`image` paths validated to reference assets already in the project (no arbitrary FS).

## Testing

- **Unit (sceneSpec):** valid specs pass; malformed/out-of-range/unknown-enum/bad-color rejected with
  the right path; clamps applied.
- **Render (headless):** a representative SceneSpec renders to a non-blank MP4 of the expected dims/frames.
- **Primitive frame tests:** each primitive (incl. the premium set — mask/reveal, split/grid, DOF,
  motion-blur, text-on-path, lighting-sweep, Ken Burns, stingers) renders visibly at a sample frame
  (via `render.mjs` single-frame). Layer modifiers verified to compose with any element.
- **Fallback:** a spec that forces a render error returns the template fallback + honest note.

## Quality gate (user judges before ship — BLOCKING)

Kaestral itself (via `compose_motion`, agent-authored specs) generates **three real videos**:
1. **SaaS product demo** — ScreenMock/Video + callouts + text, showing a product.
2. **Data-story** — charts + counters + narrative text, beat-timed.
3. **Launch film** — cinematic text + logo + particles + camera moves.

I render them and **show the user the actual output**. They must **match or beat**
`HeroDemo`/`CondenseReel`. If any looks templated/generic, **enrich the primitives and re-generate**
until they don't. The user judges with their own eyes. **No mediocre output ships.**

## Housekeeping / notes

- **Stale branch:** `pro-tier-expansion` predates the rename + rebrand + hero work and is badly out of
  date. Do NOT build on it. Clean it up (delete or re-cut from `main`) before any Pro-tier work.
- Known Windows-build gaps to fix for v1 (separate from this engine): `resources/remotion/node_modules`
  must ship in the installer; `inspect_media`/`inspect_timeline`/transcription are stubbed.

## Out of scope (YAGNI for v1)

- Sandboxed raw-code generation (the hybrid's second path) — designed for, flag-gated, matured later.
- PixiJS/shaders/GPU particles — post-launch Pro, drop-in via the registry.
- No new MCP server; no `.palmier` format change; `generate_motion` templates stay.
