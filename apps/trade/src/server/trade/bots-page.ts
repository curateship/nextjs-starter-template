import { eq } from "drizzle-orm"

import {
  BOTS_PAGE_BLOCK_TYPES,
  BOTS_PAGE_LOCKED,
  BOTS_PAGE_TOO_LONG,
  defaultBotsPage,
  withBotsSectionsBlock,
} from "@/lib/bots/bots-page"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { db, type CustomShellDb } from "@/server/db"
import { tradeBotsPages } from "@/server/trade/schema"

/**
 * The Bots dashboard's left page (9 Nov 2026), one per person, read and
 * written only by its owner. Locked, it reads only, and a save is refused
 * here as well as on screen.
 */

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/**
 * A page's words cleaned to what it may hold, always keeping its Dashboards
 * block, the only way between the sections.
 */
function cleanPage(text: string) {
  const stored = storedPageBody(text, BOTS_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withBotsSectionsBlock(JSON.parse(stored)))
}

export async function getBotsPage(userId: string, database: CustomShellDb = db): Promise<StoredPage> {
  const [row] = await database.select().from(tradeBotsPages).where(eq(tradeBotsPages.userId, userId)).limit(1)
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultBotsPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  userId: string,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null; coverImages: string[] }>,
  database: CustomShellDb
) {
  const at = new Date()
  await database
    .insert(tradeBotsPages)
    .values({ userId, body: "", locked: false, coverUrl: null, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: tradeBotsPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first by the same rule the editor ran. */
export async function saveBotsPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(BOTS_PAGE_TOO_LONG)
  const page = await getBotsPage(userId, database)
  if (page.locked) throw new Error(BOTS_PAGE_LOCKED)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setBotsPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setBotsPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, { coverUrl: cover.coverUrl, coverImages: readCoverImages(cover.coverImages) }, database)
}
