import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm"

import { APPEAL_REMINDER_MS, type AppealAnswer } from "@/lib/bans/options"
import { handleWords } from "@/lib/social/networks"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { clearProblem } from "@/server/phones/notices"
import { ringBell } from "@/server/social/notices"

import { recordAccountEvent } from "./history"
import { promoBans } from "./schema"

/**
 * The appeal tracker (Bans task, part 25). Appeals are sent by hand in the
 * app; Promo only keeps the record: when it went, an optional note, and the
 * answer. Seven days with no answer rings the bell once. "Won" offers Let it
 * run again, after which the slow restart applies (part 23); "lost" offers
 * Clean up (part 6).
 */

/** The ban an appeal is about: the account's newest that was not cleaned up. */
async function openBan(userId: string, banId: string, db: CustomShellDb) {
  const [ban] = await db
    .select()
    .from(promoBans)
    .where(and(eq(promoBans.id, banId), eq(promoBans.userId, userId)))
    .limit(1)
  if (!ban) throw new Error("That ban is not there any more.")
  return ban
}

/** Records that an appeal was sent, today, with an optional note. */
export async function markAppealed(
  userId: string,
  banId: string,
  note: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const ban = await openBan(userId, banId, db)
  if (ban.appealedAt) throw new Error("This ban already has an appeal recorded.")
  await db
    .update(promoBans)
    .set({ appealedAt: now, appealNote: note.trim().slice(0, 1_000) })
    .where(eq(promoBans.id, ban.id))
  if (ban.accountId) await recordAccountEvent(userId, ban.accountId, "appealed", note.trim() ? `Appealed: ${note.trim().slice(0, 300)}` : "Appealed.", db, now)
}

/** Records the app's answer to the appeal. The reminder stops for good. */
export async function answerAppeal(
  userId: string,
  banId: string,
  answer: AppealAnswer,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (answer !== "won" && answer !== "lost") throw new Error("An appeal is won or lost.")
  const ban = await openBan(userId, banId, db)
  if (!ban.appealedAt) throw new Error("Record the appeal first.")
  if (ban.appealAnswer) throw new Error("This appeal already has its answer.")
  await db.update(promoBans).set({ appealAnswer: answer, appealAnsweredAt: now }).where(eq(promoBans.id, ban.id))
  if (ban.accountId) {
    await recordAccountEvent(userId, ban.accountId, "appeal_answered", answer === "won" ? "Appeal won." : "Appeal lost.", db, now)
    await clearProblem(userId, "appeal_waiting", ban.accountId, null, db, now)
  }
}

/**
 * Rings the bell once for each appeal 7 days old with no answer. Run by the
 * phones' upkeep on the ticker. An appeal already reminded about, answered,
 * or on a ban cleaned up or let run again rings nothing.
 */
export async function remindAppeals(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(promoBans)
    .where(
      and(
        isNotNull(promoBans.appealedAt),
        lte(promoBans.appealedAt, new Date(now.getTime() - APPEAL_REMINDER_MS)),
        eq(promoBans.appealAnswer, ""),
        isNull(promoBans.appealRemindedAt),
        isNull(promoBans.cleanedUpAt),
        isNull(promoBans.letRunAt),
        isNotNull(promoBans.accountId)
      )
    )
    .orderBy(desc(promoBans.appealedAt))
    .limit(50)
  for (const ban of due) {
    await db.update(promoBans).set({ appealRemindedAt: now }).where(eq(promoBans.id, ban.id))
    const who = handleWords(ban.app, ban.handle) || "an account"
    await ringBell(
      ban.userId,
      {
        kind: "appeal_waiting",
        targetId: ban.accountId ?? ban.id,
        message: `No answer to ${who}'s appeal yet`,
        detail: `No answer to ${who}'s appeal yet. It went in 7 days ago. Record the answer in the Anti Detect dashboard's Bans when it comes, or press Clean up to put its phone back to work.`,
        href: `/admin/anti-detect?section=bans&open=${encodeURIComponent(ban.id)}`,
      },
      db,
      now
    )
  }
  return due.length
}
