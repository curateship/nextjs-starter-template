import { and, asc, eq, gte } from "drizzle-orm"

import type { LiveFill } from "@/lib/trade/live-trades"
import { db } from "@/server/trade/db"
import { stampFillOwners } from "@/server/trade/fill-owners"
import { stampGridFills } from "@/server/trade/grid-fills"
import { liveFillFromRow } from "@/server/trade/live-fills"
import { stampFillAims } from "@/server/trade/order-aims"
import { toTradeFill } from "@/server/trade/paper"
import { tradeLiveFills, tradePaperJournal } from "@/server/trade/schema"

/**
 * The most fills one coin's history is read with. A grid that recycles every
 * few minutes makes a few hundred a week, so this is a year of a busy grid;
 * past it the answer says so rather than passing off a short list as whole.
 */
export const COIN_FILLS_LIMIT = 20_000

/**
 * Every fill on one wallet's coin since `since`, oldest first, stamped as the
 * Journal's are: grid levels, aims, and who placed each one.
 *
 * The page itself only holds the newest few thousand fills across every
 * wallet, so a grid that has been running for weeks has sales older than any
 * of them. The details panel asks for this when a grid or a ladder opens in
 * it, so "every sale" really is every sale (Tyler, 10 Nov 2026: "a grid trade
 * will show all the grid sales").
 */
export async function loadCoinFills(
  userId: string,
  wallet: { id: string; kind: "live" | "paper" },
  marketKey: string,
  since: number
): Promise<{ fills: LiveFill[]; capped: boolean }> {
  const walletIds = [wallet.id]
  let fills: LiveFill[]
  if (wallet.kind === "live") {
    const rows = await db
      .select()
      .from(tradeLiveFills)
      .where(
        and(
          eq(tradeLiveFills.userId, userId),
          eq(tradeLiveFills.walletId, wallet.id),
          eq(tradeLiveFills.marketKey, marketKey),
          eq(tradeLiveFills.hidden, false),
          gte(tradeLiveFills.at, since)
        )
      )
      .orderBy(asc(tradeLiveFills.at))
      .limit(COIN_FILLS_LIMIT + 1)
    fills = rows.slice(0, COIN_FILLS_LIMIT).map(liveFillFromRow)
    fills = await stampGridFills(userId, walletIds, fills)
    await stampFillAims(userId, walletIds, fills)
    return { fills: await stampFillOwners(userId, walletIds, fills), capped: rows.length > COIN_FILLS_LIMIT }
  }
  const rows = await db
    .select()
    .from(tradePaperJournal)
    .where(
      and(
        eq(tradePaperJournal.userId, userId),
        eq(tradePaperJournal.walletId, wallet.id),
        eq(tradePaperJournal.marketKey, marketKey),
        eq(tradePaperJournal.hidden, false),
        gte(tradePaperJournal.fillTime, new Date(since))
      )
    )
    .orderBy(asc(tradePaperJournal.fillTime))
    .limit(COIN_FILLS_LIMIT + 1)
  fills = rows.slice(0, COIN_FILLS_LIMIT).map(toTradeFill)
  fills = await stampGridFills(userId, walletIds, fills)
  return { fills: await stampFillOwners(userId, walletIds, fills), capped: rows.length > COIN_FILLS_LIMIT }
}
