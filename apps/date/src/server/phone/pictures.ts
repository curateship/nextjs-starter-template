import { and, eq, inArray, lt, sql } from "drizzle-orm"
import sharp from "sharp"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"

import { sha256Hex } from "./signing"
import { datePhoneActions, datePictures } from "./schema"

/**
 * The pictures Date keeps: a step's screenshot, a photo cut from a Tinder
 * card, and the screen that stopped everything.
 *
 * They are other people's photos and private chats, so each is kept the way
 * Promo keeps its step pictures: encrypted with the server's key, in R2 under
 * a key nobody can read without the server, and handed out only to the member
 * who owns it (`src/routes/api/dating/picture.$pictureId.ts`). The same bytes
 * are kept once per member: a second copy finds the first and gets its id.
 */

export type PictureKind = "step" | "photo" | "stop"

/** Step pictures go after this many days. Photos and the stop screen stay while their record does. */
export const STEP_PICTURE_DAYS = 7

function objectKey(userId: string, sha: string): string {
  return `date-pictures/${userId}/${sha}.bin`
}

/**
 * Keeps one JPEG and returns its id. The same bytes kept before return the
 * same id and nothing is uploaded again.
 */
export async function keepPicture(
  userId: string,
  jpeg: Buffer,
  kind: PictureKind,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const sha = sha256Hex(jpeg)
  const existing = await findBySha(userId, sha, db)
  if (existing) return existing

  const meta = await sharp(jpeg).metadata()
  const key = objectKey(userId, sha)
  await uploadToR2(key, Buffer.from(encryptSecret(jpeg.toString("base64")), "utf8"), "application/octet-stream")
  const id = uuid()
  const [row] = await db
    .insert(datePictures)
    .values({
      id,
      userId,
      kind,
      sha256: sha,
      objectKey: key,
      width: meta.width ?? null,
      height: meta.height ?? null,
      bytes: jpeg.length,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: datePictures.id })
  // Two copies racing: the other one's row won, and its id is the answer.
  return row?.id ?? (await findBySha(userId, sha, db)) ?? id
}

async function findBySha(userId: string, sha: string, db: CustomShellDb): Promise<string | null> {
  const [row] = await db
    .select({ id: datePictures.id })
    .from(datePictures)
    .where(and(eq(datePictures.userId, userId), eq(datePictures.sha256, sha)))
    .limit(1)
  return row?.id ?? null
}

export type PictureFile =
  | { kind: "file"; jpeg: Buffer }
  | { kind: "sample"; path: string }

/** One of this member's pictures, or null when it is not theirs or no longer kept. */
export async function readPicture(
  userId: string,
  pictureId: string,
  db: CustomShellDb = defaultDb
): Promise<PictureFile | null> {
  const [row] = await db
    .select()
    .from(datePictures)
    .where(and(eq(datePictures.id, pictureId), eq(datePictures.userId, userId)))
    .limit(1)
  if (!row) return null
  if (row.samplePath) return { kind: "sample", path: row.samplePath }
  if (!row.objectKey) return null
  const object = await getFromR2(row.objectKey)
  if (!object.Body) return null
  const sealed = Buffer.from(await object.Body.transformToByteArray()).toString("utf8")
  return { kind: "file", jpeg: Buffer.from(decryptSecret(sealed), "base64") }
}

/** The JPEG bytes of a picture the server itself needs, such as a photo to show the AI. */
export async function pictureBytes(userId: string, pictureId: string, db: CustomShellDb = defaultDb): Promise<Buffer | null> {
  const file = await readPicture(userId, pictureId, db)
  return file?.kind === "file" ? file.jpeg : null
}

/** A box on the phone's screen, in the screen's own pixels: left, top, right, bottom. */
export type Bounds = [number, number, number, number]

/**
 * Cuts a box out of a screenshot. The phone may send its screenshot smaller
 * than the screen, so the box is scaled by how much smaller it is.
 */
export async function cropScreenshot(jpeg: Buffer, bounds: Bounds, screenWidth: number): Promise<Buffer> {
  const image = sharp(jpeg)
  const meta = await image.metadata()
  const width = meta.width ?? screenWidth
  const height = meta.height ?? 0
  const scale = screenWidth > 0 ? width / screenWidth : 1
  const left = clamp(Math.round(bounds[0] * scale), 0, width - 1)
  const top = clamp(Math.round(bounds[1] * scale), 0, Math.max(0, height - 1))
  const right = clamp(Math.round(bounds[2] * scale), left + 1, width)
  const bottom = clamp(Math.round(bounds[3] * scale), top + 1, height)
  return image
    .extract({ left, top, width: right - left, height: bottom - top })
    .jpeg({ quality: 85 })
    .toBuffer()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** 16 by 16 grey squares, the same for two pictures of the same thing. */
async function thumbnail(jpeg: Buffer): Promise<Buffer> {
  return sharp(jpeg).resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer()
}

/**
 * Whether two pictures show the same thing. A photo strip that stops moving
 * at its last photo is told this way, because two screenshots of one photo
 * are not always the same bytes.
 */
export async function looksSame(a: Buffer, b: Buffer): Promise<boolean> {
  const [x, y] = await Promise.all([thumbnail(a), thumbnail(b)])
  let total = 0
  for (let index = 0; index < x.length; index += 1) total += Math.abs(x[index] - y[index])
  return total / x.length < 6
}

/**
 * A short fingerprint of a picture, 64 bits as hex: each of 8 by 8 grey
 * squares lighter or darker than the average. Two crops of the same face in
 * a list differ in a few bits at most.
 */
export async function averageHash(jpeg: Buffer): Promise<string> {
  const pixels = await sharp(jpeg).resize(8, 8, { fit: "fill" }).greyscale().raw().toBuffer()
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length
  let bits = ""
  for (const value of pixels) bits += value > mean ? "1" : "0"
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0")
}

/** How many of 64 bits differ between two fingerprints. */
export function hashDistance(a: string, b: string): number {
  let diff = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
  let count = 0
  while (diff) {
    count += Number(diff & 1n)
    diff >>= 1n
  }
  return count
}

/** Deletes pictures from R2 and the list. One R2 will not delete keeps its row, to be tried again. */
export async function deletePictures(ids: string[], db: CustomShellDb = defaultDb): Promise<number> {
  if (!ids.length) return 0
  const rows = await db
    .select({ id: datePictures.id, objectKey: datePictures.objectKey })
    .from(datePictures)
    .where(inArray(datePictures.id, ids))
  const gone: string[] = []
  for (let start = 0; start < rows.length; start += 10) {
    await Promise.all(
      rows.slice(start, start + 10).map(async (row) => {
        try {
          if (row.objectKey) await deleteFromR2(row.objectKey)
          gone.push(row.id)
        } catch (error) {
          console.error(`Could not delete the picture ${row.objectKey}`, error)
        }
      })
    )
  }
  if (gone.length) await db.delete(datePictures).where(inArray(datePictures.id, gone))
  return gone.length
}

/**
 * Step pictures older than a week, fifty a pass, and the screenshots that
 * waited on action rows for a walk that never used them. Photos cut from
 * cards and the stop screen are not touched: they go with their record.
 */
export async function tidyOldPictures(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STEP_PICTURE_DAYS * 86_400_000)
  const old = await db
    .select({ id: datePictures.id })
    .from(datePictures)
    .where(and(eq(datePictures.kind, "step"), lt(datePictures.createdAt, cutoff)))
    .limit(50)
  const removed = await deletePictures(
    old.map((row) => row.id),
    db
  )
  // A screenshot is only held on the row until its walk has read it.
  await db
    .update(datePhoneActions)
    .set({ screenshot: null })
    .where(and(sql`${datePhoneActions.screenshot} is not null`, lt(datePhoneActions.createdAt, new Date(now.getTime() - 3_600_000))))
  return removed
}
