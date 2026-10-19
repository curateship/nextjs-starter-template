import { and, asc, count, eq, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { notePostFolders, notePosts } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import { cleanFolderName, NOTE_SAYS } from "@/lib/note/videos"
import type { NotePostFolder, NotePostFolderList } from "@/lib/note/posts/posts"

/**
 * One person's Posts folders, copied from the Videos folders
 * (`src/server/note/folders.ts`) and kept apart from them: a flat list in the
 * order they dragged it, a post in one folder at most, and deleting a folder
 * leaves its posts on the list in no folder. Posts folders have no fields
 * (Tyler, 19 Oct 2026). Every read and write is scoped to the owner.
 */

export async function listPostFolders(ownerId: string): Promise<NotePostFolderList> {
  const [folders, counts] = await Promise.all([
    db
      .select()
      .from(notePostFolders)
      .where(eq(notePostFolders.ownerId, ownerId))
      .orderBy(asc(notePostFolders.position), asc(notePostFolders.createdAt)),
    db
      .select({ folderId: notePosts.folderId, posts: count() })
      .from(notePosts)
      .where(eq(notePosts.ownerId, ownerId))
      .groupBy(notePosts.folderId),
  ])

  const byFolder = new Map(counts.map((row) => [row.folderId, Number(row.posts)]))
  return {
    folders: folders.map(
      (folder): NotePostFolder => ({
        id: folder.id,
        name: folder.name,
        position: folder.position,
        postCount: byFolder.get(folder.id) ?? 0,
      })
    ),
    allCount: counts.reduce((sum, row) => sum + Number(row.posts), 0),
    noFolderCount: byFolder.get(null) ?? 0,
  }
}

export async function createPostFolder(ownerId: string, name: string): Promise<NotePostFolderList> {
  const cleaned = cleanFolderName(name)
  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${notePostFolders.position}), -1)` })
    .from(notePostFolders)
    .where(eq(notePostFolders.ownerId, ownerId))
  const at = now()
  try {
    await db.insert(notePostFolders).values({
      id: uuid(),
      ownerId,
      name: cleaned,
      position: Number(last?.position ?? -1) + 1,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTE_SAYS.folderTaken)
    throw error
  }
  return listPostFolders(ownerId)
}

export async function renamePostFolder(
  ownerId: string,
  folderId: string,
  name: string
): Promise<NotePostFolderList> {
  const cleaned = cleanFolderName(name)
  let renamed: { id: string }[]
  try {
    renamed = await db
      .update(notePostFolders)
      .set({ name: cleaned, updatedAt: now() })
      .where(and(eq(notePostFolders.id, folderId), eq(notePostFolders.ownerId, ownerId)))
      .returning({ id: notePostFolders.id })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTE_SAYS.folderTaken)
    throw error
  }
  if (!renamed.length) throw new Error(NOTE_SAYS.folderNotFound)
  return listPostFolders(ownerId)
}

/**
 * Takes the folder away and leaves every post that was in it on the list, in
 * no folder. The database does that by itself (ON DELETE SET NULL); it is
 * written out here too so the count that comes back is exact.
 */
export async function deletePostFolder(
  ownerId: string,
  folderId: string
): Promise<{ looseCount: number; folders: NotePostFolderList }> {
  const looseCount = await db.transaction(async (tx) => {
    const [folder] = await tx
      .select({ id: notePostFolders.id })
      .from(notePostFolders)
      .where(and(eq(notePostFolders.id, folderId), eq(notePostFolders.ownerId, ownerId)))
    if (!folder) throw new Error(NOTE_SAYS.folderNotFound)
    const loosened = await tx
      .update(notePosts)
      .set({ folderId: null })
      .where(and(eq(notePosts.ownerId, ownerId), eq(notePosts.folderId, folderId)))
      .returning({ id: notePosts.id })
    await tx.delete(notePostFolders).where(eq(notePostFolders.id, folderId))
    return loosened.length
  })
  return { looseCount, folders: await listPostFolders(ownerId) }
}

/** Saves the dragged order. The list must be exactly this person's folders. */
export async function reorderPostFolders(
  ownerId: string,
  folderIds: string[]
): Promise<NotePostFolderList> {
  await db.transaction(async (tx) => {
    const mine = await tx
      .select({ id: notePostFolders.id })
      .from(notePostFolders)
      .where(eq(notePostFolders.ownerId, ownerId))
    const known = new Set(mine.map((row) => row.id))
    if (
      folderIds.length !== known.size ||
      new Set(folderIds).size !== folderIds.length ||
      folderIds.some((id) => !known.has(id))
    ) {
      throw new Error(NOTE_SAYS.folderNotFound)
    }
    const at = now()
    for (const [position, id] of folderIds.entries()) {
      await tx
        .update(notePostFolders)
        .set({ position, updatedAt: at })
        .where(and(eq(notePostFolders.id, id), eq(notePostFolders.ownerId, ownerId)))
    }
  })
  return listPostFolders(ownerId)
}

export async function requireOwnPostFolder(ownerId: string, folderId: string) {
  const [folder] = await db
    .select({ id: notePostFolders.id, name: notePostFolders.name })
    .from(notePostFolders)
    .where(and(eq(notePostFolders.id, folderId), eq(notePostFolders.ownerId, ownerId)))
  if (!folder) throw new Error(NOTE_SAYS.folderNotFound)
  return folder
}
