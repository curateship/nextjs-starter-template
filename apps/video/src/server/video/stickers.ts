import { and, eq, inArray } from "drizzle-orm"

import {
  BUILT_IN_STICKERS,
  MAX_STICKERS,
  readEmoji,
  readStickerList,
  sameSticker,
  STICKER_DUPLICATE_MESSAGE,
  STICKER_LIST_FULL_MESSAGE,
  STICKER_NOT_EMOJI_MESSAGE,
  STICKER_PICTURE_NOT_FOUND_MESSAGE,
  type Sticker,
  type StickerEntry,
} from "@/lib/video/stickers"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoStickerLists } from "@/server/video/schema"

/**
 * One person's stickers. The list is read and written whole, inside a
 * transaction that locks the person's row, so an add in one tab and a remove
 * in another cannot each save a list missing the other's change.
 *
 * A picture sticker only ever points at the caller's own picture. The add
 * checks that, and every read checks it again, which is also how a deleted
 * file drops off the list.
 *
 * Addresses are filled in after the transaction has finished, never inside
 * it: working out an address reads the storage settings on a connection of
 * its own, and a transaction holding the last free connection would wait on
 * it for ever.
 */

export async function getStickers(
  userId: string,
  database: CustomShellDb = db
): Promise<Sticker[]> {
  const [row] = await database
    .select({ stickers: videoStickerLists.stickers })
    .from(videoStickerLists)
    .where(eq(videoStickerLists.userId, userId))
    .limit(1)
  return resolveStickers(
    userId,
    row ? readStickerList(row.stickers) : BUILT_IN_STICKERS,
    database
  )
}

/** Add one sticker at the end of the list, and answer the new list. */
export async function addSticker(
  userId: string,
  entry: StickerEntry,
  database: CustomShellDb = db
): Promise<Sticker[]> {
  const added = requireAddable(entry)
  const next = await database.transaction(async (tx) => {
    const current = await lockedEntries(userId, tx)
    if (current.some((kept) => sameSticker(kept, added))) {
      throw new Error(STICKER_DUPLICATE_MESSAGE)
    }
    if (current.length >= MAX_STICKERS) {
      throw new Error(STICKER_LIST_FULL_MESSAGE)
    }
    if (added.kind === "image") {
      const owned = await ownedPictureIds(userId, [added.mediaId], tx)
      if (!owned.has(added.mediaId)) {
        throw new Error(STICKER_PICTURE_NOT_FOUND_MESSAGE)
      }
    }
    const list = [...current, added]
    await saveEntries(userId, list, tx)
    return list
  })
  return resolveStickers(userId, next, database)
}

/**
 * Take one sticker off the list, and answer the new list. Removing one that
 * is already gone (from another tab) is not an error: the list is simply
 * answered as it now is.
 */
export async function removeSticker(
  userId: string,
  entry: StickerEntry,
  database: CustomShellDb = db
): Promise<Sticker[]> {
  const next = await database.transaction(async (tx) => {
    const current = await lockedEntries(userId, tx)
    const list = current.filter((kept) => !sameSticker(kept, entry))
    await saveEntries(userId, list, tx)
    return list
  })
  return resolveStickers(userId, next, database)
}

function requireAddable(entry: StickerEntry): StickerEntry {
  if (entry.kind === "image") return entry
  const emoji = readEmoji(entry.emoji)
  if (!emoji) throw new Error(STICKER_NOT_EMOJI_MESSAGE)
  return { kind: "emoji", emoji }
}

/**
 * The stored list with pictures that are no longer the caller's left out.
 * The row is written first when it is missing, so there is always a row to
 * lock: without it, two tabs saving their first change at once would each
 * start from the built-in eight and one change would be lost.
 */
async function lockedEntries(
  userId: string,
  tx: CustomShellDb
): Promise<StickerEntry[]> {
  await tx
    .insert(videoStickerLists)
    .values({ userId, stickers: BUILT_IN_STICKERS, updatedAt: now() })
    .onConflictDoNothing()
  const [row] = await tx
    .select({ stickers: videoStickerLists.stickers })
    .from(videoStickerLists)
    .where(eq(videoStickerLists.userId, userId))
    .for("update")
  const entries = row ? readStickerList(row.stickers) : BUILT_IN_STICKERS
  const owned = await ownedPictureIds(userId, pictureIds(entries), tx)
  return entries.filter(
    (entry) => entry.kind === "emoji" || owned.has(entry.mediaId)
  )
}

async function saveEntries(
  userId: string,
  stickers: StickerEntry[],
  tx: CustomShellDb
) {
  const updatedAt = now()
  await tx
    .insert(videoStickerLists)
    .values({ userId, stickers, updatedAt })
    .onConflictDoUpdate({
      target: videoStickerLists.userId,
      set: { stickers, updatedAt },
    })
}

function pictureIds(entries: StickerEntry[]) {
  return entries.flatMap((entry) =>
    entry.kind === "image" ? [entry.mediaId] : []
  )
}

function ownedPictureFilter(userId: string, mediaIds: string[]) {
  return and(
    eq(customShellMedia.userId, userId),
    eq(customShellMedia.fileType, "image"),
    inArray(customShellMedia.id, mediaIds)
  )
}

async function ownedPictureIds(
  userId: string,
  mediaIds: string[],
  database: CustomShellDb
) {
  if (!mediaIds.length) return new Set<string>()
  const rows = await database
    .select({ id: customShellMedia.id })
    .from(customShellMedia)
    .where(ownedPictureFilter(userId, mediaIds))
  return new Set(rows.map((row) => row.id))
}

/**
 * The list with each picture's address filled in. A picture that is no
 * longer the caller's own picture, deleted or otherwise, is left out.
 */
async function resolveStickers(
  userId: string,
  entries: StickerEntry[],
  database: CustomShellDb
): Promise<Sticker[]> {
  const mediaIds = pictureIds(entries)
  const rows = mediaIds.length
    ? await database
        .select()
        .from(customShellMedia)
        .where(ownedPictureFilter(userId, mediaIds))
    : []
  const pictures = new Map(
    await Promise.all(
      rows.map(async (row) => [row.id, await serializeMedia(row)] as const)
    )
  )
  return entries.flatMap((entry): Sticker[] => {
    if (entry.kind === "emoji") return [entry]
    const picture = pictures.get(entry.mediaId)
    return picture
      ? [
          {
            kind: "image",
            mediaId: entry.mediaId,
            url: picture.url,
            name: picture.original_name,
          },
        ]
      : []
  })
}
