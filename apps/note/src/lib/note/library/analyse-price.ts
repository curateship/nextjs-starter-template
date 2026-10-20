import { AI_MODEL_OPTIONS, AI_MODEL_PRICES, DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"
import type { AnalyseInputs } from "@/lib/note/library/notes"

/**
 * What pressing Analyse will cost, worked out in the browser before anything
 * is spent, from the shell's one price list.
 *
 * A video, or an X post's video, is written down first: the sound goes in at
 * about 32 tokens a second and the words come out at about 4. Then one call
 * reads those words, the post's own words at about 4 characters a token and
 * each picture at about 1,120 tokens, and writes about 1,200 tokens of
 * summary, plan, quotes and tags back.
 */

const SOUND_TOKENS_PER_SECOND = 32
const WORD_TOKENS_PER_SECOND = 4
const CHARS_PER_TOKEN = 4
const PICTURE_TOKENS = 1_120
const PROMPT_TOKENS = 600
const ANSWER_TOKENS = 1_200
const MERGE_ANSWER_TOKENS = 1_000

function dollars(inputTokens: number, outputTokens: number) {
  const price = AI_MODEL_PRICES[DEFAULT_AI_MODEL.gemini]
  if (!price) return 0
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
}

export function analyseDollars(inputs: AnalyseInputs): number {
  const seconds = Math.max(0, inputs.soundSeconds)
  const spoken = seconds * WORD_TOKENS_PER_SECOND
  const listening = seconds ? dollars(seconds * SOUND_TOKENS_PER_SECOND, spoken) : 0
  const reading =
    PROMPT_TOKENS +
    Math.ceil(Math.max(0, inputs.chars) / CHARS_PER_TOKEN) +
    spoken +
    Math.max(0, inputs.pictures) * PICTURE_TOKENS
  return listening + dollars(reading, ANSWER_TOKENS)
}

function mergeDollars(planChars: number): number {
  return dollars(PROMPT_TOKENS + Math.ceil(Math.max(0, planChars) / CHARS_PER_TOKEN), MERGE_ANSWER_TOKENS)
}

function modelName() {
  return (
    AI_MODEL_OPTIONS.gemini.find((option) => option.id === DEFAULT_AI_MODEL.gemini)?.label ??
    DEFAULT_AI_MODEL.gemini
  )
}

export function cents(amount: number) {
  const exact = amount * 100
  return exact < 1 ? "under 1¢" : `about ${Math.round(exact)}¢`
}

/**
 * The line under the Analyse button: "Under 1¢ with Gemini 3.8 Flash", the
 * words in Tyler's drawing of 20 Oct 2026. Once a note was analysed, it says
 * what goes, because Analyse again replaces the cards along with every tick
 * and edit (Tyler, 19 Oct 2026: "Replace all, warn first").
 */
export function analysePriceLine(inputs: AnalyseInputs, again: boolean) {
  const price = cents(analyseDollars(inputs))
  const line = `${price.charAt(0).toUpperCase()}${price.slice(1)} with ${modelName()}`
  return again ? `${line}. Replaces the summary, the plan with your ticks, and the quotes.` : line
}

/**
 * "Analysing 3 notes costs about 2¢ with Gemini 3.8 Flash." When some of them
 * were analysed before, it says their cards go, the same warning the single
 * Analyse again gives.
 */
export function manyPriceLine(notes: { analyse: AnalyseInputs; analysed: boolean }[]) {
  const total = notes.reduce((sum, note) => sum + analyseDollars(note.analyse), 0)
  const what = notes.length === 1 ? "1 note" : `${notes.length} notes`
  const line = `Analysing ${what} costs ${cents(total)} with ${modelName()}.`
  const again = notes.filter((note) => note.analysed).length
  if (!again) return line
  return `${line} It replaces the plan${again === 1 ? "" : "s"} of the ${again === 1 ? "one" : again} already analysed, ticks included.`
}

export function mergePriceLine(notes: { planChars: number }[]) {
  const chars = notes.reduce((sum, note) => sum + note.planChars, 0)
  return `One plan from ${notes.length} notes costs ${cents(mergeDollars(chars))} with ${modelName()}.`
}
