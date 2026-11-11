import { gridRoundTrips, type LiveFill, type LiveTrade } from "@/lib/trade/live-trades"
import type { SmartOrder } from "@/lib/trade/smart-plan"

/** One sale a grid or a ladder made. */
export type SmartOrderSale = {
  fillId: string
  at: number
  /** Gross dollars bought or sold by the closing fill. */
  amountUsd: number
  /** Null when the venue sold but never said what the sale banked. */
  money: number | null
  /** The price it sold at, and how many coins. */
  px: number
  sz: number
  /** The grid level that sold, by its own name, where the fill names one. */
  level: string | null
}

/**
 * Every sale one smart order has made, newest first, with their total.
 *
 * **Read off the fills, not off the plan.** A grid's levels say what they were
 * set to do; the fills say what happened, in the exchange's own figures, fee
 * included. Every closing fill on this coin since the order was placed counts:
 * there is one smart order per coin per wallet, so on this coin, over this
 * stretch of time, they are its sales.
 *
 * Finished round trips are counted too, for the kinds that do go flat. A grid
 * rarely does, which is exactly why its sells sit in the open fills instead.
 *
 * **A sell is a sale even when the venue states no profit for it.** KuCoin
 * reports money per POSITION closed, not per fill, and a grid selling a fifth
 * of what it holds never closes a position. A grid and a ladder are both long
 * only, so a sell on their coin is a sale, whoever is keeping the books.
 *
 * What the venue would not state is left NULL rather than counted as zero.
 * Zero is a real answer, meaning the sale broke even.
 *
 * **A grid's sale is worth what its own level made.** The venue books every
 * partial sell against the position average, and while a grid is working that
 * average is held up by the expensive levels still holding, so a level that
 * did its job reads as a loss. `gridRoundTrips` has the arithmetic.
 *
 * `trades` are finished round trips whose fills are not in `fills`. The Grid
 * block's popover passes the page's open fills and finished trades and lists
 * the newest twelve (`bankedBy`); the details panel passes every fill read
 * for the coin, with no trades, and lists them all.
 */
export function smartOrderSales(
  order: SmartOrder,
  fills: readonly LiveFill[],
  trades: readonly LiveTrade[]
): { sells: SmartOrderSale[]; total: number; unpriced: number } {
  const mine = (walletId: string, marketKey: string, at: number) =>
    walletId === order.walletId &&
    marketKey === order.marketKey &&
    at >= order.createdAt

  // Over every fill, not only this order's: a level's round trip is paid out
  // of the trade that level opened with, and that trade has to still be in the
  // list for the closing one to be worth anything.
  const levels = gridRoundTrips(
    fills,
    order.kind === "grid" ? order.plan.direction : "long"
  )

  const sales: SmartOrderSale[] = []
  for (const fill of fills) {
    if (!mine(fill.walletId, fill.marketKey, fill.at)) continue
    const level = levels.get(fill.fillId)
    // A stated profit, or a sell out of a long-only order. The first also
    // catches a short being bought back, which the second cannot see.
    const stated = fill.closedPnl !== 0
    if (!level && !stated && fill.side !== "sell") continue
    sales.push({
      fillId: fill.fillId,
      at: fill.at,
      amountUsd: Math.abs(fill.px * fill.sz),
      money: level ? level.money : stated ? fill.closedPnl - fill.fee : null,
      px: fill.px,
      sz: fill.sz,
      level: level?.name ?? (level?.rung ? `Rung ${level.rung}` : null),
    })
  }
  for (const trade of trades) {
    if (!mine(trade.walletId, trade.marketKey, trade.closedAt)) continue
    sales.push({
      fillId: trade.id,
      at: trade.closedAt,
      amountUsd: Math.abs(trade.exitPx * trade.sz),
      money: trade.pnl,
      px: trade.exitPx,
      sz: trade.sz,
      level: null,
    })
  }

  sales.sort((left, right) => right.at - left.at)
  return {
    sells: sales,
    total: sales.reduce((sum, sale) => sum + (sale.money ?? 0), 0),
    unpriced: sales.filter((sale) => sale.money === null).length,
  }
}
