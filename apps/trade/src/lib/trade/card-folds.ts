import { z } from "zod"

/**
 * Which settings cards somebody has folded away, kept against the account.
 *
 * A card id to whether it is open. A card nobody has ever touched is simply
 * absent, and falls back to whatever that card opens as — so the answer
 * "remembered" and the answer "never asked" stay different things, and adding
 * a card later does not need every stored row updating.
 *
 * Against the account rather than the browser, the same as the chart's zoom
 * and its indicators: this app runs inside an embedded preview where the
 * browser's own storage is quietly dropped.
 */
export type CardFolds = Record<string, boolean>

/** Ids are short and there are few cards; both caps are far above real use. */
const MAX_CARDS = 60
const MAX_ID = 60

export function readCardFolds(value: unknown): CardFolds {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }
  const folds: CardFolds = {}
  for (const [id, open] of Object.entries(value)) {
    if (typeof open !== "boolean" || id.length > MAX_ID) continue
    folds[id] = open
    if (Object.keys(folds).length >= MAX_CARDS) break
  }
  return folds
}

export const cardFoldsSchema: z.ZodType<CardFolds> = z
  .record(z.string().max(MAX_ID), z.boolean())
  .refine((folds) => Object.keys(folds).length <= MAX_CARDS, {
    message: "Too many cards",
  })
  .transform(readCardFolds)
