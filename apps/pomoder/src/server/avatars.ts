import { and, eq } from "drizzle-orm"

import { AVATAR_MAX_BYTES } from "@/lib/avatar"
import { db, type PomoderDb } from "@/server/db"
import { putMediaObject, validateMediaUpload } from "@/server/pomoder-media"
import { mediaAssets, storageDeletionJobs, users } from "@/server/schema"

type PomoderTransaction = Parameters<Parameters<PomoderDb["transaction"]>[0]>[0]

const AVATAR_ASSET_NAME = "Profile avatar"

// A profile picture is identity, not premium media, so this path deliberately
// skips the Pro storage entitlement that gates background and soundscape
// uploads: every signed-in account gets one. Storage stays bounded because an
// account only ever owns one avatar — replacing or removing it deletes the
// previous asset and queues its object for deletion.
export async function saveUserAvatar(
  userId: string,
  upload: { bytes: Uint8Array; mimeType: string },
  database: PomoderDb = db
) {
  const fileSize = upload.bytes.byteLength
  if (fileSize > AVATAR_MAX_BYTES) throw new Error("FILE_TOO_LARGE")
  const detected = validateMediaUpload({
    bytes: upload.bytes.subarray(0, 16),
    mimeType: upload.mimeType,
    fileSize,
  })
  if (detected.kind !== "image") throw new Error("INVALID_FILE_CONTENT")

  const avatarMediaId = crypto.randomUUID()
  const storageKey = `users/${userId}/avatars/${avatarMediaId}.${detected.extension}`
  await putMediaObject(storageKey, upload.bytes, upload.mimeType)
  await database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ avatarMediaId: users.avatarMediaId })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
    if (!current) throw new Error("USER_NOT_FOUND")
    await transaction.insert(mediaAssets).values({
      id: avatarMediaId,
      ownerUserId: userId,
      kind: "image",
      source: "upload",
      status: "ready",
      name: AVATAR_ASSET_NAME,
      storageKey,
      mimeType: upload.mimeType,
      fileSize,
    })
    await transaction
      .update(users)
      .set({ avatarMediaId, updatedAt: new Date() })
      .where(eq(users.id, userId))
    // Only after the pointer moved, so the foreign key never nulls the row we
    // just wrote.
    if (current.avatarMediaId) await discardAvatarAsset(transaction, userId, current.avatarMediaId)
  })
  return { avatarMediaId }
}

export async function removeUserAvatar(userId: string, database: PomoderDb = db) {
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ avatarMediaId: users.avatarMediaId })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
    if (!current) throw new Error("USER_NOT_FOUND")
    if (!current.avatarMediaId) return { avatarMediaId: null }
    await transaction
      .update(users)
      .set({ avatarMediaId: null, updatedAt: new Date() })
      .where(eq(users.id, userId))
    await discardAvatarAsset(transaction, userId, current.avatarMediaId)
    return { avatarMediaId: null }
  })
}

// Avatars are served to anyone who can see the display name beside them, so
// this lookup has no viewer check. What it does enforce is that the asset is
// somebody's *current* avatar: a media id that is only a private background or
// soundscape is not readable through this door.
export async function findPublicAvatar(avatarMediaId: string, database: PomoderDb = db) {
  const [row] = await database
    .select({ storageKey: mediaAssets.storageKey, mimeType: mediaAssets.mimeType })
    .from(mediaAssets)
    .innerJoin(users, eq(users.avatarMediaId, mediaAssets.id))
    .where(
      and(
        eq(mediaAssets.id, avatarMediaId),
        eq(mediaAssets.kind, "image"),
        eq(mediaAssets.status, "ready")
      )
    )
    .limit(1)
  if (!row) throw new Error("AVATAR_NOT_FOUND")
  return row
}

// Drops the asset row and hands its stored object to the deletion queue. The
// owner check keeps a replaced pointer from ever deleting somebody else's file.
async function discardAvatarAsset(
  transaction: PomoderTransaction,
  userId: string,
  avatarMediaId: string
) {
  const [removed] = await transaction
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, avatarMediaId), eq(mediaAssets.ownerUserId, userId)))
    .returning({ storageKey: mediaAssets.storageKey })
  if (removed)
    await transaction
      .insert(storageDeletionJobs)
      .values({ storageKey: removed.storageKey })
      .onConflictDoNothing()
}
