# Step 5-6 report — landing launch-ready + privacy/local-first

**Status:** Done. All 8 checklist items complete, none partial.

**Commit hash:** `14b6025` — "feat(landing): launch-ready — Kaestral-pro links, releases/latest download, Vercel Analytics+events, Formspree waitlist, 3-step onboarding, local-first privacy (landing + in-app)"
(3 files changed: `landing/index.html`, `landing/vercel.json` [new], `src/ui/Settings.tsx`)

## Checklist

- **Repo links → Kaestral-pro**: done. All 8 occurrences (nav GitHub, nav Download, hero Download, hero GitHub, footer Download, footer GitHub, footer Docs, footer NOTICE.md link) now point to `github.com/prabindersinghh/Kaestral-pro`. Verified via Playwright DOM scan — zero remaining `prabindersinghh/kaestral/` (lowercase, old) links.
- **Download permalink**: done. All 3 Download CTAs (nav, hero, footer) point to `https://github.com/prabindersinghh/Kaestral-pro/releases/latest`.
- **vercel.json**: done. Created `landing/vercel.json` with `cleanUrls: true`, `trailingSlash: false`, security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), and long-cache headers for `/assets/*`. No `builds`/`routes` needed — Vercel auto-detects the static `index.html`. Nothing blocks attaching a custom domain in the dashboard.
- **Analytics + events**: done. Added `<script defer src="/_vercel/insights/script.js"></script>` before `</body>`. Added the `window.va` queue shim at the top of the script block. Wired `trackDownload()` (fires `va('event',{name:'download_click'})`) via `onclick` on all 3 Download CTAs. Wired `pro_waitlist_submit` event inside `joinWaitlist()`, firing only on a confirmed-successful Formspree POST (`r.ok`).
- **Pro + Formspree**: done. `WAITLIST_ENDPOINT` set to `https://formspree.io/f/xrenbavp`. Kept the existing JSON POST shape (`Content-Type/Accept: application/json`, `{email, source}`) — this is Formspree-compatible. Added a safety net: if the fetch itself throws (network error), it now falls back to the `mailto:` flow instead of dead-ending on "Network error — try again." Pro section copy already said "coming" / "we'll email you the moment it opens" — honest, no changes needed there.
- **3-step onboarding**: done. Added a new `#how-it-works` section (nav link added too) with exactly the 3 steps: 1) Install Kaestral (Windows), 2) Connect Claude — shows `claude mcp add kaestral -- npx kaestral` verbatim in a code callout, 3) Describe your edit in plain language. Styled to match the existing card/grid visual language (`.steps`/`.step` classes, green accent numbering, connecting line on desktop). Also updated the older `#developers` code sample, which still had the pre-stdio `claude mcp add --transport http ...` two-step flow — now leads with the one-command stdio connect and keeps the HTTP variant as a commented "prefer HTTP?" alternative, so the two sections don't contradict each other.
- **Screenshot / branding audit**: done, no leaks found. Checked all 4 landing screenshots (`editor.png`, `captions.png`, `ai-operated.png`, `dataviz.png`) visually — all show "Kaestral" branding in the mocked app UI, no "Maestro"/"Palmier" baked into any image. Checked all `alt=`/`aria-label=` strings, meta tags, title, og:tags — all say Kaestral. Full-page text scan (Playwright `body.innerText` + raw HTML source) confirms zero occurrences of "Maestro" anywhere, and the only "Palmier" occurrence is the required GPLv3 upstream-attribution line in the footer (`palmier-io/palmier-pro © Palmier Inc.`), which was left untouched as instructed.
- **Landing privacy**: done. Added a new `#privacy` section (between Compare and Developers) with a prominent local-first statement, a 3-item highlight grid (on-disk footage/projects, on-device transcription/vision/beat-detection, open-source/GPLv3 auditability), and an honest exceptions callout using the exact framing requested: prompts → Anthropic (in-app chat, own key) and email → Formspree (Pro waitlist only). Added a "Privacy" link in a new footer "Legal" column, anchored to `#privacy`.
- **In-app privacy**: done. Added a "Privacy" block to the Settings modal's About tab (`src/ui/Settings.tsx`), below the version/update-check UI, using the existing `sectionLabelStyle` + inline theme-token idiom (`theme.color.textSecondary`, `theme.space`, `theme.color.borderPrimary`). Copy: "Your video and project files stay on your device — Kaestral never uploads them. Transcription, vision, and beat/silence detection all run locally. In-app AI chat sends your prompts to Anthropic using your own API key; the Pro waitlist form sends only your email."

## tsc result

`npx tsc --noEmit` → **exit 0**, no errors.

## Verification performed

- Balanced-tag check (Node script counting `<section>/<div>/<header>/<footer>/<nav>/<form>/<table>/<thead>/<tbody>/<tr>/<svg>` open vs close) — all matched.
- Rendered the page with Playwright (Chromium): confirmed all 6 sections present (`features, how-it-works, usecases, compare, privacy, developers`), the 3 step headings are exactly "Install Kaestral" / "Connect Claude" / "Describe your edit", the connect command renders verbatim, the Pro waitlist form is present, and all Download/GitHub links resolve to the correct `Kaestral-pro` URLs. Only console message was the expected 404 for `/_vercel/insights/script.js` (not present in local static serving — Vercel injects this file automatically in production when Analytics is enabled on the project, so this is expected/harmless locally).

## Branding leaks found + fixed

None found beyond the link/text/count issues explicitly called out in the task (repo URLs, tool count, connect command). No "Maestro" strings anywhere; the one "Palmier" mention is the required GPLv3 attribution and was intentionally left as-is.

## Concerns / notes

- `landing/index.html`'s `#developers` section previously showed the two-step HTTP-transport-only connect flow (pre-dating the new stdio one-liner from `DECISIONS.md`). I updated it to lead with the one-command stdio connect (`claude mcp add kaestral -- npx kaestral`) to stay consistent with the new 3-step section, and kept the HTTP transport as a commented fallback rather than deleting it, since the in-app "Connect AI" flow (Settings.tsx `ClaudeCodeSetup`) still uses HTTP transport (`claude mcp add --transport http kaestral <url>`) for its in-app launch button — that's a distinct, intentional local-HTTP path for users driving the desktop app, not a leftover bug. Flagging for visibility since it wasn't explicitly in scope, but it directly affects a section named in the task (`developers`, ~line 394 in the original numbering) and would have been inconsistent with the new 3-step command otherwise.
- The `/_vercel/insights/script.js` script tag will 404 until the project is actually deployed to Vercel with Web Analytics enabled — this is expected and not fixable/testable locally; flagging so it isn't mistaken for a bug during any pre-deploy review.
- Did not touch the many unrelated untracked/deleted files present in the working tree (`.sdd-briefs/*` deletions, various `*.mp4`/`*.mts` scratch files, `step3/4-report.md`) — those predate this task and are out of scope; only `landing/` + `src/ui/Settings.tsx` were staged and committed, per instructions.
