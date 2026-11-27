import { and, count, eq, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { cleanSubreddit } from "../keywords"
import { promoBlockedSubreddits, promoFinds } from "../schema"

/**
 * Subreddits the app never shows again.
 *
 * One list for all of a person's keywords, because the same off-topic
 * subreddit turns up under every one of them. Blocking hides, it never
 * deletes: the stored posts stay in `promo_finds` and the list leaves them
 * out, so unblocking brings them back exactly as they were. A post already
 * commented on is never hidden, whatever its subreddit, because that comment
 * is a record of something that happened.
 *
 * Names are compared without case, as Reddit compares them. The rule the
 * list itself reads by is `shownFind` in `../keywords.ts`, beside the reads
 * that use it.
 */

export type BlockedSubreddit = {
  subreddit: string
  createdAt: Date
  /** How many stored posts the block is hiding right now. */
  hidden: number
}

/** The blocked names, lower case, for the search to drop posts against. */
export async function blockedNames(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<Set<string>> {
  const rows = await db
    .select({ subreddit: promoBlockedSubreddits.subreddit })
    .from(promoBlockedSubreddits)
    .where(eq(promoBlockedSubreddits.userId, userId))
  return new Set(rows.map((row) => row.subreddit.toLowerCase()))
}

export async function listBlockedSubreddits(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<BlockedSubreddit[]> {
  const rows = await db
    .select()
    .from(promoBlockedSubreddits)
    .where(eq(promoBlockedSubreddits.userId, userId))
    .orderBy(sql`lower(${promoBlockedSubreddits.subreddit})`)
  if (!rows.length) return []

  // Every count in one read rather than one per subreddit.
  const counts = await db
    .select({ name: sql<string>`lower(${promoFinds.subreddit})`, hidden: count() })
    .from(promoFinds)
    .where(and(eq(promoFinds.userId, userId), ne(promoFinds.status, "commented")))
    .groupBy(sql`lower(${promoFinds.subreddit})`)
  const hidden = new Map(counts.map((row) => [row.name, Number(row.hidden)]))

  return rows.map((row) => ({
    subreddit: row.subreddit,
    createdAt: row.createdAt,
    hidden: hidden.get(row.subreddit.toLowerCase()) ?? 0,
  }))
}

/**
 * Puts a subreddit on the list and says how many stored posts it hid.
 *
 * Blocking one that is already blocked is not an error: the answer is the
 * same list and the same count, so a second press does no harm.
 */
export async function blockSubreddit(
  userId: string,
  raw: string,
  db: CustomShellDb = defaultDb
): Promise<{ subreddit: string; hidden: number }> {
  const subreddit = cleanSubreddit(raw)
  if (!subreddit) throw new Error("Type a subreddit name first.")

  await db
    .insert(promoBlockedSubreddits)
    .values({ id: uuid(), userId, subreddit })
    .onConflictDoNothing()

  return { subreddit, hidden: await hiddenBy(userId, subreddit, db) }
}

/** Takes a subreddit off the list and says how many posts came back. */
export async function unblockSubreddit(
  userId: string,
  raw: string,
  db: CustomShellDb = defaultDb
): Promise<{ subreddit: string; restored: number }> {
  const subreddit = cleanSubreddit(raw)
  const removed = await db
    .delete(promoBlockedSubreddits)
    .where(
      and(
        eq(promoBlockedSubreddits.userId, userId),
        sql`lower(${promoBlockedSubreddits.subreddit}) = lower(${subreddit})`
      )
    )
    .returning({ subreddit: promoBlockedSubreddits.subreddit })
  if (!removed.length) throw new Error(`r/${subreddit || raw} is not blocked.`)

  return { subreddit: removed[0].subreddit, restored: await hiddenBy(userId, subreddit, db) }
}

/** The stored posts a block on this subreddit hides: all but the commented ones. */
async function hiddenBy(userId: string, subreddit: string, db: CustomShellDb): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(promoFinds)
    .where(
      and(
        eq(promoFinds.userId, userId),
        ne(promoFinds.status, "commented"),
        sql`lower(${promoFinds.subreddit}) = lower(${subreddit})`
      )
    )
  return Number(row?.n ?? 0)
}
