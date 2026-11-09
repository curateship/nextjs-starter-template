import { eq } from "drizzle-orm"

import { readCoverImages } from "@/lib/notes/page-cover"
import { openedPageBody, storedTradePage, type TradePage } from "@/lib/trade/trade-pages"
import { db, type CustomShellDb } from "@/server/db"
import { tradeDashboardPages } from "@/server/trade/schema"

/**
 * The Trade dashboard's left page (8 Nov 2026), one per person and read and
 * written only by its owner. It is the same page whichever exchange is
 * picked; its blocks follow the exchange.
 */

export const PAGE_LOCKED_MESSAGE =
  "This page is locked. Unlock the notes to change it."

/**
 * The page, or a `null` body when it was never written, so the starting page
 * shows. A written page always comes back holding its Protocols block, the
 * way Admin's page always holds its Dashboards block.
 */
export async function loadTradePage(
  userId: string,
  database: CustomShellDb = db
): Promise<{ body: string | null; locked: boolean; coverUrl: string | null; coverImages: string[] }> {
  const [row] = await database
    .select({
      body: tradeDashboardPages.body,
      locked: tradeDashboardPages.locked,
      coverUrl: tradeDashboardPages.coverUrl,
      coverImages: tradeDashboardPages.coverImages,
    })
    .from(tradeDashboardPages)
    .where(eq(tradeDashboardPages.userId, userId))
    .limit(1)
  return row
    ? {
        body: openedPageBody(row.body),
        locked: row.locked,
        coverUrl: row.coverUrl,
        coverImages: readCoverImages(row.coverImages),
      }
    : { body: null, locked: false, coverUrl: null, coverImages: [] }
}

/**
 * Saves the page's words, cleaned again here so nothing the editor would not
 * keep is ever stored. A locked page refuses, so a second browser that still
 * shows it unlocked cannot change it.
 */
export async function saveTradePage(
  userId: string,
  text: string,
  database: CustomShellDb = db
): Promise<Pick<TradePage, "body" | "locked">> {
  const body = storedTradePage(text)
  return database.transaction(async (tx) => {
    const [row] = await tx
      .select({ locked: tradeDashboardPages.locked })
      .from(tradeDashboardPages)
      .where(eq(tradeDashboardPages.userId, userId))
      .for("update")
    if (row?.locked) throw new Error(PAGE_LOCKED_MESSAGE)
    await tx
      .insert(tradeDashboardPages)
      .values({ userId, body })
      .onConflictDoUpdate({
        target: tradeDashboardPages.userId,
        set: { body, updatedAt: new Date() },
      })
    return { body: openedPageBody(body), locked: false }
  })
}

/**
 * Locks or unlocks the page. A page that was never written has no row, so
 * locking it saves what it shows (`shownBody`, the starting page) with the
 * lock. A page that has a row keeps its words as they are.
 */
export async function setTradePageLocked(
  userId: string,
  locked: boolean,
  shownBody: string,
  database: CustomShellDb = db
) {
  const body = storedTradePage(shownBody)
  await database
    .insert(tradeDashboardPages)
    .values({ userId, body, locked })
    .onConflictDoUpdate({
      target: tradeDashboardPages.userId,
      set: { locked, updatedAt: new Date() },
    })
  return { locked }
}

/**
 * Sets the page's cover (none, the sky, or a picture) and its own pictures
 * together, as the shell's pages do. A page that was never written has no
 * row, so the first cover saves what the page shows with it, as the lock does.
 */
export async function setTradePageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  shownBody: string,
  database: CustomShellDb = db
) {
  const body = storedTradePage(shownBody)
  const coverImages = readCoverImages(cover.coverImages)
  await database
    .insert(tradeDashboardPages)
    .values({ userId, body, coverUrl: cover.coverUrl, coverImages })
    .onConflictDoUpdate({
      target: tradeDashboardPages.userId,
      set: { coverUrl: cover.coverUrl, coverImages, updatedAt: new Date() },
    })
  return { coverUrl: cover.coverUrl, coverImages }
}
