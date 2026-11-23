import { PROJECT_NAME_MAX } from "@/lib/video/projects"
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

/**
 * The locale a language's captions are put in capitals with. Of the languages
 * on offer only Turkish writes them differently from English: a dotted i
 * becomes İ, not I. Left out, the device's own locale is used.
 */
export function capitalsLocale(language: TranslateLanguage) {
  return language === "Turkish" ? "tr" : undefined
}

/**
 * The most languages one press makes, in the Another language window and in a
 * carousel's copies. Each one is a voice and an export, and ten already fills
 * half of anyone's export queue.
 */
export const TRANSLATE_LANGUAGES_AT_ONCE = 10

/** The longest single line sent or accepted back. Captions are a few words. */
export const TRANSLATE_LINE_MAX = 300

/**
 * As many lines as one translation takes: about 25 minutes of captions, at
 * about forty lines a minute.
 */
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

export const TRANSLATE_SOURCE_GONE_MESSAGE =
  "The talking this was translated from is no longer on the project. Translate it again"

export const TRANSLATE_PAST_THE_END_MESSAGE =
  "The translated lines start after the project ends. Translate it again"

export const TRANSLATE_TOO_MANY_LANGUAGES_MESSAGE = `Pick up to ${TRANSLATE_LANGUAGES_AT_ONCE} languages at once`

export const TRANSLATE_TOO_MANY_LINES_MESSAGE = `This project has more than ${TRANSLATE_LINES_MAX.toLocaleString("en-US")} caption lines, which is as many as one translation takes`

/** These reach the screen as they are. */
export const SAFE_TRANSLATE_ERRORS = new Set([
  TRANSLATE_NOTHING_TO_SAY_MESSAGE,
  TRANSLATE_TOO_LONG_TO_SPEAK_MESSAGE,
  TRANSLATE_NO_VOICE_MESSAGE,
  TRANSLATE_TOO_MANY_LINES_MESSAGE,
  TRANSLATE_SOURCE_GONE_MESSAGE,
  TRANSLATE_TOO_MANY_LANGUAGES_MESSAGE,
  TRANSLATE_PAST_THE_END_MESSAGE,
])

/** What the voice is asked to say: every line in order, as one script. */
export function translationScript(lines: { text: string }[]) {
  return lines
    .map((line) => line.text.trim())
    .filter(Boolean)
    .join(" ")
}

/**
 * What a language copy of a project is called: "My Short (Spanish)". A long
 * name gives way at its end, so the language always fits.
 */
export function languageCopyName(projectName: string, language: TranslateLanguage) {
  const suffix = ` (${language})`
  const base = projectName.trim().replace(/\s+/g, " ")
  return `${base.slice(0, PROJECT_NAME_MAX - suffix.length).trimEnd()}${suffix}`
}

/**
 * Why Make all is refused while some translations have not been read: the
 * read-and-correct step is what keeps a dubbed version honest.
 */
export function unreadLanguagesMessage(unread: TranslateLanguage[]) {
  const names =
    unread.length === 1
      ? unread[0]
      : `${unread.slice(0, -1).join(", ")} and ${unread.at(-1)}`
  return `Read ${names} first. Open ${unread.length === 1 ? "its tab" : "each of their tabs"}, so every translation is read before it is made`
}
