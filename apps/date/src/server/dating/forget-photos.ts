import { and, eq, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { deletePictures } from "@/server/phone/pictures"
import { datePictures } from "@/server/phone/schema"
import { dateMatches, dateOwnProfiles, dateProfiles } from "@/server/tinder/schema"

import { decideSwipe } from "./ai"
import { readDatingSettings } from "./settings"

/**
 * Strangers' photos are not kept for ever (part 8 of
 * "features/02-swiping-and-scoring"). 30 days after a pass, the card's photos
 * are deleted from R2 and its photo list emptied. The name, age, score and
 * read stay. Tyler's choice, 18 Oct 2026.
 *
 * Kept: a pass the member made against the AI's score, because the AI learns
 * from those (`overruledCards` in `ai.ts`); every like; and sample cards. A
 * photo another card, a match or the member's own profile still uses is not
 * deleted, because the same picture is kept once per member.
 */

/** A pass's photos go this many days after the swipe. */
export const FORGET_PASSED_PHOTOS_DAYS = 30

/** Cards looked at in one run. The worker runs this once a day. */
const BATCH = 500

/** Deletes the photos of passes older than 30 days. Returns how many cards lost theirs. */
export async function forgetPassedPhotos(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - FORGET_PASSED_PHOTOS_DAYS * 86_400_000)
  const rows = await db
    .select({
      id: dateProfiles.id,
      accountId: dateProfiles.accountId,
      swipedBy: dateProfiles.swipedBy,
      aiScore: dateProfiles.aiScore,
      aiFlags: dateProfiles.aiFlags,
      photoIds: dateProfiles.photoIds,
    })
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.swipe, "pass"),
        lt(dateProfiles.swipedAt, cutoff),
        eq(dateProfiles.sample, false),
        isNull(dateProfiles.photosForgottenAt),
        ne(dateProfiles.photoIds, sql`'[]'::jsonb`)
      )
    )
    .limit(BATCH)

  // An overruled pass: the member passed a card the AI's rule would like, by the like line as it is now.
  const likeLines = new Map<string, number>()
  const forget: typeof rows = []
  for (const row of rows) {
    if (row.swipedBy === "member") {
      if (!likeLines.has(row.accountId)) likeLines.set(row.accountId, (await readDatingSettings(row.accountId, db)).likeAbove)
      if (decideSwipe(row, { likeAbove: likeLines.get(row.accountId) as number }) === "like") continue
    }
    forget.push(row)
  }
  if (!forget.length) return 0

  const ids = [...new Set(forget.flatMap((row) => row.photoIds))]
  const forgetIds = forget.map((row) => row.id)
  const stillUsed = new Set<string>()
  const list = sql`array[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `
  )}]::text[]`
  const [cards, matches, own] = await Promise.all([
    db
      .select({ photoIds: dateProfiles.photoIds })
      .from(dateProfiles)
      .where(and(notInArray(dateProfiles.id, forgetIds), sql`${dateProfiles.photoIds} ?| ${list}`)),
    db.select({ photoId: dateMatches.photoId }).from(dateMatches).where(inArray(dateMatches.photoId, ids)),
    db
      .select({ photoIds: dateOwnProfiles.photoIds })
      .from(dateOwnProfiles)
      .where(sql`${dateOwnProfiles.photoIds} ?| ${list}`),
  ])
  for (const row of [...cards, ...own]) for (const id of row.photoIds) stillUsed.add(id)
  for (const row of matches) if (row.photoId) stillUsed.add(row.photoId)

  await deletePictures(
    ids.filter((id) => !stillUsed.has(id)),
    db
  )
  // A card is emptied once each of its photos is gone or still used elsewhere.
  // One whose picture R2 would not delete keeps it, and is tried again next time.
  const left = new Set(
    (await db.select({ id: datePictures.id }).from(datePictures).where(inArray(datePictures.id, ids))).map((row) => row.id).filter((id) => !stillUsed.has(id))
  )
  const done = forget.filter((row) => row.photoIds.every((id) => !left.has(id))).map((row) => row.id)
  if (done.length) {
    await db.update(dateProfiles).set({ photoIds: [], photosForgottenAt: now, updatedAt: now }).where(inArray(dateProfiles.id, done))
  }
  return done.length
}
