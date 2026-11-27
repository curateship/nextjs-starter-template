/**
 * Directions written into a script: `[whispering]` before a phrase, and
 * `[pause 1.5s]` between sentences.
 *
 * The script box holds one way of writing both, whatever voice reads it. Just
 * before it is sent, the script is turned into what the chosen model
 * understands: ElevenLabs v3 and v4 follow tags in square brackets and take a
 * pause as an ellipsis on its own line, while v2, Flash and Turbo ignore tags
 * (they would read "whispering" out loud) and take a pause as an exact
 * `<break time="1.5s" />`. OpenAI follows neither, so it gets the plain words
 * with an ellipsis for each pause.
 *
 * Nothing here talks to anybody, so all of it can be tested without a key.
 */

/** The ElevenLabs models that follow tags in square brackets. */
export const DIRECTED_VOICE_MODELS = [
  "eleven_v3",
  "eleven_v4",
  "eleven_v4_turbo",
] as const

export function followsDirections(modelId: string) {
  return (DIRECTED_VOICE_MODELS as readonly string[]).includes(modelId)
}

/** The lengths the pause button offers, in seconds. */
export const VOICE_PAUSE_SECONDS = [0.5, 1, 1.5, 2, 2.5, 3] as const
const PAUSE_MIN_S = VOICE_PAUSE_SECONDS[0]
const PAUSE_MAX_S = VOICE_PAUSE_SECONDS[VOICE_PAUSE_SECONDS.length - 1]

/**
 * ElevenLabs: "Using too many break tags in a single generation can cause
 * instability. The AI might speed up, or introduce additional noises." Ten is
 * this app's line.
 */
export const VOICE_PAUSES_MAX = 10

/** The tags the window suggests. Any word in square brackets is passed on. */
export const VOICE_TAG_EXAMPLES = ["[whispering]", "[excited]", "[sighs]"]

/** What the pause button puts in the script. */
export function pauseMark(seconds: number) {
  return `[pause ${seconds}s]`
}

const PAUSE = /\[\s*pause\s+(\d+(?:\.\d+)?)\s*s?\s*\]/gi
// A tag is a short run of words in square brackets on one line. Anything
// longer is left alone, because it is more likely writing than a direction.
const TAG = /\[[^[\]\n]{1,40}\]/g

export function countPauses(script: string) {
  return script.match(PAUSE)?.length ?? 0
}

/** Why a script cannot be sent as it is, or null when it can. */
export function voicePausesRefusal(script: string) {
  const pauses = countPauses(script)
  if (pauses <= VOICE_PAUSES_MAX) return null
  const extra = pauses - VOICE_PAUSES_MAX
  return `This script has ${pauses} pauses. ${VOICE_PAUSES_MAX} is the most, because more make the voice speed up or crackle. Take ${extra} out.`
}

function pauseSeconds(written: string) {
  const seconds = Number(written)
  if (!Number.isFinite(seconds)) return PAUSE_MIN_S
  return Math.min(PAUSE_MAX_S, Math.max(PAUSE_MIN_S, seconds))
}

/** Joins the pieces around a replaced mark without doubling the spaces. */
function tidy(text: string) {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

/**
 * The script as the chosen reader understands it.
 *
 * `directed` is ElevenLabs v3 and v4, `timed` is the other ElevenLabs models,
 * and `plain` is OpenAI.
 */
export function scriptForReader(
  script: string,
  reader: "directed" | "timed" | "plain"
) {
  if (reader === "timed") {
    return tidy(
      script
        .replace(PAUSE, (_, seconds: string) => {
          return ` <break time="${pauseSeconds(seconds)}s" /> `
        })
        .replace(TAG, " ")
    )
  }
  // v3 and v4 do not take <break>; a line break with an ellipsis is the pause
  // ElevenLabs recommends. Its length is the voice's to choose.
  const paused = script.replace(PAUSE, " ...\n")
  return tidy(reader === "directed" ? paused : paused.replace(TAG, " "))
}

/** Which kind of reader a voice is, from who speaks and which model. */
export function readerFor(speaker: "elevenlabs" | "openai", modelId: string) {
  if (speaker === "openai") return "plain" as const
  return followsDirections(modelId) ? ("directed" as const) : ("timed" as const)
}

/**
 * Only the words that are said: every tag and pause taken out. This is what
 * the voiceover shelf keeps and what the run length counts.
 */
export function spokenScript(script: string) {
  return tidy(script.replace(PAUSE, " ").replace(TAG, " "))
}

/** The pauses written into a script, added up in seconds. */
export function pauseSecondsTotal(script: string) {
  let total = 0
  for (const match of script.matchAll(PAUSE)) total += pauseSeconds(match[1])
  return total
}

/** Whether the script has tags that a model which ignores them would drop. */
export function hasTags(script: string) {
  return new RegExp(TAG.source).test(script.replace(PAUSE, " "))
}

/**
 * ElevenLabs v3 takes only three steadiness settings, 0, 0.5 and 1 (Creative,
 * Natural and Robust on its own site), and refuses anything between. v4 is
 * treated the same, because a value it refuses costs a failed read.
 */
export function steadinessForModel(stability: number, modelId: string) {
  if (!followsDirections(modelId)) return stability
  return Math.round(stability * 2) / 2
}
