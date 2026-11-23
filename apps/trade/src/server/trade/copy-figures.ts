import { and, count, eq, gte, sql } from "drizzle-orm"

import {
  SOLD_INTO_COPIERS_MS,
  type PublicCopyFigures,
} from "@/lib/trade/copy/copy-rules"
import { db } from "@/server/trade/db"
import {
  tradeCopies,
  tradeCopyFills,
  tradeFollows,
  tradeRecordFills,
} from "@/server/trade/schema"

const DAY_MS = 86_400_000

/**
 * What a public profile says about copying, all of it added up from rows:
 * the fee record for what copiers made, and the trader's permanent record for
 * when they sold. Nothing is typed in and nothing is remembered.
 *
 * **"People copying Sam made or lost" counts real wallets only.** A practice
 * copy moves no price and risks no money, so it cannot show the one thing
 * this figure is for: a trader who pumps a coin and sells into their copiers
 * shows up here as copiers losing.
 */
export async function loadPublicCopyFigures(
  traderUserId: string,
  copyable: boolean,
  now = Date.now()
): Promise<PublicCopyFigures> {
  const since = now - 30 * DAY_MS
  const [[followers], [copiers], [made], [sales]] = await Promise.all([
    db
      .select({ n: count() })
      .from(tradeFollows)
      .where(eq(tradeFollows.traderUserId, traderUserId)),
    db
      .select({ n: count() })
      .from(tradeCopies)
      .where(
        and(
          eq(tradeCopies.traderUserId, traderUserId),
          eq(tradeCopies.status, "active")
        )
      ),
    db
      .select({
        money: sql<number>`coalesce(sum(${tradeCopyFills.closedPnl} - ${tradeCopyFills.exchangeFee} - ${tradeCopyFills.feeUsd}), 0)`,
        fills: count(),
      })
      .from(tradeCopyFills)
      .where(
        and(
          eq(tradeCopyFills.traderUserId, traderUserId),
          eq(tradeCopyFills.real, true),
          gte(tradeCopyFills.at, since)
        )
      ),
    // A sale is an order that closed something. It came "soon after copiers
    // bought" when a real copier's opening fill on the same market landed in
    // the five minutes before one of its fills.
    db
      .select({
        // One sale is one order, however many fills it took.
        sales: sql<number>`count(distinct "trade_record_fills"."order_id")`,
        // Written out by hand with the outer table named on every column:
        // drizzle leaves the table off a column inside a raw fragment in the
        // select list, and "market_key" would then match the inner table's
        // own column and be true for every row.
        soldInto: sql<number>`count(distinct "trade_record_fills"."order_id") filter (where exists (
          select 1 from "trade_copy_fills" bought
          where bought."trader_user_id" = "trade_record_fills"."user_id"
            and bought."real"
            and bought."closed_pnl" = 0
            and bought."market_key" = "trade_record_fills"."market_key"
            and bought."at" between "trade_record_fills"."at" - ${SOLD_INTO_COPIERS_MS} and "trade_record_fills"."at"
        ))`,
      })
      .from(tradeRecordFills)
      .where(
        and(
          eq(tradeRecordFills.userId, traderUserId),
          gte(tradeRecordFills.at, since),
          sql`${tradeRecordFills.dir} like 'Close%'`
        )
      ),
  ])
  return {
    copyable,
    followers: followers?.n ?? 0,
    copiers: copiers?.n ?? 0,
    copiersMade30d: Number(made?.money ?? 0),
    copiedTrades30d: made?.fills ?? 0,
    sales30d: Number(sales?.sales ?? 0),
    soldIntoCopiers30d: Number(sales?.soldInto ?? 0),
  }
}
