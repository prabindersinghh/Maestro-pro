# Task 1 Report: SceneSpec types + validator

## Summary

Implemented the pure SceneSpec contract and fail-loud validator exactly per the brief and the
design spec's SceneSpec block, following strict TDD.

## Files

- Created: `src/gen/sceneSpec.ts` — types, closed-enum constants, brand tokens, `isAllowedColor`,
  `clamp` helper, and `validateSceneSpec`.
- Created: `src/gen/__tests__/sceneSpec.test.ts` — the exact test code from the brief (5 tests,
  verbatim).

## TDD sequence

1. Wrote the test file first (verbatim from brief). Ran
   `npx vitest run src/gen/__tests__/sceneSpec.test.ts` → failed with
   `Failed to load url ../sceneSpec ... Does the file exist?` — correct failure reason (module
   doesn't exist yet).
2. Implemented `src/gen/sceneSpec.ts`.
3. Ran the test again → all 5 tests passed.
4. `npx tsc --noEmit` initially failed once: `TS6133: 'i' is declared but its value is never read`
   in the `beatMarkers` map callback (project has `noUnusedLocals: true`). Fixed by separating the
   numeric-validation `forEach` (which uses the index for the error path) from the `map` (which
   doesn't need the index) instead of computing both in one pass with an unused parameter.
5. Re-ran typecheck → exit 0. Re-ran the target test file → still 5/5 green.
6. Ran the full suite (`npx vitest run`) to check for regressions → 34 files / 195 tests passed,
   no regressions.
7. Committed both files with the exact commit message from the brief.

## Implementation notes

- **Enums** (`ELEMENTS`, `ANIMS`, `EASINGS`, `CAMERA_MOVES`, `BG_KINDS`, `TRANSITIONS`,
  `MASK_SHAPES`, `STYLE_ROLES`, `ASPECTS`) copied verbatim from the ```jsonc SceneSpec block in
  `docs/superpowers/specs/2026-07-12-generative-motion-engine-design.md`, including the premium
  values (`textOnPath`, `splitLayout`, `gridLayout`, `countdown` in `ELEMENTS`; `maskReveal` in
  `ANIMS`; `rgbSplit` in `TRANSITIONS`; `logo`/`wipe` in `MASK_SHAPES`, etc.).
- Also modeled the enums that appear only inline in nested modifier fields (not exported, since the
  brief's exported-constants list doesn't include them): exit anims (`fade|collapse|glitch|none`),
  enter `from` (`below|left|scale`), mask `reveal` (`left|up|iris|none`), Ken Burns `move`
  (`push|drift|zoom|none`), and layer `depth` (`foreground|mid|background`).
- **Brand tokens** (`BRAND_TOKENS`): black `#0b0a0d`, green `#16b16a`/`#1fce7e` (as `green`/
  `greenLight`), gold hairline `rgba(201,162,39,0.55)`, white hairline `rgba(255,255,255,0.10)`,
  slate `#484852`/`#2b2931` (as `slate`/`slateDark`) — verbatim from Global Constraints.
- `isAllowedColor` accepts an exact brand-token value match OR a `#rrggbb` hex (case-insensitive).
  This rejects the test's `javascript:alert(1)` payload and any other free-form string/URL.
- **Bounds enforced via `clamp(n, min, max, def)`:** `durationInFrames` 8..600, `opacity` 0..1,
  `blur` 0..24, `position.x`/`y` 0..1, `camera.amount` 0..0.3, `style.size` 0.01..0.4. Non-numeric
  or missing values fall back to the default rather than clamping garbage.
- **Defaults filled on success:** `meta.brand="kaestral"`, `meta.fps=30` (via clamp default),
  layer `opacity=1`, `blur=0`, `position={x:0.5,y:0.5}`, `depth="mid"`, `motionBlur=false`.
- **Validation walks depth-first** and throws an internal `ValidationError` carrying the exact
  path on the first violation (closed-enum, color, or shape check), caught once at the top of
  `validateSceneSpec` and returned as `{ ok:false, error }`. The function has no other throw paths
  reachable from arbitrary JSON input — a final catch-all in the entry point also converts any
  unexpected exception into `{ ok:false, error }` so `validateSceneSpec` truly never throws.
- `beats` and each beat's `layers` are required to be non-empty arrays (enforced explicitly, not
  just via clamping), matching the "requires at least one beat" test.
- Pure module: only uses vanilla TS/JS constructs, no imports beyond `vitest` in the test file.

## Test output

```
npx vitest run src/gen/__tests__/sceneSpec.test.ts
✓ src/gen/__tests__/sceneSpec.test.ts (5 tests) 17ms
Test Files  1 passed (1)
     Tests  5 passed (5)
```

```
npx tsc --noEmit
(exit 0, no output)
```

Full suite: `npx vitest run` → 34 files passed, 195 tests passed (no regressions from this change).

## Concerns

None. All acceptance criteria from the brief are met: TDD sequence followed with the test failing
for the right reason first, exact test code used verbatim, exact commit message used, typecheck
clean, enums copied exactly from the design spec including premium values, module is pure (no
rendering/no non-Node/TS imports), `validateSceneSpec` never throws.

One minor design choice worth flagging for whoever builds Task 4 (`compose_motion` tool /
`Generative.tsx` interpreter): unknown/extra fields on objects are currently silently ignored
(not rejected) rather than triggering an "unknown field" error, since the brief's Step 3 wording
("unknown field → validation error" appears in the design doc's prose, not in the Step 3
instructions or the given test list) wasn't exercised by any of the 5 required tests. If strict
unknown-field rejection is required by a later task's tests, it can be added without touching the
enum/clamp/color logic — happy to pick that up if it turns out to be needed.

---

## Review fix pass (2026-07-12)

Addressed 3 review findings on `src/gen/sceneSpec.ts` / `src/gen/__tests__/sceneSpec.test.ts`.

### Findings fixed

1. **CRITICAL/IMPORTANT — Unknown-field rejection was missing.** The design spec states
   "Unknown field → validation error" as a normative contract property, and the global
   "fail loud, never silent-substitute" constraint forbids silently dropping fields. A typo'd
   key (`oppacity`, `beatz`, etc.) was previously ignored rather than rejected.

   Fix: added a `checkUnknownKeys(obj, known, path)` helper that walks `Object.keys(obj)` and
   fails with `{path}: unknown field '{key}'` on the first key not in the level's known-key set.
   Wired it into every structural object-level validator: `validateSceneSpec` (top-level, keys
   `meta`/`beats`), `validateMeta` (`aspect`/`fps`/`brand`/`beatMarkers`), `validateBeat`
   (`durationInFrames`/`camera`/`background`/`layers`/`transitionOut`), `validateLayer`
   (`element`/`props`/`position`/`opacity`/`blur`/`depth`/`mask`/`motionBlur`/`kenBurns`/
   `lightingSweep`/`enter`/`exit`/`style`), `validateEnter`, `validateExit`, `validateStyle`,
   `validateCamera`, `validateBackground`, `validateTransitionOut`, `validateMask`,
   `validateKenBurns`, `validateLightingSweep`, and `validatePosition`. Each level's known-keys
   set is a small `const FOO_KEYS = [...] as const` placed next to its validator.
   Deliberately did **not** apply this inside a layer's `props` bag — that object is free-form
   per-element data by design and must stay open. The validator remains pure and never-throwing:
   `checkUnknownKeys` calls the existing internal `fail()` (throws `ValidationError`), which is
   still caught once at the top of `validateSceneSpec` and converted to `{ ok:false, error }`.

2. **MINOR — `validateMeta` coerced `brand` via `String(obj.brand)`,** which silently accepted
   objects/arrays (e.g. `String({a:1})` → `"[object Object]"`) instead of erroring.

   Fix: if `obj.brand !== undefined && typeof obj.brand !== "string"`, fail with
   `meta.brand: must be a string, got '...'`. Absent `brand` still defaults to `"kaestral"`,
   present-and-string is passed through unchanged (no more lossy coercion).

3. **MINOR — the `beatMarkers` clamp used an unexplained magic number `100000`.**

   Fix: pulled it into a named constant `MAX_BEAT_MARKER_FRAME = 100000` with a comment
   explaining the bound: at the max allowed `meta.fps` (120), 100000 frames is ~833s / ~13.9min,
   comfortably beyond any realistic single generated clip — same "generous but not unbounded"
   rationale as the other numeric clamps in the file.

### TDD sequence

Added 3 new tests to `src/gen/__tests__/sceneSpec.test.ts` *before* touching the implementation:
- `"rejects an unknown top-level field"` — spreads an extra `wat: "nope"` key onto the minimal
  spec, expects `ok:false` and `error` matching `/^\$: unknown field 'wat'/`.
- `"rejects an unknown field inside a nested layer"` — adds `oppacity: 0.5` (typo) to a layer,
  expects `error` matching `/beats\[0\]\.layers\[0\]: unknown field 'oppacity'/`.
- `"rejects a non-string brand"` — sets `meta.brand` to an object, expects `error` matching
  `/^meta\.brand/`.

Ran `npx vitest run src/gen/__tests__/sceneSpec.test.ts` first — confirmed all 3 new tests failed
(`expected true to be false`, i.e. the validator was accepting input it should reject) while the
original 5 tests still passed. Then implemented the fix described above and re-ran until green.

### Test command + output (after fix)

```
npx vitest run src/gen/__tests__/sceneSpec.test.ts

 ✓ src/gen/__tests__/sceneSpec.test.ts (8 tests) 11ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

Full-suite regression check:

```
npx vitest run

 Test Files  34 passed (34)
      Tests  198 passed (198)
```

(195 previously-passing tests + 3 new = 198, no regressions; `sceneSpec.ts` has no other
consumers yet in the repo, so no downstream code was affected by the stricter validation.)

### Typecheck

```
npx tsc --noEmit
```
Exit code 0, no output.

### Concerns

None. All 3 findings are fixed with minimal, targeted diffs; the 5 pre-existing tests' minimal
specs contain no unknown fields and continue to pass unchanged; legitimate optional fields
(`opacity`, `blur`, `position`, `depth`, `mask`, `motionBlur`, `kenBurns`, `lightingSweep`,
`enter`, `exit`, `style`, `props`, `element`, `camera`, `background`, `transitionOut`,
`durationInFrames`, `layers`, `meta`, `beats`, `aspect`, `fps`, `brand`, `beatMarkers`) are all
still accepted at their respective levels; `props` remains intentionally free-form and unchecked.
