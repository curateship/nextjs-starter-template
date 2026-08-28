import { and, eq, inArray } from "drizzle-orm"

import type { LiveFill } from "@/lib/trade/live-trades"
import { db } from "@/server/db"
import { tradeSmartLadders } from "@/server/trade/schema"

/**
 * Marks the fills a grid level made, so the chart can say what that level made.
 *
 * **Why the fill has to be told and cannot work it out.** An exchange reports a
 * fill and nothing else: a coin, a price, a size and what it booked. Whether a
 * grid or a ladder sent it is something only this app knows, and it matters,
 * because the two want different money written on the same sell. A ladder's
 * part-close is a share of one blended position and the exchange's own figure
 * is right for it. A grid's sell is one level closing the coins that same level
 * bought, and the exchange's figure is wrong for it every time. `gridRoundTrips`
 * in `live-trades.ts` has the arithmetic and the case it was found on.
 *
 * **Matched on when, not just on which coin.** A market can carry a ladder one
 * week and a grid the next, and the fills sit in one table together. So each
 * grid row is read as a span — from when it was placed, until it flipped to
 * done — and only a fill inside a span is a grid's. A grid still working has no
 * end to its span yet.
 *
 * Done rows are read as well as working ones, deliberately. They are kept for
 * the record, and without them every finished grid's arrows would quietly go
 * back to the exchange's figures the moment the grid closed, so the same sell
 * would be worth two different amounts depending on when you looked at it.
 */
export async function stampGridFills(
  userId: string,
  walletIds: readonly string[],
  fills: LiveFill[]
): Promise<LiveFill[]> {
  if (walletIds.length === 0 || fills.length === 0) return fills
  const marketKeys = [...new Set(fills.map((fill) => fill.marketKey))]

  const rows = await db
    .select({
      walletId: tradeSmartLadders.walletId,
      marketKey: tradeSmartLadders.marketKey,
      status: tradeSmartLadders.status,
      createdAt: tradeSmartLadders.createdAt,
      updatedAt: tradeSmartLadders.updatedAt,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        inArray(tradeSmartLadders.walletId, [...walletIds]),
        inArray(tradeSmartLadders.marketKey, marketKeys),
        eq(tradeSmartLadders.kind, "grid")
      )
    )
  if (rows.length === 0) return fills

  const spans = new Map<string, { from: number; to: number }[]>()
  for (const row of rows) {
    const key = `${row.walletId} ${row.marketKey}`
    const list = spans.get(key)
    const span = {
      from: row.createdAt.getTime(),
      // A grid still working has not finished, so its span has no end. A
      // finished one ends when it was written down as finished, which is
      // always after its last fill.
      to: row.status === "done" ? row.updatedAt.getTime() : Infinity,
    }
    if (list) list.push(span)
    else spans.set(key, [span])
  }

  return fills.map((fill) => {
    const list = spans.get(`${fill.walletId} ${fill.marketKey}`)
    if (!list) return fill
    const inside = list.some(
      (span) => fill.at >= span.from && fill.at <= span.to
    )
    return inside ? { ...fill, grid: true } : fill
  })
}
