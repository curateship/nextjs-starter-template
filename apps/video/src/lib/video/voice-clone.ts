/**
 * A voice of your own: 10 to 60 seconds of speech, uploaded or recorded,
 * which ElevenLabs turns into an instant clone that reads like any other
 * voice. The rules both sides check, and the sentences both sides show.
 */

export const VOICE_SAMPLE_MIN_MS = 10_000
export const VOICE_SAMPLE_MAX_MS = 60_000
/** A minute of studio-quality WAV is about 17 MB, so this leaves room. */
export const VOICE_SAMPLE_MAX_BYTES = 25 * 1024 * 1024
export const VOICE_CLONE_NAME_MAX = 100

/** The sound files a sample can be. The browser records WebM. */
export const VOICE_SAMPLE_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
]

/** "audio/webm;codecs=opus" is "audio/webm". */
export function plainSoundType(type: string) {
  return type.split(";")[0].trim().toLowerCase()
}

export const VOICE_CLONE_NAME_MESSAGE = "Give the voice a name"
export const VOICE_SAMPLE_MISSING_MESSAGE = "Add a recording first"
export const VOICE_SAMPLE_TYPE_MESSAGE =
  "That file is not sound this app can use. Use MP3, WAV, M4A, OGG or WebM."
export const VOICE_SAMPLE_TOO_BIG_MESSAGE =
  "That file is over 25 MB. A minute of speech fits well under that."
export const VOICE_SAMPLE_UNREADABLE_MESSAGE =
  "That file could not be played, so it may not be sound. Try another one."
export const VOICE_CLONE_PLAN_MESSAGE =
  "ElevenLabs only makes voices on a paid plan, and the key saved in Settings → AI is not on one."
export const VOICE_CLONE_NOT_FOUND_MESSAGE =
  "That voice is not there any more. It may already have been deleted."
export const VOICE_CLONE_FAILED_MESSAGE =
  "ElevenLabs did not make the voice. Nothing was charged. Try again in a moment."
export const VOICE_CLONE_TOO_OFTEN_MESSAGE =
  "That is 10 tries at making a voice in an hour, the most allowed. Try again in an hour."
export const VOICE_CLONE_DELETE_FAILED_MESSAGE =
  "ElevenLabs did not delete the voice, so it is still here. Try again in a moment."

/** How the provider's own words are passed on, so they can be recognised. */
export const PROVIDER_SAID = "ElevenLabs said: "

/** Why a sample of this length cannot be used, or null when it can. */
export function sampleLengthRefusal(durationMs: number) {
  if (durationMs >= VOICE_SAMPLE_MIN_MS && durationMs <= VOICE_SAMPLE_MAX_MS) {
    return null
  }
  const seconds = Math.round(durationMs / 1000)
  return `The sample runs ${seconds} ${seconds === 1 ? "second" : "seconds"}. It needs 10 to 60 seconds of speech.`
}

// Some of these carry the provider's own words after them, so a message is
// recognised by how it starts.
const KNOWN_OPENINGS = [
  VOICE_CLONE_NAME_MESSAGE,
  VOICE_SAMPLE_MISSING_MESSAGE,
  VOICE_SAMPLE_TYPE_MESSAGE,
  VOICE_SAMPLE_TOO_BIG_MESSAGE,
  VOICE_SAMPLE_UNREADABLE_MESSAGE,
  VOICE_CLONE_PLAN_MESSAGE,
  VOICE_CLONE_NOT_FOUND_MESSAGE,
  VOICE_CLONE_FAILED_MESSAGE,
  VOICE_CLONE_TOO_OFTEN_MESSAGE,
  VOICE_CLONE_DELETE_FAILED_MESSAGE,
  PROVIDER_SAID,
  "The sample runs ",
]

/** Whether a message is one of this feature's own, fit to show as it is. */
export function isVoiceCloneMessage(message: string) {
  return KNOWN_OPENINGS.some((opening) => message.startsWith(opening))
}
