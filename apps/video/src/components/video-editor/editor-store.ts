import * as React from "react"

import {
  clipSpeed,
  DEFAULT_CLIP_SPEED,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
  sourceMsAt,
  sourceSpanMs,
  storedPlaybackValue,
} from "@/lib/video/clip-playback"
import type { ClipboardClip } from "@/lib/video/clip-clipboard"
import { voiceoverRefusal } from "@/lib/video/saved-voiceovers"
import { PlaybackClock } from "@/lib/video/playback-clock"
import {
  MAX_TIMELINE_TRACKS,
  MAX_TRACK_CLIPS,
  type AspectRatio,
  type ProjectTimeline,
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
  // The clip the inspector shows. It is always the last of `selectedClipIds`,
  // which is every clip picked with Shift or Cmd held, for copying as a group.
  selectedClipId: string | null
  selectedClipIds: string[]
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
  // Words or a sticker from the Text panel. Unlike ADD_CLIP it never lands
  // under a picture that would hide it.
  | { type: "ADD_OVERLAY"; clip: EditorClip; atMs: number }
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
  // Playing a clip faster or slower changes how much timeline room it needs,
  // which is why it is its own action rather than a patch on UPDATE_CLIP.
  | { type: "SET_CLIP_SPEED"; clipId: string; speed: number; transient?: boolean }
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
  // Cut several pieces out of one clip at once, closing the gaps. What comes
  // after on the same lane shuffles back by however much was taken out.
  | {
      type: "APPLY_JUMP_CUTS"
      clipId: string
      removals: { clipStartMs: number; clipEndMs: number }[]
      rippleClipIds: string[]
    }
  // The opening line, rewritten across the clips it was read from. One action
  // so one undo puts the old words back.
  | {
      type: "REWRITE_HOOK"
      lines: { clipId: string; text: string }[]
      /**
       * When the opening line is spoken, what to do about it: swap a voice
       * clip's sound outright, or quieten the opening of a piece of footage
       * and lay the new line over it.
       */
      spoken?:
        | { how: "swap"; clipId: string; media: Partial<EditorClip> }
        | {
            how: "quieten"
            clipId: string
            /** How far into the timeline the footage stops being silent. */
            untilMs: number
            voice: EditorClip
          }
    }
  // A voiceover and the words it says, dropped on together: the sound on a
  // lane of its own and the captions above it. One action, one undo.
  | {
      type: "INSERT_VOICEOVER"
      audio: EditorClip
      captions: EditorClip[]
      /**
       * A clip whose own sound is turned down under the new voice, as a
       * translation read over the original. It stays where it is.
       */
      quieten?: { clipId: string; volume: number }
    }
  // Every caption at once, onto a lane of their own. One action so one press
  // of undo takes the whole lot back off again.
  | { type: "INSERT_CAPTIONS"; captions: EditorClip[] }
  // A music track under the whole project, on a lane of its own at the bottom
  // with ducking on (see background-music.ts). One action, one undo.
  | { type: "ADD_MUSIC_TRACK"; clips: EditorClip[] }
  | { type: "DELETE_CLIP"; clipId: string }
  | { type: "DELETE_TRACK"; trackId: string }
  | { type: "MOVE_TRACK"; trackId: string; toIndex: number }
  | { type: "TOGGLE_TRACK_MUTE"; trackId: string }
  | { type: "TOGGLE_TRACK_DUCK"; trackId: string }
  // Clips copied out of a project (see clip-clipboard.ts), dropped as one
  // block: each keeps its distance from the others and its lane relative to
  // them. One action, one undo.
  | { type: "PASTE_CLIPS"; clips: ClipboardClip[]; atMs: number; trackId?: string }
  // `additive` is a click with Shift or Cmd held: the clip joins the group, or
  // leaves it if it was already in.
  | { type: "SELECT_CLIP"; clipId: string | null; additive?: boolean }
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
    selectedClipIds: [],
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
/**
 * The pieces to cut, tidied: inside the clip, in order, joined where they
 * overlap, and with anything too short to bother with dropped.
 */
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
    const previous = merged.at(-1)
    if (previous && removal.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, removal.endMs)
    } else {
      merged.push({ ...removal })
    }
  }
  return merged
}

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

/**
 * Put words or a sticker where they will be seen. The top lane covers the ones
 * below it, so a clip dropped onto a lower lane under a video or a picture is
 * hidden behind it. This takes the highest lane with room at `atMs` that has
 * no picture above it at those moments, and otherwise adds a new lane at the
 * top. Sound on a lane above does not count: it has nothing to cover with.
 */
function placeOverlay(
  state: EditorState,
  clip: EditorClip,
  atMs: number
): EditorState {
  const start = Math.max(0, atMs)
  const end = start + clip.durationMs
  const placed = { ...clip, startMs: start }
  for (const track of state.tracks) {
    if (fitsAt(track, null, start, clip.durationMs)) {
      const tracks = withTrack(state.tracks, track.id, (lane) => ({
        ...lane,
        clips: sortClips([...lane.clips, placed]),
      }))
      return { ...pushUndo(state, tracks), selectedClipId: clip.id }
    }
    const covers = track.clips.some(
      (other) =>
        (other.kind === "video" || other.kind === "image") &&
        other.startMs < end &&
        other.startMs + other.durationMs > start
    )
    if (covers) break
  }
  // A project already at the most lanes a save allows takes it wherever it
  // fits, the ordinary way, rather than a lane the save would refuse.
  if (state.tracks.length >= MAX_TIMELINE_TRACKS) {
    return placeClip(state, clip, start)
  }
  const track = { ...newTrack(), clips: [placed] }
  return {
    ...pushUndo(state, [track, ...state.tracks]),
    selectedClipId: clip.id,
  }
}

// Drop a copied group at `atMs`, starting on the lane `trackId` names. The
// group lands only where every clip fits on the lane it is headed for; if any
// one would overlap something, the whole group goes onto new lanes at the
// bottom instead, so the gaps between the clips are never squeezed.
function pasteClips(
  state: EditorState,
  clips: ClipboardClip[],
  atMs: number,
  trackId?: string
): EditorState {
  if (!clips.length) return state
  const desired = Math.max(0, atMs)
  const laneCount = Math.max(...clips.map((entry) => entry.lane)) + 1
  const firstLane = Math.max(
    0,
    state.tracks.findIndex((track) => track.id === trackId)
  )
  const fitsInPlace = clips.every(({ clip, lane }) => {
    const track = state.tracks[firstLane + lane]
    return !track || fitsAt(track, null, desired + clip.startMs, clip.durationMs)
  })

  const start = fitsInPlace ? firstLane : state.tracks.length
  // A timeline holds so many lanes, and a lane so many clips. A paste that
  // would pass either is refused whole, because the save would refuse it.
  if (start + laneCount > MAX_TIMELINE_TRACKS) return state
  const tracks = [...state.tracks]
  while (tracks.length < start + laneCount) tracks.push(newTrack())
  for (let lane = 0; lane < laneCount; lane++) {
    const landing = clips
      .filter((entry) => entry.lane === lane)
      .map(({ clip }) => ({ ...clip, startMs: desired + clip.startMs }))
    if (!landing.length) continue
    const track = tracks[start + lane]
    if (track.clips.length + landing.length > MAX_TRACK_CLIPS) return state
    tracks[start + lane] = {
      ...track,
      clips: sortClips([...track.clips, ...landing]),
    }
  }
  const pastedIds = clips.map(({ clip }) => clip.id)
  return {
    ...pushUndo(state, tracks),
    selectedClipId: pastedIds.at(-1) ?? null,
    selectedClipIds: pastedIds,
  }
}

export function editorReducer(
  state: EditorState,
  action: EditorAction
): EditorState {
  const next = reduceEditor(state, action)
  // Every action that moves the selection without saying what the group is —
  // a new clip dropped on, a delete, an undo — leaves just that one clip
  // selected, so the group can never name a clip the inspector is not on.
  if (
    next.selectedClipId !== state.selectedClipId &&
    next.selectedClipIds === state.selectedClipIds
  ) {
    return {
      ...next,
      selectedClipIds: next.selectedClipId ? [next.selectedClipId] : [],
    }
  }
  return next
}

function reduceEditor(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "ADD_CLIP":
      return placeClip(state, action.clip, action.atMs, action.trackId)

    case "ADD_CLIP_TO_NEW_TRACK":
      return placeClipInNewTrack(state, action.clip, action.atMs)

    case "ADD_OVERLAY":
      return placeOverlay(state, action.clip, action.atMs)

    case "ADD_TRACK":
      return pushUndo(state, [...state.tracks, newTrack()])

    case "PASTE_CLIPS":
      return pasteClips(state, action.clips, action.atMs, action.trackId)

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

      // Walk the clip, keeping what is between the cuts. Each kept piece stays
      // pointing at the same moment of the original recording, so the picture
      // and the sound never drift.
      let sourceCursorMs = 0
      let timelineCursorMs = found.clip.startMs
      let first = true
      const clips: EditorClip[] = []
      const keepUpTo = (endMs: number) => {
        const durationMs = endMs - sourceCursorMs
        if (durationMs < MIN_CLIP_MS) return
        const isFirst = first
        first = false
        clips.push({
          ...found.clip,
          id: isFirst ? found.clip.id : editorId(),
          startMs: timelineCursorMs,
          durationMs,
          trimStartMs: sourceMsAt(found.clip, sourceCursorMs),
          // Only the first piece keeps the blend coming into it. The rest butt
          // against a cut in the same footage, where a dissolve makes no sense.
          transition: isFirst ? found.clip.transition : undefined,
        })
        timelineCursorMs += durationMs
      }

      for (const removal of removals) {
        keepUpTo(removal.startMs)
        sourceCursorMs = removal.endMs
      }
      keepUpTo(found.clip.durationMs)
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
      return { ...pushUndo(state, tracks), selectedClipId: clips[0].id }
    }

    case "REWRITE_HOOK": {
      const byId = new Map(action.lines.map((line) => [line.clipId, line.text]))
      const spoken = action.spoken
      if (!byId.size && !spoken) return state

      let tracks = state.tracks.map((track) => ({
        ...track,
        clips: track.clips.flatMap((clip) => {
          // A voice clip of its own: the same clip, now pointing at the new
          // sound. It keeps its place so nothing after it has to move.
          if (spoken?.how === "swap" && clip.id === spoken.clipId) {
            return [{ ...clip, ...spoken.media }]
          }

          // Footage talking: the take is cut where the opening line ends, and
          // only that first piece is silenced. The rest keeps its own sound,
          // and nothing moves — the two pieces still cover exactly what the
          // one did.
          if (spoken?.how === "quieten" && clip.id === spoken.clipId) {
            const openingMs = Math.min(
              Math.max(spoken.untilMs - clip.startMs, MIN_CLIP_MS),
              clip.durationMs
            )
            const rest = clip.durationMs - openingMs
            const opening = { ...clip, durationMs: openingMs, muted: true }
            if (rest < MIN_CLIP_MS) return [opening]
            return [
              opening,
              {
                ...clip,
                id: editorId(),
                startMs: clip.startMs + openingMs,
                durationMs: rest,
                trimStartMs: sourceMsAt(clip, openingMs),
                transition: undefined,
              },
            ]
          }

          const text = byId.get(clip.id)
          // A clip whose share of the new line is empty keeps its place on the
          // timeline rather than leaving a hole; it simply says nothing.
          return [
            text === undefined ? clip : { ...clip, text, name: text || clip.name },
          ]
        }),
      }))

      // The new line goes on a lane of its own, under the picture.
      if (spoken?.how === "quieten") {
        tracks = [...tracks, { ...newTrack(), clips: [spoken.voice] }]
      }
      return pushUndo(state, tracks)
    }

    case "INSERT_VOICEOVER": {
      // Past the most lanes a save allows, every later save would fail. The
      // callers ask voiceoverRefusal first, so this only guards the store.
      if (voiceoverRefusal(state.tracks, action.captions)) return state
      const captions: EditorTrack = {
        ...newTrack(),
        clips: [...action.captions].sort((a, b) => a.startMs - b.startMs),
      }
      const voice: EditorTrack = { ...newTrack(), clips: [action.audio] }
      const quieten = action.quieten
      // Turned down, never up: a clip already quieter than asked keeps its
      // own level.
      const tracks = quieten
        ? state.tracks.map((track) => ({
            ...track,
            clips: track.clips.map((clip) =>
              clip.id === quieten.clipId
                ? {
                    ...clip,
                    volume: Math.min(clip.volume ?? 1, quieten.volume),
                  }
                : clip
            ),
          }))
        : state.tracks
      // Words above the picture, sound below it, the way they are laid out
      // when somebody does this by hand.
      return {
        ...pushUndo(state, [
          ...(action.captions.length ? [captions] : []),
          ...tracks,
          voice,
        ]),
        selectedClipId: action.audio.id,
      }
    }

    case "INSERT_CAPTIONS": {
      if (!action.captions.length) return state
      // A lane of their own, above everything: captions belong over the
      // picture, and keeping them together means they can be muted, moved or
      // deleted as one thing later.
      const track: EditorTrack = {
        ...newTrack(),
        clips: [...action.captions].sort((a, b) => a.startMs - b.startMs),
      }
      return {
        ...pushUndo(state, [track, ...state.tracks]),
        selectedClipId: null,
      }
    }

    case "ADD_MUSIC_TRACK": {
      if (!action.clips.length || state.tracks.length >= MAX_TIMELINE_TRACKS) {
        return state
      }
      const music: EditorTrack = {
        ...newTrack(),
        duck: true,
        clips: action.clips,
      }
      return {
        ...pushUndo(state, [...state.tracks, music]),
        selectedClipId: action.clips[0].id,
      }
    }

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
        // Only a picture moves, so a move does not carry over to footage.
        motion: fileType === "image" ? found.clip.motion : undefined,
        // Only a picture can be smaller than the frame and placed on it, so a
        // swap to footage goes back to the full frame.
        ...(fileType === "image"
          ? {}
          : { scale: undefined, x: undefined, y: undefined }),
        // Sound has no picture, so colour does not carry over to it.
        ...(fileType === "audio"
          ? {
              brightness: undefined,
              contrast: undefined,
              saturation: undefined,
            }
          : {}),
        trimStartMs: 0,
        // The new file has to cover the clip at whatever speed it is set to:
        // a clip playing at 2x needs twice its own length of recording.
        durationMs: isTimed
          ? Math.min(
              found.clip.durationMs,
              action.media.sourceDurationMs / clipSpeed(found.clip)
            )
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

    case "SET_CLIP_SPEED": {
      const found = findClip(state.tracks, action.clipId)
      if (!found) return state
      const { clip } = found
      const speed = Math.min(
        Math.max(action.speed, MIN_CLIP_SPEED),
        MAX_CLIP_SPEED
      )
      if (speed === clipSpeed(clip)) return state

      // The clip keeps pointing at the same stretch of the recording; only the
      // room it needs to play it changes. Slowing a clip down can run it into
      // whatever is next on its lane, so it takes the space up to that clip and
      // no more, which means a slowed clip may show less of the recording than
      // it did. Speeding up always fits.
      const wantedMs = sourceSpanMs(clip) / speed
      const nextOnLane = found.track.clips
        .filter(
          (other) => other.id !== clip.id && other.startMs >= clip.startMs
        )
        .reduce<number | null>(
          (closest, other) =>
            closest === null ? other.startMs : Math.min(closest, other.startMs),
          null
        )
      const roomMs =
        nextOnLane === null ? wantedMs : nextOnLane - clip.startMs
      const durationMs = Math.max(MIN_CLIP_MS, Math.min(wantedMs, roomMs))

      const tracks = withTrack(state.tracks, found.track.id, (track) => ({
        ...track,
        clips: track.clips.map((candidate) =>
          candidate.id === clip.id
            ? {
                ...candidate,
                speed: storedPlaybackValue(speed, DEFAULT_CLIP_SPEED),
                durationMs,
              }
            : candidate
        ),
      }))
      return action.transient
        ? { ...state, tracks }
        : pushUndo(state, tracks)
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
      // middle of one piece of footage, so it must not carry that blend. A
      // fade at the end belongs to the right half for the same reason: the
      // left half now ends in the middle, where a fade would be a dip.
      const left: EditorClip = {
        ...clip,
        durationMs: offset,
        fadeOutMs: undefined,
      }
      const right: EditorClip = {
        ...clip,
        id: editorId(),
        startMs: clip.startMs + offset,
        durationMs: clip.durationMs - offset,
        trimStartMs: sourceMsAt(clip, offset),
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

    case "SELECT_CLIP": {
      const { clipId } = action
      if (!action.additive || !clipId) {
        return {
          ...state,
          selectedClipId: clipId,
          selectedClipIds: clipId ? [clipId] : [],
        }
      }
      const selectedClipIds = state.selectedClipIds.includes(clipId)
        ? state.selectedClipIds.filter((id) => id !== clipId)
        : [...state.selectedClipIds, clipId]
      return {
        ...state,
        selectedClipId: selectedClipIds.at(-1) ?? null,
        selectedClipIds,
      }
    }

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

/**
 * Why this window has stopped saving, if it has. "read-only" is chosen when
 * the project is already being edited in another window. "conflict" is forced
 * when a save is refused because another window saved first.
 */
export type EditorLock = "read-only" | "conflict"

type EditorStoreSnapshot = {
  state: EditorState
  durationMs: number
  saveStatus: SaveStatus
  // Set, the timeline cannot be changed and nothing is sent until a reload.
  lock: EditorLock | null
  projectName: string
  // Goes up by one whenever something outside the media panel puts files on
  // this project's shelf, such as a paste, so the panel knows to read it again.
  mediaShelfVersion: number
}

export type EditorStore = {
  getSnapshot: () => EditorStoreSnapshot
  subscribe: (listener: () => void) => () => void
  dispatch: React.Dispatch<EditorAction>
  setSaveStatus: (status: SaveStatus) => void
  setLock: (lock: EditorLock) => void
  /**
   * True, and says why, when the window is locked. For work that costs
   * something before it reaches the timeline, such as an AI tool, so it is
   * stopped before it runs rather than refused after.
   */
  refuseIfLocked: () => boolean
  setProjectName: (name: string) => void
  refreshMediaShelf: () => void
}

/**
 * `onLockedEdit` hears about every change to the timeline refused because the
 * window is locked. Selecting, zooming and moving the playhead are not changes
 * to the timeline and always go through.
 */
export function createEditorStore(
  state: EditorState,
  projectName: string,
  onLockedEdit: () => void = () => undefined
): EditorStore {
  let snapshot: EditorStoreSnapshot = {
    state,
    durationMs: timelineDurationMs(state.tracks),
    saveStatus: "saved",
    lock: null,
    projectName,
    mediaShelfVersion: 0,
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
      if (
        snapshot.lock &&
        (nextState.tracks !== snapshot.state.tracks ||
          nextState.aspect !== snapshot.state.aspect)
      ) {
        onLockedEdit()
        return
      }
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
    setLock: (lock) => {
      // A clash outranks a choice, and neither is ever taken back in place.
      if (snapshot.lock === "conflict" || snapshot.lock === lock) return
      update({
        ...snapshot,
        lock,
        saveStatus: lock === "conflict" ? "error" : snapshot.saveStatus,
      })
    },
    refuseIfLocked: () => {
      if (!snapshot.lock) return false
      onLockedEdit()
      return true
    },
    setProjectName: (projectName) => update({ ...snapshot, projectName }),
    refreshMediaShelf: () =>
      update({
        ...snapshot,
        mediaShelfVersion: snapshot.mediaShelfVersion + 1,
      }),
  }
}

type EditorContextValue = {
  store: EditorStore
  dispatch: React.Dispatch<EditorAction>
  clock: PlaybackClock
  projectId: string
  /** Sends any edit still waiting, so the server reads the timeline as it is. */
  saveNow: () => Promise<void>
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

export function useEditorLock() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.lock)
}

export function useEditorProjectName() {
  const { store } = useEditorRuntime()
  return useEditorStoreSelector(store, (snapshot) => snapshot.projectName)
}
