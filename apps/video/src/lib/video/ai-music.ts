/**
 * Music made to fit, by ElevenLabs Music (workspace/docs/ai-music.md).
 *
 * A few words of mood go in, and an instrumental track as long as the video
 * comes back, from 3 seconds to 5 minutes. A video longer than 5 minutes gets
 * a 5 minute track, which the Music panel lays down again from the top until
 * the video is covered, as it does any track (background-music.ts).
 */

/** The model asked. */
export const AI_MUSIC_MODEL = "music_v1"

/**
 * ElevenLabs' API price page, read on 4 Nov 2026: $0.30 a minute, and tracks
 * of up to 5 minutes.
 */
export const AI_MUSIC_CENTS_PER_MINUTE = 30
export const AI_MUSIC_MIN_MS = 3_000
export const AI_MUSIC_MAX_MS = 5 * 60_000

/** The longest mood a person can type. */
export const AI_MUSIC_MOOD_MAX = 300

export const AI_MUSIC_NO_MOOD_MESSAGE = "Say what the music should sound like first"
export const AI_MUSIC_EMPTY_VIDEO_MESSAGE = "Put something on the timeline first, so the music knows how long to be"
export const AI_MUSIC_FAILED_MESSAGE = "The music couldn't be made this time. Try again."

/** How long the track asked for is, for a video this long. */
export function aiMusicLengthMs(videoMs: number) {
  return Math.round(Math.min(AI_MUSIC_MAX_MS, Math.max(AI_MUSIC_MIN_MS, videoMs)))
}

/** What a track this long costs, in cents, rounded up to a whole cent. */
export function aiMusicCostCents(lengthMs: number) {
  return Math.ceil((lengthMs / 60_000) * AI_MUSIC_CENTS_PER_MINUTE)
}

/** The name the track gets in the media library and on the Music list. */
export function aiMusicName(mood: string) {
  const words = mood.trim().replace(/\s+/g, " ").slice(0, 60)
  return `Music - ${words || "made to fit"}`
}
