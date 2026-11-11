import { eq } from "drizzle-orm"

import {
  automationPageBlockTypes,
  defaultAutomationPage,
  withAutomationSectionsBlock,
} from "@/lib/automations/automation-page"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAutomationPages } from "@/server/schema"

/**
 * The Automations dashboard's left page, one per site: what is written on
 * it, its cover photo, and its lock. Locked, a page reads only, and a save is
 * refused here as well as on screen. Built as the Admin page is
 * (`server/admin-dashboard/page.ts`).
 */

export const AUTOMATION_PAGE_LOCKED = "AUTOMATION_PAGE_LOCKED"
export const AUTOMATION_PAGE_TOO_LONG = "AUTOMATION_PAGE_TOO_LONG"

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page's words cleaned to what it may hold, its Dashboards block kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, automationPageBlockTypes()) || EMPTY_PAGE
  return JSON.stringify(withAutomationSectionsBlock(JSON.parse(stored)))
}

export async function getAutomationPage(workspaceId: string, database: CustomShellDb = db): Promise<StoredPage> {
  const [row] = await database
    .select()
    .from(customShellAutomationPages)
    .where(eq(customShellAutomationPages.workspaceId, workspaceId))
    .limit(1)
  // Only a page never saved starts with its first blocks.
  const body = row?.body ? cleanPage(row.body) : JSON.stringify(defaultAutomationPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  workspaceId: string,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null; coverImages: string[] }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(customShellAutomationPages)
    .values({ workspaceId, body: "", locked: false, coverUrl: null, ...values, updatedAt: at })
    .onConflictDoUpdate({
      target: customShellAutomationPages.workspaceId,
      set: { ...values, updatedAt: at },
    })
}

/** Saves what is written, cleaned first. Refused while the page is locked. */
export async function saveAutomationPageBody(workspaceId: string, body: string, database: CustomShellDb = db) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(AUTOMATION_PAGE_TOO_LONG)
  const page = await getAutomationPage(workspaceId, database)
  if (page.locked) throw new Error(AUTOMATION_PAGE_LOCKED)
  await upsertPage(workspaceId, { body: cleanPage(body) }, database)
}

export async function setAutomationPageLock(workspaceId: string, locked: boolean, database: CustomShellDb = db) {
  await upsertPage(workspaceId, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setAutomationPageCover(
  workspaceId: string,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, cover, database)
}
