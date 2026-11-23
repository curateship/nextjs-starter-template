import { eq } from "drizzle-orm"

import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import type { FlowTab } from "@/lib/video/flow/flow-search"
import {
  cleanFlowSections,
  defaultFlowPage,
  flowPageBlockTypes,
  withFlowSectionsBlock,
} from "@/lib/video/flow/flow-page"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoFlowPages } from "@/server/video/schema"

/**
 * The Flow dashboard's left page, one per person: what is written on it, its
 * cover photo, its lock, and the Dashboards block's hidden rows and their
 * order. Locked, a page reads only, and a save is refused here as well as
 * on screen. Built as Automations' page is (`server/automations/page.ts`).
 */

export const FLOW_PAGE_LOCKED = "FLOW_PAGE_LOCKED"
export const FLOW_PAGE_TOO_LONG = "FLOW_PAGE_TOO_LONG"

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page's words cleaned to what it may hold, its Dashboards block kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, flowPageBlockTypes()) || EMPTY_PAGE
  return JSON.stringify(withFlowSectionsBlock(JSON.parse(stored)))
}

export type FlowPage = StoredPage & { hiddenSections: FlowTab[]; sectionOrder: FlowTab[] }

export async function getFlowPage(userId: string, database: CustomShellDb = db): Promise<FlowPage> {
  const [row] = await database.select().from(videoFlowPages).where(eq(videoFlowPages.userId, userId)).limit(1)
  // Only a page never saved starts with its first blocks.
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultFlowPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
    hiddenSections: cleanFlowSections(row?.hiddenSections),
    sectionOrder: cleanFlowSections(row?.sectionOrder),
  }
}

type PageValues = Partial<{
  body: string
  locked: boolean
  coverUrl: string | null
  coverImages: string[]
  hiddenSections: string[]
  sectionOrder: string[]
}>

async function upsertPage(userId: string, values: PageValues, database: CustomShellDb) {
  const at = now()
  await database
    .insert(videoFlowPages)
    .values({ userId, body: "", ...values, updatedAt: at })
    .onConflictDoUpdate({ target: videoFlowPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. Refused while the page is locked. */
export async function saveFlowPageBody(userId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(FLOW_PAGE_TOO_LONG)
  const page = await getFlowPage(userId, database)
  if (page.locked) throw new Error(FLOW_PAGE_LOCKED)
  await upsertPage(userId, { body: cleanPage(body) }, database)
}

export async function setFlowPageLock(userId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(userId, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setFlowPageCover(
  userId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(userId, cover, database)
}

/** The Dashboards block's rows hidden in its ⋮, and the order they were dragged into. */
export async function setFlowPageSections(
  userId: string,
  sections: { hiddenSections?: string[]; sectionOrder?: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(
    userId,
    {
      ...(sections.hiddenSections ? { hiddenSections: cleanFlowSections(sections.hiddenSections) } : {}),
      ...(sections.sectionOrder ? { sectionOrder: cleanFlowSections(sections.sectionOrder) } : {}),
    },
    database
  )
}
