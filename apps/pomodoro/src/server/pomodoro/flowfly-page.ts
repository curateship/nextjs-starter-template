import { eq } from "drizzle-orm"

import { cleanWidgetLayout, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import {
  DEFAULT_FLOWFLY_WIDGETS,
  defaultFlowflyPage,
  FLOWFLY_PAGE_BLOCK_TYPES,
  FLOWFLY_PAGE_ERRORS,
  FLOWFLY_WIDGET_IDS,
  withFlowflySectionsBlock,
} from "@/lib/pomodoro/flowfly-page"
import { FLOWFLY_LIST_SECTIONS, type FlowflyListSection } from "@/lib/pomodoro/flowfly-search"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { pomodoroAdminPages } from "@/server/pomodoro/schema"

/**
 * The Flowfly admin dashboard's own records (Tyler, 13 Nov 2026): each
 * admin's left page and Overview layout, copied from Promo's Anti Detect
 * dashboard (`apps/promo/src/server/anti-detect/page.ts`). Every read and
 * write is the signed-in admin's own row.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Dashboards block always kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, FLOWFLY_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withFlowflySectionsBlock(JSON.parse(stored)))
}

async function pageRow(userId: string, database: Pick<CustomShellDb, "select">) {
  const [row] = await database.select().from(pomodoroAdminPages).where(eq(pomodoroAdminPages.userId, userId)).limit(1)
  return row
}

function pageOf(row: Awaited<ReturnType<typeof pageRow>>): StoredPage {
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultFlowflyPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

/** The Dashboards block's sections left out, and the order they were dragged into. Overview is never in either. */
export type FlowflySections = { hidden: FlowflyListSection[]; order: FlowflyListSection[] }

async function upsertPage(
  userId: string,
  values: Partial<{
    body: string
    locked: boolean
    coverUrl: string | null
    coverImages: string[]
    widgets: WidgetLayout
    sections: FlowflySections
  }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(pomodoroAdminPages)
    .values({ userId, body: "", locked: false, coverUrl: null, coverImages: [], sections: {}, ...values, updatedAt: at })
    .onConflictDoUpdate({ target: pomodoroAdminPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveFlowflyPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(FLOWFLY_PAGE_ERRORS.tooLong)
  const page = pageOf(await pageRow(userId, database))
  if (page.locked) throw new Error(FLOWFLY_PAGE_ERRORS.locked)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setFlowflyPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

export async function setFlowflyPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, cover, database)
}

function readSections(value: unknown): FlowflyListSection[] {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value.filter((section): section is FlowflyListSection => (FLOWFLY_LIST_SECTIONS as readonly unknown[]).includes(section))
    ),
  ]
}

/** The page and the Dashboards block's sections from one read of the admin's row, as the dashboard opens. */
export async function getFlowflyPageAndSections(userId: string, database: Pick<CustomShellDb, "select"> = db) {
  const row = await pageRow(userId, database)
  return {
    page: pageOf(row),
    sections: { hidden: readSections(row?.sections.hidden), order: readSections(row?.sections.order) },
  }
}

export async function saveFlowflySections(userId: string, sections: FlowflySections, database: CustomShellDb = db) {
  await upsertPage(userId, { sections: { hidden: readSections(sections.hidden), order: readSections(sections.order) } }, database)
}

/** Overview's layout as stored, or the starting one. */
export async function getFlowflyWidgets(userId: string, database: Pick<CustomShellDb, "select"> = db): Promise<WidgetLayout> {
  const row = await pageRow(userId, database)
  return cleanWidgetLayout(row?.widgets ?? DEFAULT_FLOWFLY_WIDGETS, FLOWFLY_WIDGET_IDS, DEFAULT_FLOWFLY_WIDGETS)
}

/** Saves Overview's layout, cleaned, and answers with it as stored. */
export async function saveFlowflyWidgets(userId: string, layout: unknown, database: CustomShellDb = db): Promise<WidgetLayout> {
  const cleaned = cleanWidgetLayout(layout, FLOWFLY_WIDGET_IDS, DEFAULT_FLOWFLY_WIDGETS)
  await upsertPage(userId, { widgets: cleaned }, database)
  return cleaned
}
