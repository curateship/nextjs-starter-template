import { and, asc, eq, inArray, max } from "drizzle-orm"

import { db } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  videoCreatorFolderCreators,
  videoCreatorFolders,
} from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"
import { ownsCreator } from "@/server/video/creators/creators"
import {
  CREATOR_FOLDER_NAME_MAX,
  MAX_CREATOR_FOLDERS,
  type CreatorFolder,
} from "@/lib/video/creators"

/**
 * Folders of creators, copied from the trade app's social folders because the
 * behaviour is the same one and it is already proven.
 *
 * Every change hands back the whole fresh list. The panel keeps folders in its
 * own state so a tick applies the moment it is clicked, and giving it the real
 * list back is what stops the two drifting apart.
 */

export const FOLDER_ERRORS = {
  notFound: "FOLDER_NOT_FOUND",
  nameTaken: "FOLDER_NAME_TAKEN",
  tooMany: "FOLDER_LIMIT_REACHED",
  emptyName: "FOLDER_NAME_EMPTY",
  creatorNotFound: "CREATOR_NOT_FOUND",
} as const

export async function listFolders(ownerId: string): Promise<CreatorFolder[]> {
  const [folders, members] = await Promise.all([
    db
      .select()
      .from(videoCreatorFolders)
      .where(eq(videoCreatorFolders.ownerId, ownerId))
      .orderBy(asc(videoCreatorFolders.position)),
    db
      .select({
        folderId: videoCreatorFolderCreators.folderId,
        creatorId: videoCreatorFolderCreators.creatorId,
      })
      .from(videoCreatorFolderCreators)
      .innerJoin(
        videoCreatorFolders,
        eq(videoCreatorFolders.id, videoCreatorFolderCreators.folderId)
      )
      .where(eq(videoCreatorFolders.ownerId, ownerId)),
  ])

  const byFolder = new Map<string, string[]>()
  for (const member of members) {
    const held = byFolder.get(member.folderId) ?? []
    held.push(member.creatorId)
    byFolder.set(member.folderId, held)
  }

  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    position: folder.position,
    hidden: folder.hidden,
    creatorIds: byFolder.get(folder.id) ?? [],
  }))
}

/**
 * Makes a folder, optionally with its first creator already in it — which is
 * what the "new folder" field inside a creator's folder menu does, so naming
 * and filling it is one step rather than two.
 */
export async function createFolder(
  ownerId: string,
  name: string,
  firstCreatorId?: string
): Promise<CreatorFolder[]> {
  const tidied = name.trim().slice(0, CREATOR_FOLDER_NAME_MAX)
  if (!tidied) throw new Error(FOLDER_ERRORS.emptyName)
  if (firstCreatorId && !(await ownsCreator(ownerId, firstCreatorId))) {
    throw new Error(FOLDER_ERRORS.creatorNotFound)
  }

  const [counted] = await db
    .select({ highest: max(videoCreatorFolders.position) })
    .from(videoCreatorFolders)
    .where(eq(videoCreatorFolders.ownerId, ownerId))

  const existing = await db
    .select({ id: videoCreatorFolders.id })
    .from(videoCreatorFolders)
    .where(eq(videoCreatorFolders.ownerId, ownerId))
  if (existing.length >= MAX_CREATOR_FOLDERS) {
    throw new Error(FOLDER_ERRORS.tooMany)
  }

  const id = uuid()
  const at = now()
  try {
    await db.transaction(async (tx) => {
      await tx.insert(videoCreatorFolders).values({
        id,
        ownerId,
        name: tidied,
        // Straight onto the end, so a new folder never jumps the order.
        position: (counted?.highest ?? -1) + 1,
        hidden: false,
        createdAt: at,
        updatedAt: at,
      })
      if (firstCreatorId) {
        await tx
          .insert(videoCreatorFolderCreators)
          .values({ folderId: id, creatorId: firstCreatorId })
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FOLDER_ERRORS.nameTaken)
    throw error
  }

  return listFolders(ownerId)
}

export async function renameFolder(
  ownerId: string,
  folderId: string,
  name: string
): Promise<CreatorFolder[]> {
  const tidied = name.trim().slice(0, CREATOR_FOLDER_NAME_MAX)
  if (!tidied) throw new Error(FOLDER_ERRORS.emptyName)

  try {
    const [renamed] = await db
      .update(videoCreatorFolders)
      .set({ name: tidied, updatedAt: now() })
      .where(
        and(
          eq(videoCreatorFolders.id, folderId),
          eq(videoCreatorFolders.ownerId, ownerId)
        )
      )
      .returning({ id: videoCreatorFolders.id })
    if (!renamed) throw new Error(FOLDER_ERRORS.notFound)
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FOLDER_ERRORS.nameTaken)
    throw error
  }

  return listFolders(ownerId)
}

/** Deleting a folder keeps its creators; only the grouping goes. */
export async function deleteFolder(
  ownerId: string,
  folderId: string
): Promise<CreatorFolder[]> {
  const [removed] = await db
    .delete(videoCreatorFolders)
    .where(
      and(
        eq(videoCreatorFolders.id, folderId),
        eq(videoCreatorFolders.ownerId, ownerId)
      )
    )
    .returning({ id: videoCreatorFolders.id })
  if (!removed) throw new Error(FOLDER_ERRORS.notFound)
  return listFolders(ownerId)
}

/**
 * Puts a creator in a folder or takes them out. Both sides have to belong to
 * the person asking, or an id borrowed from somewhere else could file somebody
 * else's creator into your folder.
 */
export async function setCreatorInFolder(
  ownerId: string,
  folderId: string,
  creatorId: string,
  saved: boolean
): Promise<void> {
  const [folder] = await db
    .select({ id: videoCreatorFolders.id })
    .from(videoCreatorFolders)
    .where(
      and(
        eq(videoCreatorFolders.id, folderId),
        eq(videoCreatorFolders.ownerId, ownerId)
      )
    )
  if (!folder) throw new Error(FOLDER_ERRORS.notFound)
  if (!(await ownsCreator(ownerId, creatorId))) {
    throw new Error(FOLDER_ERRORS.creatorNotFound)
  }

  if (saved) {
    await db
      .insert(videoCreatorFolderCreators)
      .values({ folderId, creatorId })
      // Ticking a box that is already ticked is not an error.
      .onConflictDoNothing()
    return
  }

  await db
    .delete(videoCreatorFolderCreators)
    .where(
      and(
        eq(videoCreatorFolderCreators.folderId, folderId),
        eq(videoCreatorFolderCreators.creatorId, creatorId)
      )
    )
}

/**
 * Saves a dragged order and which folders are hidden, in one go. Dragging
 * three folders is one request rather than three, so a half-applied order can
 * never be left behind.
 */
export async function saveFolderOrder(
  ownerId: string,
  order: { id: string; position: number; hidden: boolean }[]
): Promise<CreatorFolder[]> {
  if (order.length === 0) return listFolders(ownerId)

  const mine = await db
    .select({ id: videoCreatorFolders.id })
    .from(videoCreatorFolders)
    .where(
      and(
        eq(videoCreatorFolders.ownerId, ownerId),
        inArray(
          videoCreatorFolders.id,
          order.map((one) => one.id)
        )
      )
    )
  const ownedIds = new Set(mine.map((one) => one.id))

  const at = now()
  await db.transaction(async (tx) => {
    for (const one of order) {
      // An id that is not this person's is skipped rather than refused: the
      // rest of the drag still lands, and nothing of theirs was touched.
      if (!ownedIds.has(one.id)) continue
      await tx
        .update(videoCreatorFolders)
        .set({ position: one.position, hidden: one.hidden, updatedAt: at })
        .where(eq(videoCreatorFolders.id, one.id))
    }
  })

  return listFolders(ownerId)
}
