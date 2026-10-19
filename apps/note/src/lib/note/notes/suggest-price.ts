import { AI_MODEL_OPTIONS, AI_MODEL_PRICES, DEFAULT_AI_MODEL } from "@/lib/ai/ai-models"

/**
 * What pressing "Suggest fields" will cost, worked out in the browser before
 * anything is spent, the same way the Analyse button's line is.
 *
 * One text call. It reads the note (about four characters a token, capped at
 * `SUGGEST_TEXT_MAX`) plus about 300 tokens of instructions and 30 a field,
 * and writes about 40 tokens a field. The prices per token come from the
 * shell's one price list.
 */

/** The most of a note's text the AI reads, so a very long note costs a known most. */
export const SUGGEST_TEXT_MAX = 40_000

const CHARS_PER_TOKEN = 4
const INSTRUCTION_TOKENS = 300
const FIELD_IN_TOKENS = 30
const FIELD_OUT_TOKENS = 40

function suggestCostDollars(textLength: number, fieldCount: number): number {
  const price = AI_MODEL_PRICES[DEFAULT_AI_MODEL.gemini]
  if (!price) return 0
  const inputTokens =
    Math.min(textLength, SUGGEST_TEXT_MAX) / CHARS_PER_TOKEN + INSTRUCTION_TOKENS + fieldCount * FIELD_IN_TOKENS
  const outputTokens = fieldCount * FIELD_OUT_TOKENS
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
}

/** "Suggesting costs under 1¢ with Gemini 3.8 Flash." */
export function suggestPriceLine(textLength: number, fieldCount: number) {
  const model =
    AI_MODEL_OPTIONS.gemini.find((option) => option.id === DEFAULT_AI_MODEL.gemini)?.label ??
    DEFAULT_AI_MODEL.gemini
  const cents = suggestCostDollars(textLength, fieldCount) * 100
  const price = cents < 1 ? "under 1¢" : `about ${Math.round(cents)}¢`
  return `Suggesting costs ${price} with ${model}.`
}
