import { eq } from "drizzle-orm"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  datingPageBlockTypes,
  defaultDatingPage,
  readDatingWidgetLayout,
  readSectionList,
  withDatingSectionsBlock,
  type DatingSections,
} from "@/lib/dating/dating-page"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { DatingAccount } from "@/server/dating/accounts"
import { datePages } from "@/server/dating/schema"

/**
 * The Dating dashboard's left page, one per profile (task
 * "features/07-three-panel-design"): what is written on it, its cover photo,
 * its lock, and Overview's widget layout. Built as the shell's Automations
 * page is (`server/automations/page.ts`). Every function takes the profile
 * the server already picked for the member (`requestAccount`), so a page is
 * only ever read or written by its owner.
 */

export const DATING_PAGE_LOCKED = "The page is locked. Unlock it in the ⋮ to write on it."
export const DATING_PAGE_TOO_LONG = "The page is too long to save. Take something off it."

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page's words cleaned to what it may hold, its Dashboards block kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, datingPageBlockTypes()) || EMPTY_PAGE
  return JSON.stringify(withDatingSectionsBlock(JSON.parse(stored)))
}

async function readRow(accountId: string, db: CustomShellDb) {
  const [row] = await db.select().from(datePages).where(eq(datePages.accountId, accountId)).limit(1)
  return row ?? null
}

export async function getDatingPage(account: DatingAccount, db: CustomShellDb = defaultDb): Promise<StoredPage> {
  const row = await readRow(account.id, db)
  // Only a page never saved starts with its first blocks.
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultDatingPage(account.app))
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  accountId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    hiddenSections: string[]
    sectionOrder: string[]
  }>,
  db: CustomShellDb,
  now: Date
) {
  await db
    .insert(datePages)
    .values({ accountId, body: "", locked: false, coverUrl: null, ...values, updatedAt: now })
    .onConflictDoUpdate({ target: datePages.accountId, set: { ...values, updatedAt: now } })
}

/** Saves what is written, cleaned first. Refused while the page is locked. */
export async function saveDatingPageBody(account: DatingAccount, body: string, db: CustomShellDb = defaultDb, now: Date = new Date()) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(DATING_PAGE_TOO_LONG)
  const row = await readRow(account.id, db)
  if (row?.locked) throw new Error(DATING_PAGE_LOCKED)
  await upsertPage(account.id, { body: cleanPage(body) }, db, now)
}

export async function setDatingPageLock(account: DatingAccount, locked: boolean, db: CustomShellDb = defaultDb, now: Date = new Date()) {
  await upsertPage(account.id, { locked }, db, now)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setDatingPageCover(
  account: DatingAccount,
  cover: { coverUrl: string | null; coverImages: string[] },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
) {
  await upsertPage(account.id, cover, db, now)
}

/** Overview's layout; a profile that never changed it has the starting widgets. */
export async function getDatingWidgets(account: DatingAccount, db: CustomShellDb = defaultDb): Promise<WidgetLayout> {
  const row = await readRow(account.id, db)
  return readDatingWidgetLayout(row?.widgets)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveDatingWidgets(
  account: DatingAccount,
  layout: unknown,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<WidgetLayout> {
  const widgets = readDatingWidgetLayout(layout)
  await upsertPage(account.id, { widgets }, db, now)
  return widgets
}

/** The Dashboards block's hidden rows and their order. */
export async function getDatingSections(account: DatingAccount, db: CustomShellDb = defaultDb): Promise<DatingSections> {
  const row = await readRow(account.id, db)
  return { hidden: readSectionList(row?.hiddenSections), order: readSectionList(row?.sectionOrder) }
}

/** Saves which rows the Dashboards block hides, cleaned, and answers with them. */
export async function saveDatingHiddenSections(account: DatingAccount, hidden: unknown, db: CustomShellDb = defaultDb, now: Date = new Date()) {
  const hiddenSections = readSectionList(hidden)
  await upsertPage(account.id, { hiddenSections }, db, now)
  return hiddenSections
}

/** Saves the Dashboards block's dragged order, cleaned, and answers with it. */
export async function saveDatingSectionOrder(account: DatingAccount, order: unknown, db: CustomShellDb = defaultDb, now: Date = new Date()) {
  const sectionOrder = readSectionList(order)
  await upsertPage(account.id, { sectionOrder }, db, now)
  return sectionOrder
}
