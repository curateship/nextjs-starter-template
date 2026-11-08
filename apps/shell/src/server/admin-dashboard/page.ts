import { and, eq } from "drizzle-orm"

import { ADMIN_PAGE_BLOCK_TYPES, defaultAdminPage, type AdminPageSide } from "@/lib/admin-dashboard/admin-page"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellAdminPages } from "@/server/schema"

/**
 * The Admin dashboard's two pages, each one per site: what is written on it,
 * its cover photo, and its lock. Locked, a page reads only, and a save is
 * refused here as well as on screen. Built as the CRM's page is
 * (`server/crm/page.ts`).
 */

export const ADMIN_PAGE_LOCKED = "ADMIN_PAGE_LOCKED"
export const ADMIN_PAGE_TOO_LONG = "ADMIN_PAGE_TOO_LONG"

/** A page with nothing on it: one empty line. */
const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

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
    ? storedPageBody(row.body, ADMIN_PAGE_BLOCK_TYPES) || EMPTY_PAGE
    : JSON.stringify(defaultAdminPage(side))
  return {
    body,
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
  }
}

async function upsertPage(
  workspaceId: string,
  side: AdminPageSide,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null }>,
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
 * every block taken off and nothing typed is kept as one empty line.
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
  const stored = storedPageBody(body, ADMIN_PAGE_BLOCK_TYPES)
  await upsertPage(workspaceId, side, { body: stored || EMPTY_PAGE }, database)
}

export async function setAdminPageLock(
  workspaceId: string,
  side: AdminPageSide,
  locked: boolean,
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, side, { locked }, database)
}

export async function setAdminPageCover(
  workspaceId: string,
  side: AdminPageSide,
  coverUrl: string | null,
  database: CustomShellDb = db
) {
  await upsertPage(workspaceId, side, { coverUrl }, database)
}
