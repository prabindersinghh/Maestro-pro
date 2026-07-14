# Launch UI/UX polish + first-run onboarding — implementation report

Scope: Kaestral (Tauri 2 + React 18 + TS + Vite). All changes additive/polish; no editing-logic, engine, or MCP-server changes. Demo project still loads and plays (verified live, see verification section).

## A. First-run onboarding

Built `src/ui/Onboarding.tsx`: a 4-step modal (Welcome → Sample project → 3 example prompts → Connect AI), progress dots, Skip on every step, Back/Next nav, "Maybe later" on the last step. Copyable example prompts (click-to-copy with a "✓ Copied" confirmation). Step 4's primary button calls `store.completeOnboarding(); store.openSettings(true);` per spec, reusing the existing Settings/Connect-AI flow untouched.

Store plumbing (`src/state/store.ts`):
- `settings.onboarded: boolean` — read via `lsGet("kaestral.onboarded") === "1"`.
- `settings.showShortcuts: boolean` for the new shortcuts modal (see E).
- `store.completeOnboarding()` — idempotent, sets the flag + `lsSet` + `emit()`.
- `store.openShortcuts(open)`.

Rendered from `Editor.tsx` next to `<Settings />`. It's a plain conditional overlay gated on `store.settings.onboarded` — if skipped/completed it never renders again, and it doesn't touch any editing state, so it can't block the app.

**Verified live**: ran `npm run dev` + Playwright against the Vite dev server (Tauri backend not running in this sandbox, so `ERR_CONNECTION_REFUSED` toasts for the MCP bridge are expected/pre-existing, unrelated to this work). Confirmed: onboarding shows "Welcome to Kaestral" on first load, demo assets (Sample Clip.mp4, Logo.png, Music Bed.m4a) are present in Media + on the timeline, Skip dismisses it, onboarding does **not** reappear after reload (localStorage gate holds), and Space plays the demo (playhead advanced, button flipped to pause).

## B. Unsaved-changes guard

- `store.dirty: boolean`, `store.markDirty()`, `store.clearDirty()` added to `EditorStore`.
- `markDirty()` is called from every actual content-mutating method (editText, trimClip, moveClip, removeSelected, splitAtPlayhead, undo/redo, editSelected, stampKeyframe/clearKeyframes/writeKeyframes, applyColor, addMediaToTimeline, toggleTrackFlag, addTransitionsAtCuts, setProjectSettings) — **not** inside the generic `emit()`, because `emit()` also fires on pure view-state changes (playhead scrubbing, zoom, play/pause) via the playback RAF loop; tagging `emit()` itself would have falsely marked the project dirty every time the user just presses play. This was a deliberate judgment call to keep the guard meaningful.
- `doExport()` in `Editor.tsx` calls `store.clearDirty()` on a successful export.
- Browser/dev path: `beforeunload` listener in `Editor.tsx`, warns via the native prompt if `store.dirty`.
- Tauri path: `getCurrentWindow().onCloseRequested(...)` — if dirty, `event.preventDefault()` and show a new in-app modal (`src/ui/CloseConfirm.tsx`, "Cancel" / "Close without saving"). Confirming calls `getCurrentWindow().destroy()`.
- **Capabilities**: added `core:window:allow-close` and `core:window:allow-destroy` to `src-tauri/capabilities/default.json` — `core:default` alone does not grant these (they're separate, deliberately-gated permissions in Tauri 2). Verified with `cargo check` (full clean compile, no permission errors).
- No Rust code changes were needed beyond the capability grant — `onCloseRequested`/`destroy()` are pure JS-API operations once permitted.

## C. Humanized error messages

New `src/ui/errors.ts` — `humanizeError(e, context?)`: logs the real error to `console.error` (prefixed `[kaestral]`), then maps common failure shapes (network/fetch failures, bare `status ${code}` strings, Tauri-invoke-unavailable, timeouts, permission-denied, file-not-found, out-of-memory, bad API key, rate-limit/529, Anthropic error JSON) to warm, on-brand sentences. Falls back to a clean generic sentence for anything that still looks like a dev string (braces, stack-trace-shaped `at foo (...)`, `.ts:123` references); otherwise keeps genuinely-human short messages as-is.

Applied at:
- `Editor.tsx` — export catch, drag-drop import catch.
- `MediaPanel.tsx` — import (path + file) failure paths.
- `ChatPanel.tsx` — attach-file failure, agent `send()` failure.
- `Settings.tsx` — `launch_claude_code` failure.
- `src/state/bridge.ts` — replaced the terse `state ${r.status}` / `import ${r.status}` / `upload ${r.status}` / `${name} ${r.status}` / `gen-config ${r.status}` / `gpu-config ${r.status}` / `gpu ${action} ${r.status}` / `status ${r.status}` throws with human sentences directly at the source, so every caller (including any I didn't touch directly) gets a clean message without needing to re-wrap.

Real errors are never lost — every `humanizeError` call still funnels the original `Error`/value to `console.error` for debugging.

## D. Empty-timeline + loading/progress states

- Empty timeline: `Editor.tsx` computes `timelineEmpty = store.totalFrames === 0` and overlays a centered, `pointer-events: none` guide ("Your timeline is empty. Import media (top-left) or ask the AI to build an edit.") inside the existing timeline-tracks container, without altering `Timeline.tsx` itself — the normal filled view is untouched.
- Export progress: **checked first** — grepped `exportVideoFromUI` / bridge / Rust `export_video` for `progress`/`onProgress`. Found that `src/render/renderVideo.ts` and `renderCli.ts` do support an `onProgress(done,total)` callback (written to the CLI's stderr), but the Tauri command `export_video` in `src-tauri/src/lib.rs` uses `child.wait_with_output()` — it blocks until the process exits and only returns stdout/stderr at the end; there is no streaming channel (Tauri event or otherwise) from the Rust child process back to the frontend today. Wiring real % would require Rust-side changes (reading `child.stderr` incrementally and emitting a Tauri event) which is out of scope for "purely additive UI polish" and risks the render pipeline — so per the instructions' explicit fallback, I implemented the **indeterminate** animated indicator instead: a small pulsing dot (`PulsingDot`, CSS `@keyframes kaestral-pulse`) shown next to "Exporting…" in the title bar and inside the Export button itself. The Export button is disabled and dimmed (`opacity 0.7`, muted text) while `exporting` is true, re-enabled in a `finally` block regardless of success/failure.

## E. Keyboard shortcuts — cheat-sheet + dedupe

- Removed the duplicate `keydown` listener from `src/ui/timeline/Timeline.tsx` (was binding Ctrl/Cmd+Z undo/redo, Delete/Backspace, `s`/`S` split — the same keys Editor.tsx already handles), leaving Editor.tsx's handler as the single source of truth. Also dropped the now-unused `useEffect` import from Timeline.tsx.
- Added `?` to Editor.tsx's existing keydown handler to toggle a new shortcuts modal.
- New `src/ui/ShortcutsModal.tsx` — simple on-brand list (Space, S, Delete/Backspace, Ctrl+Z, Ctrl+Shift+Z/Ctrl+Y, `?`), opened via the `?` key or a new small "⌨" button added to the title bar toolbar.

## F. Visual polish (theme tokens)

Added to `src/ui/theme.ts`: `theme.color.warning` (`#e0a63b`), `errorBg` (`#5a2020`), `errorBorder` (`#a34`), `errorText` (`#ffd9d9`), `onAccent` (`#1a1a1a`).

Replaced hardcoded literals with these tokens across: `Editor.tsx` (title-bar connecting dots ×2, Export button text color, toast stack error colors), `MediaPanel.tsx` (connecting-amber notice), `Settings.tsx` (connecting dot, 3× on-accent button text), `ChatPanel.tsx` (2× on-accent button text), `GenerationPanel.tsx` (on-accent button text, busy-amber status color), `WaitlistModal.tsx` (error border, on-accent button text).

Added:
- `focus-visible` outline on all `<button>` elements (scoped `<style>` block injected once in `Editor.tsx`, `outline: 2px solid theme.color.accent`).
- Export button: disabled + dimmed while exporting (see D), `cursor: default`.
- `IconBtn` already had hover/active states pre-existing; left as-is (not touched, out of the targeted-consistency scope).

I deliberately did **not** restyle every component — only the literals the survey flagged plus the two buttons directly touched by this task (Export, shortcuts button).

## Files touched

- `src/ui/Onboarding.tsx` (new)
- `src/ui/ShortcutsModal.tsx` (new)
- `src/ui/CloseConfirm.tsx` (new)
- `src/ui/errors.ts` (new)
- `src/ui/Editor.tsx`
- `src/ui/theme.ts`
- `src/ui/Settings.tsx`
- `src/ui/MediaPanel.tsx`
- `src/ui/ChatPanel.tsx`
- `src/ui/GenerationPanel.tsx`
- `src/ui/WaitlistModal.tsx`
- `src/ui/timeline/Timeline.tsx`
- `src/state/store.ts`
- `src/state/bridge.ts`
- `src-tauri/capabilities/default.json`

## Judgment calls / things left partial

1. **Dirty-tracking granularity**: `markDirty()` is called explicitly from content-mutating methods rather than inside the generic `emit()` — this is more precise but means any *new* mutating method added later must remember to call `markDirty()` too (same discipline the codebase already expects for `emit()` itself). Documented inline.
2. **Export progress is indeterminate, not real-%** — real progress would need a Rust-side change (streaming child-process stderr via a Tauri event) that's out of scope for this additive-polish pass; called out explicitly per the task's fallback instructions.
3. **`applyRemoteState`** (incoming edits from Claude via MCP) does *not* call `markDirty()` — those edits already live on the server, so there's nothing new to locally save; only local-only mutations count as "unsaved."
4. Did not touch `src/agent/agent.ts` (throws `Anthropic ${status}: ...` / JSON.stringify errors) since it's not one of the named files, but `humanizeError`'s patterns (Anthropic status codes, rate-limit, generic JSON-error shape) already catch what it throws when it surfaces through `ChatPanel.tsx`'s catch block.
5. Verified the demo project + onboarding gate live via a Playwright smoke test against the Vite dev server (Tauri's Rust-spawned backend wasn't running in this sandbox, so bridge-connection toasts appeared as expected/pre-existing — unrelated to these changes).

## Verification

- `npx tsc --noEmit` — exit 0, clean.
- `npm run build` (tsc + vite build) — succeeds; only a pre-existing dynamic/static import warning from Settings.tsx + exportVideo.ts (present before this work, not introduced by it).
- `cargo check` in `src-tauri` — clean compile, confirms the new capability grants are valid and Tauri's build-time capability validation passes.
- Live smoke test (Playwright vs `npm run dev`): onboarding appears, demo assets present, Skip works, onboarding doesn't reappear after reload, Space plays the demo project.
