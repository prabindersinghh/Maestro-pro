// Headless edit engine — ONE pure module consumed by both the UI (Stage E) and the
// MCP tools (Stage C). Ported from Editor/ViewModel/EditorViewModel+{ClipMutations,
// Ripple,Linking,Keyframes,Tracks}.swift. Undo is modeled as timeline snapshots
// (matching EditorViewModel.withTimelineSwap / registerTimelineSwap).

import type { AnimatableProperty, ClipType } from "../model/enums";
import type { Clip, Keyframe, KeyframeTrack, KeyframeValue, Timeline, Track } from "../model/types";
import { defaultClip, newId } from "../model/defaults";
import { encodeTimeline } from "../model/codec";
import { endFrame } from "../model/helpers";
import { isCompatible } from "../model/enums";
import {
  computeRipplePush, computeRippleShifts, computeRippleShiftsForRanges, mergeRanges, rangeLength,
  type ClipShift, type FrameRange,
} from "./ripple";
import { computeOverwrite } from "./overwrite";
import {
  clampFadesToDuration, clampKeyframesToDuration, rescaleKeyframes, rescaleWordTimings,
  setClipDuration, splitClipKeyframes, trimValues, upsertKeyframe, type TrimEdge,
} from "./clipOps";

export interface ClipLocation {
  trackIndex: number;
  clipIndex: number;
}

export interface PlaceSpec {
  mediaRef: string;
  trackIndex: number;
  startFrame: number;
  durationFrames: number;
  mediaType?: ClipType;
  sourceClipType?: ClipType;
  trimStartFrame?: number;
  trimEndFrame?: number;
  id?: string;
  linkGroupId?: string;
  volume?: number;
}

export interface InsertSpec {
  mediaRef: string;
  durationFrames: number;
  trimStartFrame?: number;
  trimEndFrame?: number;
  mediaType?: ClipType;
  id?: string;
  linkGroupId?: string;
}

export interface MoveSpec {
  clipId: string;
  toTrack?: number;
  toFrame?: number;
}

export interface RippleRangesReport {
  removedFrames: number;
  clearedTracks: number;
  shiftedClips: number;
  anchorTrackIndex: number;
  resultingFragments: { clipId: string; startFrame: number; durationFrames: number }[];
  removedClipIds: string[];
}
export type RippleOutcome = { ok: true; report: RippleRangesReport } | { ok: false; reason: string };

const PROP_TO_KEY: Record<AnimatableProperty, keyof Clip> = {
  opacity: "opacityTrack",
  position: "positionTrack",
  scale: "scaleTrack",
  rotation: "rotationTrack",
  crop: "cropTrack",
  volume: "volumeTrack",
};

interface UndoEntry {
  name: string;
  timeline: Timeline;
}

export class EditEngine {
  timeline: Timeline;
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];

  constructor(timeline: Timeline) {
    this.timeline = timeline;
  }

  // MARK: - Undo/commit

  private snapshotEquals(a: Timeline, b: Timeline): boolean {
    return JSON.stringify(encodeTimeline(a)) === JSON.stringify(encodeTimeline(b));
  }

  /** Run one atomic mutation; snapshot-swap undo. Returns whether anything changed. */
  private commit(name: string, work: () => void): boolean {
    const before = structuredClone(this.timeline);
    work();
    if (this.snapshotEquals(before, this.timeline)) return false;
    this.undoStack.push({ name, timeline: before });
    this.redoStack = [];
    return true;
  }

  /** Reverts the most recent committed edit. Returns its action name, or null if none. */
  undo(): string | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ name: entry.name, timeline: structuredClone(this.timeline) });
    this.timeline = entry.timeline;
    return entry.name;
  }

  redo(): string | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ name: entry.name, timeline: structuredClone(this.timeline) });
    this.timeline = entry.timeline;
    return entry.name;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  // MARK: - Lookups

  findClip(id: string): ClipLocation | null {
    for (let ti = 0; ti < this.timeline.tracks.length; ti++) {
      const ci = this.timeline.tracks[ti].clips.findIndex((c) => c.id === id);
      if (ci >= 0) return { trackIndex: ti, clipIndex: ci };
    }
    return null;
  }

  clipRef(id: string): Clip | null {
    const loc = this.findClip(id);
    return loc ? this.timeline.tracks[loc.trackIndex].clips[loc.clipIndex] : null;
  }

  private allClips(): Clip[] {
    return this.timeline.tracks.flatMap((t) => t.clips);
  }

  /** Reverse link-group index: groupId → member clip ids. */
  private linkIndex(): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const t of this.timeline.tracks) {
      for (const c of t.clips) {
        if (c.linkGroupId) {
          const arr = m.get(c.linkGroupId) ?? [];
          arr.push(c.id);
          m.set(c.linkGroupId, arr);
        }
      }
    }
    return m;
  }

  linkedPartnerIds(clipId: string): string[] {
    for (const members of this.linkIndex().values()) {
      if (members.includes(clipId)) return members.filter((id) => id !== clipId);
    }
    return [];
  }

  expandToLinkGroup(ids: Set<string>): Set<string> {
    const idx = this.linkIndex();
    const clipToGroup = new Map<string, string>();
    for (const [gid, members] of idx) for (const id of members) clipToGroup.set(id, gid);
    const groups = new Set<string>();
    for (const id of ids) {
      const g = clipToGroup.get(id);
      if (g) groups.add(g);
    }
    if (groups.size === 0) return new Set(ids);
    const result = new Set(ids);
    for (const g of groups) for (const m of idx.get(g) ?? []) result.add(m);
    return result;
  }

  private timingPropagationPartners(ids: Set<string>): Set<string> {
    const out = new Set<string>();
    for (const id of ids) {
      for (const pid of this.linkedPartnerIds(id)) if (!ids.has(pid)) out.add(pid);
    }
    return out;
  }

  private get firstAudioIndex(): number {
    const i = this.timeline.tracks.findIndex((t) => t.type === "audio");
    return i < 0 ? this.timeline.tracks.length : i;
  }

  private sortTrack(ti: number): void {
    this.timeline.tracks[ti]?.clips.sort((a, b) => a.startFrame - b.startFrame);
  }

  private pruneEmptyTracks(): void {
    this.timeline.tracks = this.timeline.tracks.filter((t) => t.clips.length > 0);
  }

  /** "V1" / "A1" label (EditorViewModel+Tracks.swift:19). */
  trackDisplayLabel(trackIndex: number): string {
    const t = this.timeline.tracks[trackIndex];
    if (!t) return "";
    const prefix = t.type.charAt(0).toUpperCase();
    let n = 0;
    if (t.type === "audio") {
      for (let i = 0; i <= trackIndex; i++) if (this.timeline.tracks[i].type === t.type) n += 1;
    } else {
      const upper = Math.max(trackIndex + 1, this.firstAudioIndex);
      for (let i = trackIndex; i < upper; i++) if (this.timeline.tracks[i].type === t.type) n += 1;
    }
    return `${prefix}${n}`;
  }

  private contiguousClipIds(track: Track, fromEnd: number, excludeId: string): Set<string> {
    const ids = new Set<string>();
    let chainEnd = fromEnd;
    for (const c of [...track.clips].sort((a, b) => a.startFrame - b.startFrame)) {
      if (c.id === excludeId || c.startFrame < fromEnd) continue;
      if (c.startFrame !== chainEnd) break;
      chainEnd = endFrame(c);
      ids.add(c.id);
    }
    return ids;
  }

  private applyShifts(shifts: ClipShift[]): number {
    let applied = 0;
    for (const s of shifts) {
      const c = this.clipRef(s.clipId);
      if (c) {
        c.startFrame = s.newStartFrame;
        applied += 1;
      }
    }
    return applied;
  }

  private buildClip(spec: PlaceSpec): Clip {
    const c = defaultClip({
      mediaRef: spec.mediaRef,
      startFrame: spec.startFrame,
      durationFrames: spec.durationFrames,
      id: spec.id,
      mediaType: spec.mediaType,
      sourceClipType: spec.sourceClipType,
    });
    if (spec.trimStartFrame !== undefined) c.trimStartFrame = spec.trimStartFrame;
    if (spec.trimEndFrame !== undefined) c.trimEndFrame = spec.trimEndFrame;
    if (spec.volume !== undefined) c.volume = spec.volume;
    if (spec.linkGroupId !== undefined) c.linkGroupId = spec.linkGroupId;
    return c;
  }

  // MARK: - Region clearing (overwrite)  — internal, no commit

  private rawRemoveClip(clipId: string): void {
    for (const t of this.timeline.tracks) {
      const i = t.clips.findIndex((c) => c.id === clipId);
      if (i >= 0) {
        t.clips.splice(i, 1);
        return;
      }
    }
  }

  /** Clear [start,end) on a track by removing/trimming/splitting overlaps (clearRegion). */
  private clearRegion(trackIndex: number, start: number, end: number): void {
    const track = this.timeline.tracks[trackIndex];
    if (!track) return;
    const actions = computeOverwrite(track.clips, start, end, newId);
    for (const a of actions) {
      switch (a.kind) {
        case "remove":
          this.rawRemoveClip(a.clipId);
          break;
        case "trimEnd": {
          const c = this.clipRef(a.clipId);
          if (!c) break;
          c.trimEndFrame += Math.round((c.durationFrames - a.newDuration) * c.speed);
          setClipDuration(c, a.newDuration);
          break;
        }
        case "trimStart": {
          const c = this.clipRef(a.clipId);
          if (!c) break;
          c.startFrame = a.newStartFrame;
          c.trimStartFrame = a.newTrimStart;
          setClipDuration(c, a.newDuration);
          break;
        }
        case "split": {
          this.splitClipRaw(a.clipId, start);
          const ti = this.findClip(a.clipId)?.trackIndex ?? trackIndex;
          const right = this.timeline.tracks[ti].clips.find((c) => c.startFrame === start && c.id !== a.clipId);
          if (right) {
            if (endFrame(right) > end) {
              this.splitClipRaw(right.id, end);
              this.rawRemoveClip(right.id);
            } else {
              this.rawRemoveClip(right.id);
            }
          }
          break;
        }
      }
    }
  }

  // MARK: - Split  — internal raw, no link regroup

  private splitClipRaw(clipId: string, atFrame: number): string | null {
    const loc = this.findClip(clipId);
    if (!loc) return null;
    const track = this.timeline.tracks[loc.trackIndex];
    const clip = track.clips[loc.clipIndex];
    if (!(atFrame > clip.startFrame && atFrame < endFrame(clip))) return null;

    const splitOffset = atFrame - clip.startFrame;
    const leftSource = Math.round(splitOffset * clip.speed);
    const rightSource = Math.round((clip.durationFrames - splitOffset) * clip.speed);

    const left = structuredClone(clip);
    left.durationFrames = splitOffset;
    left.trimEndFrame = clip.trimEndFrame + rightSource;
    left.fadeOutFrames = 0;
    clampFadesToDuration(left);

    const right = structuredClone(clip);
    right.id = newId();
    right.startFrame = atFrame;
    right.durationFrames = clip.durationFrames - splitOffset;
    right.trimStartFrame = clip.trimStartFrame + leftSource;
    right.fadeInFrames = 0;
    clampFadesToDuration(right);

    splitClipKeyframes(clip, left, right, splitOffset);

    track.clips[loc.clipIndex] = left;
    track.clips.push(right);
    this.sortTrack(loc.trackIndex);
    return right.id;
  }

  /** Split the clip containing `atFrame` on a track, plus its linked partners; regroup right halves. */
  private splitGroupAt(trackIndex: number, atFrame: number): string[] {
    const track = this.timeline.tracks[trackIndex];
    if (!track) return [];
    const clip = track.clips.find((c) => atFrame > c.startFrame && atFrame < endFrame(c));
    if (!clip) return [];
    const groupIds = clip.linkGroupId
      ? new Set<string>([clip.id, ...this.linkedPartnerIds(clip.id)])
      : new Set<string>([clip.id]);
    const rights: string[] = [];
    for (const gid of groupIds) {
      const r = this.splitClipRaw(gid, atFrame);
      if (r) rights.push(r);
    }
    if (groupIds.size > 1 && rights.length > 0) {
      const newGroup = newId();
      for (const rid of rights) {
        const c = this.clipRef(rid);
        if (c) c.linkGroupId = newGroup;
      }
    }
    return rights;
  }

  // MARK: - Public operations (each is one undo step)

  /** add_clips: place clips, clearing (overwriting) whatever overlaps on each track. */
  addClips(entries: PlaceSpec[]): boolean {
    return this.commit(entries.length === 1 ? "Add Clip" : "Add Clips", () => {
      for (const e of entries) {
        if (!this.timeline.tracks[e.trackIndex]) continue;
        this.clearRegion(e.trackIndex, e.startFrame, e.startFrame + e.durationFrames);
        this.timeline.tracks[e.trackIndex].clips.push(this.buildClip(e));
        this.sortTrack(e.trackIndex);
      }
      this.pruneEmptyTracks();
    });
  }

  /** insert_clips: ripple — push clips at/after atFrame right on target + sync-locked tracks. */
  insertClips(specs: InsertSpec[], trackIndex: number, atFrame: number): boolean {
    if (!this.timeline.tracks[trackIndex] || specs.length === 0) return false;
    return this.commit(specs.length === 1 ? "Insert Clip" : "Insert Clips", () => {
      const totalPush = specs.reduce((s, x) => s + x.durationFrames, 0);
      const pushTracks = this.timeline.tracks
        .map((_, i) => i)
        .filter((i) => i === trackIndex || this.timeline.tracks[i].syncLocked);

      for (const ti of pushTracks) {
        const straddler = this.timeline.tracks[ti].clips.find((c) => c.startFrame < atFrame && atFrame < endFrame(c));
        if (straddler) this.splitGroupAt(ti, atFrame);
      }
      for (const ti of pushTracks) {
        this.applyShifts(computeRipplePush(this.timeline.tracks[ti].clips, atFrame, totalPush));
      }
      let cursor = atFrame;
      for (const spec of specs) {
        this.timeline.tracks[trackIndex].clips.push(
          this.buildClip({ ...spec, trackIndex, startFrame: cursor, durationFrames: spec.durationFrames }),
        );
        cursor += spec.durationFrames;
      }
      this.sortTrack(trackIndex);
    });
  }

  /** remove_clips: removes clips; a clip in a link group takes its whole group. */
  removeClips(ids: Iterable<string>, opts: { expandLinks?: boolean; prune?: boolean } = {}): boolean {
    const expandLinks = opts.expandLinks ?? true;
    const prune = opts.prune ?? true;
    const set = expandLinks ? this.expandToLinkGroup(new Set(ids)) : new Set(ids);
    const has = this.allClips().some((c) => set.has(c.id));
    if (!has) return false;
    const count = this.allClips().filter((c) => set.has(c.id)).length;
    return this.commit(count === 1 ? "Remove Clip" : "Remove Clips", () => {
      for (const t of this.timeline.tracks) t.clips = t.clips.filter((c) => !set.has(c.id));
      if (prune) this.pruneEmptyTracks();
    });
  }

  /** remove_tracks: remove whole tracks by index; linked partners on other tracks stay. */
  removeTracks(trackIndexes: number[]): boolean {
    const ids = new Set(
      trackIndexes.map((i) => this.timeline.tracks[i]?.id).filter((x): x is string => x !== undefined),
    );
    if (ids.size === 0) return false;
    return this.commit(ids.size === 1 ? "Remove Track" : "Remove Tracks", () => {
      this.timeline.tracks = this.timeline.tracks.filter((t) => !ids.has(t.id));
    });
  }

  /** move_clips: move clips; linked partners follow by the same frame delta, staying on their track. */
  moveClips(moves: MoveSpec[]): boolean {
    // Expand with linked-partner frame deltas.
    const explicit = new Set(moves.map((m) => m.clipId));
    const all: MoveSpec[] = [...moves];
    for (const m of moves) {
      if (m.toFrame === undefined) continue;
      const lead = this.clipRef(m.clipId);
      if (!lead) continue;
      const delta = m.toFrame - lead.startFrame;
      if (delta === 0) continue;
      for (const pid of this.linkedPartnerIds(m.clipId)) {
        if (explicit.has(pid)) continue;
        const partner = this.clipRef(pid);
        if (!partner) continue;
        all.push({ clipId: pid, toFrame: Math.max(0, partner.startFrame + delta) });
      }
    }

    interface Resolved { clip: Clip; toTrack: number; toFrame: number; }
    const resolved: Resolved[] = [];
    for (const m of all) {
      const loc = this.findClip(m.clipId);
      if (!loc) continue;
      const clip = this.timeline.tracks[loc.trackIndex].clips[loc.clipIndex];
      const toTrack = m.toTrack ?? loc.trackIndex;
      if (!this.timeline.tracks[toTrack]) continue;
      if (!isCompatible(this.timeline.tracks[toTrack].type, this.timeline.tracks[loc.trackIndex].type)) continue;
      resolved.push({ clip, toTrack, toFrame: Math.max(0, m.toFrame ?? clip.startFrame) });
    }
    if (resolved.length === 0) return false;

    return this.commit(moves.length === 1 ? "Move Clip" : "Move Clips", () => {
      const toTrackIds = resolved.map((r) => this.timeline.tracks[r.toTrack].id);
      // Pull moved clips off their source tracks first.
      for (const r of resolved) this.rawRemoveClip(r.clip.id);
      // Clear destination regions.
      resolved.forEach((r, i) => {
        const ti = this.timeline.tracks.findIndex((t) => t.id === toTrackIds[i]);
        if (ti >= 0) this.clearRegion(ti, r.toFrame, r.toFrame + r.clip.durationFrames);
      });
      // Drop each clip at its target.
      resolved.forEach((r, i) => {
        const ti = this.timeline.tracks.findIndex((t) => t.id === toTrackIds[i]);
        if (ti < 0) return;
        const clip = structuredClone(r.clip);
        clip.startFrame = r.toFrame;
        this.timeline.tracks[ti].clips.push(clip);
      });
      for (let ti = 0; ti < this.timeline.tracks.length; ti++) this.sortTrack(ti);
      this.pruneEmptyTracks();
    });
  }

  /** split_clips (explicit clipId/atFrame pairs). Linked partners split together. */
  splitClips(splits: { clipId: string; atFrame: number }[]): string[] {
    let rights: string[] = [];
    this.commit(splits.length > 1 ? "Split Clips" : "Split Clip", () => {
      for (const s of splits) {
        const loc = this.findClip(s.clipId);
        if (!loc) continue;
        rights = rights.concat(this.splitGroupAt(loc.trackIndex, s.atFrame));
      }
    });
    return rights;
  }

  /** split_clips (trackIndex + frames). Each frame is matched to the clip containing it. */
  splitTrackAt(trackIndex: number, frames: number[]): string[] {
    let rights: string[] = [];
    this.commit(frames.length > 1 ? "Split Clips" : "Split Clip", () => {
      for (const f of frames) rights = rights.concat(this.splitGroupAt(trackIndex, f));
    });
    return rights;
  }

  /**
   * trim: edits give absolute SOURCE-frame trim values; the delta from the clip's current
   * trim is converted to a TIMELINE-frame delta via speed (trim-in-project-frames).
   * Ported from EditorViewModel+Ripple.swift:432 (trimClipInternal).
   */
  trimClips(edits: { clipId: string; trimStartFrame: number; trimEndFrame: number }[]): boolean {
    if (edits.length === 0) return false;
    return this.commit(edits.length === 1 ? "Trim Clip" : "Trim Clips", () => {
      for (const e of edits) {
        const loc = this.findClip(e.clipId);
        if (!loc) continue;
        const clip = this.timeline.tracks[loc.trackIndex].clips[loc.clipIndex];
        const deltaStartSource = e.trimStartFrame - clip.trimStartFrame;
        const deltaEndSource = e.trimEndFrame - clip.trimEndFrame;
        const deltaStartTimeline = Math.round(deltaStartSource / clip.speed);
        const deltaEndTimeline = Math.round(deltaEndSource / clip.speed);
        const newDuration = clip.durationFrames - deltaStartTimeline - deltaEndTimeline;
        clip.trimStartFrame = e.trimStartFrame;
        clip.trimEndFrame = e.trimEndFrame;
        clip.startFrame = clip.startFrame + deltaStartTimeline;
        setClipDuration(clip, newDuration);
        this.sortTrack(loc.trackIndex);
      }
    });
  }

  /** commitTrim: a project-frame edge drag; expands to linked partners. */
  commitTrim(clipId: string, edge: TrimEdge, deltaFrames: number, propagateToLinked: boolean): boolean {
    const lead = this.clipRef(clipId);
    if (!lead) return false;
    const leadNew = trimValues(lead, edge, deltaFrames);
    const edits = [{ clipId, trimStartFrame: leadNew.trimStart, trimEndFrame: leadNew.trimEnd }];
    if (propagateToLinked) {
      for (const pid of this.linkedPartnerIds(clipId)) {
        const p = this.clipRef(pid);
        if (!p) continue;
        const pv = trimValues(p, edge, deltaFrames);
        edits.push({ clipId: pid, trimStartFrame: pv.trimStart, trimEndFrame: pv.trimEnd });
      }
    }
    return this.trimClips(edits);
  }

  /** speed: rescales duration & keyframes and ripples the contiguous chain after it. */
  setClipSpeed(clipIds: string[], newSpeed: number): boolean {
    return this.commit("Change Speed", () => {
      for (const id of clipIds) {
        const loc = this.findClip(id);
        if (!loc) continue;
        const clip = this.timeline.tracks[loc.trackIndex].clips[loc.clipIndex];
        if (clip.speed === newSpeed) continue;
        this.applySpeedTo(loc.trackIndex, loc.clipIndex, newSpeed);
      }
    });
  }

  private applySpeedTo(ti: number, ci: number, newSpeed: number): void {
    const clip = this.timeline.tracks[ti].clips[ci];
    const sourceFrames = clip.durationFrames * clip.speed;
    const newDuration = Math.max(1, Math.round(sourceFrames / newSpeed));
    const oldDuration = clip.durationFrames;
    const oldEnd = endFrame(clip);

    clip.speed = newSpeed;
    clip.durationFrames = newDuration;
    rescaleWordTimings(clip, oldDuration);
    rescaleKeyframes(clip, newDuration / oldDuration);
    clampKeyframesToDuration(clip);
    clampFadesToDuration(clip);

    const rippleDelta = clip.startFrame + newDuration - oldEnd;
    if (rippleDelta !== 0) {
      const chainIds = this.contiguousClipIds(this.timeline.tracks[ti], oldEnd, clip.id);
      for (const c of this.timeline.tracks[ti].clips) if (chainIds.has(c.id)) c.startFrame += rippleDelta;
    }
    this.sortTrack(ti);
  }

  /** Generic property mutation over a set of clips (one undo step). */
  mutateClips(ids: Set<string>, modify: (clip: Clip) => void, actionName = "Change Clip Property"): boolean {
    return this.commit(actionName, () => {
      for (const t of this.timeline.tracks) for (const c of t.clips) if (ids.has(c.id)) modify(c);
    });
  }

  /** Run an arbitrary timeline mutation as one undo step (higher-level ops like layouts). `work`
   *  must NOT throw — validate before calling. Returns whether anything changed. */
  run(name: string, work: () => void): boolean {
    return this.commit(name, work);
  }

  /** Partners that a timing change (duration/trim/speed) should propagate to. */
  timingPartners(ids: Set<string>): Set<string> {
    return this.timingPropagationPartners(ids);
  }

  /**
   * set_keyframes: replace one property's track on one clip. `keyframes` are CLIP-RELATIVE
   * (0 = clip start). Sorted by frame; last row wins on a duplicate frame. Empty clears.
   */
  setKeyframes(clipId: string, property: AnimatableProperty, keyframes: Keyframe<KeyframeValue>[]): boolean {
    return this.commit("Set Keyframes", () => {
      const clip = this.clipRef(clipId);
      if (!clip) return;
      const key = PROP_TO_KEY[property];
      const track: KeyframeTrack<KeyframeValue> = { keyframes: [] };
      for (const kf of [...keyframes].sort((a, b) => a.frame - b.frame)) upsertKeyframe(track, kf);
      (clip[key] as KeyframeTrack<KeyframeValue> | undefined) = track.keyframes.length ? track : undefined;
    });
  }

  // MARK: - Ripple delete (with sync-lock refusal)

  /**
   * Selection-style ripple delete: remove clips (whole link group) and close the gaps.
   * Sync-locked tracks WITHOUT their own removals shift along (content NOT cut) to preserve
   * alignment, and this is the path that genuinely REFUSES when such a track can't absorb the
   * shift. Ported from EditorViewModel+Ripple.swift:130 (rippleDeleteSelectedClips).
   *
   * (Note: the trackIndex tool path `rippleDeleteRangesOnTrack` instead CUTS every sync-locked
   * track, so its refusal branch is unreachable — see SPEC/PROGRESS. This method is where the
   * sync-lock refusal invariant actually lives.)
   */
  rippleDeleteClips(ids: Iterable<string>): RippleOutcome {
    const removed = this.expandToLinkGroup(new Set(ids));
    if (!this.allClips().some((c) => removed.has(c.id))) {
      return { ok: false, reason: "No matching clips to delete" };
    }
    const globalRemovedRanges: FrameRange[] = this.allClips()
      .filter((c) => removed.has(c.id))
      .map((c) => ({ start: c.startFrame, end: endFrame(c) }));

    const shiftsByTrack = new Map<number, ClipShift[]>();
    for (let ti = 0; ti < this.timeline.tracks.length; ti++) {
      const track = this.timeline.tracks[ti];
      const hasOwnRemovals = track.clips.some((c) => removed.has(c.id));
      if (hasOwnRemovals) {
        shiftsByTrack.set(ti, computeRippleShifts(track.clips, removed));
      } else if (track.syncLocked) {
        const shifts = computeRippleShiftsForRanges(track.clips, globalRemovedRanges);
        const reason = this.validateShifts(ti, shifts);
        if (reason) return { ok: false, reason }; // refuse — nothing changed
        shiftsByTrack.set(ti, shifts);
      }
    }

    const removedFrames = mergeRanges(globalRemovedRanges).reduce((s, r) => s + rangeLength(r), 0);
    let shiftedClips = 0;
    this.commit("Ripple Delete", () => {
      for (const t of this.timeline.tracks) t.clips = t.clips.filter((c) => !removed.has(c.id));
      this.pruneEmptyTracks();
      for (const shifts of shiftsByTrack.values()) shiftedClips += this.applyShifts(shifts);
    });

    return {
      ok: true,
      report: {
        removedFrames,
        clearedTracks: shiftsByTrack.size,
        shiftedClips,
        anchorTrackIndex: -1,
        resultingFragments: [],
        removedClipIds: [...removed],
      },
    };
  }

  private validateShifts(trackIndex: number, shifts: ClipShift[]): string | null {
    const track = this.timeline.tracks[trackIndex];
    if (shifts.length === 0 || !track) return null;
    const label = this.trackDisplayLabel(trackIndex);
    const shiftMap = new Map(shifts.map((s) => [s.clipId, s.newStartFrame]));
    const intervals: FrameRange[] = [];
    for (const clip of track.clips) {
      const start = shiftMap.get(clip.id) ?? clip.startFrame;
      if (start < 0) return `Sync-locked track "${label}" would move past the timeline start.`;
      intervals.push({ start, end: start + clip.durationFrames });
    }
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start < intervals[i - 1].end) {
        return `Sync-locked track "${label}" doesn't have room to ripple.`;
      }
    }
    return null;
  }

  /**
   * ripple_delete_ranges (trackIndex mode). Cuts project-frame ranges spanning any clips on
   * the track and closes the gaps; clears linked-partner tracks + sync-locked tracks; refuses
   * (no change) if a sync-locked follower can't absorb the shift.
   * Ported from EditorViewModel+Ripple.swift:185 (rippleDeleteRangesOnTrack).
   */
  rippleDeleteRangesOnTrack(
    trackIndex: number,
    ranges: FrameRange[],
    ignoreSyncLockTrackIndices: number[] = [],
  ): RippleOutcome {
    const tracks = this.timeline.tracks;
    if (!tracks[trackIndex]) return { ok: false, reason: `Track index out of range: ${trackIndex}` };

    const ignoredTrackIds = new Set(
      ignoreSyncLockTrackIndices.map((i) => tracks[i]?.id).filter((x): x is string => x !== undefined),
    );
    const merged = mergeRanges(ranges.filter((r) => rangeLength(r) > 0));
    if (merged.length === 0) return { ok: false, reason: "No non-empty ranges to delete" };
    const totalRemoved = merged.reduce((s, r) => s + rangeLength(r), 0);

    const anchorTrackId = tracks[trackIndex].id;
    const clearTrackIds = new Set<string>([anchorTrackId]);
    for (const clip of tracks[trackIndex].clips) {
      if (clip.linkGroupId && merged.some((r) => r.start < endFrame(clip) && r.end > clip.startFrame)) {
        for (const pid of this.linkedPartnerIds(clip.id)) {
          const l = this.findClip(pid);
          if (l) clearTrackIds.add(tracks[l.trackIndex].id);
        }
      }
    }
    for (const t of tracks) if (t.syncLocked && !ignoredTrackIds.has(t.id)) clearTrackIds.add(t.id);

    // Refuse up front if a sync-locked follower can't absorb the shift.
    for (let ti = 0; ti < tracks.length; ti++) {
      const t = tracks[ti];
      if (clearTrackIds.has(t.id) || !t.syncLocked || ignoredTrackIds.has(t.id)) continue;
      const shifts = computeRippleShiftsForRanges(t.clips, merged);
      const reason = this.validateShifts(ti, shifts);
      if (reason) return { ok: false, reason };
    }

    const anchorBeforeIds = new Set(tracks[trackIndex].clips.map((c) => c.id));
    let shiftedClips = 0;

    this.commit("Ripple Delete", () => {
      for (const tid of clearTrackIds) {
        const ti = this.timeline.tracks.findIndex((t) => t.id === tid);
        if (ti < 0) continue;
        for (const r of merged) this.clearRegion(ti, r.start, r.end);
      }
      for (let ti = 0; ti < this.timeline.tracks.length; ti++) {
        const t = this.timeline.tracks[ti];
        if (!(clearTrackIds.has(t.id) || (t.syncLocked && !ignoredTrackIds.has(t.id)))) continue;
        const shifts = computeRippleShiftsForRanges(t.clips, merged);
        shiftedClips += this.applyShifts(shifts);
        this.sortTrack(ti);
      }
    });

    const anchorTi = this.timeline.tracks.findIndex((t) => t.id === anchorTrackId);
    const after = anchorTi >= 0 ? this.timeline.tracks[anchorTi].clips : [];
    const afterIds = new Set(after.map((c) => c.id));
    const fragments = [...after]
      .sort((a, b) => a.startFrame - b.startFrame)
      .map((c) => ({ clipId: c.id, startFrame: c.startFrame, durationFrames: c.durationFrames }));
    const removedClipIds = [...anchorBeforeIds].filter((id) => !afterIds.has(id));

    return {
      ok: true,
      report: {
        removedFrames: totalRemoved,
        clearedTracks: clearTrackIds.size,
        shiftedClips,
        anchorTrackIndex: anchorTi < 0 ? trackIndex : anchorTi,
        resultingFragments: fragments,
        removedClipIds,
      },
    };
  }
}
