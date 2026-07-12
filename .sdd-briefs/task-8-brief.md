# GLOBAL CONSTRAINTS
## Global Constraints

- **Work on `main`.** Do NOT use the stale `pro-tier-expansion` branch.
- **No agent-authored executable code is ever rendered.** SceneSpec fields are closed enums / clamped numbers / brand-token-or-hex colors only. No free-form CSS, no code, no URLs.
- **Brand tokens (single source of truth):** black `#0b0a0d`; green `#16b16a` / `#1fce7e`; gold hairline `rgba(201,162,39,0.55)`; white hairline `rgba(255,255,255,0.10)`; slate `#484852` / `#2b2931`. Type roles: Geist (display/sans) + Geist Mono.
- **Fail loud, never silent-substitute:** template fallback only after retries exhausted, always labelled `fallback:true` with a reason.
- **Quality bar:** output must match or beat `remotion/src/compositions/HeroDemo.tsx` and `CondenseReel.tsx`. The user judges rendered output visually — mediocre output does not ship.
- **Every render syncs to the app's live render dir** before showing the user: after editing anything in `remotion/`, copy `remotion/src/**` to `src-tauri/target/release/resources/remotion/src/**` and delete that copy's `.bundle-cache/` (the app renders from there; the top-level `remotion/` is the source of truth).
- **Existing render bridge (do not change its signature):** `renderRemotion(compId: string, props: Record<string, unknown>, outputPath: string, remotionDir: string): Promise<MotionResult>` where `MotionResult = { outputLocation, durationInFrames, width, height, fps }` (`src/motion/renderRemotion.ts`).
- **Compositions register in** `remotion/src/Root.tsx` via `<Composition id=... component=... calculateMetadata={dur} />`; `dur` reads `props.durationSeconds`.

---

---

# BINDING QUALITY BAR: see docs/superpowers/gate/CRITIQUE-must-fix.md — the user rejected slideshow output. This task must advance those 8 points.


**Files:**
- Create: `remotion/src/primitives/{Video,Image,ScreenMock,Arrow,HighlightBox,PointerLine,SpotlightDim}.tsx`
- Modify: `remotion/src/primitives/index.ts`; `src/gen/sceneSpec.ts` (validate that `video`/`image` `props.src` resolves inside the project media set — add a `validateMediaPath` hook that the executor supplies the allowed paths to)
- Modify: `src/mcp/executor.ts` (`composeMotion` passes the project's known media absolute paths into validation)
- Test: extend `sceneSpec.test.ts` (media path outside the set is rejected); extend `generativeRender.test.ts` (a spec with an `image` layer using a real sample asset renders).

**Interfaces:** Produces the seven primitives. `Video`/`Image` honor `mask`, `kenBurns`, chrome framing via `ScreenMock`. Adds `validateSceneSpec(input, { allowedMediaPaths?: string[] })` optional 2nd arg; when provided, `video`/`image` `src` must be in the set (path traversal / arbitrary FS blocked).

- [ ] **Step 1: Write the failing tests.** — [ ] **Step 2: Run → FAIL.** — [ ] **Step 3: Implement** primitives + the media-path allowlist; use `public/sample-image.png` / `public/sample-video.mp4` in the render test. Sync + bust cache. — [ ] **Step 4: Run → PASS.** — [ ] **Step 5: Commit** `"feat(motion): media (Video/Image/ScreenMock) + callout primitives with media-path allowlist"`

---

