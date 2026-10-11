import { eq, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { TIDY_DAYS_RANGE, TIDY_DEFAULT_DAYS } from "@/lib/social/options"

import { promoRedditSettings } from "./schema"

/**
 * Dropping the posts and stored threads nobody will look at again.
 *
 * A year of daily searches is tens of thousands of found posts, most of them
 * skipped months ago and each carrying its stored replies. The database is
 * shared, so two things happen to a post no search has seen for the number of
 * days set in Settings:
 *
 * - **Skipped, it is deleted.**
 * - **Still open, it keeps its row and loses its stored replies**, the big
 *   part. The screen already reads a missing thread as "not read yet" and
 *   offers to read it again.
 *
 * A post with a comment against it, sent or failed, is never touched, and
 * nor is a skipped post with drafts, since deleting the post would take its
 * drafts with it. Comments, drafts and the shell's own tables are out of
 * reach entirely.
 *
 * Age is when a search last saw the post, not when it went up. A post a
 * search still returns is still in front of someone; deleting it would only
 * bring it back as new on the next run.
 */

/** Rows one pass touches, each kind, so a big backlog never holds up the shared ticker. */
export const TIDY_BATCH = 500

/** The person's tidy-up setting, or the default when they never changed it. */
export async function readTidyAfterDays(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<number> {
  const [row] = await db
    .select({ days: promoRedditSettings.tidyAfterDays })
    .from(promoRedditSettings)
    .where(eq(promoRedditSettings.userId, userId))
    .limit(1)
  return row?.days ?? TIDY_DEFAULT_DAYS
}

export async function saveTidyAfterDays(
  userId: string,
  days: number,
  db: CustomShellDb = defaultDb
): Promise<number> {
  if (!Number.isInteger(days) || days < TIDY_DAYS_RANGE.min || days > TIDY_DAYS_RANGE.max) {
    throw new Error(
      `The days have to be a whole number from ${TIDY_DAYS_RANGE.min} to ${TIDY_DAYS_RANGE.max}.`
    )
  }
  await db
    .insert(promoRedditSettings)
    .values({ userId, tidyAfterDays: days })
    .onConflictDoUpdate({
      target: promoRedditSettings.userId,
      set: { tidyAfterDays: days, updatedAt: new Date() },
    })
  return days
}

/**
 * One pass for every person: deletes up to `TIDY_BATCH` skipped posts past
 * their age and clears the stored replies of up to as many open ones. A
 * person whose setting is 0 is skipped entirely.
 *
 * Every column is qualified: an unqualified name in a raw statement resolves
 * against the wrong table without complaining about it.
 */
export async function tidyOldFinds(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ deleted: number; cleared: number }> {
  const at = sql`${now.toISOString()}::timestamptz`
  const days = sql`COALESCE("s"."tidy_after_days", ${TIDY_DEFAULT_DAYS})`
  const pastAge = sql`${days} > 0 AND "f"."last_seen_at" < ${at} - make_interval(days => ${days})`
  const noComment = sql`NOT EXISTS (SELECT 1 FROM "promo_comments" AS "c" WHERE "c"."find_id" = "f"."id")`

  const deleted = await db.execute(sql`
    DELETE FROM "promo_finds"
    WHERE "promo_finds"."id" IN (
      SELECT "f"."id" FROM "promo_finds" AS "f"
      LEFT JOIN "promo_reddit_settings" AS "s" ON "s"."user_id" = "f"."user_id"
      WHERE "f"."status" = 'skipped'
        AND ${pastAge}
        AND ${noComment}
        AND NOT EXISTS (SELECT 1 FROM "promo_drafts" AS "d" WHERE "d"."find_id" = "f"."id")
      ORDER BY "f"."last_seen_at" ASC
      LIMIT ${TIDY_BATCH}
    )
    RETURNING "promo_finds"."id"
  `)

  const cleared = await db.execute(sql`
    UPDATE "promo_finds"
    SET "thread" = NULL, "thread_read_at" = NULL
    WHERE "promo_finds"."id" IN (
      SELECT "f"."id" FROM "promo_finds" AS "f"
      LEFT JOIN "promo_reddit_settings" AS "s" ON "s"."user_id" = "f"."user_id"
      WHERE "f"."status" IN ('new', 'shortlisted')
        AND "f"."thread" IS NOT NULL
        AND ${pastAge}
        AND ${noComment}
      ORDER BY "f"."last_seen_at" ASC
      LIMIT ${TIDY_BATCH}
    )
    RETURNING "promo_finds"."id"
  `)

  return { deleted: deleted.rows.length, cleared: cleared.rows.length }
}
