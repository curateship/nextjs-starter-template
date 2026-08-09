import { and, count, eq, inArray, sql } from "drizzle-orm"

import {
  cleanCollectionName,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
} from "@/lib/video/media-collections"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  videoMediaCollectionItems,
  videoMediaCollections,
} from "@/server/video/schema"

/**
 * Collections are per-person groups over the shell's media library. Every
 * write in here proves ownership first — of the collection, and of every media
 * id it is asked to attach — so a borrowed id can never move somebody else's
 * files into a stranger's collection.
 */

export type MediaCollectionSummary = {
  id: string
  name: string
  item_count: number
  created_at: string
  updated_at: string
}

/**
 * Drizzle wraps the driver error, so the unique-index violation is found by
 * walking the `cause` chain rather than trusting the top-level error.
 */
function isUniqueViolation(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function serializeCollection(row: {
  id: string
  name: string
  itemCount?: number
  createdAt: Date
  updatedAt: Date
}): MediaCollectionSummary {
  return {
    id: row.id,
    name: row.name,
    item_count: row.itemCount ?? 0,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listOwnedCollections(
  userId: string,
  database: CustomShellDb = db
): Promise<MediaCollectionSummary[]> {
  const rows = await database
    .select({
      id: videoMediaCollections.id,
      name: videoMediaCollections.name,
      itemCount: count(videoMediaCollectionItems.mediaId),
      createdAt: videoMediaCollections.createdAt,
      updatedAt: videoMediaCollections.updatedAt,
    })
    .from(videoMediaCollections)
    .leftJoin(
      videoMediaCollectionItems,
      eq(videoMediaCollectionItems.collectionId, videoMediaCollections.id)
    )
    .where(eq(videoMediaCollections.userId, userId))
    .groupBy(videoMediaCollections.id)
    .orderBy(sql`lower(${videoMediaCollections.name})`)

  return rows.map(serializeCollection)
}

async function requireOwnedCollection(
  userId: string,
  collectionId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(videoMediaCollections)
    .where(
      and(
        eq(videoMediaCollections.id, collectionId),
        eq(videoMediaCollections.userId, userId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
  }
  return row
}

export async function createOwnedCollection(
  userId: string,
  name: string,
  database: CustomShellDb = db
): Promise<MediaCollectionSummary> {
  const createdAt = now()
  const row = {
    id: uuid(),
    userId,
    name: cleanCollectionName(name),
    createdAt,
    updatedAt: createdAt,
  }
  try {
    await database.insert(videoMediaCollections).values(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(COLLECTION_NAME_TAKEN_MESSAGE)
    }
    throw error
  }
  return serializeCollection(row)
}

export async function renameOwnedCollection(
  userId: string,
  collectionId: string,
  name: string,
  database: CustomShellDb = db
) {
  await requireOwnedCollection(userId, collectionId, database)
  try {
    await database
      .update(videoMediaCollections)
      .set({ name: cleanCollectionName(name), updatedAt: now() })
      .where(eq(videoMediaCollections.id, collectionId))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(COLLECTION_NAME_TAKEN_MESSAGE)
    }
    throw error
  }
}

/** Deletes only the collection — its media survive, detached by cascade. */
export async function deleteOwnedCollection(
  userId: string,
  collectionId: string,
  database: CustomShellDb = db
) {
  const deleted = await database
    .delete(videoMediaCollections)
    .where(
      and(
        eq(videoMediaCollections.id, collectionId),
        eq(videoMediaCollections.userId, userId)
      )
    )
    .returning({ id: videoMediaCollections.id })
  if (!deleted.length) {
    throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
  }
}

/** Every membership write funnels through this ownership filter. */
async function ownedMediaIds(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb
) {
  const wanted = [...new Set(mediaIds)]
  if (!wanted.length) return []
  const rows = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.userId, userId),
        inArray(customShellMedia.id, wanted)
      )
    )
  return rows.map((row) => row.id)
}

export async function addMediaToOwnedCollection(
  userId: string,
  collectionId: string,
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<{ added_count: number }> {
  await requireOwnedCollection(userId, collectionId, database)
  const owned = await ownedMediaIds(userId, mediaIds, database)
  if (!owned.length) return { added_count: 0 }

  const createdAt = now()
  const inserted = await database
    .insert(videoMediaCollectionItems)
    .values(owned.map((mediaId) => ({ collectionId, mediaId, createdAt })))
    .onConflictDoNothing()
    .returning({ mediaId: videoMediaCollectionItems.mediaId })
  return { added_count: inserted.length }
}

export async function removeMediaFromOwnedCollection(
  userId: string,
  collectionId: string,
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<{ removed_count: number }> {
  await requireOwnedCollection(userId, collectionId, database)
  const wanted = [...new Set(mediaIds)]
  if (!wanted.length) return { removed_count: 0 }
  const removed = await database
    .delete(videoMediaCollectionItems)
    .where(
      and(
        eq(videoMediaCollectionItems.collectionId, collectionId),
        inArray(videoMediaCollectionItems.mediaId, wanted)
      )
    )
    .returning({ mediaId: videoMediaCollectionItems.mediaId })
  return { removed_count: removed.length }
}

/**
 * Replaces one media item's memberships wholesale, in one transaction, after
 * proving the media and every requested collection belong to the caller.
 */
export async function setMediaItemCollections(
  userId: string,
  mediaId: string,
  collectionIds: string[],
  database: CustomShellDb = db
) {
  const owned = await ownedMediaIds(userId, [mediaId], database)
  if (!owned.length) {
    throw new Error("Media not found")
  }

  const wanted = [...new Set(collectionIds)]
  if (wanted.length) {
    const collections = await database
      .select({ id: videoMediaCollections.id })
      .from(videoMediaCollections)
      .where(
        and(
          eq(videoMediaCollections.userId, userId),
          inArray(videoMediaCollections.id, wanted)
        )
      )
    if (collections.length !== wanted.length) {
      throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
    }
  }

  const createdAt = now()
  await database.transaction(async (tx) => {
    await tx
      .delete(videoMediaCollectionItems)
      .where(eq(videoMediaCollectionItems.mediaId, mediaId))
    if (wanted.length) {
      await tx
        .insert(videoMediaCollectionItems)
        .values(
          wanted.map((collectionId) => ({ collectionId, mediaId, createdAt }))
        )
    }
  })
}

/**
 * Membership ids for a page of media rows in one round trip. Deliberately not
 * owner-filtered — callers pass ids they have already proven they own.
 */
export async function collectionIdsByMedia(
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, string[]>> {
  const byMedia = new Map<string, string[]>()
  if (!mediaIds.length) return byMedia
  const rows = await database
    .select({
      mediaId: videoMediaCollectionItems.mediaId,
      collectionId: videoMediaCollectionItems.collectionId,
    })
    .from(videoMediaCollectionItems)
    .where(inArray(videoMediaCollectionItems.mediaId, mediaIds))
  for (const row of rows) {
    const existing = byMedia.get(row.mediaId)
    if (existing) {
      existing.push(row.collectionId)
    } else {
      byMedia.set(row.mediaId, [row.collectionId])
    }
  }
  return byMedia
}
