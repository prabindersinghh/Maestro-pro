# Publishing Kaestral

Everything below is set up and verified locally. These are the steps **you** run to go live.

---

## 1. npm — `npx kaestral` (primary distribution)

The package is publish-ready: `name: kaestral`, a `bin`, a `files` allowlist, and a `prepublishOnly`
that bundles the server. Verified locally — `node bin/kaestral.mjs` starts the MCP server (palmier-pro).

```bash
cd palmier-win
npm run build && npm run bundle:server   # produces dist-server/ (prepublishOnly also does this)
npm login                                # your npmjs.com account
npm publish --access public
```

Then anyone can run:
```bash
npx kaestral
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
```

**Prereq for users:** FFmpeg + ffprobe on PATH (document this). The whisper model (~142 MB) downloads
on first transcription. The package ships the whisper CLI (`vendor/whisper/`), skills, and public samples.

**Note:** the npm bin runs the headless MCP server (for Claude Code), not the desktop window — that's
the Windows installer (step 3). If the name `kaestral` is taken on npm, use a scope: `@yourname/kaestral`.

---

## 2. Landing page — deploy the static site

`landing/` is a self-contained static site (no build step). Two easy options:

**Vercel (recommended):**
```bash
cd landing
npx vercel            # first run links/creates the project; follow prompts
npx vercel --prod     # deploy to production
```
Or: connect the GitHub repo in the Vercel dashboard and set the **Root Directory** to `landing`.

**GitHub Pages:**
- Push the repo, then Settings → Pages → deploy from branch `main`, folder `/landing`.
  (Or copy `landing/*` to a `gh-pages` branch root.)

**Wire the waitlist to collect emails** (2 min, optional but recommended):
1. Create a free form at https://formspree.io → copy your form URL (`https://formspree.io/f/xxxx`).
2. Landing page: set `WAITLIST_ENDPOINT` in `landing/index.html` (the `<script>` near the bottom).
3. In-app: build with `VITE_WAITLIST_URL=https://formspree.io/f/xxxx` set, so the app's ✨ Pro form
   posts there too.
Without an endpoint, both fall back to opening the user's email client to you — still works, just
manual.

---

## 3. GitHub — repo + release

1. **Rename the repo** to `kaestral` (Settings → rename). Update the **description** to:
   *"The AI-operated video editor for Windows. You describe the edit, it makes it."*
   Add topics: `video-editor`, `mcp`, `claude`, `ai`, `windows`, `ffmpeg`.
   *(The README + package.json already use `prabindersinghh/kaestral` URLs — the rename makes them resolve.)*
2. **Cut a release:** tag `v0.0.1`, upload the installer
   `src-tauri/target/release/bundle/nsis/Kaestral_0.0.1_x64-setup.exe`. The landing "Download" button
   links to `/releases`.

---

## 4. Launch

Post the drafts in `docs/LAUNCH-POSTS.md` (Show HN, r/ClaudeAI, X). Lead with the landing page + repo.

---

## ⚠️ Before the public launch — quick polish

- [ ] **Refresh screenshots.** The landing images in `landing/assets/` are current dev captures; some
      app title bars still read "Maestro". Retake them from the running Kaestral app (and ideally record
      a short **demo GIF** of an edit happening from a prompt — that's the money shot for the hero).
- [ ] Set the **Formspree** endpoint (step 2) so the waitlist actually collects emails.
- [ ] Verify the **Download** link works after you cut the GitHub release.
- [ ] (Optional) Rename the GitHub repo before sharing links so nothing 404s.
