import { eq } from "drizzle-orm"

import {
  ANTI_DETECT_PAGE_BLOCK_TYPES,
  ANTI_DETECT_PAGE_ERRORS,
  ANTI_DETECT_WIDGET_IDS,
  DEFAULT_ANTI_DETECT_WIDGETS,
  defaultAntiDetectPage,
  withAntiDetectSectionsBlock,
} from "@/lib/anti-detect/page"
import { ANTI_DETECT_LIST_SECTIONS, type AntiDetectListSection } from "@/lib/anti-detect/search"
import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { promoAntiDetectPages } from "@/server/social/schema"

/**
 * The Anti Detect dashboard's own records (Tyler, 12 Nov 2026): each
 * person's left page and Overview layout, the same as the Projects
 * dashboard's (`src/server/social/projects-dashboard.ts`). Every read and
 * write is the signed-in person's own row.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Dashboards block always kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, ANTI_DETECT_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withAntiDetectSectionsBlock(JSON.parse(stored)))
}

async function pageRow(userId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database.select().from(promoAntiDetectPages).where(eq(promoAntiDetectPages.userId, userId)).limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultAntiDetectPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

/** The Dashboards block's sections left out, and the order they were dragged into. Overview is never in either. */
export type AntiDetectSections = { hidden: AntiDetectListSection[]; order: AntiDetectListSection[] }

async function upsertPage(
  userId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: AntiDetectSections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(promoAntiDetectPages)
    .values({ userId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: promoAntiDetectPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveAntiDetectPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(ANTI_DETECT_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(userId, database))
  if (page.locked) throw new Error(ANTI_DETECT_PAGE_ERRORS.locked)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setAntiDetectPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

export async function setAntiDetectPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, cover, database)
}

function readSections(value: unknown): AntiDetectListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is AntiDetectListSection =>
        (ANTI_DETECT_LIST_SECTIONS as readonly unknown[]).includes(section)
      )
    ),
  ]
}

/** The page and the Dashboards block's sections from one read of the person's row, as the dashboard opens. */
export async function getAntiDetectPageAndSections(userId: string, database: Pick<CustomShellDb, "select"> = db) {
  const row = await pageRow(userId, database)
  return {
    page: pageOf(row),
    sections: { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) },
  }
}

export async function saveAntiDetectSections(userId: string, sections: AntiDetectSections, database: CustomShellDb = db) {
  await upsertPage(userId, { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } }, database)
}

/** Overview's layout as stored, or the starting one. */
export async function getAntiDetectWidgets(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<WidgetLayout> {
  const row = await pageRow(userId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_ANTI_DETECT_WIDGETS, ANTI_DETECT_WIDGET_IDS, DEFAULT_ANTI_DETECT_WIDGETS)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveAntiDetectWidgets(userId: string, layout: unknown, database: CustomShellDb = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, ANTI_DETECT_WIDGET_IDS, DEFAULT_ANTI_DETECT_WIDGETS)
  await upsertPage(userId, { widgets: cleaned }, database)
  return cleaned
}
