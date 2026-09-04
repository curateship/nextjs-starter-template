import { sql } from "drizzle-orm"

import {
  marketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { historySourceFor } from "@/lib/protocols/history-source"
import { db } from "@/server/db"
import { tradeCandles } from "@/server/trade/schema"

/**
 * One-minute bars built from prices as the app watches them.
 *
 * **For markets with nothing to borrow, and only those.** A venue that
 * publishes no candles gets its chart from a source where one exists — SOL
 * borrows Binance's — and those markets are skipped here: recording a second,
 * worse copy of a chart the store already holds would waste rows and invite
 * two answers to one question. What is left is the long tail, the coins no
 * other venue lists, which have no history anywhere and can only grow one.
 *
 * **The bars are honest about being thin.** Volume is zero because a price
 * carries none, and a minute nobody was watching has no bar at all rather
 * than a flat line pretending the price held. `charts/candle-store.md`
 * records both, so a gap is read as a gap.
 *
 * One statement per turn, however many markets: the store already holds
 * millions of rows and this runs while a page is open.
 */
export async function recordMinuteBars(
  protocol: ProtocolId,
  network: NetworkId,
  prices: ReadonlyArray<readonly [string, number]>,
  now = Date.now()
): Promise<number> {
  const openTime = Math.floor(now / 60_000) * 60_000
  const rows = []
  for (const [marketId, price] of prices) {
    if (!(price > 0) || !Number.isFinite(price)) continue
    const key = marketKey({ protocol, network, marketId })
    // A market that can borrow a real chart never records a thinner one.
    if (historySourceFor(key) !== null) continue
    rows.push({
      marketKey: key,
      interval: "1m" as const,
      openTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    })
  }
  if (rows.length === 0) return 0

  await db
    .insert(tradeCandles)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        tradeCandles.marketKey,
        tradeCandles.interval,
        tradeCandles.openTime,
      ],
      // The minute's first price opened it and every later one closes it,
      // stretching the high and low as it goes. `excluded` is the row this
      // statement tried to insert, which is the price that just arrived.
      set: {
        high: sql`greatest(${tradeCandles.high}, excluded.high)`,
        low: sql`least(${tradeCandles.low}, excluded.low)`,
        close: sql`excluded.close`,
      },
    })
  return rows.length
}
