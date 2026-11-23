import { and, eq, inArray, sql } from "drizzle-orm"

import {
  cleanCollectionName,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
} from "@/lib/media-collections"
import { db } from "@/server/db"
import {
  aiVideoMedia,
  aiVideoMediaCollectionItems,
  aiVideoMediaCollections,
  type AiVideoMediaCollection,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export type MediaCollection = {
  id: string
  name: string
  item_count: number
  created_at: string
  updated_at: string
}

// Postgres unique-violation (raised by ux_media_collections_user_name). Drizzle
// wraps driver errors, so the pg error carrying the code sits on the cause
// chain rather than on the error that was thrown.
function isUniqueViolation(error: unknown) {
  let current = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (
      typeof current === "object" &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function serializeCollection(
  row: AiVideoMediaCollection,
  itemCount: number
): MediaCollection {
  return {
    id: row.id,
    name: row.name,
    item_count: itemCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listOwnedCollections(
  userId: string
): Promise<MediaCollection[]> {
  const rows = await db
    .select({
      id: aiVideoMediaCollections.id,
      name: aiVideoMediaCollections.name,
      createdAt: aiVideoMediaCollections.createdAt,
      updatedAt: aiVideoMediaCollections.updatedAt,
      itemCount: sql<number>`count(${aiVideoMediaCollectionItems.mediaId})::int`,
    })
    .from(aiVideoMediaCollections)
    .leftJoin(
      aiVideoMediaCollectionItems,
      eq(aiVideoMediaCollectionItems.collectionId, aiVideoMediaCollections.id)
    )
    .where(eq(aiVideoMediaCollections.userId, userId))
    .groupBy(aiVideoMediaCollections.id)
    .orderBy(sql`lower(${aiVideoMediaCollections.name})`)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    item_count: row.itemCount,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }))
}

export async function requireOwnedCollection(
  userId: string,
  collectionId: string
) {
  const [row] = await db
    .select()
    .from(aiVideoMediaCollections)
    .where(
      and(
        eq(aiVideoMediaCollections.id, collectionId),
        eq(aiVideoMediaCollections.userId, userId)
      )
    )
    .limit(1)

  if (!row) throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
  return row
}

export async function createOwnedCollection(userId: string, name: string) {
  const createdAt = now()
  const row = {
    id: uuid(),
    userId,
    name: cleanCollectionName(name),
    createdAt,
    updatedAt: createdAt,
  }

  try {
    await db.insert(aiVideoMediaCollections).values(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(COLLECTION_NAME_TAKEN_MESSAGE)
    }
    throw error
  }

  return serializeCollection(row, 0)
}

export async function renameOwnedCollection(
  userId: string,
  collectionId: string,
  name: string
) {
  await requireOwnedCollection(userId, collectionId)
  const cleaned = cleanCollectionName(name)

  try {
    await db
      .update(aiVideoMediaCollections)
      .set({ name: cleaned, updatedAt: now() })
      .where(
        and(
          eq(aiVideoMediaCollections.id, collectionId),
          eq(aiVideoMediaCollections.userId, userId)
        )
      )
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(COLLECTION_NAME_TAKEN_MESSAGE)
    }
    throw error
  }
}

// Only the collection row goes; media_collection_items cascades and the media
// itself is never touched.
export async function deleteOwnedCollection(
  userId: string,
  collectionId: string
) {
  const [row] = await db
    .delete(aiVideoMediaCollections)
    .where(
      and(
        eq(aiVideoMediaCollections.id, collectionId),
        eq(aiVideoMediaCollections.userId, userId)
      )
    )
    .returning({ id: aiVideoMediaCollections.id })

  if (!row) throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
}

// Media ids from the given list that this user actually owns. Everything that
// writes membership filters through here, so a borrowed id can never be
// attached to someone else's collection.
async function ownedMediaIds(userId: string, mediaIds: string[]) {
  const unique = Array.from(new Set(mediaIds))
  if (!unique.length) return []

  const rows = await db
    .select({ id: aiVideoMedia.id })
    .from(aiVideoMedia)
    .where(and(eq(aiVideoMedia.userId, userId), inArray(aiVideoMedia.id, unique)))

  return rows.map((row) => row.id)
}

export async function addMediaToOwnedCollection(
  userId: string,
  collectionId: string,
  mediaIds: string[]
) {
  await requireOwnedCollection(userId, collectionId)
  const ids = await ownedMediaIds(userId, mediaIds)
  if (!ids.length) return { added_count: 0 }

  const createdAt = now()
  const inserted = await db
    .insert(aiVideoMediaCollectionItems)
    .values(ids.map((mediaId) => ({ collectionId, mediaId, createdAt })))
    // Already-a-member is a no-op, so adding a mixed selection is idempotent.
    .onConflictDoNothing()
    .returning({ mediaId: aiVideoMediaCollectionItems.mediaId })

  return { added_count: inserted.length }
}

export async function removeMediaFromOwnedCollection(
  userId: string,
  collectionId: string,
  mediaIds: string[]
) {
  await requireOwnedCollection(userId, collectionId)
  const ids = await ownedMediaIds(userId, mediaIds)
  if (!ids.length) return { removed_count: 0 }

  const removed = await db
    .delete(aiVideoMediaCollectionItems)
    .where(
      and(
        eq(aiVideoMediaCollectionItems.collectionId, collectionId),
        inArray(aiVideoMediaCollectionItems.mediaId, ids)
      )
    )
    .returning({ mediaId: aiVideoMediaCollectionItems.mediaId })

  return { removed_count: removed.length }
}

// Replaces one item's membership with exactly `collectionIds` — what the media
// edit dialog's checkbox list saves.
export async function setMediaItemCollections(
  userId: string,
  mediaId: string,
  collectionIds: string[]
) {
  const [ownedMediaId] = await ownedMediaIds(userId, [mediaId])
  if (!ownedMediaId) throw new Error("Media not found")

  const wanted = Array.from(new Set(collectionIds))
  const owned = wanted.length
    ? await db
        .select({ id: aiVideoMediaCollections.id })
        .from(aiVideoMediaCollections)
        .where(
          and(
            eq(aiVideoMediaCollections.userId, userId),
            inArray(aiVideoMediaCollections.id, wanted)
          )
        )
    : []

  if (owned.length !== wanted.length) {
    throw new Error(COLLECTION_NOT_FOUND_MESSAGE)
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(aiVideoMediaCollectionItems)
      .where(eq(aiVideoMediaCollectionItems.mediaId, ownedMediaId))

    if (owned.length) {
      const createdAt = now()
      await tx.insert(aiVideoMediaCollectionItems).values(
        owned.map((collection) => ({
          collectionId: collection.id,
          mediaId: ownedMediaId,
          createdAt,
        }))
      )
    }
  })
}

// Collection ids per media id, for a page of library rows. Media with no
// collections are simply absent from the map. Read-only and unfiltered by
// owner: callers must pass ids they have already proved the user owns, which
// both of them do (an ownership-scoped list query, and getOwnedMedia).
export async function collectionIdsByMedia(mediaIds: string[]) {
  const unique = Array.from(new Set(mediaIds))
  if (!unique.length) return new Map<string, string[]>()

  const rows = await db
    .select({
      mediaId: aiVideoMediaCollectionItems.mediaId,
      collectionId: aiVideoMediaCollectionItems.collectionId,
    })
    .from(aiVideoMediaCollectionItems)
    .where(inArray(aiVideoMediaCollectionItems.mediaId, unique))

  const byMedia = new Map<string, string[]>()
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
