# Kaestral

**The AI-operated video editor for Windows. You describe the edit. It makes it.**

A kestrel watches with total precision, then strikes. Kaestral watches your footage, hears every
word, and cuts. Type *"cut the boring parts, add captions, punch in on the hook"* — and watch your
timeline change.

Works with the **Claude Code** you already have (free), or in-app chat. Built on a real pro timeline —
so when the AI is done, you can still touch every frame.

> **Why Windows?** The AI-native editor (Palmier Pro) is macOS-only. Kaestral brings it to Windows —
> the 70% they don't serve — and gives it eyes and ears they don't have.

---

## What it does

### 🎬 AI-operated. You direct, it edits.
Describe the edit in plain language and watch it happen on your timeline — cut, caption, punch in,
grade, add a title. Every action runs through the editor's tools, so the result is a real, editable
project, not a black-box export. Drive it with **Claude Code** (free, terminal) or the **in-app chat**.

### ⚡ Raw footage → publish-ready reel.
Drop a 20-minute recording; get a tight, captioned, beat-cut short. Kaestral **removes filler words**,
**finds the hook**, and **captions on the word** — automatically. Speech is transcribed on-device; cuts
land on silences and beats.

### 📊 Make SaaS & product videos without an editor.
Animated intros, logo reveals, data-viz, and transition stingers — **generated from a sentence** and
rendered onto your timeline. Launch videos, demos, and ads, without hiring an editor.

*...plus the full editor underneath:*

- **Real pro timeline** — multi-track, ruler + playhead, drag-with-snapping, split, ripple-delete,
  undo/redo, keyframes, 16 blend modes, frame-accurate composited preview.
- **Perception** — word-level transcription (whisper, on-device), frame **vision** (the AI actually
  sees your footage), beat/silence detection, color-palette extraction.
- **Motion graphics** — titles (canvas) + Remotion templates from a prompt.
- **Color** — grade with wheels, curves, LUTs, temperature.
- **Import from anywhere** — files, drag-drop, or a URL (`import_from_url`, via your `yt-dlp`).
- **Export** — H.264 / H.265 / ProRes, plus **Premiere (XMEML)**, **Resolve/FCP (FCPXML)**, and
  `.palmier`.
- **Editing playbooks (skills)** — viral-reel, beat-sync, creative-director, captions, b-roll,
  platform-delivery, promo/ad. The AI reads them and follows pro workflows.

**48+ MCP tools.** A full editor the AI operates like a pair of hands.

---

## How it works (the proof)

On-device **whisper** for word-level transcription · **frame vision** so the model sees the footage ·
**beat/silence detection** for rhythmic cuts · **palette extraction** for on-brand color · **Remotion**
motion graphics · an **MCP server** exposing 48+ tools · a full multi-track timeline · **H.264/H.265/
ProRes** render + **Premiere/Resolve** interchange export. No cloud required for any of it.

## Pro (waitlist)
**AI video generation — coming soon.** Type a prompt, get a real clip on your timeline. Generate video,
images, and B-roll inside Kaestral. [Join the waitlist](#) from the app's **✨ Pro** button.

---

## Get it

Kaestral is designed to be adopted **MCP-first** — the fastest way in is to point the Claude Code you
already have at it.

### 1. MCP server (primary — one line)
```bash
npx kaestral            # starts the local editor engine on http://127.0.0.1:19789/mcp
claude mcp add --transport http palmier-pro http://127.0.0.1:19789/mcp
claude
```
Then just ask: *"get_timeline, then cut the silent parts of demo.mp4, add captions, and export it."*

### 2. Windows installer
Download **Kaestral_x64-setup.exe** from [Releases](https://github.com/prabindersinghh/kaestral/releases).
Double-click — the editor and its engine start internally (no terminal, no npm).

### 3. From source
```bash
git clone https://github.com/prabindersinghh/kaestral
cd kaestral && npm install
npm run tauri dev
```

### macOS
Roadmap. Kaestral is Windows-first by design (that's the wedge). macOS is planned once Windows lands.

---

## Honest comparison — Kaestral vs Palmier Pro

| | **Kaestral** | **Palmier Pro** |
|---|---|---|
| Platform | **Windows** (macOS on roadmap) | macOS only |
| AI editing over MCP | ✅ | ✅ (the original) |
| Perception (transcribe/see/beats) | ✅ on-device | ✅ |
| AI video **generation** | ⏳ Pro (waitlist) | ✅ **paid cloud (shipping)** |
| Maturity | new, open-source | established, funded (YC S24) |
| Price | free, GPLv3 | paid |
| The format & MCP contract | **theirs** (`.palmier`, palmier-pro) | theirs |

**Where Palmier wins:** they ship AI generation today and they're more mature. Kaestral doesn't compete
on generation — that's their paid cloud and our deferred Pro tier. Kaestral's edge is **Windows + real
perception + a free, open, Claude-Code-native workflow.**

## Why the MCP server is named `palmier-pro`
Kaestral is a Windows port of Palmier Pro. To stay a **drop-in** for the Palmier ecosystem, the MCP
server identifies as **`palmier-pro`** and speaks the **`.palmier`** project format — so agents,
configs, and MCP clients built for Palmier work against Kaestral unchanged. This is a frozen
compatibility contract; the *product* is Kaestral, the *wire protocol* is palmier-pro on purpose.

## Development
```bash
npm test           # 190 tests: format round-trip, edit engine, MCP contract, perception, render
npm run typecheck  # strict TS
npm run build      # production frontend
```

## License & credit
**GPLv3.** Kaestral is a derivative work of **Palmier Pro** by Palmier Inc.
([palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro), GPLv3), re-implemented for
Windows using the Swift source as an executable specification. The `.palmier` format, MCP contract,
and editing semantics are theirs; the Windows implementation is this repo. Palmier's proprietary cloud
generation backend is not part of the upstream repo and is not ported. Third-party components
(whisper.cpp, FFmpeg, Remotion, etc.) retain their own permissive licenses — see [NOTICE.md](./NOTICE.md).
