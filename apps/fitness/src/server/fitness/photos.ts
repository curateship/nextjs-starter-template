import { and, desc, eq } from "drizzle-orm"

import type { Day } from "@/lib/fitness/dates"
import { FITNESS_ERRORS } from "@/lib/fitness/errors"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { type FitnessDb } from "@/server/fitness/access"
import { fitnessCoachClients, fitnessPhotoSessions } from "@/server/fitness/schema"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"

/**
 * Before and after photos. They are the most private thing in the app, so:
 *
 * - The storage key never leaves the server. The browser only ever sees
 *   `/api/fitness/photos/<session>/<slot>`, and that address checks who is
 *   asking on every request (`src/routes/api/fitness/photos.$sessionId.$slot.ts`).
 * - Only the owner can read them, plus a coach the owner switched photos on for.
 * - The key is an unguessable id under `fitness-photos/`. The bucket's public
 *   address could serve it to someone who knew the key, but nobody is ever
 *   told the key.
 */

export const PHOTO_SLOTS = ["front", "side", "back"] as const
export type PhotoSlot = (typeof PHOTO_SLOTS)[number]
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024
type PhotoType = "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif"

/** The photo type the file's first bytes show, or null for anything that isn't one. */
export function imageTypeOf(data: Uint8Array): PhotoType | null {
  const text = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to))
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg"
  if (data[0] === 0x89 && text(1, 4) === "PNG") return "image/png"
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp"
  if (text(4, 8) === "ftyp") {
    const brand = text(8, 12)
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic"
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif"
  }
  return null
}

/** Where photos are written. Tests hand in a fake so they never reach the bucket. */
export type PhotoStorage = {
  put: (path: string, data: Uint8Array, mimeType: string) => Promise<void>
  remove: (path: string) => Promise<void>
}

const photoBucket: PhotoStorage = {
  put: async (path, data, mimeType) => {
    await uploadToR2(path, data, mimeType)
  },
  remove: async (path) => {
    await deleteFromR2(path)
  },
}

type SessionRow = typeof fitnessPhotoSessions.$inferSelect

export type PhotoSession = {
  id: string
  day: Day
  bodyweightKg: number | null
  chestCm: number | null
  waistCm: number | null
  hipsCm: number | null
  armCm: number | null
  thighCm: number | null
  note: string
  photos: Record<PhotoSlot, string | null>
}

function keyColumn(slot: PhotoSlot) {
  return slot === "front" ? "frontKey" : slot === "side" ? "sideKey" : "backKey"
}

function toSession(row: SessionRow): PhotoSession {
  const address = (slot: PhotoSlot) =>
    row[keyColumn(slot)] ? `/api/fitness/photos/${row.id}/${slot}?v=${encodeURIComponent(row[keyColumn(slot)]!.slice(-8))}` : null
  return {
    id: row.id,
    day: row.day,
    bodyweightKg: row.bodyweightKg,
    chestCm: row.chestCm,
    waistCm: row.waistCm,
    hipsCm: row.hipsCm,
    armCm: row.armCm,
    thighCm: row.thighCm,
    note: row.note,
    photos: { front: address("front"), side: address("side"), back: address("back") },
  }
}

/** True when the actor may see this person's photos. */
export async function canSeePhotos(actorId: string, personId: string, database: FitnessDb = db) {
  if (actorId === personId) return true
  const [link] = await database
    .select({ allowed: fitnessCoachClients.photosAllowed, acceptedAt: fitnessCoachClients.acceptedAt })
    .from(fitnessCoachClients)
    .where(and(eq(fitnessCoachClients.coachUserId, actorId), eq(fitnessCoachClients.clientUserId, personId)))
    .limit(1)
  return Boolean(link?.allowed && link.acceptedAt)
}

export async function listPhotoSessions(actorId: string, personId: string, database: FitnessDb = db) {
  if (!(await canSeePhotos(actorId, personId, database))) throw new Error(FITNESS_ERRORS.photoNotFound)
  const rows = await database
    .select()
    .from(fitnessPhotoSessions)
    .where(eq(fitnessPhotoSessions.userId, personId))
    .orderBy(desc(fitnessPhotoSessions.day), desc(fitnessPhotoSessions.createdAt))
  return rows.map(toSession)
}

type PhotoSessionInput = Omit<PhotoSession, "id" | "photos">

async function ownSession(userId: string, sessionId: string, database: FitnessDb) {
  const [row] = await database
    .select()
    .from(fitnessPhotoSessions)
    .where(and(eq(fitnessPhotoSessions.id, sessionId), eq(fitnessPhotoSessions.userId, userId)))
    .limit(1)
  if (!row) throw new Error(FITNESS_ERRORS.photoNotFound)
  return row
}

export async function createPhotoSession(userId: string, input: PhotoSessionInput, database: FitnessDb = db) {
  const [row] = await database
    .insert(fitnessPhotoSessions)
    .values({ id: uuid(), userId, ...input, note: input.note.trim(), createdAt: now() })
    .returning()
  return toSession(row)
}

export async function updatePhotoSession(
  userId: string,
  sessionId: string,
  input: Partial<PhotoSessionInput>,
  database: FitnessDb = db
) {
  await ownSession(userId, sessionId, database)
  const [row] = await database
    .update(fitnessPhotoSessions)
    .set({ ...input, ...(input.note !== undefined ? { note: input.note.trim() } : {}) })
    .where(eq(fitnessPhotoSessions.id, sessionId))
    .returning()
  return toSession(row)
}

/** Puts one photo in a slot, replacing and deleting whatever was there. */
export async function savePhoto(
  userId: string,
  input: { sessionId: string; slot: PhotoSlot; mimeType: string; data: Uint8Array },
  database: FitnessDb = db,
  storage: PhotoStorage = photoBucket
) {
  if (input.data.byteLength > PHOTO_MAX_BYTES) throw new Error(FITNESS_ERRORS.photoTooBig)
  // The browser's word for the file's type is not trusted: the type stored and
  // later served is read from the file's own first bytes.
  const mimeType = imageTypeOf(input.data)
  if (!mimeType) throw new Error(FITNESS_ERRORS.photoType)
  const row = await ownSession(userId, input.sessionId, database)
  const key = `fitness-photos/${userId}/${uuid()}`
  await storage.put(key, input.data, mimeType)
  const column = keyColumn(input.slot)
  const old = row[column]
  const [saved] = await database
    .update(fitnessPhotoSessions)
    .set({ [column]: key })
    .where(eq(fitnessPhotoSessions.id, row.id))
    .returning()
  if (old) await storage.remove(old).catch(() => undefined)
  return toSession(saved)
}

export async function removePhoto(
  userId: string,
  sessionId: string,
  slot: PhotoSlot,
  database: FitnessDb = db,
  storage: PhotoStorage = photoBucket
) {
  const row = await ownSession(userId, sessionId, database)
  const column = keyColumn(slot)
  const old = row[column]
  const [saved] = await database
    .update(fitnessPhotoSessions)
    .set({ [column]: null })
    .where(eq(fitnessPhotoSessions.id, row.id))
    .returning()
  if (old) await storage.remove(old).catch(() => undefined)
  return toSession(saved)
}

/** Deletes a photo day and its photos from storage. */
export async function deletePhotoSession(
  userId: string,
  sessionId: string,
  database: FitnessDb = db,
  storage: PhotoStorage = photoBucket
) {
  const row = await ownSession(userId, sessionId, database)
  await database.delete(fitnessPhotoSessions).where(eq(fitnessPhotoSessions.id, row.id))
  for (const slot of PHOTO_SLOTS) {
    const key = row[keyColumn(slot)]
    if (key) await storage.remove(key).catch(() => undefined)
  }
}

/** The storage key behind one photo, for the actor allowed to see it, or null. */
export async function photoKeyFor(
  actorId: string,
  sessionId: string,
  slot: PhotoSlot,
  database: FitnessDb = db
): Promise<string | null> {
  const [row] = await database
    .select()
    .from(fitnessPhotoSessions)
    .where(eq(fitnessPhotoSessions.id, sessionId))
    .limit(1)
  if (!row || !(await canSeePhotos(actorId, row.userId, database))) return null
  return row[keyColumn(slot)]
}
