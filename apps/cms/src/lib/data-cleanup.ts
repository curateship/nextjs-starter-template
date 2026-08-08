import { plural } from "@/lib/format/plural"

/**
 * The rules for throwing away data that has outlived its use, and the words the
 * settings card says afterwards.
 *
 * Kept out of `@/server` on purpose: the card imports these numbers to describe
 * itself, and anything the browser imports from a server module drags the
 * server's own imports along with it.
 */

/**
 * Sessions, links, limits, notices and old email records, and how many of each
 * a run deleted.
 */
export type CleanupCounts = {
  sessions: number
  authTokens: number
  throttles: number
  notifications: number
  emailSends: number
}

/**
 * The most rows one table gives up in a single run.
 *
 * A run happens inside somebody's request, so it has to finish in the time a
 * page load can spare. A backlog bigger than this is not lost — the next run
 * takes the next batch, and the card says plainly that there is more to go.
 */
export const CLEANUP_BATCH_LIMIT = 500

/** A used or expired sign-in link is kept this long, then deleted. */
export const LINK_KEEP_DAYS = 7

/** A notification that has been read is kept this long, then deleted. */
export const READ_NOTICE_KEEP_DAYS = 90

/**
 * An attempt counter is kept this long after its last attempt.
 *
 * The longest counting window in the app is an hour, so a row untouched for a
 * day is certainly finished. A row still blocking somebody is never touched,
 * whatever its age.
 */
export const THROTTLE_KEEP_HOURS = 24

/**
 * A record of one of the app's own emails going out is kept this long.
 *
 * Long enough to answer "did my reset link ever get sent" months later, and
 * three times the thirty days the System emails list counts over, so the
 * numbers on that page are never trimmed from underneath.
 */
export const EMAIL_SEND_KEEP_DAYS = 90

const EMPTY_RESULT = "Nothing to clean up — there was no old data."

/** One line naming what a run deleted, or saying it found nothing. */
export function describeCleanupResult(counts: CleanupCounts) {
  const parts = [
    counts.sessions > 0
      ? `${counts.sessions} ${plural(counts.sessions, "expired sign-in", "expired sign-ins")}`
      : null,
    counts.authTokens > 0
      ? `${counts.authTokens} ${plural(counts.authTokens, "used email link", "used email links")}`
      : null,
    counts.throttles > 0
      ? `${counts.throttles} ${plural(counts.throttles, "finished attempt limit", "finished attempt limits")}`
      : null,
    counts.notifications > 0
      ? `${counts.notifications} ${plural(counts.notifications, `notice read over ${READ_NOTICE_KEEP_DAYS} days ago`, `notices read over ${READ_NOTICE_KEEP_DAYS} days ago`)}`
      : null,
    counts.emailSends > 0
      ? `${counts.emailSends} ${plural(counts.emailSends, `email record over ${EMAIL_SEND_KEEP_DAYS} days old`, `email records over ${EMAIL_SEND_KEEP_DAYS} days old`)}`
      : null,
  ].filter((part) => part !== null)

  if (parts.length === 0) return EMPTY_RESULT

  const sentence = `Deleted ${joinWithAnd(parts)}.`
  // A table that gave up exactly its cap almost certainly has more waiting, and
  // saying so is the difference between "that is all of it" and "press again".
  return Object.values(counts).some((count) => count >= CLEANUP_BATCH_LIMIT)
    ? `${sentence} That is the most one run takes — press it again to clear the rest.`
    : sentence
}

function joinWithAnd(parts: string[]) {
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
