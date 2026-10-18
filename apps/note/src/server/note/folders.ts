import { and, asc, count, eq, sql } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { noteFolders, noteVideos } from "@/server/note/schema"
import { isUniqueViolation } from "@/server/note/unique-violation"
import {
  cleanFolderName,
  NOTE_SAYS,
  type NoteFolder,
  type NoteFolderList,
} from "@/lib/note/videos"

/**
 * One person's folders: a flat list, in the order they dragged it. A video is
 * in one folder at most, and deleting a folder leaves its videos on the list
 * in no folder. Every read and write is scoped to the owner.
 */

export async function listFolders(ownerId: string): Promise<NoteFolderList> {
  const [folders, counts] = await Promise.all([
    db
      .select()
      .from(noteFolders)
      .where(eq(noteFolders.ownerId, ownerId))
      .orderBy(asc(noteFolders.position), asc(noteFolders.createdAt)),
    db
      .select({ folderId: noteVideos.folderId, videos: count() })
      .from(noteVideos)
      .where(eq(noteVideos.ownerId, ownerId))
      .groupBy(noteVideos.folderId),
  ])

  const byFolder = new Map(counts.map((row) => [row.folderId, Number(row.videos)]))
  return {
    folders: folders.map(
      (folder): NoteFolder => ({
        id: folder.id,
        name: folder.name,
        position: folder.position,
        videoCount: byFolder.get(folder.id) ?? 0,
      })
    ),
    allCount: counts.reduce((sum, row) => sum + Number(row.videos), 0),
    noFolderCount: byFolder.get(null) ?? 0,
  }
}

/** Makes a folder at the foot of the list. A name already taken is refused. */
export async function createFolder(ownerId: string, name: string): Promise<NoteFolderList> {
  const cleaned = cleanFolderName(name)
  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${noteFolders.position}), -1)` })
    .from(noteFolders)
    .where(eq(noteFolders.ownerId, ownerId))
  const at = now()
  try {
    await db.insert(noteFolders).values({
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
  return listFolders(ownerId)
}

export async function renameFolder(
  ownerId: string,
  folderId: string,
  name: string
): Promise<NoteFolderList> {
  const cleaned = cleanFolderName(name)
  let renamed: { id: string }[]
  try {
    renamed = await db
      .update(noteFolders)
      .set({ name: cleaned, updatedAt: now() })
      .where(and(eq(noteFolders.id, folderId), eq(noteFolders.ownerId, ownerId)))
      .returning({ id: noteFolders.id })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(NOTE_SAYS.folderTaken)
    throw error
  }
  if (!renamed.length) throw new Error(NOTE_SAYS.folderNotFound)
  return listFolders(ownerId)
}

/**
 * Takes the folder away and leaves every video that was in it on the list, in
 * no folder. The database does the second half by itself (ON DELETE SET
 * NULL); it is written out here too so the count that comes back is exact.
 */
export async function deleteFolder(
  ownerId: string,
  folderId: string
): Promise<{ looseCount: number; folders: NoteFolderList }> {
  const looseCount = await db.transaction(async (tx) => {
    const [folder] = await tx
      .select({ id: noteFolders.id })
      .from(noteFolders)
      .where(and(eq(noteFolders.id, folderId), eq(noteFolders.ownerId, ownerId)))
    if (!folder) throw new Error(NOTE_SAYS.folderNotFound)
    const loosened = await tx
      .update(noteVideos)
      .set({ folderId: null })
      .where(and(eq(noteVideos.ownerId, ownerId), eq(noteVideos.folderId, folderId)))
      .returning({ id: noteVideos.id })
    await tx.delete(noteFolders).where(eq(noteFolders.id, folderId))
    return loosened.length
  })
  return { looseCount, folders: await listFolders(ownerId) }
}

/**
 * Saves the order the folders were dragged into. The list must be exactly
 * this person's folders, so a stale screen cannot drop one out of the order.
 */
export async function reorderFolders(
  ownerId: string,
  folderIds: string[]
): Promise<NoteFolderList> {
  await db.transaction(async (tx) => {
    const mine = await tx
      .select({ id: noteFolders.id })
      .from(noteFolders)
      .where(eq(noteFolders.ownerId, ownerId))
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
        .update(noteFolders)
        .set({ position, updatedAt: at })
        .where(and(eq(noteFolders.id, id), eq(noteFolders.ownerId, ownerId)))
    }
  })
  return listFolders(ownerId)
}

/** Whether a folder is this person's. Used before a video is moved into it. */
export async function requireOwnFolder(ownerId: string, folderId: string) {
  const [folder] = await db
    .select({ id: noteFolders.id, name: noteFolders.name })
    .from(noteFolders)
    .where(and(eq(noteFolders.id, folderId), eq(noteFolders.ownerId, ownerId)))
  if (!folder) throw new Error(NOTE_SAYS.folderNotFound)
  return folder
}
