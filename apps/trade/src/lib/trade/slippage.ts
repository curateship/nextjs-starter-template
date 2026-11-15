import type { LiveFill } from "@/lib/trade/live-trades"

/**
 * Slippage: the price an order was first placed at against the price it
 * filled at, in dollars (Tyler, 10 Nov 2026: "Add a col for slippage on
 * position table and journal", then "aimed vs filled").
 *
 * **Signed as money made or lost.** A buy that filled above its aim, or a
 * sell that filled below it, cost money and comes out negative. A fill
 * better than its aim comes out positive. So the column reads the same way
 * as Made / lost beside it.
 *
 * **A dash, never a short number.** A fill with no aim (one from before aims
 * were recorded, or an order this app did not place) has no answer, and a
 * total over fills where only some have one would understate the cost. So
 * any missing aim makes the whole answer null, which the screen draws as a
 * dash.
 */

/** One fill's slippage over `sz` of it, or null when its aim is unknown. */
export function fillSlippage(fill: Pick<LiveFill, "side" | "px" | "aimedPx">, sz: number): number | null {
  const aimed = fill.aimedPx
  if (typeof aimed !== "number" || !Number.isFinite(aimed) || aimed <= 0) return null
  if (!Number.isFinite(fill.px) || fill.px <= 0) return null
  return (fill.side === "buy" ? aimed - fill.px : fill.px - aimed) * sz
}

/** Slippage over whole fills, or null when any of them has no aim. */
export function fillsSlippage(fills: readonly Pick<LiveFill, "side" | "px" | "sz" | "aimedPx">[]): number | null {
  if (fills.length === 0) return null
  let total = 0
  for (const fill of fills) {
    const one = fillSlippage(fill, fill.sz)
    if (one === null) return null
    total += one
  }
  return total
}
