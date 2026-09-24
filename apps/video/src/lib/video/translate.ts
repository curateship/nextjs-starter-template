import { VOICE_TEXT_MAX } from "@/lib/video/voice"

/**
 * Putting a project's words into another language, on both sides of the wire.
 *
 * The talking is written down first, as caption lines with their times. Each
 * line is then translated on its own, so the new words keep the old line's
 * place on the timeline. Nothing here talks to a provider, so the browser can
 * import it freely.
 */

/**
 * The languages on offer: the ones the ElevenLabs multilingual voice can
 * speak, so every language that can be captioned can also be read aloud.
 */
export const TRANSLATE_LANGUAGES = [
  "Arabic",
  "Bulgarian",
  "Chinese",
  "Croatian",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Filipino",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hindi",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Malay",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Slovak",
  "Spanish",
  "Swedish",
  "Tamil",
  "Turkish",
  "Ukrainian",
] as const

export type TranslateLanguage = (typeof TRANSLATE_LANGUAGES)[number]

export const DEFAULT_TRANSLATE_LANGUAGE: TranslateLanguage = "Spanish"

/** The longest single line sent or accepted back. Captions are a few words. */
export const TRANSLATE_LINE_MAX = 300

/** As many lines as ten minutes of captions can make. */
export const TRANSLATE_LINES_MAX = 1000

/**
 * The only voice model used to read a translation aloud. It speaks every
 * language in the list above.
 */
export const TRANSLATE_VOICE_MODEL = "eleven_multilingual_v2"

/**
 * How loud the original talking plays once the translation is read over it:
 * a fifth of what it was, low enough to follow the new voice and still hear
 * that someone is speaking underneath.
 */
export const TRANSLATE_ORIGINAL_VOLUME = 0.2

export const TRANSLATE_NOTHING_TO_SAY_MESSAGE =
  "Every line of the translation is empty, so there is nothing to use"

export const TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE = `The translation is too long to read aloud in one go. The voice reads up to ${VOICE_TEXT_MAX.toLocaleString("en-US")} characters`

export const TRANSLATE_NO_VOICE_MESSAGE =
  "Pick a voice to read the translation"

/** These reach the screen as they are. */
export const SAFE_TRANSLATE_ERRORS = new Set([
  TRANSLATE_NOTHING_TO_SAY_MESSAGE,
  TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE,
  TRANSLATE_NO_VOICE_MESSAGE,
])

/** What the voice is asked to say: every line in order, as one script. */
export function translationScript(lines: { text: string }[]) {
  return lines
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(" ")
}
