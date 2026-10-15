/**
 * When the last order was placed by hand on each coin, in this browser.
 *
 * A module-level memory rather than component state, so it outlives a chart
 * panel that unmounts when the layout changes and follows a coin across
 * every screen in the tab. A reload empties it; the chart seeds it again from
 * the newest fill and open order it can see for the coin.
 */
const lastOrders = new Map<string, number>()

export function rememberLastOrder(marketKey: string, at = Date.now()): void {
  const known = lastOrders.get(marketKey)
  if (known === undefined || at > known) lastOrders.set(marketKey, at)
}

/** The newest of what the browser remembers and what the caller can see. */
export function lastOrderAt(
  marketKey: string,
  seen: number | null
): number | null {
  const known = lastOrders.get(marketKey) ?? null
  if (known === null) return seen
  if (seen === null) return known
  return Math.max(known, seen)
}
