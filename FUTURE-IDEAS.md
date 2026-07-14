# Kaestral — Future Ideas (post-1.0)

Deferred deliberately. Not in the 1.0 launch scope.

## render_frame / preview_timeline (post-launch — HIGH value)
A tool that reads back a **composited** timeline frame (grades, effects, text, motion all baked
together) as an image, so a connected LLM can self-critique its own finished work without a full
`export_project`. Surfaced by the tool-surface audit (`docs/superpowers/TOOL-SURFACE-AUDIT.md`,
top MISSING tool) and validated during the cold-subagent gate — the controller judged rendered
frames by eye; this tool would give the LLM that same self-critique loop. Ship after 1.0.

## Other audited MISSING tools (see TOOL-SURFACE-AUDIT.md)
- `measure_legibility` — safe-margin / text-contrast check (matters most for 9:16 social).
- `version_composition` / `duplicate_clip` — non-destructive A/B branching of a grade / caption
  style / motion composition.
- Remaining MISSING items and the 6 DEEPER-LATER handler-deepening items are catalogued in the
  audit doc.

## add_captions doc/handler mismatch
Being FIXED in the 1.0 launch pass (schema documented fields the handler never read). If any
residual deepening remains after the fix, track it here.
