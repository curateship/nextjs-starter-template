import { and, eq, gte, inArray, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { queueJob } from "../jobs"
import { promoAccounts } from "../schema"
import { xFollow } from "./calls"
import { promoXFollows } from "./schema"
import { readXSettings } from "./searchers"

/**
 * Following the people an account replies to (part 44). Tyler, 21 Oct 2026:
 * "You set it, start at 5". Off on every account to begin with; switched on
 * per account on the Accounts dashboard. After a reply lands, its account
 * follows the person it answered, as a job of its own after the visit, at
 * most the follows a day in Settings → Behaviour under X. Too many follows a
 * day is one of the surest ways to get an X account locked, so a follow over
 * the number is dropped, never held for tomorrow.
 *
 * A follow is a public action, so it only ever follows somebody a person
 * pressed Post to reply to.
 */

const DAY_MS = 86_400_000

/** How many follows an account made or has waiting in the last day. */
export async function followsToday(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoXFollows)
    .where(
      and(
        eq(promoXFollows.userId, userId),
        eq(promoXFollows.accountId, accountId),
        inArray(promoXFollows.status, ["waiting", "done"]),
        gte(promoXFollows.createdAt, new Date(now.getTime() - DAY_MS))
      )
    )
  return row?.n ?? 0
}

/**
 * Queues a follow of the person a reply answered, when the account has
 * following switched on, has follows left today, and never followed them
 * before. Returns why it did not, or null when it queued one.
 */
export async function queueFollowBack(
  userId: string,
  accountId: string,
  handle: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  const [account] = await db
    .select({ followBack: promoAccounts.xFollowBack, handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account?.followBack) return "Following is off on this account."
  if (account.handle.toLowerCase() === handle.toLowerCase()) return "That is the account itself."
  const { followsPerDay } = await readXSettings(userId, db)
  if ((await followsToday(userId, accountId, db, now)) >= followsPerDay) {
    return `It already followed ${followsPerDay} today, the number in Settings → Behaviour.`
  }
  const id = uuid()
  const inserted = await db
    .insert(promoXFollows)
    .values({ id, userId, accountId, handle: handle.slice(0, 20), createdAt: now })
    .onConflictDoNothing()
    .returning({ id: promoXFollows.id })
  if (!inserted.length) return "It follows them already."
  try {
    const jobId = await queueJob(userId, "x_follow", { followId: id, accountId }, db)
    await db.update(promoXFollows).set({ jobId }).where(eq(promoXFollows.id, id))
  } catch (error) {
    await db.delete(promoXFollows).where(eq(promoXFollows.id, id))
    if (error instanceof Refusal) return error.message
    throw error
  }
  return null
}

/** Follows one person from the account's browser or phone, and writes down that it did. */
export async function runXFollow(
  userId: string,
  followId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoXFollows)
    .where(and(eq(promoXFollows.id, followId), eq(promoXFollows.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That follow is not saved any more.")
  if (row.status !== "waiting") return
  try {
    const { done } = await xFollow(target, { handle: row.handle })
    if (!done) throw new Error(`Follow was pressed, but X does not show @${row.handle} as followed.`)
  } catch (error) {
    await db.update(promoXFollows).set({ status: "failed" }).where(eq(promoXFollows.id, row.id))
    throw error
  }
  await db.update(promoXFollows).set({ status: "done" }).where(eq(promoXFollows.id, row.id))
}
