import { and, asc, eq, inArray, lt } from "drizzle-orm"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"

import { promoPhoneActions, promoPhoneScreenshots } from "./schema"
import { readPhoneSettings } from "./settings"

/**
 * The picture trail of every phone action (part 17 of the phone farm): one
 * small screenshot per step, so a failed action shows where it stopped.
 *
 * Kept privately in R2, never in the database and never at a public address:
 * each picture is encrypted with the server's key, the same key that keeps a
 * window password, and only an admin's request through `stepPictures` opens
 * it. A finished action's pictures go after the days set in Settings →
 * Phones; a failed action's stay until a person clears them, because those
 * are the ones worth looking at.
 */

export type StepShot = { step: string; jpeg: string }

/** At most this many steps per action, each at most about 1.5MB of base64. */
const MAX_STEPS = 30
const MAX_SHOT_CHARS = 2_000_000

function objectKey(phoneId: string, actionId: string, name: string): string {
  return `promo-phone-steps/${phoneId}/${actionId}/${name}.bin`
}

/**
 * Keeps an action's step pictures, all uploaded at once, then listed in one
 * write, and returns the rows it wrote. A picture R2 will not take is logged
 * and its step is still listed, with no picture, so the trail keeps its order.
 */
export async function keepStepPictures(
  phoneId: string,
  actionId: string,
  shots: StepShot[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string[]> {
  const valid = shots.filter((shot) => shot.jpeg.length <= MAX_SHOT_CHARS && /^[A-Za-z0-9+/=]+$/.test(shot.jpeg))
  // Too many: the first steps and the last, which is where it stopped.
  const usable = valid.length <= MAX_STEPS ? valid : [...valid.slice(0, MAX_STEPS - 1), ...valid.slice(-1)]
  if (!usable.length) return []
  // Each answer's pictures get their own keys, so a second copy of the same
  // answer can never overwrite or delete the first one's.
  const batch = uuid().slice(0, 8)
  const kept = await Promise.all(
    usable.map(async (shot, position) => {
      const key = objectKey(phoneId, actionId, `${batch}-${position}`)
      try {
        await uploadToR2(key, Buffer.from(encryptSecret(shot.jpeg), "utf8"), "application/octet-stream")
        return key
      } catch (error) {
        console.error(`Could not keep picture ${position + 1} of phone action ${actionId}`, error)
        return ""
      }
    })
  )
  const rows = await db
    .insert(promoPhoneScreenshots)
    .values(
      usable.map((shot, position) => ({
        id: uuid(),
        actionId,
        step: shot.step.trim().slice(0, 200),
        position,
        objectKey: kept[position],
        createdAt: now,
      }))
    )
    .returning({ id: promoPhoneScreenshots.id })
  return rows.map((row) => row.id)
}

/** Deletes pictures just kept for an answer that was then turned away. */
export async function dropStepPictures(ids: string[], db: CustomShellDb = defaultDb): Promise<void> {
  await removePictures(ids, db, "rows")
}

export type StepPicture = { id: string; step: string; src: string | null }

/** An action's steps in order, each with its picture as a data address, or null when it was not kept. */
export async function stepPictures(
  userId: string,
  actionId: string,
  db: CustomShellDb = defaultDb
): Promise<StepPicture[]> {
  const [action] = await db
    .select({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .where(and(eq(promoPhoneActions.id, actionId), eq(promoPhoneActions.userId, userId)))
    .limit(1)
  if (!action) throw new Error("That action does not exist.")
  const rows = await db
    .select()
    .from(promoPhoneScreenshots)
    .where(eq(promoPhoneScreenshots.actionId, actionId))
    .orderBy(asc(promoPhoneScreenshots.position), asc(promoPhoneScreenshots.createdAt))
  return Promise.all(
    rows.map(async (row) => ({ id: row.id, step: row.step, src: await pictureSource(row) }))
  )
}

async function pictureSource(row: typeof promoPhoneScreenshots.$inferSelect): Promise<string | null> {
  if (!row.objectKey) return null
  try {
    const object = await getFromR2(row.objectKey)
    if (!object.Body) return null
    const sealed = Buffer.from(await object.Body.transformToByteArray()).toString("utf8")
    return `data:image/jpeg;base64,${decryptSecret(sealed)}`
  } catch (error) {
    console.error(`Could not open the picture ${row.objectKey}`, error)
    return null
  }
}

/**
 * Deletes pictures from R2 and the list, by their actions or by their own
 * rows. A picture R2 will not delete keeps its row.
 */
async function removePictures(ids: string[], db: CustomShellDb, by: "actions" | "rows" = "actions"): Promise<number> {
  if (!ids.length) return 0
  const rows = await db
    .select({ id: promoPhoneScreenshots.id, objectKey: promoPhoneScreenshots.objectKey })
    .from(promoPhoneScreenshots)
    .where(inArray(by === "actions" ? promoPhoneScreenshots.actionId : promoPhoneScreenshots.id, ids))
  const gone: string[] = []
  // Ten at a time, so a backlog does not hold up the rest of the ticker.
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
  if (gone.length) await db.delete(promoPhoneScreenshots).where(inArray(promoPhoneScreenshots.id, gone))
  return gone.length
}

/** A person clearing a failed action's pictures once they have seen them. */
export async function clearStepPictures(
  userId: string,
  actionId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [action] = await db
    .select({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .where(and(eq(promoPhoneActions.id, actionId), eq(promoPhoneActions.userId, userId)))
    .limit(1)
  if (!action) throw new Error("That action does not exist.")
  await removePictures([actionId], db)
}

/**
 * The pictures of actions that did not fail, once they are older than the
 * days set in Settings → Phones. Fifty actions a pass, so a long backlog is
 * worked through over a few passes rather than in one go.
 */
export async function tidyStepPictures(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const { screenshotDays } = await readPhoneSettings(db)
  const cutoff = new Date(now.getTime() - screenshotDays * 86_400_000)
  const old = await db
    .selectDistinct({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .innerJoin(promoPhoneScreenshots, eq(promoPhoneScreenshots.actionId, promoPhoneActions.id))
    .where(
      and(inArray(promoPhoneActions.status, ["done", "cancelled"]), lt(promoPhoneActions.createdAt, cutoff))
    )
    .limit(50)
  return removePictures(old.map((row) => row.id), db)
}

/** Every picture of these phones, for when the phones are deleted. */
export async function removePhonePictures(phoneIds: string[], db: CustomShellDb = defaultDb): Promise<void> {
  if (!phoneIds.length) return
  const actions = await db
    .select({ id: promoPhoneActions.id })
    .from(promoPhoneActions)
    .where(inArray(promoPhoneActions.phoneId, phoneIds))
  await removePictures(actions.map((row) => row.id), db)
}
