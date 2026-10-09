import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm"

import { redditHealth, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { ProfileCheck } from "@/lib/social/options"

import { queueJob } from "./jobs"
import { promoAccounts, promoJobs } from "./schema"

/**
 * Whether the Reddit account is in good standing: its karma, how old it is,
 * and whether its profile loads for a stranger.
 *
 * A shadowbanned account posts comments that look fine to its owner and do
 * not exist for anybody else, with no notice and no email. The only way to
 * see it is to look at the profile signed out, which is what the reading does.
 * It stores what loaded and what did not, and never decides what that means;
 * `profileCheckWords` words it, carefully, when it is shown.
 *
 * Every reading is a read, so the ticker takes one a day on its own. Nothing
 * here acts on a bad reading.
 */

/** How long a reading stands before the ticker takes another. */
const HEALTH_EVERY_HOURS = 24

export type AccountHealth = {
  handle: string
  /** When the browser last saw who was signed in. Null means never. */
  stateReadAt: Date | null
  karma: number | null
  redditCreatedAt: Date | null
  /** When the karma and the age were read. Null means never. */
  karmaReadAt: Date | null
  profileCheck: ProfileCheck | null
  /** A health job is waiting or running. */
  checking: boolean
  /** Why the newest health job failed, when it did. */
  lastError: string | null
}

/** The readings for the account, and what its newest check is doing. */
export async function readAccountHealth(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<AccountHealth | null> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) return null

  const [job] = await db
    .select({ status: promoJobs.status, lastError: promoJobs.lastError })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "health"),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .orderBy(desc(promoJobs.createdAt))
    .limit(1)

  return {
    handle: account.handle,
    stateReadAt: account.stateReadAt,
    karma: account.karma,
    redditCreatedAt: account.redditCreatedAt,
    karmaReadAt: account.karmaReadAt,
    profileCheck: account.profileCheck,
    checking: job?.status === "queued" || job?.status === "running",
    lastError: job?.status === "failed" && job.lastError ? job.lastError : null,
  }
}

/** Asks for a reading now. One waiting at a time, so a second press adds nothing. */
export async function queueHealthCheck(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [account] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("Set up a Reddit account first.")
  if (await pendingHealthJob(userId, accountId, db)) return
  await queueJob(userId, "health", { accountId }, db)
}

/**
 * Takes a reading through the account's browser and stores it. Run by the
 * browser program for a `health` job.
 *
 * Signed out there is no profile to ask about, which is refused with a reason
 * a person can act on, and the last reading is left where it was.
 */
export async function recordAccountHealth(
  userId: string,
  accountId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const reading = await redditHealth(target)

  if (!reading.handle || !reading.profile) {
    throw new Refusal(
      reading.blocked
        ? `Reddit put something in front of the browser (${reading.reason}), so nothing could be read. Clear it on the Browser profiles dashboard.`
        : "The browser is not signed in to Reddit, so there is no profile to look at. Sign in on the Browser profiles dashboard."
    )
  }

  const { signedIn, signedOut } = reading.profile
  await db
    .update(promoAccounts)
    .set({
      handle: reading.handle,
      ...accountFigures(reading, now),
      profileCheck: {
        handle: reading.handle,
        signedInStatus: signedIn.status,
        signedInFound: signedIn.found,
        signedOutStatus: signedOut.status,
        signedOutFound: signedOut.found,
        suspended: signedIn.suspended || signedOut.suspended,
        readAt: now.toISOString(),
      },
    })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
}

/**
 * The karma and age columns to write from a "who am I" answer, or nothing.
 *
 * Nothing when signed out or when the figure was not there: the last reading
 * stays with its own date rather than being blanked, and never becomes a 0.
 */
export function accountFigures(
  reading: { handle: string | null; karma: number | null; createdSeconds: number | null },
  now: Date = new Date()
): { karma: number; redditCreatedAt: Date | null; karmaReadAt: Date } | Record<string, never> {
  if (!reading.handle || reading.karma === null) return {}
  return {
    karma: reading.karma,
    redditCreatedAt:
      reading.createdSeconds === null ? null : new Date(reading.createdSeconds * 1000),
    karmaReadAt: now,
  }
}

/**
 * Queues a reading for every Reddit account whose last one is a day old.
 *
 * Only accounts with a browser profile that were signed in when last seen,
 * since anything else would be refused. One health job per account per day
 * at most, counted from when the job was made, so a check that keeps failing
 * is tried once a day and not on every tick.
 */
export async function queueDueHealthChecks(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - HEALTH_EVERY_HOURS * 3_600_000)

  const accounts = await db
    .select({ id: promoAccounts.id, userId: promoAccounts.userId })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "reddit"),
        isNotNull(promoAccounts.profileId),
        ne(promoAccounts.handle, "")
      )
    )
  if (!accounts.length) return 0

  const recent = await db
    .select({ accountId: sql<string>`${promoJobs.payload}->>'accountId'` })
    .from(promoJobs)
    .where(and(eq(promoJobs.kind, "health"), gte(promoJobs.createdAt, since)))
  const asked = new Set(recent.map((row) => row.accountId))

  let queued = 0
  for (const account of accounts) {
    if (asked.has(account.id)) continue
    await queueJob(account.userId, "health", { accountId: account.id }, db)
    queued += 1
  }
  return queued
}

async function pendingHealthJob(
  userId: string,
  accountId: string,
  db: CustomShellDb
): Promise<boolean> {
  const [row] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "health"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  return Boolean(row)
}
