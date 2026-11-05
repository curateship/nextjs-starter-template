import { beatTimelineTimes } from "./beats"
import { sourceMsAt } from "./clip-playback"
import { shiftMarkers, type TimelineMarker } from "./timeline-markers"

/**
 * The AI highlights teaser at the start (`workspace/docs/teaser.md`). Tyler,
 * 4 Nov 2026: "For walking videos or food videos etc.. Ai can chop 1-3 sec
 * clips highlights and match it to a music beat (optional) for preview". It
 * goes at the start of the video, from the whole video, at a length he
 * types ("I should be able to pick any seconds I want"), following the music
 * already on the video.
 *
 * The server scores stills along the video clips; everything here is plain
 * maths on those scores and the timeline, so the editor can lay the teaser
 * as one Undo step.
 */

export const TEASER_MIN_SECONDS = 3
export const TEASER_DEFAULT_SECONDS = 10
export const TEASER_MIN_MOMENT_MS = 1000
export const TEASER_MAX_MOMENT_MS = 3000
export const TEASER_MOMENT_MS = 2000
export const TEASER_MAX_STILLS = 300
/** The short fade on each moment's own sound, so cuts don't click. */
const TEASER_SOUND_FADE_MS = 40
/** The music under the teaser fades out as the video proper starts. */
const TEASER_MUSIC_FADE_MS = 300

export const TEASER_NO_VIDEO_MESSAGE = "Put some video on the timeline first, so the teaser has moments to pick from."
export const TEASER_LENGTH_MESSAGE = "Type a whole number of seconds, at least 3 and no longer than the video."
/** The moment counts a teaser this long allows, so each lasts 1 to 3 seconds. */
export function teaserCountRange(totalMs: number) {
  return {
    min: Math.max(1, Math.ceil(totalMs / TEASER_MAX_MOMENT_MS)),
    max: Math.max(1, Math.floor(totalMs / TEASER_MIN_MOMENT_MS)),
  }
}

export function teaserCountMessage(totalMs: number) {
  const { min, max } = teaserCountRange(totalMs)
  return `A ${Math.round(totalMs / 1000)} second teaser holds ${min} to ${max} moments, so each lasts 1 to 3 seconds. Leave it empty to let Video choose.`
}

export const TEASER_NOTHING_GOOD_MESSAGE = "No moment scored well enough to use. Try a longer video."

type TeaserClip = {
  id: string
  kind: string
  mediaId?: string
  startMs: number
  durationMs: number
  trimStartMs: number
  speed?: number
  [key: string]: unknown
}
type TeaserTrack<C extends TeaserClip> = { id: string; muted: boolean; clips: C[]; [key: string]: unknown }

export type ScoredMoment = { atMs: number; score: number; reason: string }

function videoClips<C extends TeaserClip>(tracks: TeaserTrack<C>[]) {
  return tracks.flatMap((track) => track.clips.filter((clip) => clip.kind === "video" && clip.mediaId))
}

/** The video clip on top at a moment of the timeline, or nothing. */
function videoAt<C extends TeaserClip>(tracks: TeaserTrack<C>[], atMs: number) {
  return videoClips(tracks).find((clip) => atMs >= clip.startMs && atMs < clip.startMs + clip.durationMs)
}

/** How long the video runs: where its last video clip ends. */
export function videoLengthMs(tracks: TeaserTrack<TeaserClip>[]) {
  return Math.max(0, ...videoClips(tracks).map((clip) => clip.startMs + clip.durationMs))
}

/**
 * The moments the server draws a still at: evenly spaced from the start, at
 * most one a second and at most 300 along the video, kept only where a video
 * clip is on screen. The server draws the whole grid in one pass and keeps
 * the stills at these moments, by their place on the grid.
 */
export function teaserStillGrid(tracks: TeaserTrack<TeaserClip>[]) {
  const endMs = videoLengthMs(tracks)
  const stepMs = Math.max(1000, Math.ceil(endMs / TEASER_MAX_STILLS / 1000) * 1000)
  const times: { index: number; atMs: number }[] = []
  for (let index = 0; index * stepMs < endMs; index += 1) {
    if (videoAt(tracks, index * stepMs + 1)) times.push({ index, atMs: index * stepMs })
  }
  return { stepMs, endMs, times }
}

/**
 * How long each cut of a teaser this long lasts, in order. With no count,
 * each cut aims for two seconds; with a count, for an even share of what is
 * left. With music, each cut ends on the beat nearest its aim, as long as
 * that keeps it between one and three seconds (and, with a count, leaves the
 * cuts still to come room to do the same). Without a count, the last cut
 * ends at the teaser's end, and one that would be under a second is folded
 * into the cut before.
 */
export function teaserCutLengths(totalMs: number, beatsMs: number[] | null, count: number | null = null) {
  if (count) return countedCutLengths(totalMs, beatsMs, count)
  const lengths: number[] = []
  let cursor = 0
  while (totalMs - cursor > 0) {
    let next = cursor + TEASER_MOMENT_MS
    if (beatsMs?.length) {
      const near = beatsMs
        .filter((beat) => beat >= cursor + TEASER_MIN_MOMENT_MS && beat <= cursor + TEASER_MAX_MOMENT_MS)
        .sort((a, b) => Math.abs(a - (cursor + TEASER_MOMENT_MS)) - Math.abs(b - (cursor + TEASER_MOMENT_MS)))[0]
      if (near !== undefined) next = near
    }
    next = Math.min(next, totalMs)
    if (totalMs - next > 0 && totalMs - next < TEASER_MIN_MOMENT_MS) next = totalMs
    lengths.push(Math.round(next - cursor))
    cursor = next
  }
  if (lengths.length > 1 && lengths.at(-1)! < TEASER_MIN_MOMENT_MS) {
    const last = lengths.pop()!
    lengths[lengths.length - 1] += last
  }
  return lengths
}

function countedCutLengths(totalMs: number, beatsMs: number[] | null, count: number) {
  const lengths: number[] = []
  let cursor = 0
  for (let left = count; left > 1; left -= 1) {
    const aim = cursor + (totalMs - cursor) / left
    const earliest = Math.max(cursor + TEASER_MIN_MOMENT_MS, totalMs - (left - 1) * TEASER_MAX_MOMENT_MS)
    const latest = Math.min(cursor + TEASER_MAX_MOMENT_MS, totalMs - (left - 1) * TEASER_MIN_MOMENT_MS)
    const near = beatsMs
      ?.filter((beat) => beat >= earliest && beat <= latest)
      .sort((a, b) => Math.abs(a - aim) - Math.abs(b - aim))[0]
    const next = Math.round(Math.min(latest, Math.max(earliest, near ?? aim)))
    lengths.push(next - cursor)
    cursor = next
  }
  lengths.push(totalMs - cursor)
  return lengths
}

export type TeaserMoment = { clipId: string; offsetMs: number; durationMs: number }

/**
 * The teaser's moments: the best scored stills that don't overlap, as many
 * as there are cuts, played in the order they happen in the video. Each is
 * centred on its still and kept inside the clip it comes from.
 */
export function planTeaser<C extends TeaserClip>(
  tracks: TeaserTrack<C>[],
  scored: ScoredMoment[],
  lengths: number[]
): TeaserMoment[] {
  // Far enough apart that no two moments share footage.
  const apartMs = Math.max(TEASER_MIN_MOMENT_MS, ...lengths)
  const picked: ScoredMoment[] = []
  for (const moment of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= lengths.length) break
    if (picked.some((other) => Math.abs(other.atMs - moment.atMs) < apartMs)) continue
    if (!videoAt(tracks, moment.atMs)) continue
    picked.push(moment)
  }
  return picked
    .sort((a, b) => a.atMs - b.atMs)
    .map((moment, index) => {
      const clip = videoAt(tracks, moment.atMs)!
      const durationMs = Math.min(lengths[index], clip.durationMs)
      const into = moment.atMs - clip.startMs - durationMs / 2
      const offsetMs = Math.round(Math.min(Math.max(0, into), clip.durationMs - durationMs))
      return { clipId: clip.id, offsetMs, durationMs }
    })
}

/** The music clip a teaser follows: the first sound clip whose beats are known. */
export function teaserMusic<C extends TeaserClip>(tracks: TeaserTrack<C>[], beats: Map<string, number[]>) {
  return tracks
    .flatMap((track) => track.clips)
    .find((clip) => clip.kind === "audio" && clip.mediaId && beats.has(clip.mediaId))
}

/**
 * Where the music's beats fall under a teaser, counted from its start: the
 * opening of the same music, from where its clip starts in the file.
 */
export function teaserBeats(music: TeaserClip, beats: number[], totalMs: number) {
  return beatTimelineTimes(
    { startMs: 0, durationMs: totalMs, trimStartMs: music.trimStartMs, speed: music.speed },
    beats
  )
}

/**
 * The timeline with the teaser at the start: everything moves later by its
 * length, captions and markers too, and the moments play end to end on a
 * lane at the top. With music, the moments' own sound is off and the
 * opening of the same music plays under them, so the cuts land on beats you
 * can hear.
 */
export function layTeaser<C extends TeaserClip, T extends TeaserTrack<C>>(
  tracks: T[],
  markers: TimelineMarker[],
  moments: TeaserMoment[],
  musicClipId: string | null,
  makeId: () => string
): { tracks: T[]; markers: TimelineMarker[] } {
  const all = tracks.flatMap((track) => track.clips)
  const music = musicClipId ? all.find((clip) => clip.id === musicClipId) : undefined
  let cursor = 0
  const cuts: C[] = []
  for (const moment of moments) {
    const clip = all.find((one) => one.id === moment.clipId)
    if (!clip) continue
    cuts.push({
      ...clip,
      id: makeId(),
      startMs: cursor,
      durationMs: moment.durationMs,
      trimStartMs: sourceMsAt(clip, moment.offsetMs),
      transition: undefined,
      pictureFadeInMs: undefined,
      pictureFadeOutMs: undefined,
      fadeInMs: TEASER_SOUND_FADE_MS,
      fadeOutMs: TEASER_SOUND_FADE_MS,
      followTrack: undefined,
      ad: undefined,
      origin: undefined,
      ...(music ? { muted: true } : {}),
    })
    cursor += moment.durationMs
  }
  const totalMs = cursor
  if (!totalMs) return { tracks, markers }
  const moved = tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => ({ ...clip, startMs: clip.startMs + totalMs })),
  }))
  const lanes = [{ id: makeId(), muted: false, clips: cuts } as unknown as T, ...moved]
  if (music) {
    lanes.push({
      id: makeId(),
      muted: false,
      clips: [
        {
          ...music,
          id: makeId(),
          startMs: 0,
          durationMs: totalMs,
          fadeInMs: undefined,
          fadeOutMs: TEASER_MUSIC_FADE_MS,
          transition: undefined,
        },
      ],
    } as unknown as T)
  }
  return { tracks: lanes, markers: shiftMarkers(markers, 0, totalMs) }
}
