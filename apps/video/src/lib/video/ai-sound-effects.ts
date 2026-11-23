/**
 * A sound effect made from words, by ElevenLabs' sound effects model
 * (`workspace/docs/ai-sound-effects.md`). Tyler, 4 Nov 2026: "Your sounds +
 * playhead": the sound lands at the playhead and stays in your own sounds.
 */

export const AI_SOUND_MODEL = "eleven_text_to_sound_v2"

/**
 * ElevenLabs' API price page, read on 4 Nov 2026: $0.12 a minute of sound.
 * The same page's questions say sound effects are billed per generation, so
 * the meter counts the length asked for, and the cap when none is.
 */
export const AI_SOUND_CENTS_PER_MINUTE = 12
/** The API's own limits, read on 4 Nov 2026: 0.5 to 30 seconds. */
export const AI_SOUND_MIN_SECONDS = 0.5
export const AI_SOUND_MAX_SECONDS = 30
export const AI_SOUND_WORDS_MAX = 300

export const AI_SOUND_NO_WORDS_MESSAGE = "Say what the sound should be first"
export const AI_SOUND_FAILED_MESSAGE = "The sound couldn't be made this time. Try again."
export const AI_SOUND_LENGTH_MESSAGE = `A sound can be ${AI_SOUND_MIN_SECONDS} to ${AI_SOUND_MAX_SECONDS} seconds long.`

/** Whether a typed length is one the API takes. Empty lets it choose. */
export function aiSoundLengthOk(seconds: number | null) {
  return (
    seconds === null ||
    (Number.isFinite(seconds) && seconds >= AI_SOUND_MIN_SECONDS && seconds <= AI_SOUND_MAX_SECONDS)
  )
}

/** What one sound costs, in whole cents rounded up. No length counts as the cap. */
export function aiSoundCostCents(seconds: number | null) {
  return Math.max(1, Math.ceil(((seconds ?? AI_SOUND_MAX_SECONDS) / 60) * AI_SOUND_CENTS_PER_MINUTE))
}

/** The sound's name in the media library and on the Sounds list: the words typed. */
export function aiSoundName(words: string) {
  return words.trim().replace(/\s+/g, " ").slice(0, 60) || "Sound"
}
