/**
 * The rules a booked room is held to, in one place because the host dialog
 * and the endpoint both have to agree on them. Nothing here touches the
 * database or the clock beyond the timestamp it is handed, so both sides can
 * use it and the tests need neither.
 */

/** A booking has to be far enough out that the clock can still catch it. */
export const MIN_SCHEDULE_LEAD_MINUTES = 1
/** Three months. Past that a booking is a plan, not a room. */
export const MAX_SCHEDULE_LEAD_DAYS = 90
/** How many people one booking may email. */
export const MAX_ROOM_INVITES = 20

export type ScheduleProblem =
  | "too_soon"
  | "too_far"
  | "not_a_time"
  | "too_many_invites"
  | "bad_email"

/**
 * Splits what the host typed into addresses. Commas, semicolons, spaces and
 * new lines all separate, because a pasted list uses whichever the place it
 * was copied from used. Each address is lowercased and repeats collapse, so
 * typing somebody twice invites them once.
 */
export function parseInviteEmails(typed: string) {
  const seen = new Set<string>()
  for (const part of typed.split(/[\s,;]+/)) {
    const email = part.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

// Deliberately loose: one @, something either side, a dot in the domain, no
// spaces. The real test of an address is whether Resend accepts it, and that
// answer is written onto the invite row.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

export function isLikelyEmail(email: string) {
  return email.length <= 254 && EMAIL_PATTERN.test(email)
}

/** The first thing wrong with a booking, or null when nothing is. */
export function scheduleProblem(
  startsAt: Date | null,
  invites: string[],
  now: Date
): ScheduleProblem | null {
  if (!startsAt || Number.isNaN(startsAt.getTime())) return "not_a_time"
  const minutesOut = (startsAt.getTime() - now.getTime()) / 60_000
  if (minutesOut < MIN_SCHEDULE_LEAD_MINUTES) return "too_soon"
  if (minutesOut > MAX_SCHEDULE_LEAD_DAYS * 24 * 60) return "too_far"
  if (invites.length > MAX_ROOM_INVITES) return "too_many_invites"
  if (invites.some((email) => !isLikelyEmail(email))) return "bad_email"
  return null
}

export function scheduleProblemMessage(problem: ScheduleProblem) {
  switch (problem) {
    case "not_a_time":
      return "Pick the date and time the room should open."
    case "too_soon":
      return "Pick a time at least a minute from now, or start the room straight away instead."
    case "too_far":
      return `Pick a time within the next ${MAX_SCHEDULE_LEAD_DAYS} days.`
    case "too_many_invites":
      return `One room can invite ${MAX_ROOM_INVITES} people. Remove a few addresses.`
    case "bad_email":
      return "One of those addresses doesn't look like an email. Check it and try again."
  }
}

/**
 * The start time written out for a person, in the timezone given.
 *
 * The invite email uses the host's saved timezone and says which one, because
 * the reader has no way to guess whose clock "7pm" belongs to. An unknown
 * timezone name would throw inside Intl, so it falls back to UTC.
 */
export function formatRoomStart(startsAt: Date, timezone: string) {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }
  try {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: timezone,
    }).format(startsAt)
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: "UTC",
    }).format(startsAt)
  }
}

/** "in 4 minutes", "in 3 hours", "in 2 days" — the wait, not the clock time. */
export function describeWaitUntil(startsAt: Date, now: Date) {
  const minutes = Math.round((startsAt.getTime() - now.getTime()) / 60_000)
  if (minutes <= 0) return "any moment now"
  if (minutes < 60) return `in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`
  return `in ${Math.round(hours / 24)} days`
}
