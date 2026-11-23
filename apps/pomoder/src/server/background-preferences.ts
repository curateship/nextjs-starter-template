import { and, eq, isNull, or } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { mediaAssets, userPreferences } from "@/server/schema"
import {
  DEFAULT_BACKGROUND,
  parseBackgroundReference,
  serializeBackgroundReference,
  type BackgroundReference,
} from "@/lib/background-catalog"

// Resolve a stored/incoming value into a usable reference, or null when it is
// invalid. A media reference only survives if the asset is a ready image or
// video the user is allowed to view (their own upload, or a shared/curated
// asset). Anything else — a deleted upload, one that is still processing, the
// wrong kind, or someone else's media — resolves to null so the caller falls
// back to the default scene.
export async function resolveBackgroundReference(
  userId: string,
  value: string | null,
  database: PomoderDb = db
): Promise<BackgroundReference | null> {
  const reference = parseBackgroundReference(value)
  if (!reference) return null
  if (reference.type === "scene") return reference
  const [asset] = await database
    .select({ id: mediaAssets.id, kind: mediaAssets.kind })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, reference.mediaId),
        or(eq(mediaAssets.ownerUserId, userId), isNull(mediaAssets.ownerUserId)),
        or(eq(mediaAssets.kind, "image"), eq(mediaAssets.kind, "video")),
        eq(mediaAssets.status, "ready")
      )
    )
    .limit(1)
  if (!asset) return null
  return { type: "media", mediaId: reference.mediaId, mediaKind: asset.kind as "image" | "video" }
}

export async function loadBackgroundPreference(
  userId: string,
  database: PomoderDb = db
): Promise<BackgroundReference> {
  const [row] = await database
    .select({ selectedBackground: userPreferences.selectedBackground })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)
  if (!row?.selectedBackground) return DEFAULT_BACKGROUND
  return (
    (await resolveBackgroundReference(userId, row.selectedBackground, database)) ??
    DEFAULT_BACKGROUND
  )
}

export async function applyBackgroundPreference(
  userId: string,
  value: string | null,
  database: PomoderDb = db
): Promise<BackgroundReference> {
  const resolved = await resolveBackgroundReference(userId, value, database)
  const selectedBackground = serializeBackgroundReference(resolved)
  await database
    .insert(userPreferences)
    .values({ userId, selectedBackground })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { selectedBackground, updatedAt: new Date() },
    })
  return resolved ?? DEFAULT_BACKGROUND
}
