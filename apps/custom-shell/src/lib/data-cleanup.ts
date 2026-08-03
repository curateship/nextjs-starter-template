/**
 * The rules for throwing away data that has outlived its use, and the words the
 * settings card says afterwards.
 *
 * Kept out of `@/server` on purpose: the card imports these numbers to describe
 * itself, and anything the browser imports from a server module drags the
 * server's own imports along with it.
 */

/** Sessions, links, limits and notices, and how many of each a run deleted. */
export type CleanupCounts = {
  sessions: number
  authTokens: number
  throttles: number
  notifications: number
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

const EMPTY_RESULT = "Nothing to clean up — there was no old data."

/** One line naming what a run deleted, or saying it found nothing. */
export function describeCleanupResult(counts: CleanupCounts) {
  const parts = [
    plural(counts.sessions, "expired sign-in", "expired sign-ins"),
    plural(counts.authTokens, "used email link", "used email links"),
    plural(
      counts.throttles,
      "finished attempt limit",
      "finished attempt limits"
    ),
    plural(
      counts.notifications,
      `notice read over ${READ_NOTICE_KEEP_DAYS} days ago`,
      `notices read over ${READ_NOTICE_KEEP_DAYS} days ago`
    ),
  ].filter((part) => part !== null)

  if (parts.length === 0) return EMPTY_RESULT

  const sentence = `Deleted ${joinWithAnd(parts)}.`
  // A table that gave up exactly its cap almost certainly has more waiting, and
  // saying so is the difference between "that is all of it" and "press again".
  return Object.values(counts).some((count) => count >= CLEANUP_BATCH_LIMIT)
    ? `${sentence} That is the most one run takes — press it again to clear the rest.`
    : sentence
}

/** `null` for none, so a table with nothing to delete stays out of the sentence. */
function plural(count: number, one: string, many: string) {
  if (count <= 0) return null
  return `${count} ${count === 1 ? one : many}`
}

function joinWithAnd(parts: string[]) {
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
