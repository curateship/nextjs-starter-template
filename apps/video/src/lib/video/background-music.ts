import type { ProjectTimeline } from "./timeline-schema"
import { MAX_TIMELINE_TRACKS, MAX_TRACK_CLIPS } from "./timeline-schema"
import { editorId } from "./timeline-utils"

/**
 * Laying a music track under a whole project.
 *
 * The music goes on a lane of its own at the bottom, with "duck under voice"
 * already on, and runs exactly as long as everything else. A track shorter
 * than the project plays again from the top until the project is covered. A
 * track that runs past the end is cut there and faded out, so the music never
 * stops mid-note.
 *
 * All of it is worked out here as plain clips, so the preview, the export and
 * undo treat the result like any clips somebody laid down by hand.
 */

type Track = ProjectTimeline["tracks"][number]
type Clip = Track["clips"][number]

/** How long the music takes to fade away when it is cut short. */
export const MUSIC_FADE_OUT_MS = 2_000

/**
 * A piece left over at the end that is shorter than this is dropped rather
 * than played. Two seconds of the opening bars, faded out as they start, sound
 * like a mistake; the copy before it ending on its own final note does not.
 */
export const MUSIC_SHORTEST_TAIL_MS = 2_000

/**
 * How loud music starts, as a share of the file's own level. Finished music is
 * mastered far louder than somebody talking: a sample track measured -12 LUFS
 * against -20 for a voiceover. A quarter is 12 dB down, which puts the music a
 * little under the voice between sentences and, with the duck, 10 to 13 dB
 * under it while somebody talks, measured on a test export. The Volume slider changes it per clip.
 */
export const MUSIC_START_VOLUME = 0.25

export const MUSIC_TOO_SHORT_TO_LOOP_MESSAGE =
  "This track is too short to repeat under a video this long."
export const MUSIC_UNREADABLE_MESSAGE =
  "The length of this track could not be read."
export const MUSIC_NO_ROOM_MESSAGE =
  "The timeline already has as many tracks as it can hold."

export type MusicSource = {
  mediaId: string
  name: string
  url: string
  sourceDurationMs: number
}

/** How far the clip's own sound has faded at this point in the clip. */
export function clipFadeOutGain(
  clip: Pick<Clip, "durationMs" | "fadeOutMs">,
  clipMs: number
): number {
  const fade = Math.min(clip.fadeOutMs ?? 0, clip.durationMs)
  if (fade <= 0) return 1
  const left = clip.durationMs - clipMs
  if (left >= fade) return 1
  return Math.max(0, left / fade)
}

/**
 * The clips that cover `projectMs` with one music file, back to back from the
 * start. An empty project has no length to cover, so the track is laid once at
 * its own length.
 */
export function planMusicClips(
  source: MusicSource,
  projectMs: number
): Clip[] {
  const trackMs = source.sourceDurationMs
  if (!(trackMs > 0)) return []
  const clip = (startMs: number, durationMs: number): Clip => ({
    id: editorId(),
    kind: "audio",
    name: source.name,
    mediaId: source.mediaId,
    url: source.url,
    sourceDurationMs: trackMs,
    trimStartMs: 0,
    startMs,
    durationMs,
    volume: MUSIC_START_VOLUME,
  })
  const fadedAtEnd = (piece: Clip): Clip => ({
    ...piece,
    fadeOutMs: Math.min(MUSIC_FADE_OUT_MS, piece.durationMs),
  })

  if (projectMs <= 0 || trackMs === projectMs) return [clip(0, trackMs)]
  if (trackMs > projectMs) return [fadedAtEnd(clip(0, projectMs))]

  const clips: Clip[] = []
  let startMs = 0
  // Past a lane's limit the answer is already a refusal, so there is no point
  // making the rest: a one-millisecond file under ten minutes would be 600,000.
  while (projectMs - startMs >= trackMs && clips.length <= MAX_TRACK_CLIPS) {
    clips.push(clip(startMs, trackMs))
    startMs += trackMs
  }
  const tailMs = projectMs - startMs
  if (tailMs >= MUSIC_SHORTEST_TAIL_MS) {
    clips.push(fadedAtEnd(clip(startMs, tailMs)))
  }
  return clips
}

/**
 * Why a music track cannot be laid down, or null when it can. Asked before the
 * edit, so the person hears the reason instead of the press doing nothing.
 */
export function musicRefusal(tracks: Track[], clips: Clip[]): string | null {
  if (!clips.length) return MUSIC_UNREADABLE_MESSAGE
  if (tracks.length >= MAX_TIMELINE_TRACKS) return MUSIC_NO_ROOM_MESSAGE
  if (clips.length > MAX_TRACK_CLIPS) return MUSIC_TOO_SHORT_TO_LOOP_MESSAGE
  return null
}

/** The music shelf's own messages, which the browser may show as they are. */
export const MUSIC_NOT_SOUND_MESSAGE = "Only sound files can go on the music shelf."
export const MUSIC_FILE_NOT_FOUND_MESSAGE = "That sound file no longer exists."
