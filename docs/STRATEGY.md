# Maestro strategy — beat Palmier by being open

**Maestro = Palmier's open editor (done) + transcript-based smart editing + prompt-to-motion-graphics
+ free open AI generation — all local/free, all Claude-driven over MCP.**

Palmier bet on a **closed paid cloud** for its headline generation, and — per its own FAQ — has **no
transitions, no motion graphics, and no transcript-based editing**. We don't win by copying Palmier;
we win by wiring in free, open, Claude-driven tools Palmier structurally can't match, all landing in
Maestro's timeline through the one integration seam that already works: the **`import_media` MCP tool**.

## The integration seam (non-negotiable)
Every generated or externally-edited clip lands in Maestro's timeline via **`import_media`** (path or
upload → ffprobe → asset → the app and Claude both see it). We do **not** rebuild Maestro's editor,
compositor, or timeline — companion tools **produce an MP4** and Claude **imports it**. New
capabilities ship as **Claude-Code skills** and/or **companion MCP servers** that run alongside
Maestro's MCP (`127.0.0.1:19789`) so Claude has everything in one session.

## Ground rules
1. One numbered piece at a time, in order. After each: verify **live in the running Maestro app with a
   real file** (not just tests — placeholders have fooled us before), screenshot into
   `docs/screenshots/`, and give exact user test steps.
2. Everything feeds the timeline via `import_media`. Don't rebuild; feed in.
3. State upfront what each piece needs from the user (keys, GPU, installs). Prompt for keys on contact.
4. Read each repo's `SKILL.md` / `install.md` before integrating; cite the file followed.
5. Keep GPLv3 compliance + attribution; note each tool's license.
6. Honesty over checkmarks: if a repo doesn't actually work or needs paid infra, say so.

## Build order

### ① video-use — transcript-based smart editing (PRIORITY, in progress)
Repo: https://github.com/browser-use/video-use — **MIT**. Reads the video via an **ElevenLabs Scribe**
word-level transcript (never "watches" it), then removes filler words / dead air, auto color-grades,
burns subtitles, adds 30 ms audio fades at cuts, and self-evaluates each cut. Installs as a Claude-Code
skill; outputs `<videos_dir>/edit/final.mp4`.
- **Needs from you:** an **ElevenLabs API key** (free tier fine) — elevenlabs.io/app/settings/api-keys.
- **Local prereqs (all present):** Python 3.11, uv 0.10, ffmpeg 8.0, git.
- **Seam:** after `final.mp4` is produced, Claude calls `import_media { path: ".../edit/final.mp4" }`
  → the cleaned clip appears on Maestro's timeline and exports.
- **License note:** MIT — compatible; attribute in NOTICE.

### ② Prompt → motion graphics — Remotion + Motion Canvas + Manim (Palmier has none)
Repos: wilwaldon/Claude-Code-Video-Toolkit (Remotion/Manim skills, transitions), VideoZero/skills
(Motion Canvas), and the Remotion skill (`npx skills add remotion-dev/skills`). Claude generates
animated titles/intros/outros/overlays **as code → MP4**, imported onto the timeline.
- **Needs from you:** Node (present). Remotion renders via headless Chromium (bundled).
- **Seam:** render → `import_media`. **Licenses:** Remotion has its own license (free for individuals /
  small companies; **verify before commercial use**); Motion Canvas MIT; Manim MIT. Flag Remotion's
  license to the user before shipping commercially.

### ③ Free open AI generation — un-stub generate_video/generate_image (Palmier's paid part, made free)
Primary: **LTX-2** (Apache-2.0, open weights, 4K + synced audio, free commercial under $10M rev).
Alt unified backend: Anil-matcha/Open-Generative-AI (MIT; wraps Flux, Wan 2.2, LTX, Kling).
Rewire Maestro's stubbed `generate_video`/`generate_image` to call a real generator: **local LTX-2 if a
capable NVIDIA GPU is present, else a hosted API (Fal / Replicate)**. Result auto-imports to the
timeline — reconstructing Palmier's "prompt → media on timeline" loop, open/free.
- **Needs from you:** GPU check (below) + either GPU VRAM (LTX-2 local) or a Fal/Replicate key (hosted,
  per-generation cost). **Decision gate:** confirm hardware, then local-vs-hosted + cost.
- **Companion-MCP scope (the seam):** a tiny `maestro-gen` MCP with `generate(prompt, kind, seconds)`
  that calls the chosen backend, downloads the result to disk, and returns the path; Claude then calls
  Maestro's `import_media`. Keeps generation isolated and swappable. **Not built yet — scoped only.**

### ④ Skills system — teach Claude to edit like a pro (partly done)
Palmier's own skills mechanism is **already ported and live over MCP** (`read_skill` + `list_skills`,
fetching `palmier-io/palmier-skills`; see `src/mcp/skills.ts`). Remaining: author Maestro-specific
skills — **"youtube-short"** and **"talking-head-cleanup"** — that chain ①–③ end to end (e.g. video-use
clean → captions → motion-graphic intro → export).

### ⑤ Research-only (report, don't build)
- barckley75/resolve-claude-mcp (DaVinci Resolve MCP) — study for pro-editor MCP patterns.
- bradautomates/claude-video, jordanrendric/claude-video-vision — give Claude true **video perception**
  (watch frames + transcript) so it can *see* what it edits. Evaluate for a later phase.

## License ledger (running)
| Tool | License | Use |
|------|---------|-----|
| Palmier Pro (upstream) | GPLv3 | editor/format/MCP/skills — Maestro is a GPLv3 derivative |
| palmier-io/palmier-skills | (repo license) | skill bodies fetched at runtime |
| browser-use/video-use | MIT | ① transcript editing |
| Remotion | custom (free for small orgs) | ② — **verify before commercial** |
| Motion Canvas / Manim | MIT | ② |
| LTX-2 | Apache-2.0 | ③ generation |
| Open-Generative-AI | MIT | ③ alt backend |
