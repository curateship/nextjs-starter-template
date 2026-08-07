import * as React from "react"

import { PlaybackClock } from "@/lib/video/playback-clock"
import type {
  AspectRatio,
  ProjectTimeline,
} from "@/lib/video/timeline-schema"
import {
  DEFAULT_PX_PER_SECOND,
  editorId,
  MIN_CLIP_MS,
} from "@/lib/video/timeline-utils"

/**
 * The editor's state and the one function that changes it.
 *
 * A clip and a track are exactly what the timeline schema allows — the types
 * are read off it rather than written out again, so what is on screen and what
 * is saved can never drift apart.
 *
 * The state lives in a small store of its own rather than React state because
 * playback touches it sixty times a second; components subscribe to the one
 * slice they draw.
 */

export type EditorTrack = ProjectTimeline["tracks"][number]
export type EditorClip = EditorTrack["clips"][number]
export type { AspectRatio }

export type EditorState = {
  tracks: EditorTrack[]
  selectedClipId: string | null
  pxPerSecond: number
  aspect: AspectRatio
  // The cut tool: clicking a clip splits it where the pointer is.
  cutMode: boolean
  // Undo and redo hold whole copies of `tracks` — the only part that is
  // undoable. Selection and zoom are where you are looking, not what you did.
  past: EditorTrack[][]
  future: EditorTrack[][]
}

export type EditorAction =
  | { type: "ADD_CLIP"; clip: EditorClip; atMs: number; trackId?: string }
  | { type: "ADD_CLIP_TO_NEW_TRACK"; clip: EditorClip; atMs: number }
  | { type: "MOVE_CLIP"; clipId: string; toTrackId: string; startMs: number }
  // `transient` skips the undo snapshot — for edits that arrive in a stream
  // (typing into a text clip, dragging a slider) so one undo does not step
  // back a single character.
  | {
      type: "UPDATE_CLIP"
      clipId: string
      patch: Partial<EditorClip>
      transient?: boolean
    }
  | { type: "SPLIT_CLIP"; clipId: string; atMs: number }
  | { type: "DUPLICATE_CLIP"; clipId: string }
  // Swap the footage in a clip; it keeps its place and (clamped) length.
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

// A saved project opens exactly as it was left; an empty one gets three lanes
// to drop footage onto, because a screen with nowhere to drop is a puzzle.
export function createInitialEditorState(
  timeline?: ProjectTimeline
): EditorState {
  const hasSavedTracks = timeline && timeline.tracks.length > 0
  return {
    tracks: hasSavedTracks
      ? timeline.tracks
      : [newTrack(), newTrack(), newTrack()],
    selectedClipId: null,
    pxPerSecond: DEFAULT_PX_PER_SECOND,
    aspect: timeline?.aspect ?? "9:16",
    cutMode: false,
    past: [],
    future: [],
  }
}

// Where the last clip ends — the length of the whole project.
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
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { clip, track }
  }
  return null
}

function sortClips(clips: EditorClip[]) {
  return [...clips].sort((a, b) => a.startMs - b.startMs)
}

// True when [startMs, startMs+durationMs) overlaps no other clip on the lane.
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

// The closest position to `desired` where the clip fits on this lane: it slides
// into the nearest gap, so clips butt against their neighbours instead of
// refusing to land. Null when no gap is big enough.
function resolveStart(
  track: EditorTrack,
  excludeId: string | null,
  desired: number,
  durationMs: number
): number | null {
  const others = sortClips(track.clips.filter((clip) => clip.id !== excludeId))

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

function withTrack(
  tracks: EditorTrack[],
  trackId: string,
  update: (track: EditorTrack) => EditorTrack
) {
  return tracks.map((track) => (track.id === trackId ? update(track) : track))
}

// Remember the tracks as they were, so this edit can be undone.
function pushUndo(state: EditorState, tracks: EditorTrack[]): EditorState {
  return {
    ...state,
    tracks,
    past: [...state.past.slice(-UNDO_LIMIT + 1), state.tracks],
    future: [],
  }
}

function placeClipInNewTrack(
  state: EditorState,
  clip: EditorClip,
  atMs: number
): EditorState {
  const track = { ...newTrack(), clips: [{ ...clip, startMs: Math.max(0, atMs) }] }
  return {
    ...pushUndo(state, [...state.tracks, track]),
    selectedClipId: clip.id,
  }
}

// Put a clip as close to `atMs` as it will go: the lane it was aimed at slides
// it into the nearest gap, any other lane takes it only at that exact time, and
// if none will have it a new lane is added. The clip ends up selected.
function placeClip(
  state: EditorState,
  clip: EditorClip,
  atMs: number,
  preferredTrackId?: string
): EditorState {
  const desired = Math.max(0, atMs)
  const candidates = preferredTrackId
    ? [
        ...state.tracks.filter((track) => track.id === preferredTrackId),
        ...state.tracks.filter((track) => track.id !== preferredTrackId),
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
      const tracks = withTrack(state.tracks, track.id, (lane) => ({
        ...lane,
        clips: sortClips([...lane.clips, { ...clip, startMs: start }]),
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

    case "ADD_TRACK":
      return pushUndo(state, [...state.tracks, newTrack()])

    case "DUPLICATE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      // The copy goes straight after the original. It drops any blend coming
      // into it: a copy butts against the clip it came from, and a dissolve
      // between a clip and itself is never what was meant.
      return placeClip(
        state,
        { ...found.clip, id: editorId(), transition: undefined },
        found.clip.startMs + found.clip.durationMs,
        found.track.id
      )
    }

    case "MOVE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      const target = state.tracks.find((track) => track.id === action.toTrackId)
      if (!found || !target) return state

      const start = resolveStart(
        target,
        action.clipId,
        Math.max(0, action.startMs),
        found.clip.durationMs
      )
      if (start === null) return state // No room — the clip springs back.

      const removed = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== action.clipId),
      }))
      const tracks = withTrack(removed, target.id, (track) => ({
        ...track,
        clips: sortClips([...track.clips, { ...found.clip, startMs: start }]),
      }))
      return pushUndo(state, tracks)
    }

    case "REPLACE_CLIP_MEDIA": {
      const found = findClip(state.tracks, action.clipId)
      // Any footage clip; a text clip has nothing to replace. The picker only
      // offers files of a compatible kind, so nothing odd arrives here.
      if (!found || found.clip.kind === "text") return state
      const { fileType } = action.media
      // Video and audio bring their own length, which caps the clip; a picture
      // fills whatever length the clip already had.
      const isTimed = fileType === "video" || fileType === "audio"
      const replaced: EditorClip = {
        ...found.clip,
        kind: fileType,
        mediaId: action.media.mediaId,
        url: action.media.url,
        name: action.media.name,
        sourceDurationMs: isTimed ? action.media.sourceDurationMs : undefined,
        trimStartMs: 0,
        durationMs: isTimed
          ? Math.min(found.clip.durationMs, action.media.sourceDurationMs)
          : found.clip.durationMs,
      }
      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          clip.id === action.clipId ? replaced : clip
        ),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: action.clipId }
    }

    case "UPDATE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: sortClips(
          track.clips.map((clip) =>
            clip.id === action.clipId ? { ...clip, ...action.patch } : clip
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
      // Neither half may end up shorter than the shortest clip allowed.
      if (offset < MIN_CLIP_MS || clip.durationMs - offset < MIN_CLIP_MS) {
        return state
      }

      // The left half keeps the blend coming into it — its seam with the clip
      // before is untouched. The right half's new edge is a cut through the
      // middle of one piece of footage, so it must not carry that blend.
      const left: EditorClip = { ...clip, durationMs: offset }
      const right: EditorClip = {
        ...clip,
        id: editorId(),
        startMs: clip.startMs + offset,
        durationMs: clip.durationMs - offset,
        trimStartMs: clip.trimStartMs + offset,
        transition: undefined,
      }
      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: sortClips([
          ...track.clips.filter((candidate) => candidate.id !== clip.id),
          left,
          right,
        ]),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: right.id }
    }

    case "DELETE_CLIP": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: track.clips.filter((clip) => clip.id !== action.clipId),
      }))
      return {
        ...pushUndo(state, tracks),
        selectedClipId:
          state.selectedClipId === action.clipId ? null : state.selectedClipId,
      }
    }

    case "DELETE_TRACK": {
      const track = state.tracks.find((lane) => lane.id === action.trackId)
      if (!track) return state
      const deletedSelection = track.clips.some(
        (clip) => clip.id === state.selectedClipId
      )
      const remaining = state.tracks.filter((lane) => lane.id !== action.trackId)
      // Always leave one lane to drop footage onto.
      const tracks = remaining.length ? remaining : [newTrack()]
      return {
        ...pushUndo(state, tracks),
        selectedClipId: deletedSelection ? null : state.selectedClipId,
      }
    }

    case "MOVE_TRACK": {
      const from = state.tracks.findIndex((track) => track.id === action.trackId)
      if (from === -1) return state
      const to = Math.min(Math.max(action.toIndex, 0), state.tracks.length - 1)
      if (to === from) return state
      // Reordering changes what covers what on the preview, so it is undoable.
      const tracks = [...state.tracks]
      const [moved] = tracks.splice(from, 1)
      tracks.splice(to, 0, moved)
      return pushUndo(state, tracks)
    }

    case "TOGGLE_TRACK_MUTE":
      return {
        ...state,
        tracks: withTrack(state.tracks, action.trackId, (track) => ({
          ...track,
          muted: !track.muted,
        })),
      }

    case "TOGGLE_TRACK_DUCK":
      return {
        ...state,
        tracks: withTrack(state.tracks, action.trackId, (track) => ({
          ...track,
          duck: !track.duck,
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

/** What the status bar says about the last save. */
export type SaveStatus = "saved" | "saving" | "error"

type EditorStoreSnapshot = {
  state: EditorState
  durationMs: number
  saveStatus: SaveStatus
  // Set once a save is refused because the project changed somewhere else.
  // Edits stay on screen, but nothing is sent again until a reload.
  hasConflict: boolean
  projectName: string
}

export type EditorStore = {
  getSnapshot: () => EditorStoreSnapshot
  subscribe: (listener: () => void) => () => void
  dispatch: React.Dispatch<EditorAction>
  setSaveStatus: (status: SaveStatus) => void
  setHasConflict: () => void
  setProjectName: (name: string) => void
}

export function createEditorStore(
  state: EditorState,
  projectName: string
): EditorStore {
  let snapshot: EditorStoreSnapshot = {
    state,
    durationMs: timelineDurationMs(state.tracks),
    saveStatus: "saved",
    hasConflict: false,
    projectName,
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
    setProjectName: (projectName) => update({ ...snapshot, projectName }),
  }
}

type EditorContextValue = {
  store: EditorStore
  dispatch: React.Dispatch<EditorAction>
  clock: PlaybackClock
  projectId: string
  setProjectName: (name: string) => void
}

// The provider itself lives in editor-provider.tsx: a file that exports a
// component may export only components, or fast refresh stops working.
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

export function useEditorProjectName() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.projectName)
}
