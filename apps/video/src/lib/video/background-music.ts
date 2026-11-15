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

/** How long two repeats of a track overlap and blend when blending is on. */
export const MUSIC_BLEND_MS = 3_000

/**
 * The clips that cover `fromMs` to `toMs` with one sound file played over and
 * over, each copy fading into the next instead of cutting (Blend the repeats,
 * background-music.md). The copies alternate between two lanes, each starting
 * `crossfadeMs` before the one before it ends, so one fades out while the
 * next fades in over the same stretch. Sound has no transitions of its own
 * (clip-transitions.ts), so the blend is two fades on two lanes; the preview
 * and the export already play both. The first copy starts at full, and the
 * last fades out over `MUSIC_FADE_OUT_MS` where it is cut. Returns the two
 * lanes' clips, the second empty when one copy covers it all.
 */
export function layAudioRepeats(
  source: MusicSource,
  options: { fromMs: number; toMs: number; crossfadeMs?: number; volume?: number }
): [Clip[], Clip[]] {
  const trackMs = source.sourceDurationMs
  const spanMs = options.toMs - options.fromMs
  if (!(trackMs > 0) || !(spanMs > 0)) return [[], []]
  // Never more than a third of the track, so each copy is mostly heard whole.
  const crossfadeMs = Math.max(200, Math.min(options.crossfadeMs ?? MUSIC_BLEND_MS, 5_000, trackMs / 3))
  const stepMs = trackMs - crossfadeMs
  const lanes: [Clip[], Clip[]] = [[], []]
  let startMs = options.fromMs
  for (let index = 0; startMs < options.toMs && index <= 2 * MAX_TRACK_CLIPS; index += 1) {
    const durationMs = Math.min(trackMs, options.toMs - startMs)
    const last = startMs + durationMs >= options.toMs
    // A short leftover past the last full copy is dropped, as planMusicClips does.
    if (last && index > 0 && durationMs < MUSIC_SHORTEST_TAIL_MS + crossfadeMs) {
      const previous = lanes[(index - 1) % 2].at(-1)!
      // The copy before it then runs on to the end and fades there.
      const runsTo = Math.min(previous.startMs + trackMs, options.toMs)
      previous.durationMs = runsTo - previous.startMs
      previous.fadeOutMs = Math.min(MUSIC_FADE_OUT_MS, previous.durationMs)
      break
    }
    lanes[index % 2].push({
      id: editorId(),
      kind: "audio",
      name: source.name,
      mediaId: source.mediaId,
      url: source.url,
      sourceDurationMs: trackMs,
      trimStartMs: 0,
      startMs,
      durationMs,
      volume: options.volume ?? MUSIC_START_VOLUME,
      ...(index > 0 ? { fadeInMs: crossfadeMs } : {}),
      fadeOutMs: last ? Math.min(MUSIC_FADE_OUT_MS, durationMs) : crossfadeMs,
    })
    if (last) break
    startMs += stepMs
  }
  return lanes
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
