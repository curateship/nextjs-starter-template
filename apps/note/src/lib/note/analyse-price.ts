import {
  AI_MODEL_OPTIONS,
  AI_MODEL_PRICES,
  DEFAULT_AI_MODEL,
} from "@/lib/ai/ai-models"
import { MAX_DURATION_SECONDS } from "@/lib/note/videos"

/**
 * What pressing Analyse will cost, worked out in the browser from the saved
 * length, before anything is spent.
 *
 * Two Gemini calls. The first hears the sound at about 32 tokens a second and
 * writes the words at about 4 tokens a second. The second reads those words
 * and writes about 1,500 tokens of summary, plan, quotes and tags. The prices
 * per token come from the shell's one price list, never from here.
 */

const SOUND_TOKENS_PER_SECOND = 32
const WORD_TOKENS_PER_SECOND = 4
const SUMMARY_OUTPUT_TOKENS = 1_500

export function analyseCostDollars(durationSeconds: number): number {
  const price = AI_MODEL_PRICES[DEFAULT_AI_MODEL.gemini]
  if (!price) return 0
  const seconds = Math.max(0, durationSeconds)
  const words = seconds * WORD_TOKENS_PER_SECOND
  const inputTokens = seconds * SOUND_TOKENS_PER_SECOND + words
  const outputTokens = words + SUMMARY_OUTPUT_TOKENS
  return (
    (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
  )
}

function modelName() {
  return (
    AI_MODEL_OPTIONS.gemini.find((option) => option.id === DEFAULT_AI_MODEL.gemini)?.label ??
    DEFAULT_AI_MODEL.gemini
  )
}

function cents(dollars: number) {
  const exact = dollars * 100
  return exact < 1 ? "under 1¢" : `about ${Math.round(exact)}¢`
}

/**
 * The line above the Analyse button: "Analysing costs about 8¢ with Gemini
 * 3.8 Flash". Before the length is known it says the most a 30-minute video
 * can cost. Once a video has been analysed, it says the old results go.
 */
export function analysePriceLine(durationSeconds: number | null, again: boolean) {
  const price =
    durationSeconds === null
      ? `up to ${Math.round(analyseCostDollars(MAX_DURATION_SECONDS) * 100)}¢`
      : cents(analyseCostDollars(durationSeconds))
  const line = `${again ? "Analysing again" : "Analysing"} costs ${price} with ${modelName()}`
  return again
    ? `${line} and replaces the summary, plan, quotes and transcript.`
    : `${line}.`
}
