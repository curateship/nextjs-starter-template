import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm"

import {
  redditHealth,
  redditStrangerProfile,
  type CommandTarget,
} from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import type { ProfileCheck } from "@/lib/social/options"

import { queueJob } from "./jobs"
import { ringBell } from "./notices"
import { pausedBy } from "./pause"
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
 *
 * A reading is two jobs. The account's own browser reads who is signed in,
 * the karma, the age, and the profile as the account sees it. The stranger's
 * look then runs in the reader browser, signed in to nobody, as a
 * `profile_check` job, and writes the whole profile check once both halves
 * are in. Asking as a stranger from inside the account's own browser, with
 * its cookies left off, still came from the account's browser and proxy.
 */

/** The jobs one reading is made of, so the card says "checking" until both are done. */
const HEALTH_KINDS = ["health", "profile_check"] as const

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
        inArray(promoJobs.kind, [...HEALTH_KINDS]),
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

/**
 * Asks for a reading now. One waiting at a time, so a second press adds
 * nothing. Answers whether a reading was queued.
 */
export async function queueHealthCheck(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [account] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) throw new Error("Set up a Reddit account first.")
  if (await pendingHealthJob(userId, accountId, db)) return false
  await queueJob(userId, "health", { accountId }, db)
  return true
}

/**
 * Takes the account's half of a reading through its own browser, stores the
 * karma and the age, and queues the stranger's half for the reader. Run by
 * the browser program for a `health` job.
 *
 * Signed out there is no profile to ask about, which is refused with a reason
 * a person can act on, and the last reading is left where it was. With no
 * reader picked, the karma and age are kept and the stranger's half is
 * refused with how to pick one.
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
    const onPhone = "phone" in target
    throw new Refusal(
      reading.blocked
        ? `Reddit put something in front of the ${onPhone ? "phone" : "browser"} (${reading.reason}), so nothing could be read. Clear it ${onPhone ? "through the phone's screen on the Phones dashboard" : "on the Browser profiles dashboard"}.`
        : onPhone
          ? "The Reddit app on the phone is not signed in, so there is no profile to look at. Sign in through the phone's screen on the Phones dashboard."
          : "The browser is not signed in to Reddit, so there is no profile to look at. Sign in on the Browser profiles dashboard."
    )
  }

  await db
    .update(promoAccounts)
    .set({ handle: reading.handle, ...accountFigures(reading, now) })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))

  // Queued here, never run in this browser, so the stranger's look comes from
  // a browser and a proxy that have nothing to do with the account. With no
  // reader picked, the queue refuses it and this job fails saying so.
  await queueJob(
    userId,
    "profile_check",
    { accountId, handle: reading.handle, signedIn: reading.profile.signedIn },
    db
  )
}

const signedInShape = (value: unknown) => {
  const read = (value ?? {}) as Record<string, unknown>
  return {
    status: typeof read.status === "number" ? read.status : 0,
    found: read.found === true,
    suspended: read.suspended === true,
  }
}

/**
 * The stranger's half of a reading, from the reader browser, written with the
 * account's half the `health` job carried over. Run for a `profile_check` job.
 */
export async function recordStrangerCheck(
  userId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const accountId = String(payload.accountId ?? "")
  const handle = String(payload.handle ?? "")
  if (!accountId || !handle) throw new Error("That profile check names no account.")
  const signedIn = signedInShape(payload.signedIn)
  const signedOut = await redditStrangerProfile(target, { handle })
  const suspended = signedIn.suspended || signedOut.suspended

  const [before] = await db
    .select({ profileCheck: promoAccounts.profileCheck })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)

  await db
    .update(promoAccounts)
    .set({
      profileCheck: {
        handle,
        signedInStatus: signedIn.status,
        signedInFound: signedIn.found,
        signedOutStatus: signedOut.status,
        signedOutFound: signedOut.found,
        suspended,
        readAt: now.toISOString(),
      },
    })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))

  // Reddit marking the account suspended rings the bell once, when it
  // happens, not on every daily reading after.
  if (suspended && !before?.profileCheck?.suspended) {
    await ringBell(
      userId,
      {
        kind: "suspended",
        targetId: accountId,
        message: `${NOTICE_HEADINGS.suspended} u/${handle}`,
        detail: "Reddit marks the account suspended. Nothing it posts will be seen. It is on the Reddit accounts dashboard.",
        href: "/admin/reddit-accounts",
      },
      db,
      now
    )
  }
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
): { karma: number; redditCreatedAt: Date | SQL | null; karmaReadAt: Date } | Record<string, never> {
  if (!reading.handle || reading.karma === null) return {}
  const created = reading.createdSeconds === null ? null : new Date(reading.createdSeconds * 1000)
  return {
    karma: reading.karma,
    // For the same account, the earlier of the stored date and this one. A
    // phone reads the age off the Reddit app as "2y" or "5d" and counts it
    // down, so its date is never earlier than the real one; an exact date a
    // browser read before is then kept rather than replaced by a rougher
    // one. Another account signed in there takes its own date, or a young
    // account would inherit an old one's age and escape its pace limits.
    redditCreatedAt:
      created === null
        ? null
        : sql`CASE WHEN lower(${promoAccounts.handle}) = lower(${reading.handle})
            THEN least(coalesce(${promoAccounts.redditCreatedAt}, ${created.toISOString()}::timestamptz), ${created.toISOString()}::timestamptz)
            ELSE ${created.toISOString()}::timestamptz END`,
    karmaReadAt: now,
  }
}

/**
 * Queues a reading for every Reddit account whose last one is a day old.
 *
 * Only accounts on a browser profile or a phone that were signed in when last seen,
 * since anything else would be refused, and never a retired account, which
 * Promo no longer drives. One health job per account per day
 * at most, counted from when the job was made, so a check that keeps failing
 * is tried once a day and not on every tick.
 */
export async function queueDueHealthChecks(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const since = new Date(now.getTime() - HEALTH_EVERY_HOURS * 3_600_000)

  const accounts = await db
    .select({
      id: promoAccounts.id,
      userId: promoAccounts.userId,
      pausedAt: promoAccounts.pausedAt,
      projectId: promoAccounts.projectId,
    })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "reddit"),
        // On a browser profile, or since phone farm file 05 on a phone,
        // where the Reddit app reads it.
        or(isNotNull(promoAccounts.profileId), isNotNull(promoAccounts.phoneId)),
        ne(promoAccounts.handle, ""),
        isNull(promoAccounts.retiredAt)
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
    // A paused account, or one in a paused project, takes no readings.
    if (await pausedBy(account.userId, account, db)) continue
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
        inArray(promoJobs.kind, [...HEALTH_KINDS]),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  return Boolean(row)
}
