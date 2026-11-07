import { and, eq } from "drizzle-orm"

import type { ProtocolId } from "@/lib/protocols/contracts"
import type { TradePageKind } from "@/lib/trade/note-blocks"
import {
  EXCHANGE_PAGE_MARKET,
  storedTradePage,
  type TradePage,
} from "@/lib/trade/trade-pages"
import { db, type CustomShellDb } from "@/server/db"
import { tradePages } from "@/server/trade/schema"

/**
 * The dashboard's two pages (the Admin 3 panel design, 7 Nov 2026), each
 * read and written only by its owner. `marketKey` "" is the exchange's own
 * page on the left; any other key is that market's page on the right.
 */

export const PAGE_LOCKED_MESSAGE =
  "This page is locked. Unlock the notes to change it."

function kindOf(marketKey: string): TradePageKind {
  return marketKey === EXCHANGE_PAGE_MARKET ? "exchange" : "market"
}

/** One page, or `null` body when it was never written, so the starting page shows. */
export async function loadTradePage(
  userId: string,
  protocol: ProtocolId,
  marketKey: string,
  database: CustomShellDb = db
): Promise<{ body: string | null; locked: boolean; coverUrl: string | null }> {
  const [row] = await database
    .select({
      body: tradePages.body,
      locked: tradePages.locked,
      coverUrl: tradePages.coverUrl,
    })
    .from(tradePages)
    .where(
      and(
        eq(tradePages.userId, userId),
        eq(tradePages.protocol, protocol),
        eq(tradePages.marketKey, marketKey)
      )
    )
    .limit(1)
  return row
    ? { body: row.body, locked: row.locked, coverUrl: row.coverUrl }
    : { body: null, locked: false, coverUrl: null }
}

/**
 * Saves the page's words, cleaned again here so nothing the editor would not
 * keep is ever stored. A locked page refuses, so a second browser that still
 * shows it unlocked cannot change it.
 */
export async function saveTradePage(
  userId: string,
  protocol: ProtocolId,
  marketKey: string,
  text: string,
  database: CustomShellDb = db
): Promise<Omit<TradePage, "coverUrl">> {
  const body = storedTradePage(text, kindOf(marketKey))
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({ locked: tradePages.locked })
      .from(tradePages)
      .where(
        and(
          eq(tradePages.userId, userId),
          eq(tradePages.protocol, protocol),
          eq(tradePages.marketKey, marketKey)
        )
      )
      .for("update")
    if (row?.locked) throw new Error(PAGE_LOCKED_MESSAGE)
    await tx
      .insert(tradePages)
      .values({ userId, protocol, marketKey, body })
      .onConflictDoUpdate({
        target: [tradePages.userId, tradePages.protocol, tradePages.marketKey],
        set: { body, updatedAt: new Date() },
      })
    return { body, locked: false }
  })
}

/**
 * Locks or unlocks the page. A page that was never written has no row, so
 * locking it saves what it shows (`shownBody`, the starting page) with the
 * lock. A page that has a row keeps its words as they are.
 */
export async function setTradePageLocked(
  userId: string,
  protocol: ProtocolId,
  marketKey: string,
  locked: boolean,
  shownBody: string,
  database: CustomShellDb = db
) {
  const body = storedTradePage(shownBody, kindOf(marketKey))
  await database
    .insert(tradePages)
    .values({ userId, protocol, marketKey, body, locked })
    .onConflictDoUpdate({
      target: [tradePages.userId, tradePages.protocol, tradePages.marketKey],
      set: { locked, updatedAt: new Date() },
    })
  return { locked }
}

/**
 * Sets or clears the page's cover photo. A page that was never written has no
 * row, so the first cover saves what the page shows with it, as the lock does.
 */
export async function setTradePageCover(
  userId: string,
  protocol: ProtocolId,
  marketKey: string,
  coverUrl: string | null,
  shownBody: string,
  database: CustomShellDb = db
) {
  const body = storedTradePage(shownBody, kindOf(marketKey))
  await database
    .insert(tradePages)
    .values({ userId, protocol, marketKey, body, coverUrl })
    .onConflictDoUpdate({
      target: [tradePages.userId, tradePages.protocol, tradePages.marketKey],
      set: { coverUrl, updatedAt: new Date() },
    })
  return { coverUrl }
}
