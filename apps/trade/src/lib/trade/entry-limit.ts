import { z } from "zod"

/**
 * How many coins a wallet may open in a stretch of time.
 *
 * **The day this exists for.** On 10 October 2025 the whole market fell 50-70%
 * inside eleven minutes. Forty-four coins took their first rung in one candle,
 * which used $14,585 of an $18,562 wallet on first rungs alone — and left
 * $3,977 for the rungs below, which wanted $14,193. A coin holding one rung is
 * wiped out 45% below it at 2x, so nearly every one of those forty-four was
 * liquidated before the fall had finished, and the wallet's worst moment was
 * 71% down.
 *
 * The deep rungs are where a ladder makes its money on a crash. Spending the
 * wallet on first rungs across dozens of coins is the one thing that guarantees
 * it cannot reach them.
 *
 * **What counts as an entry.** A coin going from holding nothing to holding
 * something. Adding to a coin already held is never counted — leaving room for
 * exactly that is the whole point.
 */
export const entryLimitSchema = z.object({
  /** How many coins may be opened inside the window. */
  coins: z.number().int().min(1).max(500).default(5),
  /** The stretch that count is measured over. */
  withinHours: z.number().min(0.25).max(72).default(1),
})

export type EntryLimit = z.infer<typeof entryLimitSchema>

/**
 * May another coin be opened right now?
 *
 * `openedAt` is every earlier entry's moment, oldest first. Anything outside
 * the window is simply not counted; nothing has to be tidied up, so a caller
 * that keeps a long list still gets the right answer.
 */
export function canOpenAnother(
  limit: EntryLimit | null,
  openedAt: readonly number[],
  now: number
): boolean {
  if (!limit) return true
  const since = now - limit.withinHours * 3_600_000
  let inWindow = 0
  // Backwards: the newest entries are the ones inside the window, and a wallet
  // running for a year must not walk a year of history on every fill.
  for (let i = openedAt.length - 1; i >= 0; i -= 1) {
    if (openedAt[i] <= since) break
    inWindow += 1
    if (inWindow >= limit.coins) return false
  }
  return true
}

/** What the switch starts at: five coins an hour. */
export function defaultEntryLimit(): EntryLimit {
  return { coins: 5, withinHours: 1 }
}
