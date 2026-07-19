import * as React from "react"

import type { CaptionAnimationId } from "../../lib/caption-animations.ts"
import {
  applyHookVariant,
  type HookVariantInput,
} from "../../lib/hook-variants.ts"
import type { MusicTrackId } from "../../lib/music-library.ts"
import type { SoundEffectId } from "../../lib/sound-effects.ts"
import type { TextFontId } from "../../lib/text-fonts.ts"
import type { ProjectTimeline } from "../../lib/timeline-schema.ts"
import { PlaybackClock } from "./playback-clock.ts"
import {
  DEFAULT_PX_PER_SECOND,
  editorId,
  getSlotReflowPlacements,
  MIN_CLIP_MS,
} from "./timeline-utils.ts"

export type ClipKind = "video" | "audio" | "image" | "text"

// One spoken word with clip-relative timing (ms from the clip's start), for
// voice-synced "karaoke" captions — the word is highlighted as the audio
// reaches it. Present only on captions generated with word-level timestamps.
export type ClipWord = { text: string; startMs: number; endMs: number }

export type EditorClip = {
  id: string
  kind: ClipKind
  name: string
  // Placement on the timeline.
  startMs: number
  durationMs: number
  // Media-backed clips (video/audio): source URL + how far into the source
  // this clip begins (changes when trimming the left edge or splitting).
  mediaId?: string
  url?: string
  muted?: boolean
  soundEffectId?: SoundEffectId
  // Bundled music bed (public/music); inserted onto its own ducked track.
  musicTrackId?: MusicTrackId
  sourceDurationMs?: number
  trimStartMs: number
  // Text clips.
  text?: string
  fontId?: TextFontId
  fontSize?: number
  color?: string
  // Optional background color drawn behind the whole text block (a highlight
  // box); unset = no background.
  highlightColor?: string
  // Per-word timings for voice-synced captions; the active word is highlighted
  // as playback reaches it. Unset = static text (rendered all one color).
  words?: ClipWord[]
  // Entrance animation played by the active karaoke word each time it becomes
  // the spoken word. Unset or "none" = static highlight (the historical look).
  animation?: CaptionAnimationId
  // Normalized 0–1 position of the text block's CENTER on the frame
  // (default 0.5/0.5 = centered). Set by dragging the text in the preview.
  x?: number
  y?: number
  // Template slots (CapCut-style): hover shows a Replace button that swaps
  // the media while the slot keeps its timeline position and length.
  replaceable?: boolean
  segmentLabel?: string
}

export type EditorTrack = {
  id: string
  muted: boolean
  // Marks this as the "music" track: its audio is lowered under any overlapping
  // audio on other tracks at export ("duck under voice"). Absent = off.
  duck?: boolean
  clips: EditorClip[] // kept sorted by startMs
}

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3"

export type EditorState = {
  tracks: EditorTrack[]
  selectedClipId: string | null
  pxPerSecond: number
  aspect: AspectRatio
  // Cut tool: clicking a clip splits it at the pointer (DaVinci-style razor).
  cutMode: boolean
  // Undo/redo snapshots of `tracks` (the only undoable substate).
  past: EditorTrack[][]
  future: EditorTrack[][]
}

export type EditorAction =
  | {
      type: "ADD_CLIP"
      clip: EditorClip
      atMs: number
      trackId?: string
    }
  | { type: "ADD_CLIP_TO_NEW_TRACK"; clip: EditorClip; atMs: number }
  // Music bed: its own new track, ducked under voice, starting at t=0.
  | { type: "ADD_MUSIC_BED"; clip: EditorClip }
  | {
      type: "MOVE_CLIP"
      clipId: string
      toTrackId: string
      startMs: number
      placement: "gap" | "slot-reflow"
    }
  // `transient` skips the undo snapshot — used for rapid-fire inspector edits
  // (typing text, dragging sliders) so undo stays at structural granularity.
  | {
      type: "UPDATE_CLIP"
      clipId: string
      patch: Partial<EditorClip>
      transient?: boolean
    }
  | { type: "SPLIT_CLIP"; clipId: string; atMs: number }
  | { type: "DUPLICATE_CLIP"; clipId: string }
  // Swap a slot's media; the slot keeps its start and (clamped) length.
  | {
      type: "REPLACE_CLIP_MEDIA"
      clipId: string
      media: {
        mediaId: string
        url: string
        name: string
        fileType: "video" | "image" | "audio"
        sourceDurationMs: number
      }
    }
  // Insert a whole generated caption track above everything (track 0 renders
  // on top) as a single undo step.
  | { type: "ADD_CAPTION_CLIPS"; clips: EditorClip[] }
  | {
      type: "INSERT_VOICEOVER_BUNDLE"
      audioClip: EditorClip
      captionClips: EditorClip[]
    }
  // Swap the opening hook (voice clip + its karaoke captions) for a rewritten
  // line's generated voice, leaving every other clip in place — one undo step.
  | { type: "APPLY_HOOK_VARIANT"; variant: HookVariantInput }
  | {
      type: "APPLY_JUMP_CUTS"
      clipId: string
      removals: { clipStartMs: number; clipEndMs: number }[]
      rippleClipIds: string[]
    }
  | { type: "ADD_TRACK" }
  | { type: "DELETE_CLIP"; clipId: string }
  | { type: "DELETE_TRACK"; trackId: string }
  | { type: "MOVE_TRACK"; trackId: string; toIndex: number }
  | { type: "TOGGLE_TRACK_MUTE"; trackId: string }
  | { type: "TOGGLE_TRACK_DUCK"; trackId: string }
  | { type: "SELECT_CLIP"; clipId: string | null }
  | { type: "SET_CUT_MODE"; on: boolean }
  | { type: "SET_ZOOM"; pxPerSecond: number }
  | { type: "SET_ASPECT"; aspect: AspectRatio }
  | { type: "UNDO" }
  | { type: "REDO" }

const UNDO_LIMIT = 50

function newTrack(): EditorTrack {
  return { id: editorId(), muted: false, clips: [] }
}

// Restores a saved project timeline; new/empty projects get the usual few
// empty lanes to drop media onto.
export function createInitialEditorState(timeline?: {
  tracks: EditorTrack[]
  aspect: AspectRatio
}): EditorState {
  const hasSavedTracks = timeline && timeline.tracks.length > 0
  return {
    tracks: hasSavedTracks
      ? timeline.tracks
      : [newTrack(), newTrack(), newTrack()],
    selectedClipId: null,
    pxPerSecond: DEFAULT_PX_PER_SECOND,
    aspect: timeline?.aspect ?? "16:9",
    cutMode: false,
    past: [],
    future: [],
  }
}

// Latest end time across all clips — the timeline/playback duration.
export function timelineDurationMs(tracks: EditorTrack[]) {
  let max = 0
  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startMs + clip.durationMs)
    }
  }
  return max
}

export function findClip(tracks: EditorTrack[], clipId: string) {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return { clip, track }
  }
  return null
}

function sortClips(clips: EditorClip[]) {
  return [...clips].sort((a, b) => a.startMs - b.startMs)
}

// True when [startMs, startMs+durationMs) doesn't overlap any other clip.
function fitsAt(
  track: EditorTrack,
  excludeId: string | null,
  startMs: number,
  durationMs: number
) {
  const end = startMs + durationMs
  return track.clips.every(
    (clip) =>
      clip.id === excludeId ||
      end <= clip.startMs ||
      startMs >= clip.startMs + clip.durationMs
  )
}

// Find the start position closest to `desired` where the clip fits in this
// track: clamps into the surrounding gap (so clips butt against neighbors).
// Returns null when no gap is large enough.
function resolveStart(
  track: EditorTrack,
  excludeId: string | null,
  desired: number,
  durationMs: number
): number | null {
  const others = sortClips(track.clips.filter((clip) => clip.id !== excludeId))

  // Build candidate gaps: before first clip, between clips, after last clip.
  let gapStart = 0
  const gaps: { start: number; end: number }[] = []
  for (const clip of others) {
    gaps.push({ start: gapStart, end: clip.startMs })
    gapStart = clip.startMs + clip.durationMs
  }
  gaps.push({ start: gapStart, end: Number.POSITIVE_INFINITY })

  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const gap of gaps) {
    if (gap.end - gap.start < durationMs) continue
    const clamped = Math.min(Math.max(desired, gap.start), gap.end - durationMs)
    const distance = Math.abs(clamped - desired)
    if (distance < bestDistance) {
      best = clamped
      bestDistance = distance
    }
  }
  return best
}

// Immutably replace one track by id.
function withTrack(
  tracks: EditorTrack[],
  trackId: string,
  update: (track: EditorTrack) => EditorTrack
) {
  return tracks.map((track) => (track.id === trackId ? update(track) : track))
}

function normalizeJumpCutRemovals(
  removals: { clipStartMs: number; clipEndMs: number }[],
  durationMs: number
) {
  const sorted = removals
    .map((removal) => ({
      startMs: Math.max(0, Math.min(removal.clipStartMs, durationMs)),
      endMs: Math.max(0, Math.min(removal.clipEndMs, durationMs)),
    }))
    .filter((removal) => removal.endMs - removal.startMs >= MIN_CLIP_MS)
    .sort((a, b) => a.startMs - b.startMs)
  const merged: { startMs: number; endMs: number }[] = []
  for (const removal of sorted) {
    const previous = merged[merged.length - 1]
    if (previous && removal.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, removal.endMs)
    } else {
      merged.push({ ...removal })
    }
  }
  return merged
}

// Push the current tracks onto the undo stack (called by mutating actions).
function pushUndo(state: EditorState, tracks: EditorTrack[]): EditorState {
  return {
    ...state,
    tracks,
    past: [...state.past.slice(-UNDO_LIMIT + 1), state.tracks],
    future: [],
  }
}

function reflowSlotTrack(
  state: EditorState,
  clipId: string,
  targetTrackId: string,
  desiredStartMs: number
): EditorState | null {
  const found = findClip(state.tracks, clipId)
  const target = state.tracks.find((track) => track.id === targetTrackId)
  if (!found || !target || !found.clip.replaceable) return null

  const targetClips =
    found.track.id === target.id
      ? target.clips.filter((clip) => clip.id !== clipId)
      : target.clips
  const placements = getSlotReflowPlacements({
    movingClip: found.clip,
    targetClips,
    trackClips: target.clips,
    desiredStartMs,
  })
  if (!placements) return null

  const clips = placements.map(({ clip, startMs }) => ({ ...clip, startMs }))

  const withoutMoved =
    found.track.id === target.id
      ? state.tracks
      : withTrack(state.tracks, found.track.id, (track) => ({
          ...track,
          clips: track.clips.filter((clip) => clip.id !== clipId),
        }))
  const tracks = withTrack(withoutMoved, target.id, (track) => ({
    ...track,
    clips,
  }))
  return pushUndo(state, tracks)
}

function placeClipInNewTrack(
  state: EditorState,
  clip: EditorClip,
  atMs: number
): EditorState {
  const track = newTrack()
  track.clips = [{ ...clip, startMs: Math.max(0, atMs) }]
  return {
    ...pushUndo(state, [...state.tracks, track]),
    selectedClipId: clip.id,
  }
}

// Place a clip as close to `atMs` as possible: the preferred track clamps
// into its nearest gap; other tracks take it only at the exact time;
// otherwise a fresh track is appended. Selects the placed clip.
function placeClip(
  state: EditorState,
  clip: EditorClip,
  atMs: number,
  preferredTrackId?: string
): EditorState {
  const desired = Math.max(0, atMs)
  const candidates = preferredTrackId
    ? [
        ...state.tracks.filter((t) => t.id === preferredTrackId),
        ...state.tracks.filter((t) => t.id !== preferredTrackId),
      ]
    : state.tracks

  for (const track of candidates) {
    const start =
      preferredTrackId === track.id
        ? resolveStart(track, null, desired, clip.durationMs)
        : fitsAt(track, null, desired, clip.durationMs)
          ? desired
          : null
    if (start !== null) {
      const tracks = withTrack(state.tracks, track.id, (t) => ({
        ...t,
        clips: sortClips([...t.clips, { ...clip, startMs: start }]),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: clip.id }
    }
  }

  return placeClipInNewTrack(state, clip, desired)
}

export function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  switch (action.type) {
    case "ADD_CLIP":
      return placeClip(state, action.clip, action.atMs, action.trackId)

    case "ADD_CLIP_TO_NEW_TRACK":
      return placeClipInNewTrack(state, action.clip, action.atMs)

    case "ADD_MUSIC_BED": {
      // A music bed lives on its own track marked to duck under voice, so it
      // dips under speech automatically (see audio-ducking). Starts at t=0.
      const track: EditorTrack = {
        id: editorId(),
        muted: false,
        duck: true,
        clips: [{ ...action.clip, startMs: 0 }],
      }
      return {
        ...pushUndo(state, [...state.tracks, track]),
        selectedClipId: action.clip.id,
      }
    }

    case "ADD_CAPTION_CLIPS": {
      if (action.clips.length === 0) return state
      // Captions arrive non-overlapping from the server; give them their own
      // top track so they render above the footage.
      const track: EditorTrack = {
        id: editorId(),
        muted: false,
        clips: sortClips(action.clips),
      }
      return pushUndo(state, [track, ...state.tracks])
    }

    case "INSERT_VOICEOVER_BUNDLE": {
      const tracks = state.tracks.map((track) =>
        track.clips.some(
          (clip) => clip.kind === "audio" && clip.name === "Original Audio"
        )
          ? { ...track, muted: true }
          : track
      )
      const audioTrack: EditorTrack = {
        id: editorId(),
        muted: false,
        clips: [{ ...action.audioClip, startMs: 0 }],
      }
      const nextTracks = [...tracks, audioTrack]
      if (action.captionClips.length) {
        nextTracks.unshift({
          id: editorId(),
          muted: false,
          clips: sortClips(action.captionClips),
        })
      }
      return {
        ...pushUndo(state, nextTracks),
        selectedClipId: action.audioClip.id,
      }
    }

    case "APPLY_HOOK_VARIANT": {
      // The pure swap logic (detection + replacement) is shared with its unit
      // tests in lib/hook-variants. It throws when no hook is detectable —
      // the dialog pre-checks, so that only happens if the timeline changed
      // underneath it; treat it as a no-op rather than crashing the reducer.
      let tracks: EditorTrack[]
      try {
        tracks = applyHookVariant(
          { tracks: state.tracks, aspect: state.aspect },
          action.variant,
          editorId
        ).tracks
      } catch {
        return state
      }
      const newAudioClip = tracks
        .flatMap((track) => track.clips)
        .find(
          (clip) =>
            clip.kind === "audio" && clip.mediaId === action.variant.audio.mediaId
        )
      return {
        ...pushUndo(state, tracks),
        selectedClipId: newAudioClip?.id ?? null,
      }
    }

    case "APPLY_JUMP_CUTS": {
      const found = findClip(state.tracks, action.clipId)
      if (
        !found ||
        (found.clip.kind !== "video" && found.clip.kind !== "audio")
      ) {
        return state
      }

      const removals = normalizeJumpCutRemovals(
        action.removals,
        found.clip.durationMs
      )
      if (!removals.length) return state

      let sourceCursorMs = 0
      let timelineCursorMs = found.clip.startMs
      let first = true
      const clips: EditorClip[] = []
      const addKeptSegment = (endMs: number) => {
        const durationMs = endMs - sourceCursorMs
        if (durationMs < MIN_CLIP_MS) return
        const id = first ? found.clip.id : editorId()
        first = false
        clips.push({
          ...found.clip,
          id,
          startMs: timelineCursorMs,
          durationMs,
          trimStartMs: found.clip.trimStartMs + sourceCursorMs,
        })
        timelineCursorMs += durationMs
      }

      for (const removal of removals) {
        addKeptSegment(removal.startMs)
        sourceCursorMs = removal.endMs
      }
      addKeptSegment(found.clip.durationMs)
      if (!clips.length) return state
      const removedDurationMs =
        found.clip.durationMs -
        clips.reduce((total, clip) => total + clip.durationMs, 0)
      const rippleClipIds = new Set(action.rippleClipIds)

      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: sortClips([
          ...track.clips
            .filter((clip) => clip.id !== found.clip.id)
            .map((clip) =>
              rippleClipIds.has(clip.id)
                ? {
                    ...clip,
                    startMs: Math.max(
                      found.clip.startMs,
                      clip.startMs - removedDurationMs
                    ),
                  }
                : clip
            ),
          ...clips,
        ]),
      }))
      return {
        ...pushUndo(state, tracks),
        selectedClipId: clips[0].id,
      }
    }

    case "ADD_TRACK":
      return pushUndo(state, [...state.tracks, newTrack()])

    case "DUPLICATE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      // The copy prefers the slot right after the original on its track.
      return placeClip(
        state,
        { ...found.clip, id: editorId() },
        found.clip.startMs + found.clip.durationMs,
        found.track.id
      )
    }

    case "MOVE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      const target = state.tracks.find((t) => t.id === action.toTrackId)
      if (!found || !target) return state

      if (action.placement === "slot-reflow") {
        return (
          reflowSlotTrack(
            state,
            action.clipId,
            action.toTrackId,
            Math.max(0, action.startMs)
          ) ?? state
        )
      }

      const start = resolveStart(
        target,
        action.clipId,
        Math.max(0, action.startMs),
        found.clip.durationMs
      )
      if (start === null) return state // no room — revert silently

      const removed = withTrack(state.tracks, found.track.id, (t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== action.clipId),
      }))
      const tracks = withTrack(removed, target.id, (t) => ({
        ...t,
        clips: sortClips([...t.clips, { ...found.clip, startMs: start }]),
      }))
      return pushUndo(state, tracks)
    }

    case "REPLACE_CLIP_MEDIA": {
      const found = findClip(state.tracks, action.clipId)
      // Any media slot (video/image/audio); text clips aren't replaceable. The
      // picker only offers compatible types (audio slots take audio, visual
      // slots take video/image), so no cross-kind swap reaches here.
      if (!found || found.clip.kind === "text") return state
      const { fileType } = action.media
      // Video and audio carry an intrinsic length that clamps the slot; images
      // fill any duration, so the slot keeps its length.
      const isTimed = fileType === "video" || fileType === "audio"
      const replaced: EditorClip = {
        ...found.clip,
        kind: fileType,
        mediaId: action.media.mediaId,
        url: action.media.url,
        soundEffectId: undefined,
        musicTrackId: undefined,
        name: action.media.name,
        sourceDurationMs: isTimed ? action.media.sourceDurationMs : undefined,
        trimStartMs: 0,
        // A shorter source can't fill the slot — clamp it; an image fills any
        // length, so it keeps the slot's duration.
        durationMs: isTimed
          ? Math.min(found.clip.durationMs, action.media.sourceDurationMs)
          : found.clip.durationMs,
      }
      const tracks = withTrack(state.tracks, found.track.id, (t) => ({
        ...t,
        clips: t.clips.map((c) => (c.id === action.clipId ? replaced : c)),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: action.clipId }
    }

    case "UPDATE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const tracks = withTrack(state.tracks, found.track.id, (t) => ({
        ...t,
        clips: sortClips(
          t.clips.map((c) =>
            c.id === action.clipId ? { ...c, ...action.patch } : c
          )
        ),
      }))
      return action.transient ? { ...state, tracks } : pushUndo(state, tracks)
    }

    case "SPLIT_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const { clip } = found
      const offset = action.atMs - clip.startMs
      // Both halves must respect the minimum clip length.
      if (offset < MIN_CLIP_MS || clip.durationMs - offset < MIN_CLIP_MS) {
        return state
      }

      const left: EditorClip = { ...clip, durationMs: offset }
      const right: EditorClip = {
        ...clip,
        id: editorId(),
        startMs: clip.startMs + offset,
        durationMs: clip.durationMs - offset,
        trimStartMs: clip.trimStartMs + offset,
      }
      const tracks = withTrack(state.tracks, found.track.id, (t) => ({
        ...t,
        clips: sortClips([
          ...t.clips.filter((c) => c.id !== clip.id),
          left,
          right,
        ]),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: right.id }
    }

    case "DELETE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const tracks = withTrack(state.tracks, found.track.id, (t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== action.clipId),
      }))
      return {
        ...pushUndo(state, tracks),
        selectedClipId:
          state.selectedClipId === action.clipId ? null : state.selectedClipId,
      }
    }

    case "DELETE_TRACK": {
      const track = state.tracks.find((t) => t.id === action.trackId)
      if (!track) return state
      const deletedSelection = track.clips.some(
        (c) => c.id === state.selectedClipId
      )
      const remaining = state.tracks.filter((t) => t.id !== action.trackId)
      // Always keep at least one lane to drop clips onto.
      const tracks = remaining.length ? remaining : [newTrack()]
      return {
        ...pushUndo(state, tracks),
        selectedClipId: deletedSelection ? null : state.selectedClipId,
      }
    }

    case "MOVE_TRACK": {
      const from = state.tracks.findIndex((t) => t.id === action.trackId)
      if (from === -1) return state
      const to = Math.min(Math.max(action.toIndex, 0), state.tracks.length - 1)
      if (to === from) return state
      // Reordering changes preview stacking, so it's undoable.
      const tracks = [...state.tracks]
      const [moved] = tracks.splice(from, 1)
      tracks.splice(to, 0, moved)
      return pushUndo(state, tracks)
    }

    case "TOGGLE_TRACK_MUTE":
      return {
        ...state,
        tracks: withTrack(state.tracks, action.trackId, (t) => ({
          ...t,
          muted: !t.muted,
        })),
      }

    case "TOGGLE_TRACK_DUCK":
      return {
        ...state,
        tracks: withTrack(state.tracks, action.trackId, (t) => ({
          ...t,
          duck: !t.duck,
        })),
      }

    case "SELECT_CLIP":
      return { ...state, selectedClipId: action.clipId }

    case "SET_CUT_MODE":
      return { ...state, cutMode: action.on }

    case "SET_ZOOM":
      return { ...state, pxPerSecond: action.pxPerSecond }

    case "SET_ASPECT":
      return { ...state, aspect: action.aspect }

    case "UNDO": {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        tracks: previous,
        past: state.past.slice(0, -1),
        future: [state.tracks, ...state.future],
        selectedClipId: null,
      }
    }

    case "REDO": {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        tracks: next,
        past: [...state.past, state.tracks],
        future: state.future.slice(1),
        selectedClipId: null,
      }
    }
  }
}

// Autosave lifecycle, surfaced in the timeline toolbar.
export type SaveStatus = "saved" | "saving" | "error"

// What the editor is editing: a project or a template (both have the same
// timeline shape). `kind` gates project-only tools (export, captions, script).
export type EditorDocumentKind = "project" | "template"
export type EditorMode = "regular" | "template-builder" | "fill-template"

type EditorStoreSnapshot = {
  state: EditorState
  durationMs: number
  saveStatus: SaveStatus
  // Set once a save is rejected because the project changed elsewhere. Edits
  // stay in memory but autosave stops until the user reloads.
  hasConflict: boolean
  documentName: string
  documentThumbnailUrl: string | null
}

export type EditorStore = {
  getSnapshot: () => EditorStoreSnapshot
  subscribe: (listener: () => void) => () => void
  dispatch: React.Dispatch<EditorAction>
  setSaveStatus: (status: SaveStatus) => void
  setHasConflict: () => void
  setDocumentName: (name: string) => void
  setDocumentThumbnailUrl: (url: string | null) => void
}

export function createEditorStore(
  state: EditorState,
  documentName: string,
  documentThumbnailUrl: string | null
): EditorStore {
  let snapshot: EditorStoreSnapshot = {
    state,
    durationMs: timelineDurationMs(state.tracks),
    saveStatus: "saved",
    hasConflict: false,
    documentName,
    documentThumbnailUrl,
  }
  const listeners = new Set<() => void>()
  const update = (next: EditorStoreSnapshot) => {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispatch: (action) => {
      const nextState = editorReducer(snapshot.state, action)
      if (nextState === snapshot.state) return
      update({
        ...snapshot,
        state: nextState,
        durationMs:
          nextState.tracks === snapshot.state.tracks
            ? snapshot.durationMs
            : timelineDurationMs(nextState.tracks),
      })
    },
    setSaveStatus: (saveStatus) => update({ ...snapshot, saveStatus }),
    setHasConflict: () => {
      if (snapshot.hasConflict) return
      update({ ...snapshot, hasConflict: true, saveStatus: "error" })
    },
    setDocumentName: (documentName) => update({ ...snapshot, documentName }),
    setDocumentThumbnailUrl: (documentThumbnailUrl) =>
      update({ ...snapshot, documentThumbnailUrl }),
  }
}

type EditorContextValue = {
  store: EditorStore
  dispatch: React.Dispatch<EditorAction>
  clock: PlaybackClock
  kind: EditorDocumentKind
  mode: EditorMode
  documentId: string
  setDocumentName: (name: string) => void
  setDocumentThumbnailUrl: (url: string | null) => void
  flushSave: () => Promise<void>
  // Persist an explicit snapshot straight away through the same versioned
  // save path autosave uses (the corrupt-timeline reset).
  saveSnapshot: (snapshot: ProjectTimeline) => Promise<void>
}

// The provider component lives in editor-provider.tsx (files exporting
// components must export only components for fast refresh).
export const EditorContext = React.createContext<EditorContextValue | null>(
  null
)

export function useEditorRuntime() {
  const context = React.useContext(EditorContext)
  if (!context) {
    throw new Error("Editor hooks must be used inside EditorProvider")
  }
  return context
}

export function useEditorStoreSelector<T>(
  store: EditorStore,
  selector: (snapshot: EditorStoreSnapshot) => T
) {
  return React.useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot())
  )
}

export function useEditorSelector<T>(selector: (state: EditorState) => T) {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => selector(snapshot.state))
}

export function useEditorDurationMs() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.durationMs)
}

export function useEditorSaveStatus() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.saveStatus)
}

export function useEditorHasConflict() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.hasConflict)
}

export function useEditorDocumentName() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.documentName)
}

export function useEditorDocumentThumbnailUrl() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(
    store,
    (snapshot) => snapshot.documentThumbnailUrl
  )
}
