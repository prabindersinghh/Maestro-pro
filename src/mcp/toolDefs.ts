// The 41 MCP tools — FROZEN CONTRACT. Names + inputSchemas are copied to match
// Agent/Tools/ToolDefinitions.swift verbatim (SPEC §9). Real Claude/Cursor/Codex
// clients validate against these names + schemas, so they must not drift.
//
// NOTE: tool DESCRIPTIONS here are faithful source-derived summaries. The canonical
// full-length descriptions live in ToolDefinitions.swift; syncing them verbatim is a
// tracked release checklist item (see PROGRESS.md). Names + schemas are exact now.

import { BLEND_MODES, VIDEO_LAYOUTS, TEXT_ANIMATION_PRESETS } from "../model/enums";

export type JsonSchema = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

// ToolDefinitions.objectSchema — omits properties/required when empty.
function obj(properties: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema {
  const d: JsonSchema = { type: "object" };
  if (Object.keys(properties).length) d.properties = properties;
  if (required.length) d.required = required;
  return d;
}
const arr = (items: JsonSchema, description?: string): JsonSchema =>
  description ? { type: "array", description, items } : { type: "array", items };
const str = (description?: string): JsonSchema => (description ? { type: "string", description } : { type: "string" });
const int = (description?: string): JsonSchema => (description ? { type: "integer", description } : { type: "integer" });
const num = (description?: string): JsonSchema => (description ? { type: "number", description } : { type: "number" });
const bool = (description?: string): JsonSchema => (description ? { type: "boolean", description } : { type: "boolean" });
const enumStr = (values: readonly string[], description?: string): JsonSchema => ({
  type: "string",
  enum: [...values],
  ...(description ? { description } : {}),
});

// TextAnimation.Preset.agentValues = ["off"] + non-none rawValues.
const ANIMATION_VALUES = ["off", ...TEXT_ANIMATION_PRESETS.filter((p) => p !== "none")];

const textBoxTransformProps: Record<string, JsonSchema> = {
  centerX: num("0-1 horizontal center."),
  centerY: num("0-1 vertical center."),
  width: num("0-1 width."),
  height: num("0-1 height."),
};
const textStyleProps: Record<string, JsonSchema> = {
  fontName: str("Font name."),
  fontSize: num("Canvas points."),
  isBold: bool("Bold."),
  isItalic: bool("Italic."),
  color: str("Text color hex."),
  alignment: enumStr(["left", "center", "right"], "Text alignment."),
  borderColor: str("Text outline hex; enables outline."),
  backgroundColor: str("Text box fill hex; enables fill."),
};

/** ToolDefinitions.all — 41 tools in registration order. */
export const TOOL_DEFS: ToolDef[] = [
  // --- Read / inspect (6) ---
  {
    name: "get_timeline",
    description:
      "Always call at the start of a session. Returns project settings (fps, resolution, totalFrames), tracks, clips with frames/properties, and canGenerate (false ⇒ generation/upscale tools fail). Fields equal to their defaults are omitted; caption clips come back as captionGroups.",
    inputSchema: obj({
      startFrame: int("Optional. Window start (inclusive)."),
      endFrame: int("Optional. Window end (exclusive)."),
    }),
  },
  {
    name: "get_media",
    description:
      "Call before referencing any asset. Every mediaRef in other tools comes from the IDs returned here. Also exposes generationStatus.",
    inputSchema: obj(),
  },
  {
    name: "inspect_media",
    description:
      "Container metadata for a media asset via ffprobe: width, height, duration (seconds + frames), fps, aspect ratio, and whether it has audio. Use before referencing footage to know its real dimensions/length. For what's ON the frames use see_video; for spoken words use get_transcript.",
    inputSchema: obj(
      {
        mediaRef: str("Asset ID from get_media."),
        clipId: str("Optional. Inspect the media underlying this clip instead of passing a mediaRef."),
      },
      ["mediaRef"],
    ),
  },
  {
    name: "get_transcript",
    description:
      "Returns the spoken transcript of the CURRENT timeline in project frames — the post-edit caption track in one call. Words are global 0-based indices; pass to remove_words. Transcription runs on-device.",
    inputSchema: obj({
      startFrame: int("Optional. Only return words ending after this project frame."),
      endFrame: int("Optional. Only return words starting before this project frame."),
      clipId: str("Scope the transcript to a single clip."),
      language: str("Optional BCP-47 language tag of the spoken audio."),
    }),
  },
  {
    name: "inspect_timeline",
    description:
      "A structured summary of what's on the timeline RIGHT NOW: project fps/size, total duration, and per track every clip with its media name, in/out (frames + seconds), speed, volume, and text. Read it to verify edits landed. (For a composited pixel preview, render/export.)",
    inputSchema: obj({}),
  },
  {
    name: "search_media",
    description:
      "Search the media library by content: what's on screen (visual, semantic, on-device) and what's said (spoken). Hits are source-second ranges. Not available in this Windows build (returns a stub error) — use see_video / get_transcript instead.",
    inputSchema: obj(
      {
        query: str("What to find."),
        scope: enumStr(["visual", "spoken", "both"], "Optional. Default both."),
        mediaRef: str("Optional. Restrict the search to one asset."),
        limit: int("Optional. Max hits per group (default 10, max 50)."),
      },
      ["query"],
    ),
  },

  // --- Timeline edit (13) ---
  {
    name: "add_clips",
    description:
      "Places one or more media assets on the timeline as a single undoable action. Clips on the same track are sequential; overlaps trim/split/remove existing clips (overwrite). Omit trackIndex on all entries to auto-create tracks.",
    inputSchema: obj(
      {
        entries: arr(
          obj(
            {
              mediaRef: str("ID of the media asset from get_media"),
              trackIndex: int("Optional. Track index (0-based)."),
              startFrame: int("Timeline frame position to place the clip (project frames)."),
              durationFrames: int("Optional. Clip length on the timeline. Mutually exclusive with trimEndFrame."),
              trimStartFrame: int("Optional. Frames trimmed off the START of the source (a SOURCE offset in PROJECT frames)."),
              trimEndFrame: int("Optional. Frames trimmed off the END of the source, in PROJECT frames."),
            },
            ["mediaRef", "startFrame"],
          ),
          "Clips to add.",
        ),
      },
      ["entries"],
    ),
  },
  {
    name: "insert_clips",
    description:
      "Inserts assets at a single point and RIPPLES: clips at/after atFrame are pushed right on the target track, every sync-locked track, and any linked-audio track. Non-destructive counterpart to add_clips.",
    inputSchema: obj(
      {
        trackIndex: int("Track index (0-based) to insert into and ripple."),
        atFrame: int("Timeline frame where insertion begins."),
        entries: arr(
          obj(
            {
              mediaRef: str("ID of the media asset from get_media."),
              durationFrames: int("Optional. Timeline length. Mutually exclusive with trimEndFrame."),
              trimStartFrame: int("Optional. Source in-point offset in PROJECT frames."),
              trimEndFrame: int("Optional. Source out-point offset in PROJECT frames."),
            },
            ["mediaRef"],
          ),
          "Clips to insert, placed sequentially from atFrame.",
        ),
      },
      ["trackIndex", "atFrame", "entries"],
    ),
  },
  {
    name: "remove_clips",
    description:
      "Removes one or more clips by ID as a single undoable action. A clip in a link group takes its whole group with it.",
    inputSchema: obj({ clipIds: arr(str(), "Clip IDs to remove.") }, ["clipIds"]),
  },
  {
    name: "remove_tracks",
    description:
      "Removes whole tracks and every clip on them in one undoable action. Linked partners on OTHER tracks are not removed. Remaining track indexes shift down.",
    inputSchema: obj({ trackIndexes: arr(int(), "Track indexes (0-based) to remove.") }, ["trackIndexes"]),
  },
  {
    name: "move_clips",
    description:
      "Moves one or more clips to a new track and/or frame. Overlap on the destination is resolved as in add_clips. Linked partners follow by the same startFrame delta; tracks stay with the named clip.",
    inputSchema: obj(
      {
        moves: arr(
          obj(
            {
              clipId: str("The clip ID to move."),
              toTrack: int("Destination track index (0-based). Omit to keep current track."),
              toFrame: int("Destination start frame. Omit to keep current start."),
            },
            ["clipId"],
          ),
          "Per-clip move requests. At least one of toTrack or toFrame is required per entry.",
        ),
      },
      ["moves"],
    ),
  },
  {
    name: "apply_layout",
    description:
      "Arrange multiple clips into a named multi-video layout (split screen, PIP, grid) in one undoable action. Computes every transform and crop. Two modes: place new clips (mediaRef) or re-layout existing (clipIds). Slot names by layout: full→[main]; side_by_side→[left,right]; top_bottom→[top,bottom]; pip_bottom_right/pip_bottom_left/pip_top_right/pip_top_left→[main,inset]; grid_2x2→[top_left,top_right,bottom_left,bottom_right]; main_sidebar→[main,sidebar]; three_up→[left,center,right]. Every slot of the chosen layout must be filled.",
    inputSchema: obj(
      {
        layout: enumStr(VIDEO_LAYOUTS, "Which layout template to apply."),
        slots: arr(
          obj(
            {
              slot: str("Slot name for the chosen layout (e.g. 'left', 'inset')."),
              mediaRef: str("Asset ID to place into this slot. Use this OR clipIds."),
              clipIds: arr(str(), "Existing clip(s) to frame into this slot. Use this OR mediaRef."),
              anchor: enumStr(
                ["center", "top", "bottom", "left", "right", "top_left", "top_right", "bottom_left", "bottom_right"],
                "Coarse crop anchor (default center).",
              ),
              anchorX: num("Fine horizontal framing, 0–1."),
              anchorY: num("Fine vertical framing, 0–1."),
            },
            ["slot"],
          ),
          "One entry per slot of the chosen layout.",
        ),
        startFrame: int("Placement mode only. Project frame where the layout begins. Default 0."),
        durationFrames: int("Placement mode only. Length of the placed clips."),
        fit: enumStr(["fill", "fit"], "How each clip fills its slot. Default 'fill'."),
      },
      ["layout", "slots"],
    ),
  },
  {
    name: "set_clip_properties",
    description:
      "Apply generic clip property values to one or more clips in one undoable action: durationFrames, trimStartFrame, trimEndFrame, speed, volume, opacity, transform, blendMode. Timing changes propagate to linked partners; per-clip fields don't. Not for layout (use apply_layout).",
    inputSchema: obj(
      {
        clipIds: arr(str(), "Clip IDs to update."),
        durationFrames: int("New duration in frames."),
        trimStartFrame: int("SOURCE-media offset in PROJECT frames."),
        trimEndFrame: int("SOURCE-media offset in PROJECT frames."),
        speed: num("Playback speed multiplier (default 1.0)."),
        volume: num("Volume 0.0-1.0. Clears volume keyframes."),
        opacity: num("Opacity 0.0-1.0. Clears opacity keyframes."),
        transform: obj({
          centerX: num(),
          centerY: num(),
          width: num(),
          height: num(),
          flipHorizontal: bool("Mirror across the vertical axis."),
          flipVertical: bool("Mirror across the horizontal axis."),
        }),
        blendMode: enumStr(BLEND_MODES, "Video/image clips only. 'normal' clears any blend."),
      },
      ["clipIds"],
    ),
  },
  {
    name: "set_keyframes",
    description:
      "Set animated keyframes on one property of one clip. Replaces the track (empty array clears). Frames are CLIP-RELATIVE (0 = first frame). Each row is [frame, ...values, interp?] where interp ∈ {linear, hold, smooth} (default smooth). Row shape by property: volume/opacity/rotation → [frame, value, interp?]; position/scale → [frame, a, b, interp?] (position: x,y 0-1; scale: sx,sy); crop → [frame, top, right, bottom, left, interp?] (0-1 each).",
    inputSchema: obj(
      {
        clipId: str("The clip ID."),
        property: enumStr(["volume", "opacity", "rotation", "position", "scale", "crop"], "Which property's track to set."),
        keyframes: arr({ type: "array" }, "Replacement keyframe rows; shape depends on property (see description). Empty array clears the track."),
      },
      ["clipId", "property", "keyframes"],
    ),
  },
  {
    name: "split_clips",
    description:
      "Splits clips into two at one or more cut points, one undoable action. Pass exactly one of: splits ([{clipId, atFrame}]) or trackIndex+frames. Linked A/V partners split together; right halves regroup.",
    inputSchema: obj({
      splits: arr(
        obj({ clipId: str("The clip ID to split"), atFrame: int("Project frame to split at") }, ["clipId", "atFrame"]),
        "Explicit cuts.",
      ),
      trackIndex: int("Track to cut (use with 'frames')"),
      frames: arr(int(), "Project frames to cut on trackIndex."),
    }),
  },
  {
    name: "ripple_delete_ranges",
    description:
      "Cuts one or more ranges out and closes the gaps in one undoable action. Pass exactly one of clipId or trackIndex. Sync-locked tracks shift along; refuses if one can't absorb the shift.",
    inputSchema: obj(
      {
        trackIndex: int("Cut project-frame ranges spanning every clip on this track. Requires units 'frames'."),
        clipId: str("Cut ranges within this single clip only."),
        ranges: arr(
          { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          "Ranges to remove, each a [start, end] pair.",
        ),
        units: enumStr(["seconds", "frames"], "Interpretation of range values. 'frames' (default)."),
        ignoreSyncLockedTracks: arr(int(), "Track indices to exempt from sync-lock for this call only."),
      },
      ["ranges"],
    ),
  },
  {
    name: "remove_words",
    description:
      "Cut speech by the word (Descript-style) — the primary tool for text-based editing. Name words by their get_transcript index; resolves to frames, removes surrounding pause, cuts linked A/V, closes gaps.",
    inputSchema: obj(
      {
        words: arr(
          { type: ["integer", "array"] },
          "Words to remove by get_transcript index. Each element is an index or an inclusive [start, end] span.",
        ),
        cutAggressiveness: enumStr(["tight", "balanced", "loose"], "How much silence to leave between cut words."),
        language: str("BCP-47 language tag; must match the get_transcript call the indices came from."),
      },
      ["words"],
    ),
  },
  {
    name: "sync_audio",
    description:
      "Align clips to a reference clip by cross-correlating audio and shifting targets. referenceClipId stays put. Returns offsetFrames and confidence per target; refuses weak matches. Not available in this Windows build (returns a stub error).",
    inputSchema: obj(
      {
        referenceClipId: str("Clip the others align to. Stays put."),
        targetClipId: str("Single clip to align."),
        targetClipIds: arr(str(), "Clips to align with the reference."),
        searchWindowSeconds: num("Max ± offset to search in seconds (default 30)."),
        minConfidence: num("Minimum correlation confidence 0–1 (default 0.5)."),
      },
      ["referenceClipId"],
    ),
  },
  {
    name: "undo",
    description:
      "Reverts the assistant's most recent timeline edit as one step. Undoes only edits the assistant made this session; refuses if the latest change wasn't the assistant's. Takes no arguments.",
    inputSchema: obj(),
  },

  // --- Text / captions (3) ---
  {
    name: "add_texts",
    description:
      "Adds text clips as timeline layers. Omit trackIndex on every entry to create one new top video track. Use add_captions for spoken audio captions. Unknown fields are rejected.",
    inputSchema: obj(
      {
        entries: arr(
          obj(
            {
              trackIndex: int("Existing non-audio track. Omit on all entries to create a new top track."),
              startFrame: int("Timeline start frame."),
              durationFrames: int("Duration in frames."),
              content: str("Text. Supports \\n."),
              transform: obj(textBoxTransformProps),
              ...textStyleProps,
              animation: enumStr(ANIMATION_VALUES, "Animation preset; off clears."),
              highlightColor: str("Active-word hex."),
            },
            ["startFrame", "durationFrames", "content"],
          ),
          "Text clips to add.",
        ),
      },
      ["entries"],
    ),
  },
  {
    name: "update_text",
    description:
      "Updates text clips or a captionGroupId: content, typography, color, outline/background color, animation, or text-box transform. Unknown fields are rejected.",
    inputSchema: obj({
      clipIds: arr(str(), "Text clip IDs. Optional if captionGroupId is given."),
      captionGroupId: str("Caption group id from get_timeline."),
      content: str("Replacement text. Supports \\n."),
      transform: obj(textBoxTransformProps),
      ...textStyleProps,
      animation: enumStr(ANIMATION_VALUES, "Animation preset; off clears."),
      highlightColor: str("Active-word hex."),
    }),
  },
  {
    name: "add_captions",
    description:
      "Transcribes spoken audio and creates styled caption text clips. Omit clipIds to caption the timeline's main spoken audio. Per-word animations are timed from transcript.",
    inputSchema: obj({
      clipIds: arr(str(), "Optional. Scope captioning to these audio/video clips."),
      language: str("BCP-47 speech language."),
      centerX: num("0-1 horizontal center."),
      centerY: num("0-1 vertical center."),
      textCase: enumStr(["auto", "upper", "lower"], "Letter case."),
      censorProfanity: bool("Mask profanity."),
      maxWords: int("Max words per caption."),
      ...textStyleProps,
      animation: enumStr(ANIMATION_VALUES, "Caption animation preset."),
      highlightColor: str("Active-word hex."),
    }),
  },

  // --- Color / effects (3) ---
  {
    name: "apply_effect",
    description:
      "Apply non-color effects (blur, sharpen, stylize, detail, key) to video/image clips as a live, editable effect stack. MERGES by type; pass enabled:false to bypass or list a type in remove to delete it.",
    inputSchema: obj(
      {
        clipIds: arr(str(), "Clip ids from get_timeline."),
        effects: arr(
          obj(
            {
              type: enumStr(
                [
                  "detail.clarity", "key.chroma", "blur.gaussian", "blur.sharpen",
                  "blur.noiseReduction", "blur.motion", "stylize.grain", "stylize.vignette", "stylize.glow",
                ],
                "Effect type id. This is the closed set of non-color effects (use apply_color for color.* grading).",
              ),
              params: obj({}, []),
              enabled: bool("Default true. false bypasses without removing."),
            },
            ["type"],
          ),
          "Effects to add or update on the clips.",
        ),
        remove: arr(str(), "Effect type ids to remove from the clips."),
      },
      ["clipIds"],
    ),
  },
  {
    name: "apply_color",
    description:
      "Author/refine a color grade on video/image clips with named controls (wheels, curves, hue curves, LUT). MERGES with the clip's current grade; pass reset:true to start neutral. Applies as live color.* effects.",
    inputSchema: obj(
      {
        clipIds: arr(str(), "Clip ids from get_timeline."),
        reset: bool("Start from neutral instead of merging. Default false."),
        exposure: num("-3…3 EV."),
        contrast: num("0.5…1.5 (1 = neutral)."),
        saturation: num("0…2 (1 = neutral)."),
        vibrance: num("-1…1."),
        temperature: num("2000…11000 K. HIGHER = WARMER."),
        tint: num("-100…100. Positive = green."),
        highlights: num("-1…1."),
        shadows: num("-1…1."),
        blacks: num("-1…1."),
        whites: num("-1…1."),
        shadowsHue: num("Shadow color-push hue 0–360°."),
        shadowsAmount: num("0…1 strength."),
        shadowsLum: num("-0.5…0.5 shadow lift."),
        midsHue: num("Midtone color-push hue 0–360°."),
        midsAmount: num("0…1 strength."),
        midsGamma: num("0.5…2 midtone brightness."),
        highsHue: num("Highlight color-push hue 0–360°."),
        highsAmount: num("0…1 strength."),
        highsGain: num("0.5…1.5 highlight brightness."),
        masterCurve: arr(arr(num()), "Luma tone curve as [x,y] control points in 0–1."),
        redCurve: arr(arr(num()), "Red-channel tone curve, [x,y] points 0–1."),
        greenCurve: arr(arr(num()), "Green-channel tone curve, [x,y] points 0–1."),
        blueCurve: arr(arr(num()), "Blue-channel tone curve, [x,y] points 0–1."),
        hueCurves: obj({
          targets: arr(
            obj(
              {
                targetHue: num("Source hue to act on, 0–360°."),
                hueShift: num("Rotate that hue by -30…30°."),
                satScale: num("Saturation multiplier 0–2."),
                lumShift: num("Lightness shift -0.5…0.5."),
              },
              ["targetHue"],
            ),
          ),
        }),
        lut: obj({
          path: str("Absolute path to a .cube file."),
          strength: num("0–1 blend intensity. Default 1."),
        }),
      },
      ["clipIds"],
    ),
  },
  {
    name: "inspect_color",
    description:
      "Measure color scopes of a timeline clip's graded look (clipId) OR a raw media asset (mediaRef): black/white points, clipping, levels, color tilt, saturation, hueHistogram, plus the rendered frame. Not available in this Windows build (returns a stub error) — apply_color/apply_effect still work, this is read-back measurement only.",
    inputSchema: obj({
      clipId: str("Timeline clip to measure — its current GRADED look."),
      mediaRef: str("Media asset id to measure RAW."),
      atFrame: int("Optional project frame to sample."),
      reference: str("Optional image/video asset id to compare against."),
    }),
  },

  // --- Media library (8) ---
  {
    name: "import_media",
    description:
      "Imports external media into the project's library. source sets exactly one of url (HTTPS), path (absolute local file/dir), or bytes (base64). Returns a placeholder id for URL/path imports.",
    inputSchema: obj(
      {
        source: obj({
          url: str("HTTPS URL."),
          path: str("Absolute local file or directory path."),
          bytes: str("Base64-encoded media data."),
          mimeType: str("Required when bytes is set; optional override for url."),
        }),
        name: str("Display name in the library."),
        folderId: str("Optional. Folder id. Omit for the project root."),
      },
      ["source"],
    ),
  },
  {
    name: "list_folders",
    description: "Lists every folder in the media panel as {id, name, parentFolderId}.",
    inputSchema: obj(),
  },
  {
    name: "create_folder",
    description:
      "Creates folders in the media panel. Pass either name/parentFolderId for one folder or entries for multiple, not both. Undoable.",
    inputSchema: obj({
      name: str("Folder name."),
      parentFolderId: str("Optional parent folder id."),
      entries: arr(obj({ name: str("Folder name."), parentFolderId: str("Optional parent folder id.") }, ["name"]), "Folders to create."),
    }),
  },
  {
    name: "move_to_folder",
    description:
      "Moves media assets to folders. Pass either assetIds/folderId for one destination or entries for multiple, not both. Omit folderId to move to root. Undoable.",
    inputSchema: obj({
      assetIds: arr(str(), "Media asset ids to move."),
      folderId: str("Destination folder id. Omit to move to root."),
      entries: arr(obj({ assetIds: arr(str()), folderId: str("Omit to move to root.") }, ["assetIds"]), "Move operations."),
    }),
  },
  {
    name: "rename_media",
    description:
      "Renames media assets in the library. Pass either mediaRef/name for one asset or entries for multiple, not both. Undoable.",
    inputSchema: obj({
      mediaRef: str("Media asset id from get_media."),
      name: str("New display name."),
      entries: arr(obj({ mediaRef: str(), name: str() }, ["mediaRef", "name"]), "Media assets to rename."),
    }),
  },
  {
    name: "rename_folder",
    description:
      "Renames folders in the media panel. Pass either folderId/name for one folder or entries for multiple, not both. Undoable.",
    inputSchema: obj({
      folderId: str("Folder id from list_folders."),
      name: str("New folder name."),
      entries: arr(obj({ folderId: str(), name: str() }, ["folderId", "name"]), "Folders to rename."),
    }),
  },
  {
    name: "delete_media",
    description:
      "Deletes media assets from the library. Any clips referencing them are removed from the timeline in the same undoable action.",
    inputSchema: obj({ assetIds: arr(str(), "Media asset ids to delete.") }, ["assetIds"]),
  },
  {
    name: "delete_folder",
    description:
      "Deletes folders and everything inside them. Clips referencing any deleted asset are removed from the timeline in the same undoable action.",
    inputSchema: obj({ folderIds: arr(str(), "Folder ids to delete.") }, ["folderIds"]),
  },

  // --- Project / misc (4) ---
  {
    name: "export_project",
    description:
      "Exports from the current project. mode: video (H.264/H.265/ProRes), xml (XMEML→Premiere), fcpxml (→Resolve/FCP), palmier (.palmier package). Omit outputPath to write to ~/Downloads.",
    inputSchema: obj({
      mode: enumStr(["video", "xml", "fcpxml", "palmier"], "Optional. Default video."),
      codec: enumStr(["H.264", "H.265", "ProRes"], "Video mode only. Default H.264."),
      resolution: enumStr(["720p", "1080p", "2K", "4K", "Match Timeline"], "Video mode only. Default Match Timeline."),
      outputPath: str("Optional. Absolute destination path."),
      overwrite: bool("Optional. Default true."),
    }),
  },
  {
    name: "set_project_settings",
    description:
      "Change the project's frame rate, resolution, or aspect ratio. aspectRatio and explicit width/height are mutually exclusive. Existing clips are re-fitted; frames rescale when fps changes. Undoable.",
    inputSchema: obj({
      fps: int("Frame rate in frames per second."),
      width: int("Canvas width in pixels. Mutually exclusive with aspectRatio."),
      height: int("Canvas height in pixels. Mutually exclusive with aspectRatio."),
      aspectRatio: enumStr(["16:9", "9:16", "1:1", "4:3", "2.4:1", "9:14"], "Preset aspect ratio; sets width/height together (9:14 is a real preset for tall-social crops, not a typo for 9:16)."),
      quality: enumStr(["720p", "1080p", "2K", "4K"], "Resolution quality preset, independent of aspectRatio."),
    }),
  },
  {
    name: "list_models",
    description:
      "Lists AI models with their capabilities. Returns { models, loaded } — if loaded=false the catalog hasn't synced (e.g. user not signed in). Always call before generate_* / upscale_media.",
    inputSchema: obj({ type: enumStr(["video", "image", "audio", "upscale"], "Filter by type. Omit to list all.") }),
  },

  // --- Generation (4) — STUB (signed-out shape) ---
  {
    name: "generate_video",
    description:
      "Starts an async AI video generation. Returns a placeholder asset ID immediately. Costs real money and is not undoable.",
    inputSchema: obj(
      {
        prompt: str("Text description of the video to generate"),
        name: str("Display name for the asset."),
        model: str("Model ID. Use list_models to see options."),
        duration: int("Duration in seconds."),
        aspectRatio: str("Aspect ratio (e.g. '16:9')"),
        resolution: str("Resolution (e.g. '720p')"),
        startFrameMediaRef: str("Media asset ID to use as the first frame."),
        endFrameMediaRef: str("Media asset ID to use as the last frame."),
        sourceVideoMediaRef: str("Media asset ID of a source video."),
        sourceClipId: str("Optional. Clip id referencing sourceVideoMediaRef."),
        referenceImageMediaRefs: arr(str(), "Media asset IDs of image references."),
        referenceVideoMediaRefs: arr(str(), "Media asset IDs of video references."),
        referenceAudioMediaRefs: arr(str(), "Media asset IDs of audio references."),
        folderId: str("Optional. Folder id."),
      },
      ["prompt"],
    ),
  },
  {
    name: "generate_image",
    description:
      "Starts an async AI image generation. Returns a placeholder asset ID immediately. Costs real money and is not undoable.",
    inputSchema: obj(
      {
        prompt: str("Text description of the image to generate"),
        name: str("Display name for the asset."),
        model: str("Model ID. Use list_models to see options."),
        aspectRatio: str("Aspect ratio (e.g. '16:9')"),
        resolution: str("Resolution (e.g. '2K')"),
        quality: str("Image quality (e.g. 'high')."),
        referenceMediaRefs: arr(str(), "Media asset IDs to use as reference images"),
        folderId: str("Optional. Folder id."),
      },
      ["prompt"],
    ),
  },
  {
    name: "generate_audio",
    description:
      "Starts an async AI audio generation: TTS, text-to-music, or video-to-music. Returns a placeholder asset ID immediately. Costs real money and is not undoable. Not wired in this build (returns a stub error) — use generate_title for animated text or import_media for existing audio.",
    inputSchema: obj({
      prompt: str("Text to speak (TTS) or style/mood (music)."),
      name: str("Display name for the asset."),
      model: str("Model ID. Use list_models with type='audio'."),
      voice: str("TTS only. Voice preset name."),
      lyrics: str("MiniMax Music only. Lyrics with optional section tags."),
      styleInstructions: str("Gemini TTS only. Delivery instructions."),
      instrumental: bool("Music models only. true = no vocals."),
      duration: int("Length in seconds."),
      videoSourceStartFrame: int("Video-to-audio models only. Start frame of a span to score."),
      videoSourceEndFrame: int("Video-to-audio models only. End frame of the span."),
      videoSourceMediaRef: str("Video-to-audio models only. Score this existing video asset."),
      folderId: str("Optional. Folder id."),
    }),
  },
  {
    name: "upscale_media",
    description:
      "Upscales an existing video or image asset to higher resolution. Returns a placeholder asset ID immediately. Costs real money and is not undoable. Not wired in this build (returns a stub error).",
    inputSchema: obj(
      {
        mediaRef: str("ID of the video or image asset to upscale"),
        model: str("Upscaler model ID."),
        sourceClipId: str("Optional. Video clip id referencing mediaRef."),
      },
      ["mediaRef"],
    ),
  },

  // --- Feedback ---
  {
    name: "send_feedback",
    description:
      "Report an agent limitation or bug to the Palmier team. Sends directly — no confirmation — so PARAPHRASE; never include verbatim user content. Use sparingly.",
    inputSchema: obj(
      {
        category: enumStr(["missing_capability", "wrong_result", "confusing_ux", "failure", "suggestion"], "What kind of problem."),
        summary: str("One-line paraphrased summary."),
        details: str("Optional. Paraphrased explanation."),
        severity: enumStr(["low", "medium", "high"], "Optional. How much this blocked the user."),
      },
      ["category", "summary"],
    ),
  },
];

if (TOOL_DEFS.length !== 41) {
  throw new Error(`Expected 41 MCP tools (frozen contract), got ${TOOL_DEFS.length}`);
}

// Kaestral extension tools — NOT part of the frozen 41-tool parity contract. The Skills system is
// ported from Palmier's in-app agent (Agent/Skills), which itself adds read_skill on top of the 41
// MCP tools. Exposed here so Claude Code over MCP can load Palmier's editing playbooks.
export const SKILL_TOOL_DEFS: ToolDef[] = [
  {
    name: "list_skills",
    description: "List available editing skills (playbooks) with their ids and descriptions. A skill is a step-by-step pro workflow (e.g. color-grading, ugc-editing). Call this to discover skills, then read_skill(id) to load one before a matching task.",
    inputSchema: obj({}, []),
  },
  {
    name: "read_skill",
    description: "Load an editing skill's full step-by-step workflow by id (from list_skills). Read and follow it before doing a task it covers — it teaches how to use the editing tools like a professional, not literally.",
    inputSchema: obj({ id: str("The skill id, e.g. 'color-grading' or 'ugc-editing'.") }, ["id"]),
  },
];

// Motion-graphics extension (STRATEGY ②) — NOT part of the frozen 41. Two engines, auto-picked by
// the request: generate_title = fast canvas+FFmpeg for SIMPLE text cards; generate_motion = Remotion
// (React, headless Chromium) for COMPLEX motion design. Both render to MP4 and land on the timeline.
export const MOTION_TOOL_DEFS: ToolDef[] = [
  {
    name: "generate_title",
    description: "SIMPLE animated text card — a title, lower-third, or basic intro — rendered instantly (canvas + FFmpeg, no browser). Use this when the request is essentially text with a basic entrance (fade, slide, scale, typewriter, word-by-word). For anything richer — logo reveals, animated charts, springs/particles, transitions, 'motion design' — use generate_motion instead. Placed at the playhead by default (place=false to only import).",
    inputSchema: obj({
      text: str("The title text (required)."),
      subtitle: str("Optional smaller second line."),
      preset: enumStr(["fadeSlideUp", "scaleIn", "typewriter", "wordReveal", "lowerThird"], "Animation style. Default fadeSlideUp."),
      background: str("'black' | 'gradient' | 'spotlight' | a hex like '#101820'. Default gradient. (lowerThird ignores it.)"),
      accent: str("Accent hex for gradient/spotlight/lower-third bar, e.g. '#1db26b'."),
      color: str("Text hex, default white."),
      fontSize: int("Title size in px at 1080p (scaled to project height). Default 120."),
      durationSeconds: num("Length in seconds. Default 3."),
      place: bool("Place at the playhead (default true). false = only import to the media library."),
    }, ["text"]),
  },
  {
    name: "generate_motion",
    description: "COMPLEX motion graphics via Remotion (React render engine) — animated intros/outros, logo reveals, animated data-viz charts, and transition stingers — rendered to a real MP4 and added to the timeline. Use this (not generate_title) whenever the request is more than simple text: springs, staggered reveals, glow, animated charts, logo builds, transitions, 'make it look like a motion designer did it'. Slower (renders via headless Chromium) but far richer. Templates:\n• AnimatedIntro — title + subtitle with spring scale-in, glow, wipe underline, staggered words.\n• LogoReveal — a ring draws on, the wordmark springs in with a shine sweep.\n• DataViz — an animated bar chart from `bars` (bars grow + values count up).\n• Transition — a full-frame accent wipe 'stinger' to drop between two clips (optional midpoint `label`).\nPlaced at the playhead by default (place=false to only import).",
    inputSchema: obj({
      template: enumStr(["AnimatedIntro", "LogoReveal", "DataViz", "Transition"], "Which motion template."),
      title: str("Main text (AnimatedIntro / LogoReveal / DataViz title)."),
      subtitle: str("Second line (AnimatedIntro)."),
      label: str("Optional midpoint label (Transition)."),
      accent: str("Accent hex, e.g. '#1db26b'."),
      bars: arr(obj({ label: str(), value: num() }, ["label", "value"]), "DataViz data: [{label, value}, …]."),
      durationSeconds: num("Length in seconds."),
      place: bool("Place at the playhead (default true). false = only import."),
    }, ["template"]),
  },
  {
    name: "compose_motion",
    description: "Bespoke generative motion graphics — compose a scene from a SceneSpec JSON and render it (STRATEGY ③, the Generative engine). BEFORE composing, read the 'art-direction' skill (read_skill('art-direction')) — it teaches how to art-direct at a premium level (decision process, optical composition, rhythm, restraint, the physics of premium motion) so your film reads as designed, not templated. Use this instead of generate_motion when you need a custom, beat-synced, multi-layer composition rather than a canned template. Emit JSON ONLY, never code, never CSS, never URLs — the renderer only accepts closed enums, clamped numbers, and brand-token-or-#rrggbb colors. SceneSpec shape: { meta: { aspect: '16:9'|'9:16'|'1:1', fps, brand?, beatMarkers? }, beats: [ { durationInFrames, camera?, background?, transitionOut?, outFade?, layers: [ { element, props, position?, opacity?, blur?, depth?, mask?, motionBlur?, kenBurns?, lightingSweep?, enter?, exit?, style?, hold?, animate? } ] } ] }. Elements: text, textOnPath, video, image, screenMock, waveform, timeline, logo, shape, hairline, barChart, lineChart, areaChart, counter, captionKaraoke, particles, arrow, highlightBox, pointerLine, spotlightDim, splitLayout, gridLayout, countdown. Animations (layer.enter.anim / exit.anim): spring, typewriter, wordReveal, wordStagger (per-word spring reveal), kinetic, draw, fade, collapse, maskReveal. EXPRESSIVENESS (for premium/hand-authored quality): easing anywhere accepts a preset ('ease-out'|'spring'|'linear') OR a custom cubic-bezier { curve:[x1,y1,x2,y2] } — reuse ONE curve across a film for cohesion. position:{x,y,snap} — set snap:false for exact optical placement (not grid-quantized). style:{ role:'display'|'accent'|'muted', size, anchor:'left'|'center'|'right', font:'sans'|'mono' } — anchor:'left' makes an editorial left column (default center centers the text on its point). enter:{ anim, easing, delay, from, durationFrames?, spring:{damping,mass,stiffness}?, pacing:'auto'|'manual' } — pacing:'manual' honors your authored delay verbatim (default 'auto' clamps entrance delays to prevent smear; use 'manual' when the ORDER of staggered entrances is the composition). hairline:{ props.anchor:'start'|'center'|'end' } grows a rule from that edge (honors enter.easing/durationFrames for the draw). hold:{startFrame,durationFrames} freezes a settled element still. animate:{ position?,opacity?,scale?,blur?,rotation? } drives a property on its OWN timeline ({from,to,startFrame,durationFrames,easing}) — but a property cannot be driven by BOTH animate and enter/exit (validator fails loud; pick one). camera:{ move, amount, easing? } — eased push-in/pan. transitionOut:{ kind, accent, overlapFrames?, easing? } — beats overlap and resolve; kind:'cut' only on purpose. outFade:{startFrame,durationFrames} sets the beat's content out-fade window. Per-layer modifiers also fine-tune depth-of-field (blur), parallax depth, Ken Burns drift, lighting sweeps, and masked reveals. Beat-sync: set enter.snapToBeat / transitionOut.snapToBeat true and list meta.beatMarkers (frame indices) so entrances/transitions land on the beat. On error you get back the EXACT offending path (e.g. 'beats[0].layers[1].element: unknown value...') — fix just that field and retry; nothing is rendered on a validation failure.",
    inputSchema: obj({
      spec: obj({}, []),
      place: bool("Place at the playhead (default true). false = only import."),
    }, ["spec"]),
  },
];

// Analysis extension — enables the reel/creative skills. analyze_audio powers beat-synced cutting;
// extract_palette powers palette-driven creative + brand styling. Both run on the bundled FFmpeg with
// Kaestral's own algorithms (no third-party editor code). NOT part of the frozen 41.
export const ANALYSIS_TOOL_DEFS: ToolDef[] = [
  {
    name: "analyze_audio",
    description: "Detect beats, onsets (transients), tempo, AND silence/dead-air ranges of a clip's audio, in PROJECT FRAMES. Beat-sync: cut on beatFrames/onsetFrames (split_clips/ripple_delete_ranges) or punch on the beat (set_keyframes). Jump-cut-on-pause: remove silenceRanges with ripple_delete_ranges. Give a mediaRef (music/asset) or a clipId (its audio).",
    inputSchema: obj({
      mediaRef: str("Audio or video asset id (from get_media)."),
      clipId: str("Timeline clip id (from get_timeline) — analyzes that clip's audio instead."),
    }),
  },
  {
    name: "extract_palette",
    description: "Extract the dominant colors of a clip or asset as hex swatches with prominence weights (sorted). Use for palette-driven creative direction and brand-consistent styling: set text colors (add_texts textStyle) and grading targets (apply_color) from the footage's own palette. Give a mediaRef or a clipId.",
    inputSchema: obj({
      mediaRef: str("Media asset id (from get_media)."),
      clipId: str("Timeline clip id (from get_timeline)."),
      colors: int("How many swatches to return (2–12, default 6)."),
    }),
  },
  {
    name: "import_from_url",
    description: "Download a video from a URL (YouTube, Vimeo, a direct link, …) and place it on the timeline. Uses the user's installed yt-dlp (not bundled); if it's missing, returns a clear install message. Give a `url`; place=false to only add it to the library.",
    inputSchema: obj({
      url: str("http(s) link to a video or a supported site page."),
      name: str("Optional display name in the media library."),
      place: bool("Place on the timeline at the playhead (default true)."),
    }, ["url"]),
  },
  {
    name: "see_video",
    description: "WATCH a clip: returns actual frames as images you can SEE, so you can identify the best moments, the subject and its position/framing, action, and what's on screen — then edit on content (not just rhythm/color). mode 'interval' samples evenly across the clip (overview); 'scene' returns distinct shots/scene-changes (finding moments). Each frame is labelled with its timestamp. Give a mediaRef or a clipId.",
    inputSchema: obj({
      mediaRef: str("Media asset id (from get_media)."),
      clipId: str("Timeline clip id (from get_timeline) — samples within that clip's trimmed range."),
      count: int("How many frames to return (1–12, default 6)."),
      mode: enumStr(["interval", "scene"], "'interval' = evenly spaced (default); 'scene' = on scene changes."),
      maxDim: int("Max frame dimension in px (default 512). Keep small to stay fast."),
    }),
  },
];

/** Tools advertised over MCP: the frozen 41 plus the Skills + Motion + Analysis extensions. */
export const ALL_TOOL_DEFS: ToolDef[] = [...TOOL_DEFS, ...SKILL_TOOL_DEFS, ...MOTION_TOOL_DEFS, ...ANALYSIS_TOOL_DEFS];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);
