import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import type { JobKind } from "@/lib/social/options"

import { promoAccounts, promoJobs } from "./schema"

/**
 * The queue between the screen and the browser.
 *
 * A search through a real browser takes tens of seconds, and the shell's one
 * ticker fires every fifteen. Putting browser work on that ticker would hold
 * up every other job in the app, so the screen writes a row here and a process
 * of its own picks it up.
 *
 * The claiming is the shell's own, copied from `@/server/automations/engine`
 * rather than invented: one statement that picks and claims together, a claim
 * that expires so a worker that vanished hands its job back, and an attempt
 * count so an abandoned job stops instead of being retried forever in silence.
 */

/**
 * A claim older than this belonged to a worker that is gone.
 *
 * Ten minutes, longer than the slowest real job: opening a cold browser can
 * take five, and a comment typed at a person's pace up to four more. Shorter,
 * a second copy of the browser program could call a comment still being typed
 * abandoned, and report a comment that posted as failed.
 */
const CLAIM_TIMEOUT_MINUTES = 10

/** Three goes, then the job stays failed and says so on screen. A comment gets one. */
const MAX_ATTEMPTS = 3

/** What an abandoned comment says, since it is never tried again. */
const COMMENT_ABANDONED =
  "The browser stopped part-way through posting. It is not tried again, because the comment may already be on Reddit. Check the post before posting again."

export type QueuedJob = {
  id: string
  userId: string
  kind: JobKind
  payload: Record<string, unknown>
  attempts: number
}

/**
 * Serialises claims across every copy of the browser program, so checking
 * that a lane is free and taking its job happen as one step. The number is
 * arbitrary and only ever compared with itself.
 */
const CLAIM_LOCK_KEY = 7718235309136512n

/** Adds a job. The screen never waits for it. */
export async function queueJob(
  userId: string,
  kind: JobKind,
  payload: Record<string, unknown>,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const id = uuid()
  const lane = await laneFor(userId, payload, db)
  await db.insert(promoJobs).values({ id, userId, kind, payload, lane })
  return id
}

/**
 * The account a job works as, the one rule both the queue and the runner use.
 *
 * A comment names its account, because it was written for one. A search or a
 * thread is the person's Reddit work: their oldest Reddit account. Ordered,
 * so the lane a job is filed under is the profile it then runs in; with two
 * accounts and no order, the two could pick different ones, and two jobs would
 * drive one browser at once.
 */
export async function jobAccount(
  userId: string,
  payload: Record<string, unknown>,
  db: CustomShellDb = defaultDb
): Promise<typeof promoAccounts.$inferSelect | null> {
  const named = typeof payload.accountId === "string" ? payload.accountId : ""
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(
      named
        ? and(eq(promoAccounts.id, named), eq(promoAccounts.userId, userId))
        : and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "reddit"))
    )
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))
    .limit(1)
  return account ?? null
}

/**
 * The profile a job works in, which is its lane: the one a dashboard job
 * names, or its account's. Null when there is none, so the job is its own
 * lane and is refused when it runs.
 */
async function laneFor(
  userId: string,
  payload: Record<string, unknown>,
  db: CustomShellDb
): Promise<string | null> {
  if (typeof payload.profileId === "string" && payload.profileId) return payload.profileId
  return (await jobAccount(userId, payload, db))?.profileId ?? null
}

/**
 * Takes the oldest waiting job in a lane that has nothing running, or null.
 *
 * Jobs for one profile run one at a time and in order, because a browser has
 * one page and one driver; jobs for different profiles run side by side. The
 * check and the claim are one statement, made under a lock every copy of the
 * browser program shares, so two copies cannot both start work on one
 * profile. A job from before lanes has none and is never held back.
 *
 * `FOR UPDATE SKIP LOCKED` keeps a reader outside the lock from blocking on a
 * row being taken. Every column is qualified: an unqualified name in a raw
 * statement resolves against the wrong table without complaining about it.
 */
export async function claimNextJob(
  claimToken: string,
  db: CustomShellDb = defaultDb
): Promise<QueuedJob | null> {
  await failExpiredClaims(db)

  const claimed = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_KEY.toString()}::bigint)`)
    return tx.execute(sql`
      UPDATE "promo_jobs"
      SET "claim_token" = ${claimToken},
          "claimed_at" = now(),
          "status" = 'running',
          "attempts" = "promo_jobs"."attempts" + 1
      WHERE "promo_jobs"."id" IN (
        SELECT "inner"."id" FROM "promo_jobs" AS "inner"
        WHERE "inner"."status" = 'queued'
          AND (
            "inner"."lane" IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM "promo_jobs" AS "busy"
              WHERE "busy"."status" = 'running' AND "busy"."lane" = "inner"."lane"
            )
          )
        ORDER BY "inner"."created_at" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "promo_jobs"."id",
                "promo_jobs"."user_id",
                "promo_jobs"."kind",
                "promo_jobs"."payload",
                "promo_jobs"."attempts"
    `)
  })

  const row = (
    claimed.rows as Array<{
      id: string
      user_id: string
      kind: JobKind
      payload: Record<string, unknown>
      attempts: number
    }>
  )[0]
  if (!row) return null

  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    payload: row.payload ?? {},
    attempts: row.attempts,
  }
}

/**
 * Hands back a job whose worker disappeared.
 *
 * A job that has been abandoned three times is marked failed rather than
 * queued again, because the fourth attempt would fail the same way and the
 * loop would never notice it was stuck.
 *
 * A comment is never handed back. Its worker may have died after Reddit took
 * the comment, and a second go would post it twice, so it is marked failed on
 * the first abandonment and a person checks the post.
 */
export async function failExpiredClaims(
  db: CustomShellDb = defaultDb
): Promise<number> {
  const recovered = await db.execute(sql`
    UPDATE "promo_jobs"
    SET "status" = CASE
          WHEN "promo_jobs"."kind" = 'comment' THEN 'failed'
          WHEN "promo_jobs"."attempts" >= ${MAX_ATTEMPTS} THEN 'failed'
          ELSE 'queued'
        END,
        "claim_token" = NULL,
        "claimed_at" = NULL,
        "last_error" = CASE
          WHEN "promo_jobs"."kind" = 'comment'
            THEN ${COMMENT_ABANDONED}
          WHEN "promo_jobs"."attempts" >= ${MAX_ATTEMPTS}
            THEN 'The browser stopped part-way through, three times.'
          ELSE "promo_jobs"."last_error"
        END,
        "finished_at" = CASE
          WHEN "promo_jobs"."kind" = 'comment' THEN now()
          WHEN "promo_jobs"."attempts" >= ${MAX_ATTEMPTS} THEN now()
          ELSE NULL
        END
    WHERE "promo_jobs"."status" = 'running'
      AND "promo_jobs"."claimed_at" < now() - ${sql.raw(
        `interval '${CLAIM_TIMEOUT_MINUTES} minutes'`
      )}
    RETURNING "promo_jobs"."id"
  `)
  return recovered.rows.length
}

export async function finishJob(
  jobId: string,
  claimToken: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await db
    .update(promoJobs)
    .set({ status: "done", finishedAt: new Date(), claimToken: null })
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.claimToken, claimToken)))
}

/**
 * Marks a job failed, or puts it back for another go.
 *
 * The claim token is in the WHERE clause on purpose: a worker that lost its
 * claim to the expiry above must not then overwrite whatever the next worker
 * did with it.
 */
export async function failJob(
  jobId: string,
  claimToken: string,
  message: string,
  attempts: number,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const giveUp = attempts >= MAX_ATTEMPTS
  await db
    .update(promoJobs)
    .set({
      status: giveUp ? "failed" : "queued",
      lastError: message.slice(0, 2_000),
      claimToken: null,
      claimedAt: null,
      finishedAt: giveUp ? new Date() : null,
    })
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.claimToken, claimToken)))
}

export type JobCounts = {
  queued: number
  running: number
  failed: number
  /**
   * The keywords with a search job waiting or running, so a card can say so
   * about itself rather than every card lighting up whenever anything is
   * queued. A job that reads one post's replies belongs to no keyword and is
   * deliberately not in here.
   */
  searchingKeywordIds: string[]
}

/** What is waiting or running, so the screen can say what is happening. */
export async function jobCounts(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<JobCounts> {
  const rows = await db
    .select({
      status: promoJobs.status,
      kind: promoJobs.kind,
      payload: promoJobs.payload,
    })
    .from(promoJobs)
    .where(eq(promoJobs.userId, userId))

  const counts: JobCounts = {
    queued: 0,
    running: 0,
    failed: 0,
    searchingKeywordIds: [],
  }
  const searching = new Set<string>()

  for (const row of rows) {
    if (row.status === "queued") counts.queued += 1
    else if (row.status === "running") counts.running += 1
    else if (row.status === "failed") counts.failed += 1
    else continue

    if (row.kind !== "search") continue
    if (row.status !== "queued" && row.status !== "running") continue
    const keywordId = row.payload?.keywordId
    if (typeof keywordId === "string" && keywordId) searching.add(keywordId)
  }

  counts.searchingKeywordIds = [...searching]
  return counts
}

export const JOB_MAX_ATTEMPTS = MAX_ATTEMPTS

/**
 * Why the newest job of this kind for a profile failed, or null when it did
 * not. Only a failure newer than `since` counts, so a browser that has opened
 * since is not shown an old refusal.
 */
export async function lastFailedProfileJob(
  userId: string,
  kind: JobKind,
  profileId: string,
  since: Date | null,
  db: CustomShellDb = defaultDb
): Promise<string | null> {
  const [row] = await db
    .select({ status: promoJobs.status, lastError: promoJobs.lastError, finishedAt: promoJobs.finishedAt })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, kind),
        sql`${promoJobs.payload}->>'profileId' = ${profileId}`
      )
    )
    .orderBy(desc(promoJobs.createdAt))
    .limit(1)
  if (!row || row.status !== "failed" || !row.lastError) return null
  if (since && row.finishedAt && row.finishedAt < since) return null
  return row.lastError
}

export type LastBackupJob = {
  kind: "backup" | "restore"
  status: string
  lastError: string | null
  /** The backup a restore was for. */
  backupId: string | null
}

/**
 * The newest backup or restore for a profile, finished or not, so its tab can
 * say what happened last: still going, done, or refused and why.
 */
export async function lastBackupJob(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<LastBackupJob | null> {
  const [row] = await db
    .select({ kind: promoJobs.kind, status: promoJobs.status, lastError: promoJobs.lastError, payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["backup", "restore"]),
        sql`${promoJobs.payload}->>'profileId' = ${profileId}`
      )
    )
    .orderBy(desc(promoJobs.createdAt))
    .limit(1)
  if (!row) return null
  return {
    kind: row.kind as "backup" | "restore",
    status: row.status,
    lastError: row.lastError,
    backupId: typeof row.payload?.backupId === "string" ? row.payload.backupId : null,
  }
}

/** The jobs a profile's row on the dashboard waits on, by profile. */
export async function pendingProfileJobs(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<Array<{ kind: JobKind; profileId: string }>> {
  const rows = await db
    .select({ kind: promoJobs.kind, payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.status, ["queued", "running"]),
        inArray(promoJobs.kind, ["open", "close", "check", "site_check", "backup", "restore"])
      )
    )
  return rows
    .map((row) => ({ kind: row.kind, profileId: String(row.payload?.profileId ?? "") }))
    .filter((row) => row.profileId)
}
