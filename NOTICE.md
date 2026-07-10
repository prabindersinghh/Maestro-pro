# NOTICE / CREDITS

**palmier-win** is a Windows port of **Palmier Pro**, the open-source macOS video editor by
Palmier Inc. (YC S24). This project is a derivative work: it re-implements Palmier Pro's editor,
project format, and local MCP tool contract on a web-native desktop stack (Tauri + React + TypeScript).

## Upstream work this is derived from

- **Palmier Pro** — https://github.com/palmier-io/palmier-pro
  Copyright © Palmier Inc. Licensed under the **GNU General Public License v3.0** (GPLv3).

Because Palmier Pro is GPLv3 and this port derives from it (using the Swift sources as an executable
specification and re-implementing their behavior, invariants, project schema, and the 41-tool MCP
contract), **this port is likewise licensed under GPLv3** — see [LICENSE](./LICENSE). The generative-AI
cloud backend of Palmier Pro is proprietary, is **not** part of that repository, and is **not** ported
here; generation tools are stubbed (see `../SPEC.md` §10).

## Attribution in source

Every ported file that mirrors a specific Palmier source file carries an origin comment pointing at the
upstream file it was derived from (e.g. `Models/Timeline.swift`, `Editor/RippleEngine.swift`). This is a
**standing requirement**: any new file that re-implements Palmier logic must name its upstream origin.
See `../PROGRESS.md` → "Licensing / attribution (standing requirement)".

## Port-to-upstream file map (data model + engine)

| Port file (`palmier-win/`) | Upstream (`palmier-pro-main/Sources/PalmierPro/`) |
|---|---|
| `src/model/enums.ts` | `Models/ClipType.swift`, `Keyframe.swift`, `BlendMode.swift`, `TextStyle.swift`, `TextAnimation.swift`, `VideoLayout.swift` |
| `src/model/types.ts`, `defaults.ts`, `codec.ts` | `Models/Timeline.swift`, `Effect.swift`, `TextStyle.swift`, `TextAnimation.swift` |
| `src/model/media.ts` | `Models/MediaManifest.swift`, `MediaFolder.swift`, `MediaAsset.swift` |
| `src/model/helpers.ts` | `Models/Timeline.swift`, `Keyframe.swift` (pure invariants) |
| `src/project/package.ts` | `Project/VideoProject.swift`, `Utilities/Constants.swift` |
| `src/engine/ripple.ts` | `Editor/RippleEngine.swift` |
| `src/engine/overwrite.ts` | `Editor/OverwriteEngine.swift` |
| `src/engine/clipOps.ts` | `Models/Timeline.swift` (Clip extension), `Editor/ViewModel/EditorViewModel+ClipMutations.swift` |
| `src/engine/editEngine.ts` | `Editor/ViewModel/EditorViewModel+{ClipMutations,Ripple,Linking,Keyframes,Tracks}.swift` |
| `src/model/clipSampling.ts` | `Models/Timeline.swift` (Clip sampling), `Keyframe.swift`, `Inspector/InspectorView.swift` (VolumeScale) |
| `src/mcp/toolDefs.ts`, `executor.ts`, `getTimelineOutput.ts` | `Agent/Tools/ToolDefinitions.swift`, `ToolExecutor*.swift` |
| `src/mcp/server.ts` | `Agent/MCP/MCPHTTPServer.swift`, `MCPService.swift` |
| `src/export/xml.ts` | `Export/XMLExporter.swift` (XMEML) |
| `src/export/fcpxml.ts` | `Export/FCPXMLExporter.swift` |
| `src/export/timecode.ts` | `Export/XMLExporter.swift` (timecode math) |
| `src/export/resolver.ts` | `Models/MediaResolver.swift` (exporter subset) |

## Third-party

Bundled/ported third-party components retain their own licenses (React, Tauri, FFmpeg, fonts, etc.).
Fonts vendored by upstream (Inter, Geist, DM Sans, …) are under the SIL Open Font License — see the
upstream `Resources/Fonts/*/OFL.txt`.

### Perception (transcription + vision)

- **whisper.cpp** — https://github.com/ggml-org/whisper.cpp — Copyright © The ggml authors.
  Licensed under the **MIT License**. Maestro bundles the prebuilt Windows CPU CLI (`whisper-cli.exe`
  + `ggml*.dll`) under `vendor/whisper/` for on-device speech transcription. The Whisper GGML model
  weights (`ggml-*.bin`, hosted on Hugging Face) are likewise MIT and download on first use.
- **claude-video** — https://github.com/bradautomates/claude-video — Copyright © 2026 Bradley Bonanno.
  **MIT.** Studied for ideas only (budget-by-duration frame count, scene-change selection, perceptual
  dedup, downscale/clamp, per-frame reason). No source copied — Maestro's `src/vision/frames.ts` is an
  independent reimplementation.
- **claude-video-vision** — https://github.com/jordanrendric/claude-video-vision — Copyright © 2026
  Jordan Vasconcelos. **MIT.** Studied for ideas only (two-phase analyze-then-extract, adaptive
  fps/resolution ladders, interleaved timestamped frame labels). No source copied.

`src/vision/frames.ts` (frame extraction), `src/audio/transcribe.ts` (whisper invocation + JSON
word-timestamp parsing), `src/audio/beats.ts`, and `src/color/palette.ts` are all original Maestro
code over the bundled FFmpeg — clean-room, keeping the paid-tier path free of copyleft.
