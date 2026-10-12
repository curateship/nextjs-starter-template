/**
 * How fast an account is commenting, and whether a young one may comment
 * again.
 *
 * Counted from the comments that reached Reddit. A failed attempt never
 * reached it, so it is not counted. A comment already pressed and waiting to
 * go counts against a young account's limit, or five pressed at 3am would all
 * go at 8:00.
 *
 * Pure, so the server that refuses and the screen that explains share one
 * answer.
 */

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

export type PaceCounts = {
  /** Comments that reached Reddit in the last hour and the last 24 hours. */
  lastHour: number
  lastDay: number
}

export type PaceLimit = {
  /** Which limit refused it. */
  limit: "hour" | "day"
  /**
   * When the next comment is allowed. Null when the limit is full of
   * comments still waiting to go, which have no time yet.
   */
  nextAllowedAt: Date | null
}

export function paceCounts(posted: readonly Date[], now: Date): PaceCounts {
  const time = now.getTime()
  return {
    lastHour: posted.filter((at) => time - at.getTime() < HOUR_MS).length,
    lastDay: posted.filter((at) => time - at.getTime() < DAY_MS).length,
  }
}

/**
 * Null when one more comment fits inside both limits. Otherwise the limit it
 * breaks and when it next fits: the moment enough of the counted comments
 * have aged out of the window. With both full, the later of the two.
 */
export function paceLimit(input: {
  posted: readonly Date[]
  waiting: number
  now: Date
  perHour: number
  perDay: number
}): PaceLimit | null {
  const hour = windowLimit(input.posted, input.waiting, input.now, HOUR_MS, input.perHour)
  const day = windowLimit(input.posted, input.waiting, input.now, DAY_MS, input.perDay)
  if (!hour.full && !day.full) return null
  if (hour.full && day.full) {
    if (!hour.at || !day.at) return { limit: day.at ? "hour" : "day", nextAllowedAt: null }
    return hour.at > day.at
      ? { limit: "hour", nextAllowedAt: hour.at }
      : { limit: "day", nextAllowedAt: day.at }
  }
  return hour.full
    ? { limit: "hour", nextAllowedAt: hour.at }
    : { limit: "day", nextAllowedAt: day.at }
}

function windowLimit(
  posted: readonly Date[],
  waiting: number,
  now: Date,
  windowMs: number,
  allowed: number
): { full: boolean; at: Date | null } {
  const inWindow = posted
    .filter((at) => now.getTime() - at.getTime() < windowMs)
    .sort((a, b) => a.getTime() - b.getTime())
  const total = inWindow.length + waiting
  if (total < allowed) return { full: false, at: null }
  // This many have to leave the window before one more fits. The oldest
  // leave first; a waiting comment has not been sent, so it cannot leave.
  const mustLeave = total - allowed + 1
  if (mustLeave > inWindow.length) return { full: true, at: null }
  return { full: true, at: new Date(inWindow[mustLeave - 1].getTime() + windowMs) }
}
