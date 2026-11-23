// Pure reminder-scheduling helpers for the featured-renewals cron.
// Kept free of 'server-only' so they stay unit-testable (see directory-renewal-reminders.test.ts).

// Reminder buckets in descending days-before-expiry. Each bucket sends one email.
export const REMINDER_THRESHOLD_DAYS = [7, 1]

// Widest bucket = how far ahead of expiry the cron looks for reminder candidates.
export const REMINDER_WINDOW_DAYS = Math.max(...REMINDER_THRESHOLD_DAYS)

/** Whole days until expiry, rounded up so a placement ending in <24h counts as 1. */
export function daysUntil(endsAt: Date, now: Date): number {
  const DAY_MS = 24 * 60 * 60 * 1000
  return Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS)
}

/** Smallest configured threshold whose window the entitlement is inside, or null. */
export function reminderBucketFor(daysLeft: number): number | null {
  let bucket: number | null = null
  for (const threshold of REMINDER_THRESHOLD_DAYS) {
    if (daysLeft <= threshold) bucket = threshold
  }
  return bucket
}

/**
 * The threshold bucket to email right now, or null when nothing is due.
 *
 * `lastSent` is the smallest bucket already emailed for this entitlement (smaller =
 * more urgent). A bucket only fires if it is strictly more urgent than the last one
 * sent, so each threshold sends exactly one reminder and a missed wider window never
 * back-fires once a narrower one has gone out.
 */
export function pendingReminderBucket(daysLeft: number, lastSent: number | null): number | null {
  const bucket = reminderBucketFor(daysLeft)
  if (bucket === null) return null
  if (lastSent !== null && bucket >= lastSent) return null
  return bucket
}
