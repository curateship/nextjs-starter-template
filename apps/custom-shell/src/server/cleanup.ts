import { and, inArray, isNull, lte, or, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"

import {
  CLEANUP_BATCH_LIMIT,
  EMAIL_SEND_KEEP_DAYS,
  LINK_KEEP_DAYS,
  READ_NOTICE_KEEP_DAYS,
  THROTTLE_KEEP_HOURS,
  type CleanupCounts,
} from "@/lib/data-cleanup"
import { db, type CustomShellDb } from "@/server/db"
import { sendDueVerificationReminders } from "@/server/auth/verification-reminders"
import {
  customShellAuthTokens,
  customShellNotifications,
  customShellRateLimits,
  customShellSystemEmailSends,
} from "@/server/schema"
import { now, purgeRefusedSessions } from "@/server/auth/security"

/**
 * Throws away the five kinds of row that otherwise only ever pile up: sessions
 * nobody can sign in with, sign-in links already used or long expired, attempt
 * counters that have finished counting, notifications read months ago, and the
 * record of the app's own emails going out long enough ago that nobody is
 * still asking whether theirs arrived.
 *
 * Every rule deletes only rows the app would already ignore, so nothing anybody
 * can still use is at stake. Audit and billing history are deliberately absent:
 * they are the record, and the record is never swept.
 *
 * There is no scheduler in this app, so it runs the way the account purge and
 * the traffic sweep do — opportunistically, off a real request, capped so it
 * cannot turn one person's page load into a long wait.
 */

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export async function cleanUpOldData(
  database: CustomShellDb = db,
  at: Date = now()
): Promise<CleanupCounts> {
  return {
    sessions: await purgeRefusedSessions(CLEANUP_BATCH_LIMIT, database, at),
    authTokens: await purgeSpentLinks(database, at),
    throttles: await purgeFinishedThrottles(database, at),
    notifications: await purgeOldReadNotices(database, at),
    emailSends: await purgeOldEmailSends(database, at),
  }
}

/**
 * Links that were opened, and links whose time ran out — both only once they
 * are a week past it, so somebody clicking a stale link still gets told the
 * link expired rather than being handed a blank page.
 *
 * A link that is still unused and still in date has `used_at` null and an
 * expiry in the future, so neither test can reach it.
 */
async function purgeSpentLinks(database: CustomShellDb, at: Date) {
  const cutoff = new Date(at.getTime() - LINK_KEEP_DAYS * DAY_MS)

  return deleteCapped(
    database,
    customShellAuthTokens,
    customShellAuthTokens.id,
    or(
      lte(customShellAuthTokens.usedAt, cutoff),
      lte(customShellAuthTokens.expiresAt, cutoff)
    )
  )
}

/**
 * Attempt counters nothing is counting any more. A row still blocking somebody
 * is left exactly where it is however old it looks — lifting a block early is
 * the one mistake here that would matter, and it is an admin's call to make
 * from the Locked out panel, not a sweep's.
 */
async function purgeFinishedThrottles(database: CustomShellDb, at: Date) {
  const cutoff = new Date(at.getTime() - THROTTLE_KEEP_HOURS * HOUR_MS)

  return deleteCapped(
    database,
    customShellRateLimits,
    customShellRateLimits.key,
    and(
      lte(customShellRateLimits.updatedAt, cutoff),
      or(
        isNull(customShellRateLimits.blockedUntil),
        lte(customShellRateLimits.blockedUntil, at)
      )
    )
  )
}

/** Notices somebody read months ago. An unread notice has no read date and stays. */
async function purgeOldReadNotices(database: CustomShellDb, at: Date) {
  const cutoff = new Date(at.getTime() - READ_NOTICE_KEEP_DAYS * DAY_MS)

  return deleteCapped(
    database,
    customShellNotifications,
    customShellNotifications.id,
    lte(customShellNotifications.readAt, cutoff)
  )
}

/**
 * The record of the app's own emails, once it is old enough that nobody is
 * still asking about theirs. Newsletter deliveries are not touched: that is the
 * record of what a real campaign did, and the record is never swept.
 */
async function purgeOldEmailSends(database: CustomShellDb, at: Date) {
  const cutoff = new Date(at.getTime() - EMAIL_SEND_KEEP_DAYS * DAY_MS)

  return deleteCapped(
    database,
    customShellSystemEmailSends,
    customShellSystemEmailSends.id,
    lte(customShellSystemEmailSends.createdAt, cutoff)
  )
}

/**
 * One capped delete: pick at most `CLEANUP_BATCH_LIMIT` keys, then delete
 * exactly those. Postgres has no `limit` on a delete, and the cap is the whole
 * reason a neglected app's backlog cannot stall the request this runs inside.
 */
async function deleteCapped(
  database: CustomShellDb,
  table: PgTable,
  key: PgColumn,
  where: SQL | undefined
) {
  const doomed = database
    .select({ key })
    .from(table)
    .where(where)
    .limit(CLEANUP_BATCH_LIMIT)

  const deleted = await database
    .delete(table)
    .where(inArray(key, doomed))
    .returning({ key })

  return deleted.length
}

/** The last day this process swept on, so a busy day sweeps once, not per request. */
let lastSweptDay: string | null = null

export function resetCleanupSweepForTests() {
  lastSweptDay = null
}

/**
 * The opportunistic housekeeping run. At most once a day per process, off the
 * first admin read of the day (see `server/guards.ts`), it clears old data and
 * sends any due verification reminders. Neither job can break the page it is
 * riding on, and one failing does not stop the other.
 */
export async function maybeCleanUpOldData(
  database: CustomShellDb = db,
  at: Date = now()
) {
  const day = at.toISOString().slice(0, 10)
  if (lastSweptDay === day) return

  // Marked before the work, not after: two requests arriving together must not
  // both decide they are the one to sweep.
  lastSweptDay = day

  try {
    await cleanUpOldData(database, at)
  } catch (error) {
    console.error("Old-data cleanup failed", error)
  }

  try {
    await sendDueVerificationReminders(database, at)
  } catch (error) {
    console.error("Verification reminder sweep failed", error)
  }
}
