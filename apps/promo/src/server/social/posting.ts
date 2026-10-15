import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { paceCounts, paceLimit, type PaceLimit } from "@/lib/social/pace"
import { isAwake, nextWakeAt } from "@/lib/social/waking"
import { postingRefusalText } from "@/lib/social/wording"

import {
  isYoung,
  accountTimeZone,
  readBehaviour,
  recentComments,
  warmUpEndsAt,
} from "./behaviour"
import { refuseInteraction } from "./apart"
import { queueJob } from "./jobs"
import { pausedBy } from "./pause"
import { promoAccounts, promoFinds, promoJobs } from "./schema"

/**
 * Whether an account may comment now, and if not, when.
 *
 * Three things hold a comment back, all from Settings → Behaviour. A warming
 * account is refused until its warm-up ends. A young account is refused past
 * its comments per hour or per day, with when the next is allowed. Outside
 * the account's waking hours a comment is not refused: it waits for its
 * morning, and the Projects dashboard says when it goes. Every account also
 * gets the pace line and, past the per-hour number, a warning that never
 * refuses.
 *
 * Nothing here posts. A person pressing Post is still the only way a comment
 * is written, and a waiting comment can be cancelled until it goes.
 */

export type PostingState = {
  /**
   * Paused on the Reddit accounts dashboard, or in a paused project, which
   * refuses Post until it is resumed. Null when it is running.
   */
  paused: "account" | "project" | null
  /** The account's own clock, which its waking hours are counted on. */
  timeZone: string
  awake: boolean
  /** When it next wakes. Null while it is awake. */
  nextWakeAt: Date | null
  warmUp: {
    /** Null when the warm-up is over or switched off. */
    endsAt: Date | null
    /** True when the account's age was never read, so nobody can tell. */
    ageUnknown: boolean
  }
  young: boolean
  /** Comments that reached Reddit in the last hour and the last 24 hours. */
  lastHour: number
  lastDay: number
  warnPerHour: number
  youngPerHour: number
  youngPerDay: number
  /** The young account's limit it is at, or null. Always null for an older account. */
  limit: PaceLimit | null
  /** Comments pressed and held back for the account's waking hours. */
  waiting: Array<{ findId: string; runAfter: Date }>
}

type AccountRow = typeof promoAccounts.$inferSelect

export async function readPostingState(
  userId: string,
  account: Pick<AccountRow, "id" | "profileId" | "phoneId" | "redditCreatedAt" | "pausedAt" | "projectId">,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PostingState> {
  const behaviour = await readBehaviour(userId, db)
  const timeZone = await accountTimeZone(account, db)
  const ends = warmUpEndsAt(account.redditCreatedAt, behaviour.warmUpDays, now)
  const young = isYoung(account.redditCreatedAt, behaviour.youngDays, now)
  const { posted, waiting } = await recentComments(userId, account.id, db, now)
  const counts = paceCounts(posted, now)

  const held = await db
    .select({ payload: promoJobs.payload, runAfter: promoJobs.runAfter })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "comment"),
        eq(promoJobs.status, "queued"),
        gt(promoJobs.runAfter, now),
        sql`${promoJobs.payload}->>'accountId' = ${account.id}`
      )
    )
    .orderBy(asc(promoJobs.runAfter))

  return {
    paused: await pausedBy(userId, account, db),
    timeZone,
    awake: isAwake(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    nextWakeAt: nextWakeAt(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    warmUp: { endsAt: ends ?? null, ageUnknown: ends === undefined },
    young,
    ...counts,
    warnPerHour: behaviour.warnPerHour,
    youngPerHour: behaviour.youngPerHour,
    youngPerDay: behaviour.youngPerDay,
    limit: young
      ? paceLimit({
          posted,
          waiting,
          now,
          perHour: behaviour.youngPerHour,
          perDay: behaviour.youngPerDay,
        })
      : null,
    waiting: held.flatMap((row) =>
      typeof row.payload.findId === "string" && row.runAfter
        ? [{ findId: row.payload.findId, runAfter: row.runAfter }]
        : []
    ),
  }
}

/**
 * How long a pressed comment waits before the browser may take it, so Undo
 * can take it back. Tyler picked "ten seconds to undo Post" on 12 Oct 2026.
 */
const UNDO_SECONDS = 10

/**
 * Queues a comment a person pressed Post for, or refuses it with why.
 *
 * It waits ten seconds before the browser may take it, so a wrong account or
 * a typo can be undone with Undo (`cancelWaitingComment`). Outside waking
 * hours it is queued to start at the account's next morning instead, and the
 * answer says when. A post that already has a comment on its way is refused,
 * so a second press never sends two.
 */
export async function queueComment(
  userId: string,
  account: Pick<
    AccountRow,
    | "id"
    | "handle"
    | "importance"
    | "movingToPhoneId"
    | "profileId"
    | "phoneId"
    | "redditCreatedAt"
    | "pausedAt"
    | "projectId"
  >,
  input: { findId: string; text: string; draftId: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ jobId: string; runAfter: Date | null; undoUntil: Date | null }> {
  const [onItsWay] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "comment"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'findId' = ${input.findId}`
      )
    )
    .limit(1)
  if (onItsWay) {
    throw new Refusal("A comment on this post is already on its way. Cancel it first to send a different one.")
  }

  const state = await readPostingState(userId, account, db, now)
  const refusal = postingRefusalText(state, now, state.timeZone)
  if (refusal) throw new Refusal(refusal)

  // Important and throwaway accounts are kept apart: the post's author, the
  // words, and who else commented under it (part 22 of the phone farm).
  const [find] = await db
    .select({ author: promoFinds.author, redditId: promoFinds.redditId })
    .from(promoFinds)
    .where(and(eq(promoFinds.id, input.findId), eq(promoFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That post is no longer saved.")
  await refuseInteraction(
    userId,
    account,
    { postAuthor: find.author, redditPostId: find.redditId, words: [input.text] },
    db
  )

  const runAfter = state.nextWakeAt
  const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
  const jobId = await queueJob(
    userId,
    "comment",
    { findId: input.findId, accountId: account.id, text: input.text, draftId: input.draftId },
    db,
    runAfter ?? undoUntil
  )
  return { jobId, runAfter, undoUntil }
}

/**
 * Cancels a comment still waiting for the account's waking hours. One that
 * has started cannot be cancelled: it may already be on Reddit.
 */
export async function cancelWaitingComment(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const removed = await db
    .delete(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "comment"),
        eq(promoJobs.status, "queued"),
        sql`${promoJobs.payload}->>'findId' = ${findId}`
      )
    )
    .returning({ id: promoJobs.id })
  if (!removed.length) {
    throw new Error("That comment is no longer waiting. It may have started going to Reddit.")
  }
}
