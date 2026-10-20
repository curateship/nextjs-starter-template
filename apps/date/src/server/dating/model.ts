/**
 * The two Claude models Date's AI uses, and their prices, named once.
 *
 * Claude Opus 5.5 does every job, and has the last word on a card. Claude
 * Sonnet 5.5 is the first look at every card: Tyler's choice, 18 Oct 2026,
 * because cards are most of the spend. Opus looks again only at a card Sonnet
 * scored close to the like line (`SECOND_LOOK_WITHIN`). Both read pictures.
 *
 * Prices are from the claude-api skill's table, cached on 6 Oct 2026: Opus
 * $4 per million tokens in and $20 out, Sonnet $2 in and $10 out.
 *
 * The prices are here as well as being Anthropic's because the shell's price
 * list (`src/lib/ai/ai-models.ts`, a shell file Date may not edit) does not
 * have these models yet, so the shell's usage meter records their calls at
 * $0. Date's spend cap reads the tokens off the meter and prices them here.
 * Once the shell lists the models, these prices and those must agree.
 */
export const DATING_MODEL = "claude-opus-5-5"

/** The first look at every card. */
export const FIRST_LOOK_MODEL = "claude-sonnet-5-5"

export type DatingModel = typeof DATING_MODEL | typeof FIRST_LOOK_MODEL

export const MODEL_PRICES: Record<DatingModel, { inputPerMillion: number; outputPerMillion: number }> = {
  [DATING_MODEL]: { inputPerMillion: 4, outputPerMillion: 20 },
  [FIRST_LOOK_MODEL]: { inputPerMillion: 2, outputPerMillion: 10 },
}

/** Opus scores a card again when the first look's score is this close to the like line, either side. */
export const SECOND_LOOK_WITHIN = 10

export function isDatingModel(model: string): model is DatingModel {
  return model in MODEL_PRICES
}

/** What one call cost, in dollars, from its model and tokens. */
export function datingCallDollars(model: DatingModel, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[model]
  return (inputTokens * price.inputPerMillion + outputTokens * price.outputPerMillion) / 1_000_000
}

/**
 * Photos are shrunk to this many pixels on their long side before the AI sees
 * them. A dating photo reads as well at this size, and each costs about a
 * fifth of a full-size one.
 */
export const PHOTO_LONG_EDGE = 768
