# Kaestral — launch posts (drafts)

Positioning: **Kaestral — the AI-operated video editor for Windows. You describe the edit. It makes it.**
Honesty first (never overclaim; name where Palmier wins). Generation stays a Pro-waitlist, not a claim.

---

## Hacker News — Show HN

**Title:**
`Show HN: Kaestral – an AI-operated video editor for Windows (GPLv3, Claude-Code-native)`

**Body:**
The AI-native video editor (Palmier Pro) is macOS-only. I ported it to Windows in two weeks — then
gave it eyes and ears.

Kaestral is a real multi-track video editor where the AI does the work. You point the Claude Code you
already have at it (one `claude mcp add` line) and say things like *"cut the boring parts, add captions,
punch in on the hook."* Every edit runs through the editor's own tools, so you get a real, editable
timeline — not a black-box export — and you can still touch every frame yourself.

What it actually does today (all on-device, no cloud needed):
- **Word-level transcription** (whisper.cpp) → cut filler words, caption on the word.
- **Frame vision** → the model literally sees your footage to pick the best moments.
- **Beat + silence detection** → rhythmic, jump-cut-on-pause editing.
- **Motion graphics** from a prompt (Remotion): intros, logo reveals, data-viz.
- Full timeline: keyframes, 16 blend modes, color (wheels/curves/LUTs), transitions.
- Export H.264/H.265/ProRes + Premiere (XMEML) / Resolve (FCPXML).
- 48+ MCP tools.

**Honest about the tradeoffs:**
- It's a port. The `.palmier` format + MCP contract are Palmier's; the MCP server speaks `palmier-pro`
  on purpose so it's a drop-in for their ecosystem. Full GPLv3 credit in the repo.
- **AI *generation* is NOT in the free tier.** That's Palmier's paid cloud, and it's my deferred Pro
  tier (waitlist). I'm not competing on generation. Kaestral's wedge is Windows + real perception + a
  free, open, Claude-Code-native workflow.
- New and unpolished in places; feedback very welcome.

Stack: Tauri 2 (Rust) + React/TS + bundled FFmpeg + a local MCP server. Runs on modest hardware (my
dev box is a GTX 1650). 190 tests.

Repo: https://github.com/prabindersinghh/kaestral
Windows installer + `npx kaestral` in the README.

Happy to answer anything about the port, the MCP tool design, or the on-device perception.

---

## r/ClaudeAI

**Title:**
`I built a video editor that Claude Code operates — cut, caption, and edit by prompt (Windows, open-source)`

**Body:**
If you use Claude Code, you can now edit video with it.

Kaestral is a real multi-track video editor exposed as an MCP server. You connect Claude Code with one
line and drive the whole edit by prompt:

```
npx kaestral
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
claude
```

Then: *"get_timeline, cut the silent parts of demo.mp4, add word-level captions, punch in on the hook,
and export it."* — and it happens on a real timeline you can still edit by hand.

It has 48+ tools and genuine perception, all on-device:
- **Hears** your footage: word-level transcription → caption on the word, cut filler + pauses.
- **Sees** your footage: frame vision → finds the best moments, reads the framing.
- **Feels** the music: beat/silence detection → rhythmic cuts.
- Plus motion graphics from a prompt (Remotion), color grading, transitions, and Premiere/Resolve export.

Free + open-source (GPLv3), Windows-first (it's a port of the Mac-only Palmier Pro — full credit in the
repo). AI *generation* is a separate Pro waitlist, not part of the free tier.

Would love feedback from folks building with MCP — the tool design is the interesting part.
Repo: https://github.com/prabindersinghh/kaestral

---

## X / Twitter (thread)

**1/**
The AI-native video editor was Mac-only.

I ported it to Windows in two weeks — then gave it eyes and ears.

Meet Kaestral: you describe the edit, it makes it. 🧵

**2/**
Point the Claude Code you already have at it (one line) and say:

"cut the boring parts, add captions, punch in on the hook"

…and watch your timeline change. A real editor — you can still touch every frame.

**3/**
It actually perceives your footage, all on-device:

👂 word-level transcription → cut filler, caption on the word
👁️ frame vision → finds the best moments
🥁 beat/silence detection → rhythmic cuts

No cloud required.

**4/**
Also generates motion graphics from a sentence — intros, logo reveals, data-viz (Remotion).

Full timeline underneath: keyframes, blend modes, color grading, transitions.
Export H.264/H.265/ProRes + Premiere/Resolve.

**5/**
Honest about it:
• It's a GPLv3 port of Palmier Pro (Mac-only). Full credit in the repo.
• AI *generation* is a Pro waitlist — not competing with their paid cloud.
• The wedge: Windows + real perception + free & Claude-Code-native.

**6/**
Free. Open-source. Runs on a GTX 1650.

Windows installer + `npx kaestral`:
→ github.com/prabindersinghh/kaestral

Feedback very welcome. 🦅
