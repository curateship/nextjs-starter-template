/**
 * The one Claude model Date's AI uses, and its price, named once.
 *
 * Claude Opus 5.5, the default the claude-api skill names on 18 Oct 2026, and
 * one that reads pictures. Its price is from the same skill's table, cached on
 * 6 Oct 2026: $4 per million tokens in and $20 per million out.
 *
 * The price is here as well as being Anthropic's because the shell's price list
 * (`src/lib/ai/ai-models.ts`, a shell file Date may not edit) does not have
 * this model yet, so the shell's usage meter records its calls at $0. Date's
 * spend cap reads the tokens off the meter and prices them here. Once the
 * shell lists the model, this price and that one must agree.
 */
export const DATING_MODEL = "claude-opus-5-5"

export const DATING_MODEL_PRICE = { inputPerMillion: 4, outputPerMillion: 20 } as const

/** What one call cost, in dollars, from its tokens. */
export function datingCallDollars(inputTokens: number, outputTokens: number): number {
  return (inputTokens * DATING_MODEL_PRICE.inputPerMillion + outputTokens * DATING_MODEL_PRICE.outputPerMillion) / 1_000_000
}

/**
 * Photos are shrunk to this many pixels on their long side before the AI sees
 * them. A dating photo reads as well at this size, and each costs about a
 * fifth of a full-size one.
 */
export const PHOTO_LONG_EDGE = 768
