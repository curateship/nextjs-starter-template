/**
 * What a position's money does if its stop fires right now.
 *
 * The sum is the size held times the distance from today's price to the stop,
 * signed by the side: a long with its stop below the price loses, a short with
 * its stop below the price gains. Nothing else is taken off. Fees are their
 * own column already, and the entry price is the Projected column's business.
 *
 * **Measured from the mark, not the entry.** "What do I lose from here" is the
 * question a person asks when deciding whether the open risk across every
 * trade is too much. What the trade has already made or lost is printed in
 * Unrealized P&L beside it.
 */
export function ifStoppedChange({
  szi,
  mark,
  stopPx,
}: {
  /** Size held, negative for a short — the same sign the position carries. */
  szi: number
  /** Today's price. */
  mark: number
  /** Where the stop sits. */
  stopPx: number
}): number {
  return (stopPx - mark) * szi
}
