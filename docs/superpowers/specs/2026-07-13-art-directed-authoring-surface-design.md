# Kaestral Art-Directed Authoring Surface for LLMs — Design Spec

**Date:** 2026-07-13
**Branch:** `main`
**Status:** Approved design → implementation

## Strategic thesis (locked)

Palmier's architecture is correct: **the editor is the hands, the LLM is the brain.** Do NOT build
intelligence into the engine — build the most capable hands any LLM can drive. The race is the
**capability surface**, not the model. Kaestral already leads (timeline editing + motion-graphics
rendering + perception: vision/transcript/beats/palette). This work **maximizes** that surface so a
connected LLM art-directs at or **above** the hand-authored `FilmLaunch`/`FilmSaaS`/`FilmData` level.

Safety model is unchanged and non-negotiable: the LLM emits **validated declarative data** (SceneSpec).
No arbitrary code execution, ever. Every new field is a closed enum / clamped number / bounded array,
rejected with an exact path on violation.

Nothing is thrown away: the generative engine, primitives, and SceneSpec all remain (now more
expressive). This is expansion, not replacement.

---

## Component 1 — Expressiveness expansion (the ceiling-lift)

Everything done by hand authoring the three films becomes expressible in the SceneSpec + interpreter.
Files: `src/gen/sceneSpec.ts` (schema+validation), `remotion/src/compositions/Generative.tsx` +
`remotion/src/primitives/*` (interpretation).

### New/expanded fields (all bounded data — no code)

1. **Custom easing (bezier or preset).** `easing` accepts EITHER a named preset
   (`"ease-out" | "spring" | "linear"` — kept) OR `{ curve: [x1, y1, x2, y2] }` — four numbers, x's
   clamped to `[0,1]`, y's clamped to `[-2, 3]` (allows overshoot/anticipation), mapped to
   `Easing.bezier`. Applies anywhere an easing is accepted: `enter`, `exit`, per-property `animate`,
   `transitionOut`, `camera`. This alone reaches the hand-authored curve feel.

2. **Explicit HOLD — first-class.** A layer gains `hold: { startFrame, durationFrames }` (both
   clamped to the beat). During the hold window the element is fully settled and STATIC (no residual
   entrance motion, no drift). Hold-and-settle was the single biggest premium mechanism; it is NOT
   derived — the LLM authors it and the interpreter guarantees stillness across the window.

3. **Per-property animation — every animated property on its own curve + timing.** A layer gains an
   optional `animate` block:
   ```jsonc
   "animate": {
     "position": { "from": {x,y}, "to": {x,y}, "startFrame", "durationFrames", "easing" },
     "opacity":  { "from", "to", "startFrame", "durationFrames", "easing" },
     "scale":    { "from", "to", "startFrame", "durationFrames", "easing" },
     "blur":     { "from", "to", "startFrame", "durationFrames", "easing" },
     "rotation": { "from", "to", "startFrame", "durationFrames", "easing" }
   }
   ```
   Each property key is optional; each is an independent tween (from→to over its own window on its own
   curve). This is what lets an LLM build LAYERED, STAGGERED motion (text rises on one curve while its
   underline draws later on another). `animate` composes WITH `enter`/`hold`/`exit`. **Precedence
   (explicit, so the interpreter never guesses):** for a given property, `animate.<prop>` — when
   present — is the SOLE driver of that property for the whole beat and OVERRIDES the corresponding
   `enter`/`exit`/`hold` effect on it (e.g. `animate.opacity` present ⇒ `enter`'s opacity ramp and
   `exit`'s fade do NOT also touch opacity). Properties NOT named in `animate` are driven by `enter`
   (in), `hold` (held static), and `exit` (out) as normal. All numbers clamped;
   `startFrame`/`durationFrames` clamped to the beat.

4. **Entrance physics + duration.** `enter` gains `durationFrames` (how long the entrance takes — not
   just `delay`) and `spring: { damping, mass, stiffness }` (each clamped) so the LLM tunes the settle
   physics, matching the hand-authored `spring({config})` calls.

5. **Explicit out-fade.** `exit` supports `anim: "fade"` + `durationFrames` (clamped) for an authored
   content resolve independent of the beat transition — the hand-authored per-beat `outFade`.

6. **Optical placement (snap opt-out).** `position` gains `snap: false` (default true keeps the
   baseline-grid safety net). With `snap:false` the LLM places optically-exactly, as done by hand
   (x=0.28 because the glow is offset left). Safe-area clamp still applies (nothing off-frame).

7. **Custom transition overlap.** `transitionOut` gains `overlapFrames` (clamped) so resolve length is
   authored per beat (busy outgoing beat → longer overlap). Default = the current `TRANSITION_FRAMES`.

8. **Layer z-order** is array order (documented); if a case needs explicit control, add an optional
   clamped `z` — decided during implementation, only if the reproduction gate needs it.

### Validation
All additions extend `validateSceneSpec` with closed-enum + clamp + bounded-array checks; unknown keys
rejected with the exact path (existing fail-loud contract). `animate` property keys are a fixed set;
`curve` must be exactly 4 finite numbers in range. Pure module, never throws.

### 🚦 COMPONENT 1 GATE (non-negotiable, shown to user)
Re-express ONE real beat from `remotion/src/compositions/FilmLaunch.tsx` **purely as a SceneSpec** and
render it via `compose_motion`/`Generative`. It must reproduce the hand-authored beat: same optical
placement, same curves, same hold, same out-fade. Extract frames, compare to the hand-authored beat,
show the user. **If the tool cannot express what the hands did, keep expanding the surface.** This is
the literal proof of the thesis: *can the LLM's language express what my hands did?*

---

## Component 2 — The craft-transfer skill (`skills/art-direction/SKILL.md`)

A master motion designer's playbook that **transfers craft so a fresh LLM can EXCEED the hand-authored
films**, not imitate them. Auto-loads for any connected LLM via three channels:
- the `compose_motion` tool description ("read the art-direction skill before composing motion"),
- the skill file in `skills/` surfaced by `list_skills` / `read_skill`,
- the MCP server instructions (SERVER_INSTRUCTIONS) mentioning it.

Written as REASONING, never as presets ("the busier the outgoing beat, the longer the resolve —
because the eye must never be orphaned mid-transition"), never "use 20 frames." Sections:

1. **The decision process (how a master approaches a new brief).** A METHOD for arriving at judgments,
   not a list of judgments: read the brief → what's the emotional arc? → what is the single most
   important moment? → what must the eye do first? → what is the restraint budget? This is what lets
   the LLM out-direct on briefs never anticipated.

2. **Trade-offs, not right answers.** Every craft decision has a cost, stated as a tension the LLM
   weighs: asymmetry creates energy but costs stability; longer holds feel confident but risk drag;
   gold draws the eye but muddies against the grid; motion-blur adds weight but can smear legibility.
   An LLM that understands the COST can make a different call than the hand films did and be right.

3. **Physics of premium.** Why translateY+settle reads expensive and scale-pop reads cheap; why one
   consistent ease curve unifies a film; the feel of spring damping; why linear motion reads dead.

4. **Optical composition.** How to read where the eye lands; how background glow shifts optical weight;
   asymmetry as a tool (when it serves / when it doesn't); negative space as a device; the
   left-column vs centered decision and its reasoning.

5. **Rhythm.** How hold duration relates to word count and the prior beat's density; building and
   releasing tension across a film; when to hold, when to cut.

6. **Restraint.** Why fewer elements read as more expensive; resisting the urge to animate everything;
   an element budget per beat.

7. **Transition craft.** Why overlap length scales with outgoing-beat busyness; the eye never orphaned.

8. **Worked examples (reasoning exposed).** 2–3 real beats from the hand films with the THINKING
   written out — e.g. "this headline sits at x=0.28 because the glow is offset left, so centering
   would fight the optical weight; held 50 frames because the previous beat was busy and the eye
   needed rest; the underline draws 12 frames late so the eye lands on the word first." Show the
   reasoning, not the result — this is how craft is actually taught.

9. **Failure modes (attempts 1–3).** Scale-pop, centered-everything, hard cuts, muddy gold accent,
   over-animation — documented so the LLM avoids them by knowing them.

10. **Tool-to-craft mapping.** How each expressive knob (hold, per-property `animate`, bezier `curve`,
    `overlapFrames`, `snap:false`, `enter.spring`) maps to a craft decision — so the LLM knows which
    lever expresses which intent.

Also register the skill in `skills/catalog.json`.

---

## Component 3 — Tool-surface audit for LLM power

Guiding question per tool: **"No other editor on earth gives an LLM this much control — does this tool
live up to that?"** AND **"what would an LLM WANT to do here that it currently can't — including a
capability that needs a tool that doesn't exist yet?"** (missing tools flagged, not just shallow ones).

**This build (per the "deepen motion + quick wins now" decision):**
- `compose_motion` becomes fully expressive (Component 1) — the core moat move.
- **Quick-win exposures**: app/engine capabilities the LLM can't currently reach, fixable in 1–2
  lines (a transform/keyframe/color/export knob that exists in the engine but isn't surfaced) — found
  in the audit and exposed now.
- Fix genuinely **shallow motion/perception tools** found (e.g. `see_video`, `analyze_audio`,
  `generate_title` returning less than an LLM could use).

**Deliverable:** `docs/superpowers/TOOL-SURFACE-AUDIT.md` — all 49 tools, each marked:
- ✅ deep (already the most an LLM could do)
- ⚡ quick-win done in this build (with the gap + the fix applied)
- 🔩 deeper deepening flagged for later (with the specific missing capability)
- ➕ MISSING TOOL flagged (a capability that needs a new tool that doesn't exist yet)
Ranked by impact so post-launch work is scoped and honest.

---

## 🚦 THE COLD-SUBAGENT TEST (final gate, non-negotiable, reported honestly)

After Components 1–3:
1. Dispatch a subagent with a **cold context** — given ONLY the finished `art-direction` skill text +
   the `compose_motion` tool schema (the expanded SceneSpec). **No hand-film context, no steering.**
   Prompt it: "art-direct a launch film for Kaestral." It authors a SceneSpec.
2. I render its SceneSpec via `compose_motion`/`Generative`, extract frames, and judge **harshly**
   against the three hand-authored films.
3. **The bar: its film must BEAT the hand-authored ones, not equal them.** If it only equals, the
   skill is teaching imitation, not craft — I rewrite the skill (deepen the decision process /
   trade-offs / worked examples) and re-run with a fresh subagent until a cold LLM can EXCEED the hand
   films.
4. Report honestly: did an unsteered cold LLM produce a premium film that beats the hand-authored
   ones? Show the output.

---

## Testing

- **Component 1 (sceneSpec):** unit tests for each new field — valid bezier curve accepted, out-of-range
  rejected with path; `hold`/`animate`/`enter.spring`/`exit.fade`/`snap`/`overlapFrames` validate and
  clamp; unknown `animate` property key rejected. Plus a headless render test of a spec exercising
  per-property `animate` + `hold` + bezier + custom overlap → non-blank MP4.
- **Component 1 gate:** the FilmLaunch-beat reproduction render (visual, shown to user).
- **Component 2:** the skill is prose; validated by the cold-subagent test, not unit tests. Assert it's
  registered in `catalog.json` and referenced by the tool description.
- **Full suite stays green; tsc clean.** 1080p default / 4K opt-in unchanged.

## Out of scope (YAGNI)
- No new render engine, no PixiJS, no new deps.
- No change to the frozen `.palmier` format or the `kaestral` MCP identity.
- Deep deepenings of non-motion tools are catalogued, not built, this round.
