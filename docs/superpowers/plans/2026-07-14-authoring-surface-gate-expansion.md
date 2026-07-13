# Authoring Surface — Gate-Driven Expansion (Task 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. This is a follow-up to `2026-07-13-art-directed-authoring-surface.md`, triggered by the Task 6 gate FAILURE: the SceneSpec could not reproduce hand-authored FilmLaunch Beat 1. Steps use `- [ ]` checkboxes.

**Goal:** Close the Tier-1 and Tier-2 expressiveness gaps the gate exposed, so a validated SceneSpec can reproduce the compositional moves the hands used — left-anchored text/rules, per-word spring stagger, mono font, shaped hairline draw, eased camera, and an authorable beat out-fade.

**Architecture:** Same two-layer model — extend the pure validator (`src/gen/sceneSpec.ts`) with new closed-enum/clamped optional fields, then make the standalone Remotion interpreter honor them (`remotion/src/primitives/*`, `remotion/src/compositions/Generative.tsx`). No code-exec; validated data only. Mirror every remotion edit into the packaged resources dir and bust the bundle cache.

**Tech Stack:** TypeScript, Remotion (spring/interpolate/Easing.bezier), vitest.

## Global Constraints

- Safety model unchanged: closed enums, clamped numbers, bounded arrays; NO eval / new Function / dynamic import / dynamic require; the interpreter reads only validated fields.
- The `remotion/` workspace is STANDALONE — no `import` from `src/`. Duplicate any shared tuple (e.g. bezier) locally.
- 1080p default / 4K opt-in unchanged. No new npm dependencies.
- New SceneSpec fields are ADDITIVE and OPTIONAL — every existing valid spec must still validate and render identically (defaults preserve current behavior). Anchors default to `center`; font defaults to sans; camera easing defaults to linear (current behavior); beat out-fade defaults to the current 18-frame window.
- Every edit under `remotion/src/*` is mirrored to `src-tauri/target/release/resources/remotion/src/*`, then both `.bundle-cache` dirs removed (`remotion/.bundle-cache`, and the resources one if present).
- Full `src/gen` suite green; `npx tsc --noEmit` (app) exit 0; remotion workspace tsc introduces no NEW errors vs baseline.
- EXPLICITLY OUT OF SCOPE (controller judgment, Task 6 gate): Tier-3 ambient-exactness near-misses — glow `cx/cy` position, glow breathing constants, grid drift speed, and raw-`rgba()`-string color passthrough. These are not authorial composition moves; forcing them into the schema is bloat. Do NOT add fields for them.

---

### Task 1: Text anchor + mono font (validator + interpreter)

**Files:**
- Modify: `src/gen/sceneSpec.ts` — extend `LayerStyle` + `validateStyle`.
- Modify: `remotion/src/primitives/Text.tsx` — honor anchor + font.
- Modify: `remotion/src/primitives/types.ts` — add `anchor?`/`font?` to the style shape carried on `PrimitiveProps` (mirror).
- Modify: `remotion/src/compositions/Generative.tsx` — thread `style.anchor`/`style.font` through to the primitive if it isn't already passing the whole style object.
- Test: `src/gen/__tests__/sceneSpec.test.ts` (validator) + a render assertion in `src/gen/__tests__/generativeRender.test.ts`.

**Interfaces:**
- Consumes: existing `LayerStyle = { role, size }`.
- Produces: `LayerStyle = { role, size, anchor: "left"|"center"|"right", font: "sans"|"mono" }` (both materialized with defaults `center`/`sans`).

- [ ] **Step 1: Failing validator test** — assert `validateStyle` accepts `{ role:"display", size:0.072, anchor:"left", font:"mono" }` and returns those; asserts a bad enum (`anchor:"middle"`) FAILS with a clear message; asserts an absent style still yields `anchor:"center"`, `font:"sans"` when style present-but-partial (`{ size:0.05 }` → anchor center, font sans). Add closed enums `STYLE_ANCHORS = ["left","center","right"] as const` and `STYLE_FONTS = ["sans","mono"] as const`.
- [ ] **Step 2: Run → FAIL.** `npx vitest run src/gen/__tests__/sceneSpec.test.ts`
- [ ] **Step 3: Implement in `sceneSpec.ts`.** Add the two enums near the other enums. Extend `STYLE_KEYS` to `["role","size","anchor","font"]`. In `validateStyle`, `const anchor = checkEnum(obj.anchor, STYLE_ANCHORS, ...) ?? "center"` — BUT note `checkEnum` returns `undefined` for absent; you want a DEFAULT not undefined, so use `obj.anchor === undefined ? "center" : checkEnum(obj.anchor, STYLE_ANCHORS, \`${path}.anchor\`)`. Same for font → `"sans"`. Update the `LayerStyle` interface. (If a bad enum should fail loud, `checkEnum` already throws via `fail` — verify that's its behavior for a present-but-invalid value; if `checkEnum` instead clamps to a default, replace with an explicit `fail` on invalid.)
- [ ] **Step 4: Run validator test → PASS.**
- [ ] **Step 5: Interpreter — `Text.tsx`.** Replace the hardcoded centering `translate(-50%, calc(-50% - 0.08em))` with anchor-aware placement: for `anchor:"left"` set `left: position.x*100%`, `transform: translate(0, calc(-50% - 0.08em))` and `textAlign:"left"`; for `right` translate `-100%` on X + `textAlign:"right"`; for `center` keep the current `-50%`. Replace `fontFamily: TOKENS.fontSans` with `style?.font === "mono" ? TOKENS.fontMono : TOKENS.fontSans`. Ensure the animate/enter transforms (translateX/translateY/scale) still COMPOSE with the anchor base transform (append them, don't overwrite).
- [ ] **Step 6: Render test** — append to `generativeRender.test.ts`: render a 1-beat spec with a `text` layer at `position:{x:0.12,y:0.40,snap:false}`, `style:{role:"display",size:0.072,anchor:"left"}`, text "A kestrel watches." — assert non-blank AND (ffmpeg) that the LEFT 8% column of the frame has ink pixels near y=40% (proving left-anchoring, i.e. text starts at the left edge, doesn't overflow off-frame). Add a mono-font case rendering without error.
- [ ] **Step 7: Run render test → PASS.** `npx tsc --noEmit` exit 0.
- [ ] **Step 8: Sync + commit.** `cp -r remotion/src/* src-tauri/target/release/resources/remotion/src/`; `rm -rf remotion/.bundle-cache src-tauri/target/release/resources/remotion/.bundle-cache`. `git commit -m "feat(motion): text anchor (left/center/right) + mono font opt-in"`

---

### Task 2: Hairline anchor + honor enter.easing/durationFrames (interpreter, validator already open)

**Files:**
- Modify: `remotion/src/primitives/Hairline.tsx` — anchored draw + eased draw.
- Modify: `remotion/src/compositions/Generative.tsx` — pass `enter.easing`/`durationFrames` and an anchor through to Hairline (Hairline reads `props.anchor`; anchor lives in `props`, not `style`, since Hairline has no `style`).
- Test: `src/gen/__tests__/generativeRender.test.ts`.

**Interfaces:**
- Consumes: `enter.easing: EasingSpec`, `enter.durationFrames?`, `props.orientation/length/thickness/color`, new `props.anchor: "start"|"center"|"end"` (default `center`; `start` = pin left/top and grow toward end).
- Produces: a hairline that grows from its anchored edge, shaped by the layer's `enter.easing`/`durationFrames` when present (falling back to the current spring when absent).

- [ ] **Step 1: Failing render test** — render a 1-beat spec: `hairline` at `position:{x:0.12,y:0.52,snap:false}` with `props:{orientation:"horizontal",length:0.2,anchor:"start",color:"gold"}` and `enter:{anim:"draw",easing:{curve:[0.22,0.61,0.16,1]},durationFrames:22,delay:10}`. Assert non-blank AND (ffmpeg) that at a mid-draw frame the drawn pixels START at the left anchor x≈12% (not centered on it) — i.e. ink present just right of x=0.12, absent just left of it.
- [ ] **Step 2: Run → FAIL** (Hairline currently centers + ignores easing/duration).
- [ ] **Step 3: Implement.** In `Hairline.tsx`: read `const anchor = props.anchor === "start" ? "start" : props.anchor === "end" ? "end" : "center"`. Compute `draw` progress: if `enter?.easing` present (or `enter?.durationFrames`), use `interpolate(local, [0, enter.durationFrames ?? 22], [0,1], { easing: Easing.bezier(...bezierFromSpec(enter.easing)), extrapolateLeft:"clamp", extrapolateRight:"clamp" })`; else keep the existing spring. (Import `Easing` from remotion and `bezierFromSpec` from `./easing`.) For anchor: for horizontal `start`, set `left: position.x*100%` and `transform:"translateY(-50%)"` (no X centering) so it grows rightward from the anchor; `end` → `translate(-100%,-50%)`; `center` → current `translate(-50%,-50%)`. Vertical analogous on Y. Keep `neutralizeOpacity` handling.
- [ ] **Step 4: Run render test → PASS.** `tsc --noEmit` exit 0.
- [ ] **Step 5: Sync + commit** (same sync rule). `git commit -m "feat(motion): hairline anchored draw + honor enter easing/duration"`

---

### Task 3: Per-word spring stagger reveal (validator + interpreter)

**Files:**
- Modify: `src/gen/sceneSpec.ts` — add `"wordStagger"` to `ANIMS` OR add an optional `enter.stagger?:{ perWordFrames, from }` — SEE decision below.
- Modify: `remotion/src/primitives/Text.tsx` — implement the per-word spring reveal.
- Test: validator + render.

**Decision (resolve before Step 1):** Add a new ANIMS value `"wordStagger"` (closed-enum, minimal surface) rather than a nested stagger object — the hand version's params (spring damping ~16, `16 + i*4` delay, translateY 12→0) become the built-in behavior of that anim, matching how `wordReveal`/`kinetic` already bake their params. If a later film needs tunable stagger, add `enter.spring` (already exists) to drive the per-word damping and a clamped `enter.delay` as the base offset; the per-word increment stays a sensible constant. Author the plan for the enum approach.

- [ ] **Step 1: Failing validator test** — assert `validateEnter` accepts `{ anim:"wordStagger" }` (after adding it to `ANIMS`). One line.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Add `"wordStagger"` to the `ANIMS` array in `sceneSpec.ts`.** (No other validator change — `anim` is already `checkEnum(obj.anim, ANIMS, ...)`.)
- [ ] **Step 4: Validator test → PASS.**
- [ ] **Step 5: Failing render test** — render a `text` layer, `props.text` "Total precision. Then it strikes.", `enter:{anim:"wordStagger", spring:{damping:16,mass:1,stiffness:100}, delay:16}`, mono style. Assert non-blank AND (ffmpeg) that at an early frame only the FIRST word(s) are visible (left region has ink, the region where later words sit is still dim), and at a later frame all words are visible — proving sequential per-word reveal, not an all-at-once fade.
- [ ] **Step 6: Run → FAIL** (Text has no wordStagger branch).
- [ ] **Step 7: Implement in `Text.tsx`.** Add a branch `else if (anim === "wordStagger")`. Split `text` into words; render each word in an inline-block span; for word `i`, `const wp = spring({ frame: local - (enter?.delay ?? 16) - i*4, fps, config: enter?.spring ?? { damping:16 } })`; span style `opacity: wp, transform: translateY(interpolate(wp,[0,1],[12,0])px)`. The wrapper's own `animOpacity` stays 1 (words carry their own opacity). Respect `neutralizeOpacity` (if set, pin word opacity to 1). Keep the whitespace/`gap` handling so words read as a sentence (use a flex row with a small gap, or join with spaces preserved). Ensure anchor from Task 1 still positions the whole word-row.
- [ ] **Step 8: Run render test → PASS.** `tsc --noEmit` exit 0.
- [ ] **Step 9: Sync + commit.** `git commit -m "feat(motion): wordStagger per-word spring reveal"`

---

### Task 4: Camera easing + authorable beat out-fade (validator + interpreter)

**Files:**
- Modify: `src/gen/sceneSpec.ts` — `Camera` gains `easing?: EasingSpec`; `Beat` gains `outFade?: { startFrame, durationFrames }` (both optional, clamped/validated).
- Modify: `remotion/src/primitives/Camera.tsx` — route the push-in (and pan/parallax scale) progress through the camera easing when present.
- Modify: `remotion/src/compositions/Generative.tsx` — use `beat.outFade` to drive the content out-fade window instead of the hardcoded `OUT_FADE_FRAMES = 18`; extend the local `Camera`/`Beat` mirror types.
- Test: validator + render.

**Interfaces:**
- Consumes: `Camera = { move, amount, easing? }`, `Beat.outFade? = { startFrame:0..600, durationFrames:1..600 }`.
- Produces: eased camera moves; a beat whose content fades out over `[outFade.startFrame, outFade.startFrame+durationFrames]` when authored (default = existing last-18-frames behavior).

- [ ] **Step 1: Failing validator tests** — `validateCamera` accepts `{ move:"push-in", amount:0.04, easing:{curve:[0.22,0.61,0.16,1]} }`; a beat accepts `outFade:{startFrame:70,durationFrames:14}`; both reject malformed input (bad easing array length fails loud; out-of-range frames clamp). Add `CAMERA_KEYS`/`BEAT_KEYS` unknown-key coverage for the new keys.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement validator.** In `validateCamera`: add `easing` via the existing `validateEasing(obj.easing, ...)` (undefined-guarded → returns undefined when absent). Extend `CAMERA_KEYS`. Add `validateOutFade(value,path)` returning `{ startFrame: clamp(...,0,600,0), durationFrames: clamp(...,1,600,14) }` undefined-guarded; wire into `validateBeat`, add `"outFade"` to `BEAT_KEYS`. Update `Camera` + `Beat` interfaces.
- [ ] **Step 4: Validator tests → PASS.**
- [ ] **Step 5: Implement interpreter.** `Camera.tsx`: `cameraTransform` — where it computes `t = progressOf(...)`, if `camera.easing` present, apply `Easing.bezier(...bezierFromSpec(camera.easing))` to `t` (or pass the easing into the `interpolate` calls for scale/translate). Add `easing?` to `CameraSpec` + `bezierFromSpec` import. `Generative.tsx`: replace `const OUT_FADE_FRAMES = 18` usage with `beat.outFade` when present: `const ofStart = beat.outFade ? beat.outFade.startFrame : beat.durationInFrames - OUT_FADE_FRAMES; const ofEnd = beat.outFade ? beat.outFade.startFrame + beat.outFade.durationFrames : beat.durationInFrames;` then interpolate `[ofStart, ofEnd] → [1,0]`. Extend the local `Camera`/`Beat` mirror types with the new optional fields.
- [ ] **Step 6: Failing→passing render test** — render a 1-beat spec (84 frames) with `camera:{move:"push-in",amount:0.04,easing:{curve:[0.22,0.61,0.16,1]}}` and `outFade:{startFrame:70,durationFrames:14}`; assert non-blank AND (ffmpeg) frame 78 is markedly dimmer than frame 60 (out-fade active in the authored window) and the render succeeds with the eased camera. `tsc --noEmit` exit 0; `npx vitest run src/gen` green.
- [ ] **Step 7: Sync + commit.** `git commit -m "feat(motion): camera easing + authorable beat outFade window"`

---

### Task 5: 🚦 RE-RUN THE GATE (controller judges personally)

Not a code task — the controller re-authors the FilmLaunch Beat 1 SceneSpec using the newly added fields (left anchor, wordStagger, mono, anchored eased hairline, eased camera, authored outFade), renders it, extracts matched frames vs the hand original, and judges parity by eye. If Tier-1/Tier-2 gaps remain, expand again. Tier-3 ambient near-misses do NOT block (per Global Constraints). Only when the controller judges the beat reproduced at parity does Task 6b close and the plan returns to Task 7 (the craft skill) of the parent plan.
