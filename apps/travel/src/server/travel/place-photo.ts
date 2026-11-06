import { and, eq, isNull } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  cleanOriginalName,
  getMediaFileType,
  prepareMediaContent,
  serializeMedia,
  storedFilename,
  validateMediaFile,
} from "@/server/media/library"
import { getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireActivity } from "@/server/travel/access"
import { spendGoogleLookup } from "@/server/travel/google-usage"
import { PHOTO_NAME } from "@/server/travel/google"
import { travelActivities } from "@/server/travel/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * A place's picture from Google, saved into the person's media library. A
 * Maps link (task "Misc") and a place picked from the search (More Travel
 * features part 2) both fill a card's picture this way. Only Google's own
 * picture hosts are ever downloaded from.
 */

const TIMEOUT_MS = 10_000

export const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

export type Picture = { mimeType: string; data: Uint8Array; isMap?: boolean }

/** Saves picture bytes into the person's media library, returning its address, or null when it won't save. */
export async function savePicture(userId: string, raw: Uint8Array, mimeType: string, title: string, database: CustomShellDb) {
  if (!PHOTO_TYPES.has(mimeType) || raw.byteLength === 0) return null
  try {
    validateMediaFile(mimeType, raw.byteLength)
    const data = prepareMediaContent(mimeType, raw)
    const originalName = cleanOriginalName(`${title}.${mimeType.split("/")[1]}`)
    const filename = storedFilename(originalName, mimeType)
    const storagePath = `${userId}/${filename}`
    await getPublicMediaUrl(storagePath)
    await uploadToR2(storagePath, data, mimeType)
    const at = now()
    const row = {
      id: uuid(),
      workspaceId: await workspaceIdForRequest(userId),
      userId,
      filename,
      originalName,
      altText: title.slice(0, 200),
      fileSize: data.byteLength,
      mimeType,
      fileType: getMediaFileType(mimeType),
      storagePath,
      emailProtectedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    await database.insert(customShellMedia).values(row)
    return (await serializeMedia(row)).url
  } catch {
    // Storage that isn't set up, or a picture the library refuses, leaves the activity without one.
    return null
  }
}

/** Downloads a picture from one of Google's own picture hosts. Null for anything else or a failed download. */
export async function downloadPicture(url: string) {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== "https:" || !isPictureHost(parsed.hostname)) return null
  try {
    const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim()
    return { mimeType, data: new Uint8Array(await response.arrayBuffer()) }
  } catch {
    return null
  }
}

/** Google's hosts for place photos and map snapshots; nothing else is ever downloaded. */
function isPictureHost(host: string) {
  return host === "maps.google.com" || host === "maps.googleapis.com" || /^lh\d\.googleusercontent\.com$/.test(host)
}

/** The place's first Google photo, with a key; null when there is none. */
export async function googlePhoto(photoName: string | null | undefined, key: string) {
  if (!photoName || !PHOTO_NAME.test(photoName)) return null
  try {
    const response = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1600&key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim()
    return { mimeType, data: new Uint8Array(await response.arrayBuffer()) }
  } catch {
    return null
  }
}


/**
 * A place's own Google photo, saved into the person's media library and
 * returned as its address. Null with no Google key, no photo, a person past
 * today's Google lookups (Travel features 4, part 4), or a picture that won't
 * save; a picture is never worth failing anything over.
 */
export async function savedGooglePhoto(userId: string, photoName: string | null, title: string, database: CustomShellDb) {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!key || !photoName) return null
  const spent = await spendGoogleLookup(userId, database)
    .then(() => true)
    .catch(() => false)
  if (!spent) return null
  const picture = await googlePhoto(photoName, key)
  return picture ? savePicture(userId, picture.data, picture.mimeType, title, database) : null
}

/**
 * The picture of a place just picked from the search (More Travel features
 * part 2; Tyler: "Only fill if empty"): the place's first Google photo, only
 * when the card has no picture, so an upload or an Unsplash pick stays. The
 * photo must belong to the place saved on the card, so nothing else can be
 * fetched through it.
 */
export async function fillPickedPlacePhoto(
  userId: string,
  input: { activityId: string; photoName: string },
  database: CustomShellDb = db
) {
  const { activity } = await requireActivity(userId, input.activityId, database)
  const placeId = activity.place?.placeId
  if (activity.photoUrl || !placeId || !input.photoName.startsWith(`places/${placeId}/photos/`)) return { photo: false }
  const photoUrl = await savedGooglePhoto(userId, input.photoName, activity.title, database)
  if (!photoUrl) return { photo: false }
  // Still empty: a picture set while the photo downloaded wins.
  const filled = await database
    .update(travelActivities)
    .set({ photoUrl, photoCredit: null, updatedAt: now() })
    .where(and(eq(travelActivities.id, activity.id), isNull(travelActivities.photoUrl)))
    .returning({ id: travelActivities.id })
  return { photo: filled.length > 0 }
}
