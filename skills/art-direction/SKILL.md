---
name: art-direction
description: Master motion-designer playbook for composing premium films with compose_motion — the decision process, optical composition, rhythm, restraint, transition craft, the physics of premium motion, worked examples with the reasoning exposed, and the failure modes to avoid. Read this BEFORE composing any motion piece (launch film, product reel, title sequence, brand sting).
---

# Art Direction for Motion

You are about to compose a film with `compose_motion` — a validated `SceneSpec` the engine renders. This skill is not a list of presets. It is the transfer of how a motion designer *thinks*, so that you can art-direct **above** the level of any template. Presets make every video look the same; craft makes each one look like one hand — a deciding, restraining, tasteful hand — made it. Your job is to be that hand.

The engine gives you unusual power: custom bezier curves, per-property tweens, explicit holds, optical positioning, per-element pacing, anchored draws. Power is not the goal. **Judgment about when to spend it is.** A film that uses every field is worse than a film that uses four fields with intent. Read the whole skill once; then compose.

> The single sentence to keep in your head: **you are not decorating a frame, you are directing an eye through time.** Every choice below serves that.

---

## 1. The decision process — how to read a brief before you touch a field

Do not open with elements. Open with the film. Answer these five questions, in order, *before* writing any SceneSpec:

1. **What is the emotional arc?** A launch film is not a feature list — it's a small story with a shape: *tension → thesis → proof → name*. A product reel is *problem → the turn → relief*. Name the arc in one line. Every beat must move along it; a beat that doesn't advance the arc is a beat to cut.

2. **What is the single most important moment?** There is exactly one. In a launch film it's usually the thesis line ("You describe the edit. It makes it.") or the name reveal. Everything before it builds pressure; everything after it resolves. Decide which beat is the peak, then *starve the others* so the peak has somewhere to rise to. A film where every beat is loud has no peak.

3. **In each beat, what must the eye do first?** The eye lands somewhere the instant a beat appears. Decide where — and compose so it lands there and not somewhere else. If two things compete for first-look, you have two beats, not one.

4. **What is the pace of thought, not the pace of motion?** The viewer needs time to *read and understand*, which is slower than the time it takes a spring to settle. A title that animates in over 15 frames still needs ~40–50 frames on screen for the sentence to land. Motion time ≠ comprehension time. Budget comprehension time first.

5. **What is your restraint budget?** Decide up front: how many *animated* elements per beat (2–3 is premium; 5+ is a slideshow), how many accent colors (one green, one gold — that's it), how many distinct motions (ideally one entrance language reused). Write the budget down and hold to it. Every field you add past the budget must *earn* its place by serving question 1 or 2.

Only now open the SceneSpec.

---

## 1.5 Conceptual ambition — reach for the brave idea, not the obvious one

Flawless execution of a *safe* idea is still a safe film. The single thing that separates a memorable launch film from a competent one is the **concept** — the angle, the opening image, the metaphor — and it is decided *before* any motion. This is where most drafts settle for less than they could:

- **The obvious opening is a trap.** "Editing used to mean clicking through menus. Now it's easy." is *true, clear, and forgettable* — it states the problem literally, the way a spec sheet would. The brave version finds an image or a turn of phrase that makes the viewer lean in: a metaphor ("A kestrel watches. Total precision. Then it strikes." — the product *is* the kestrel), a provocation, an unexpected admission, a single concrete detail that implies the whole. Ask: *what's the least expected true thing I could open on?*

- **Name the metaphor, then let it run the film.** The strongest films have one governing image that every beat pays off. If the product is precise and fast, that's not a bullet point — it's a hunting bird, a scalpel, a struck match. Pick the image in question 1 (the arc), and let the visual language, the word choice, and even the color accents serve it. A film with a spine reads as *authored*; a film that's just well-composed beats reads as *nice*.

- **Copy is craft, not filler.** The words on screen carry as much of the film as the motion. "It makes it." lands because it's short, certain, and slightly surprising in its confidence. Labor over the lines the way you labor over the easing curve — cut every word that isn't doing work, and make the one important line quotable.

- **Restraint is not timidity.** Apple-level restraint means *removing everything except the brave idea* — not avoiding a brave idea. Don't confuse "clean and safe" with "premium." The cleanest possible frame around a dull concept is still dull. Spend your restraint budget protecting one bold idea, not sanding a bland one smooth.

The test: after you draft the concept, ask — *would this make someone stop scrolling? or is it merely correct?* If it's merely correct, you have not yet found the film. Go back to question 1 and reach further. The execution craft in the rest of this skill exists to serve an idea worth executing.

---

## 2. Trade-offs — there are no right answers, only tensions you resolve on purpose

Craft is choosing a point on a spectrum *knowingly*. The amateur picks a default; the designer picks a position and can say why. The main tensions:

- **Asymmetry ↔ stability.** A left-anchored column (`style.anchor:"left"`, `position.x:0.12`) is more sophisticated and more dynamic than dead-center — the eye enters from the left, negative space on the right gives the composition somewhere to breathe. But asymmetry is less *stable*; it can feel unmoored if nothing anchors it. Resolution: pair a left column with a horizontal rule that pins it (the gold hairline under a title is *structural*, not decoration — it gives the floating text a ground line). Center only when the moment is the whole point (the thesis, the name) and you want maximum gravity.

- **Hold length ↔ drag.** A long hold lets a line land and gives the film gravitas; too long and it drags and feels dead. There's no magic number — it scales with *how much there is to read* (see §5). A three-word line holds shorter than a full sentence. When unsure, hold slightly longer than feels comfortable while editing — you know the content, the viewer is seeing it for the first time.

- **Accent saturation ↔ muddiness.** Gold (`rgba(201,162,39,...)`) and green are the film's only accents. Used as thin hairlines and single glows they read as *expensive*. Used as fills, or more than one per beat, they turn muddy and cheap fast. Gold especially: a 2px gold rule with a soft glow is jewelry; a gold-filled box is a discount banner. Keep accents thin and rare.

- **Motion-blur / speed ↔ legibility.** Fast entrances with motion blur feel kinetic and physical, but text that's still moving fast is unreadable. Resolution: the *last* third of every entrance must be slow (that's what an ease-out curve buys you) so the element is legible before the eye needs it. Never let type arrive at speed with a hard edge.

- **Density ↔ focus.** More elements = more information but less focus. A timeline with three tracks, a playhead, and four chips is a lot — it works only because it *is* the moment (the "it edits on a real timeline" proof beat) and everything else in that beat is quiet. Spend density on the proof beat; starve the others.

If you cannot name which side of a tension you chose and why, you are decorating, not directing.

---

## 3. The physics of premium — why some motion reads expensive and some reads cheap

This is the most transferable craft, because it's almost mechanical once you see it:

- **translateY + settle, not scale-pop.** Premium display text rises a small distance and settles: `translateY 22→0` on a spring. It does **not** scale up from small (`scale 0.85→1`). Scale-pop on type is the single biggest "template" tell — it reads as a PowerPoint transition. Elements that legitimately scale are *objects* (a card, a logo lockup), never *display type*. When in doubt, translate; don't scale.

- **One ease curve unifies the whole film.** Pick a single bezier — `{curve:[0.22,0.61,0.16,1]}` is a soft, confident ease-out — and use it for *every* non-spring motion in the film (rule draws, camera push-ins, width grows, fades). This consistency is a huge part of what reads as "one hand made this." A film where each element eases differently feels assembled by committee. Reuse the curve.

- **Spring damping is a feeling, not a number.** `damping:15` is the house spring — a confident settle with a whisper of overshoot. Lower damping (10–12) = bouncier, more playful, more energy (use for a chip or an icon, rarely for display type). Higher damping (18–20) = stiffer, more corporate, less life. The default 15 is right for most display type; reach for the extremes deliberately.

- **Linear reads dead.** A `linear` fade or move has no acceleration, so it reads mechanical — like a progress bar, not a designed motion. Almost nothing in a premium film is linear. The exceptions are continuous ambient loops (a grid drift, a glow breathe) where you *want* no arrival. For anything that arrives, ease it.

- **Everything is always breathing.** The frame is never dead-still. Even on a "static" beat, a slow camera push-in (`camera:{move:"push-in", amount:0.04, easing:<the curve>}`) and an ambient background (glow/grid) keep the frame alive. A truly frozen frame reads as a paused video, not a designed hold. Hold the *content* still (`hold`, or a settled entrance) while the *frame* keeps breathing.

---

## 4. Optical composition — directing where the eye lands

Layout is not "where things fit," it's "where the eye goes and in what order."

- **Optical, not geometric, placement.** `position.snap:false` gives you exact fractional placement — use it. Premium composition lives at specific optical positions (a title baseline at y≈0.40, a rule at 0.52, a subline at 0.56 — a tight, deliberate stack), not on a coarse grid. The default snap-to-grid is a safety net for careless specs; a designed film opts out and places by eye.

- **The glow shifts visual weight.** The ambient green glow is not just atmosphere — its position pulls the eye. A glow offset toward the text side (rather than dead center) makes the composition feel intentional and balances a left column against the empty right. Use the background to *counterweight* your content.

- **Negative space is a material.** The empty right two-thirds of a left-anchored beat is doing work — it's what makes the left column feel composed rather than crammed. Do not fill it. Restraint in space is as important as restraint in motion.

- **Left column vs. centered — a real decision.** Left-anchored (`anchor:"left"`, `x:0.12`) = editorial, dynamic, sophisticated; the eye enters and reads. Centered = declarative, stable, final; the eye is *held*. Use left columns for the building beats (setup, proof) and centering for the payload beats (thesis, name). Alternating between them gives the film a compositional rhythm on top of its motion rhythm.

- **Anchor the float.** Any floating text block feels unmoored until something grounds it. A thin horizontal rule beneath a title (drawn in, `hairline` with `props.anchor:"start"` growing rightward from the same x as the text) is the classic ground line — it says "this text belongs *here*." Anchored draws grow *from* the text's edge, never from center.

---

## 5. Rhythm — hold vs. density, tension and release

A film has a pulse. You control it with hold lengths and cut timing.

- **Hold length scales with what there's to absorb.** A hold is proportional to *word count and prior density*. A three-word line ("It makes it.") can hold shorter; a full sentence needs longer; a beat that follows a busy beat needs a beat of quiet before the next thing. Read the content, then set the hold — don't use a constant.

- **Build tension, then release it.** The setup beats should feel slightly *withheld* — a little slower, a little quieter, a beat of held breath — so the payload beat *releases*. The thesis or name landing feels like a release only if the beats before it built pressure. A film that's uniformly energetic never releases because it never built.

- **Stagger within a beat is a micro-rhythm.** Revealing a subline one word at a time (`enter.anim:"wordStagger"`) gives the eye a tiny rhythmic pulse — each word a soft beat. Use it for lines you want the viewer to *read deliberately* (a tagline, a promise). Use it sparingly; every line staggered is exhausting.

- **Hold vs. cut.** A hold says "sit with this." A cut says "next." Match the instrument to the intent: let the important line *hold*; move briskly through the connective tissue. The worst rhythm is uniform — everything holding the same length reads as a slideshow no matter how nice each frame is.

---

## 6. Restraint — why fewer elements read as more expensive

This is the hardest discipline and the most valuable.

- **Fewer, better-placed elements read as more expensive.** A beat with a title, a rule, and a subline — three elements, perfectly placed — looks more premium than a beat with eight. Expense is communicated through *confidence*: showing few things means you're sure which few matter. Clutter signals uncertainty.

- **An element budget per beat.** 2–3 animated elements is the premium zone. 4 is a stretch you'd better justify (the proof beat earns it because the density *is* the message). 5+ is almost always a slideshow — cut something.

- **One entrance language.** Don't give each element a different entrance. Pick the film's entrance vocabulary (spring-rise for display type, draw for rules, wordStagger for a deliberate line) and reuse it. Variety of motion is not sophistication; it's noise.

- **Defaults are a floor, not a look.** The engine fills gaps so a sparse spec never regresses to flat black — but a *designed* film overrides those defaults with intent. Leaning on defaults gives you "fine." Overriding them deliberately gives you "yours."

- **The cut you don't make.** Restraint includes resisting the field. Just because `motionBlur`, `lightingSweep`, `glitch`, and `kenBurns` exist doesn't mean this beat wants them. The most common failure is *over-provisioning* a beat with effects that fight each other. When a beat feels off, the fix is usually *removal*, not addition.

---

## 7. Transition craft — beats resolve, they don't stop

A cut between two beats is a seam. Craft is making the seam feel authored.

- **Beats overlap; they don't hard-cut.** Consecutive beats should share a short crossfade window (`transitionOut.overlapFrames`) so the outgoing beat *resolves into* the incoming one rather than snapping. A hard cut (`kind:"cut"`) is a deliberate percussive choice — use it rarely, on purpose (a beat drop, a reveal), never as the default.

- **Overlap length scales with outgoing busyness.** A busy beat needs a longer resolve so the eye has time to disengage from all of it; a quiet beat can hand off faster. Match the overlap to how much the viewer has to let go of.

- **The eye is never orphaned.** Across a transition, always leave the eye something continuous to hold — the ambient glow/grid persists, the camera keeps its slow push, the next beat's anchor appears before the old one fully leaves. An orphaned eye (everything gone, then everything new) reads as a scene change in a slideshow.

- **Resolve the outgoing beat.** Fade a beat's content out over an authored window (`outFade`) as it hands off, so it *sets down* rather than being cut away mid-thought. A beat that resolves feels finished; a beat that's interrupted feels dropped.

---

## 8. Worked examples — the reasoning, exposed

These are real beats, with the *thinking* shown. Study the reasoning, not the numbers — the numbers are for a specific film; the reasoning transfers.

### Worked example A — the cold-open line (a *building* beat)

*Brief:* open a launch film. Arc position: tension, before the thesis. The eye should enter and read one confident line; the beat should feel withheld.

**Thinking:**
- This is a setup beat, so it's *left-anchored*, not centered (§4): editorial, dynamic, leaves the peak for later. Title at `x:0.12`, `y:0.40`, `anchor:"left"`, `snap:false` — optical placement, not grid.
- The title *rises and settles*, it does not scale (§3): `enter.anim:"spring"`, `spring:{damping:15}`, translateY-style settle. Display type never scale-pops.
- The floating title needs a ground line (§4): a gold hairline just beneath it (`y:0.52`), `hairline` with `props.anchor:"start"` so it grows *rightward from the same left edge* as the text, drawn over ~22 frames with the film's one ease curve `{curve:[0.22,0.61,0.16,1]}`. It's structural, not decorative — and gold, thin, glowing = jewelry, not a banner (§2).
- A subline reads *deliberately*, one word at a time (§5): `enter.anim:"wordStagger"`, mono font (`style.font:"mono"`) to contrast the display title's weight. Its per-word pulse is the beat's micro-rhythm.
- The hairline (delay ~10) starts *before* the subline (delay ~16) — a deliberate 6-frame stagger between "the ground line draws" and "the words begin." That ordering is the composition. So both use `enter.pacing:"manual"` — otherwise the engine's anti-smear auto-pacing would collapse both delays to the same value and *destroy the stagger you designed*. (Auto-pacing is the right default for a careless spec; a designed sequence opts out.)
- The whole beat gets a slow eased push-in (`camera:{move:"push-in", amount:0.04, easing:<the curve>}`) — the frame breathes even as the content holds (§3). It resolves out over an authored `outFade` window into the next beat's wipe (§7).
- Restraint check (§6): three animated elements (title, rule, subline). Within budget. One entrance language reused. One accent (gold). Good.

### Worked example B — the thesis (the *payload* beat)

*Brief:* the single most important moment. The eye should be *held*, not led.

**Thinking:**
- This is the peak, so it *centers* (§4): maximum gravity, the eye is held. This is the deliberate contrast to the left-anchored setup beats — the composition itself signals "this is the point."
- Two short lines, the second in green (`style.role:"accent"`), springing in a beat apart so the sentence *completes* on screen — the viewer reads "You describe the edit." then "It makes it." lands. The green second line is the only saturated color in the beat (§2).
- A short underline grows beneath, green, thin, glowing — the same grounding move as A's gold rule but tuned to the payload (green, because this is the product's voice, not the editorial frame).
- Because it follows the withheld setup beats, this beat *releases* (§5) — it can be a touch bigger, a touch brighter. But it earns that only because the earlier beats were starved. If every beat were this loud, this wouldn't land.
- Restraint check: two lines + one underline. Within budget. The release is spent here and nowhere else.

### Worked example C — the proof (the *density* beat)

*Brief:* show the product does something real. Here density *is* the message.

**Thinking:**
- This is the one beat allowed to be busy (§2, §6): a multi-track timeline, a sweeping playhead, caption chips lighting up in sequence. It works *only* because every other beat is quiet — the density is a deliberate spike, not the film's baseline.
- Even here, restraint operates inside the density: tracks grow in *staggered* (not all at once), the playhead sweeps on the one ease curve, chips pulse one at a time. Busy is not the same as chaotic — the density is *organized* by the same rhythm and easing as the rest of the film.
- A quiet left-anchored title still labels the beat ("It edits on a real timeline.") so the eye has an anchor before it dives into the density (§4, §7 — never orphan the eye).

---

## 9. Failure modes — the attempts that came before (learn from them, skip them)

These are real failures from authoring the reference films. Each one *felt* fine while making it and read as cheap on playback. Recognize them in your own work:

- **Attempt 1 — scale-pop everything.** Every title scaled up from 0.85. It read as a template/PowerPoint instantly. *Fix:* display type rises and settles (translateY), never scales (§3). This is the number-one tell; internalize it.

- **Attempt 2 — centered everything.** Every beat dead-centered. Safe, stable, and utterly generic — no editorial voice, no rhythm between building and payload beats. *Fix:* left-anchor the building beats, center only the payloads (§4). The alternation *is* the composition.

- **Attempt 3 — hard cuts between beats.** Beats snapped from one to the next. It read as a slideshow of nice frames, not a film. *Fix:* beats overlap and resolve; the eye is never orphaned (§7).

- **Muddy gold.** Gold used as fills and in multiple places per beat — cheap, like a discount banner. *Fix:* gold is a thin glowing hairline, rare, one per beat max (§2).

- **Over-animation.** Every element with a different entrance, plus motion blur, plus a lighting sweep, plus a glitch — all fighting. It looked *busy*, which the eye reads as *cheap and uncertain*, not *rich*. *Fix:* one entrance language, 2–3 elements per beat, effects only where they serve the moment (§6). When a beat feels wrong, remove, don't add.

- **Uniform rhythm.** Every beat held the same length and moved at the same energy. No build, no release, no peak. *Fix:* vary hold length with content; withhold, then release (§5).

- **Pacing you authored but the engine ignored.** You set deliberate staggered delays and the reveal came out synchronized — because the default auto-pacing clamped them. *Fix:* on any beat where the *ordering* of entrances is the composition, set `enter.pacing:"manual"` on those layers (§8, ex. A).

If your draft has any of these, it is not yet premium. Fix it before you render.

---

## 9.5 Brand discipline & showing the product (do not get these wrong)

Two mistakes that instantly wreck a launch film — both easy to avoid:

- **The product is named KAESTRAL. Never write any other name.** Not "Maestro", not the upstream
  project's name, not a placeholder. Every title, wordmark, tagline, and mocked UI label says
  **Kaestral**. A single wrong brand name in a launch film is fatal — check every text layer.
- **To "show the product", use the REAL bundled screenshot — do NOT hand-build a fake editor UI.**
  There is a real, on-brand Kaestral editor screenshot bundled with the engine. Show it with the
  `screenMock` element and `props.src: "/kaestral-ui.png"` (a bundled asset path) — it renders the
  actual UI inside window chrome, bright and correct. Do **not** assemble a fake editor out of
  shapes/text with invented labels: it comes out dark, tiny, low-contrast, and you will mistype the
  brand. Example beat:
  ```json
  { "element": "screenMock",
    "props": { "src": "/kaestral-ui.png", "url": "kaestral", "width": 0.62 },
    "position": { "x": 0.5, "y": 0.5, "snap": false },
    "enter": { "anim": "spring" } }
  ```
  Give the screenshot room (width ~0.6 of the frame) and a slow camera push-in so it reads as the hero
  of that beat, not a thumbnail. If you genuinely need a UI shot that doesn't exist as an asset, prefer
  a clean abstract representation (a `timeline` element + a `text` label) over a mislabeled mockup.

- **Legibility over darkness.** The palette is near-black by design, but the *content* must read
  clearly: display text at full ink (`role:"display"`), one bright green accent (`role:"accent"` /
  `#1fce7e`) on the payload, and never let the beat's glow/grid wash out the type. If a frame looks
  murky, the fix is brighter/larger content, not a brighter background.

---

## 10. Tool-to-craft mapping — which field expresses which intent

You express the craft above through these `compose_motion` / `SceneSpec` fields. Reach for the field *because of the intent*, not the other way around:

| Craft intent | Field |
|---|---|
| Rise-and-settle display type (never scale-pop) | `enter.anim:"spring"`, `enter.spring:{damping:15,...}` |
| One unifying ease curve for all non-spring motion | `easing:{curve:[0.22,0.61,0.16,1]}` (reuse everywhere) |
| Exact optical placement (not grid) | `position:{x,y,snap:false}` |
| Left-column editorial vs. centered payload | `style.anchor:"left"|"center"|"right"` |
| Mono contrast for a subline / caption | `style.font:"mono"` |
| A ground line that grows from the text edge | `hairline` + `props.anchor:"start"` + `enter:{anim:"draw", easing:<curve>, durationFrames}` |
| Deliberate one-word-at-a-time reading | `enter.anim:"wordStagger"` (tune with `enter.spring`, `enter.delay`) |
| Ordering of entrances *is* the composition | `enter.pacing:"manual"` (opt out of auto-clamp) + authored `enter.delay` |
| Hold a settled element still while the frame breathes | `hold:{startFrame,durationFrames}` |
| A property on its own timeline (opacity ≠ position) | `animate:{opacity?,position?,scale?,blur?,rotation?}` (each its own `{from,to,startFrame,durationFrames,easing}`) |
| Slow eased breathing on a "static" beat | `camera:{move:"push-in", amount, easing:<curve>}` |
| Beats resolve into each other, not hard-cut | `transitionOut:{kind, overlapFrames, easing}` (`kind:"cut"` only on purpose) |
| A beat sets down rather than being interrupted | beat `outFade:{startFrame,durationFrames}` |
| Counterweight a left column / shift eye weight | `background:{kind:"glow"|"grid", accent}` |

**Guardrails (the engine enforces these — respect them):** emit JSON only, never code/CSS/URLs. Colors are brand tokens or `#rrggbb` only. `animate.<prop>` and `enter`/`exit` cannot both drive the same property — the validator fails loud if you set both; pick one. On a validation error you get the exact offending path — fix that one field and retry.

---

## The bar

The three reference launch films were hand-authored. Your job is not to match them — it's to **exceed** them, using this craft plus the engine's full expressiveness. You have more power than the hands that made them did. Read the brief for its arc and its one moment. Starve the setup so the payload can rise. Place by eye, not by grid. Reuse one curve, one entrance language, one accent. Hold the important line; move briskly through the rest. Resolve every beat. And when a draft feels *busy* — remove, don't add.

Then render.
