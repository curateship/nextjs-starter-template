import { and, eq } from "drizzle-orm"

import {
  adminPageBlockTypes,
  defaultAdminPage,
  withSectionsBlock,
  type AdminPageSide,
} from "@/lib/admin-dashboard/admin-page"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAdminPages } from "@/server/schema"

/**
 * The Admin dashboard's page, one per site: what is written on it,
 * its cover photo, and its lock. Locked, a page reads only, and a save is
 * refused here as well as on screen. Built as the CRM's page is
 * (`server/crm/page.ts`).
 */

export const ADMIN_PAGE_LOCKED = "ADMIN_PAGE_LOCKED"
export const ADMIN_PAGE_TOO_LONG = "ADMIN_PAGE_TOO_LONG"

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/**
 * A page's words cleaned to what it may hold. It always keeps its Dashboards
 * block, put back at the top if it is missing, since it is the only way
 * between the sections.
 */
function cleanPage(text: string) {
  const stored = storedPageBody(text, adminPageBlockTypes()) || EMPTY_PAGE
  return JSON.stringify(withSectionsBlock(JSON.parse(stored)))
}

export async function getAdminPage(
  workspaceId: string,
  side: AdminPageSide,
  database: CustomShellDb = db
): Promise<StoredPage> {
  const [row] = await database
    .select()
    .from(customShellAdminPages)
    .where(and(eq(customShellAdminPages.workspaceId, workspaceId), eq(customShellAdminPages.side, side)))
    .limit(1)
  // Only a page never saved starts with its first blocks. One saved with
  // everything taken off comes back empty, as it was left.
  const body = row?.body
    ? cleanPage(row.body)
    : JSON.stringify(defaultAdminPage())
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  workspaceId: string,
  side: AdminPageSide,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null; coverImages: string[] }>,
  database: CustomShellDb
) {
  const at = now()
  await database
    .insert(customShellAdminPages)
    .values({ workspaceId, side, body: "", locked: false, coverUrl: null, ...values, updatedAt: at })
    .onConflictDoUpdate({
      target: [customShellAdminPages.workspaceId, customShellAdminPages.side],
      set: { ...values, updatedAt: at },
    })
}

/**
 * Saves what is written, cleaned to what the page may hold first. A page with
 * every block taken off and nothing typed keeps its Dashboards block.
 */
export async function saveAdminPageBody(
  workspaceId: string,
  side: AdminPageSide,
  body: string,
  database: CustomShellDb = db
) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(ADMIN_PAGE_TOO_LONG)
  const page = await getAdminPage(workspaceId, side, database)
  if (page.locked) throw new Error(ADMIN_PAGE_LOCKED)
  await upsertPage(workspaceId, side, { body: cleanPage(body) }, database)
}

export async function setAdminPageLock(
  workspaceId: string,
  side: AdminPageSide,
  locked: boolean,
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, side, { locked }, database)
}

/** The cover picked (none, the sky or a picture) and the page's pictures, saved together. */
export async function setAdminPageCover(
  workspaceId: string,
  side: AdminPageSide,
  cover: { coverUrl: string | null; coverImages: string[] },
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, side, cover, database)
}
