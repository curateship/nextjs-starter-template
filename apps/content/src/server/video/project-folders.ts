import { and, count, eq, inArray, sql } from "drizzle-orm"

import {
  cleanFolderName,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-folders"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  videoProjectFolderItems,
  videoProjectFolders,
  videoProjects,
} from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"

/**
 * Folders are per-person groups of projects, and a project is in one folder at
 * most. Every write proves ownership first, of the folder and of every project
 * it is asked to move, so a borrowed id can never file somebody else's project.
 */

export type ProjectFolderSummary = {
  id: string
  name: string
  project_count: number
}

export async function listOwnedFolders(
  userId: string,
  database: CustomShellDb = db
): Promise<ProjectFolderSummary[]> {
  const rows = await database
    .select({
      id: videoProjectFolders.id,
      name: videoProjectFolders.name,
      projectCount: count(videoProjectFolderItems.projectId),
    })
    .from(videoProjectFolders)
    .leftJoin(
      videoProjectFolderItems,
      eq(videoProjectFolderItems.folderId, videoProjectFolders.id)
    )
    .where(eq(videoProjectFolders.userId, userId))
    .groupBy(videoProjectFolders.id)
    .orderBy(sql`lower(${videoProjectFolders.name})`)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    project_count: row.projectCount,
  }))
}

export async function requireOwnedFolder(
  userId: string,
  folderId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ id: videoProjectFolders.id })
    .from(videoProjectFolders)
    .where(
      and(
        eq(videoProjectFolders.id, folderId),
        eq(videoProjectFolders.userId, userId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  }
  return row
}

export async function createOwnedFolder(
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<ProjectFolderSummary> {
  const createdAt = now()
  const row = {
    id: uuid(),
    userId,
    name: cleanFolderName(name),
    createdAt,
    updatedAt: createdAt,
  }
  try {
    await database.insert(videoProjectFolders).values(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(FOLDER_NAME_TAKEN_MESSAGE)
    }
    throw error
  }
  return { id: row.id, name: row.name, project_count: 0 }
}

export async function renameOwnedFolder(
  userId: string,
  folderId: string,
  name: string,
  database: CustomShellDb = db
) {
  const cleaned = cleanFolderName(name)
  try {
    const renamed = await database
      .update(videoProjectFolders)
      .set({ name: cleaned, updatedAt: now() })
      .where(
        and(
          eq(videoProjectFolders.id, folderId),
          eq(videoProjectFolders.userId, userId)
        )
      )
      .returning({ id: videoProjectFolders.id })
    if (!renamed.length) {
      throw new Error(FOLDER_NOT_FOUND_MESSAGE)
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(FOLDER_NAME_TAKEN_MESSAGE)
    }
    throw error
  }
  return { id: folderId, name: cleaned }
}

/**
 * Deletes only the folder. Its membership rows go by cascade and every project
 * in it stays, in no folder. The answer says how many that was, counted in the
 * same transaction as the delete so it cannot drift.
 */
export async function deleteOwnedFolder(
  userId: string,
  folderId: string,
  database: CustomShellDb = db
): Promise<{ loose_count: number }> {
  return database.transaction(async (tx) => {
    await requireOwnedFolder(userId, folderId, tx)
    const [held] = await tx
      .select({ total: count() })
      .from(videoProjectFolderItems)
      .where(eq(videoProjectFolderItems.folderId, folderId))
    await tx
      .delete(videoProjectFolders)
      .where(eq(videoProjectFolders.id, folderId))
    return { loose_count: held?.total ?? 0 }
  })
}

/**
 * Puts projects into one folder, or into no folder when `folderId` is null.
 * One request for any number of projects. A project already there comes back
 * as unchanged, and an id that is not one of this person's projects comes back
 * as skipped, so the message can say exactly what happened.
 */
export async function moveOwnedProjectsToFolder(
  userId: string,
  projectIds: string[],
  folderId: string | null,
  database: CustomShellDb = db
): Promise<{
  moved_ids: string[]
  unchanged_ids: string[]
  skipped_ids: string[]
}> {
  const wanted = [...new Set(projectIds)]
  if (folderId) await requireOwnedFolder(userId, folderId, database)
  if (!wanted.length) {
    return { moved_ids: [], unchanged_ids: [], skipped_ids: [] }
  }

  const owned = await database
    .select({
      id: videoProjects.id,
      folderId: videoProjectFolderItems.folderId,
    })
    .from(videoProjects)
    .leftJoin(
      videoProjectFolderItems,
      eq(videoProjectFolderItems.projectId, videoProjects.id)
    )
    .where(
      and(eq(videoProjects.userId, userId), inArray(videoProjects.id, wanted))
    )

  const ownedIds = new Set(owned.map((row) => row.id))
  const unchanged = owned.filter((row) => row.folderId === folderId)
  const moving = owned
    .filter((row) => row.folderId !== folderId)
    .map((row) => row.id)

  if (moving.length) {
    if (folderId) {
      const createdAt = now()
      await database
        .insert(videoProjectFolderItems)
        .values(moving.map((projectId) => ({ projectId, folderId, createdAt })))
        .onConflictDoUpdate({
          target: videoProjectFolderItems.projectId,
          set: { folderId, createdAt },
        })
    } else {
      await database
        .delete(videoProjectFolderItems)
        .where(inArray(videoProjectFolderItems.projectId, moving))
    }
  }

  return {
    moved_ids: moving,
    unchanged_ids: unchanged.map((row) => row.id),
    skipped_ids: wanted.filter((id) => !ownedIds.has(id)),
  }
}

/** The folder a project is in, or null. Callers have already proven ownership. */
export async function folderIdOfProject(
  projectId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({ folderId: videoProjectFolderItems.folderId })
    .from(videoProjectFolderItems)
    .where(eq(videoProjectFolderItems.projectId, projectId))
    .limit(1)
  return row?.folderId ?? null
}
