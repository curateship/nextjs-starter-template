import { desc, eq, sql } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { noteLibraries, noteLibraryPages } from "@/server/note/schema"
import { defaultLibraryPage, LIBRARY_PAGE_BLOCK_TYPES, withLibrariesBlock } from "@/lib/note/library/library-page"
import { LIBRARY_SAYS } from "@/lib/note/library/notes"
import { PAGE_MAX_LENGTH, storedPageBody, type StoredPage } from "@/lib/notes/page-body"
import { readCoverImages } from "@/lib/notes/page-cover"

/**
 * Each person's left page on the Library dashboard (Tyler, 15 Nov 2026): what
 * is written there, its cover and its lock. Every function takes the
 * signed-in person's id and touches only their row.
 */

const EMPTY_PAGE = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] })

/** A page cleaned to what it may hold, its Libraries block always kept. */
function cleanPage(text: string) {
  const stored = storedPageBody(text, LIBRARY_PAGE_BLOCK_TYPES) || EMPTY_PAGE
  return JSON.stringify(withLibrariesBlock(JSON.parse(stored)))
}

export async function getLibraryPage(userId: string): Promise<StoredPage> {
  const [row] = await db.select().from(noteLibraryPages).where(eq(noteLibraryPages.userId, userId)).limit(1)
  const body = row?.body ? cleanPage(row.body) : ""
  return {
    body: body || JSON.stringify(defaultLibraryPage()),
    locked: row?.locked ?? false,
    coverUrl: row?.coverUrl ?? null,
    coverImages: readCoverImages(row?.coverImages),
  }
}

async function upsertPage(
  userId: string,
  values: Partial<{ body: string; locked: boolean; coverUrl: string | null; coverImages: string[] }>
) {
  const at = now()
  await db
    .insert(noteLibraryPages)
    .values({ userId, body: "", locked: false, coverUrl: null, coverImages: [], ...values, updatedAt: at })
    .onConflictDoUpdate({ target: noteLibraryPages.userId, set: { ...values, updatedAt: at } })
}

/** Saves what is written, cleaned first. A locked page refuses. */
export async function saveLibraryPageBody(userId: string, body: string) {
  if (body.length > PAGE_MAX_LENGTH) throw new Error(LIBRARY_SAYS.pageTooLong)
  const page = await getLibraryPage(userId)
  if (page.locked) throw new Error(LIBRARY_SAYS.pageLocked)
  await upsertPage(userId, { body: cleanPage(body) })
}

export async function setLibraryPageLock(userId: string, locked: boolean) {
  await upsertPage(userId, { locked })
}

export async function setLibraryPageCover(userId: string, cover: { coverUrl: string | null; coverImages: string[] }) {
  await upsertPage(userId, cover)
}

/**
 * The library `/library` opens on: the one opened last, or the newest. Null
 * for somebody with none, who sees the dashboard with only New library.
 */
export async function lastOpenedLibraryId(userId: string): Promise<string | null> {
  const [last] = await db
    .select({ id: noteLibraries.id })
    .from(noteLibraries)
    .where(eq(noteLibraries.ownerId, userId))
    .orderBy(sql`${noteLibraries.lastOpenedAt} desc nulls last`, desc(noteLibraries.createdAt))
    .limit(1)
  return last?.id ?? null
}
