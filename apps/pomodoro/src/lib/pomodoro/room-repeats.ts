import {
  describeWeekdaySet,
  isValidWeekdaySet,
  weekdayNames,
  weekdayOfLocalDate,
  weekdaySetHas,
} from "@/lib/pomodoro/task-repeats"
import { isLikelyEmail, MAX_ROOM_INVITES } from "@/lib/pomodoro/scheduled-rooms"

/**
 * The rules and the calendar sums for a room that repeats every week, in one
 * place because the Host a room window and the endpoint both need them and
 * the worker needs the sums. Nothing here reads the database or the clock; the
 * caller hands in the moment it means by "now".
 *
 * The days are the task repeats' seven-bit set, bit 0 Sunday. The time is
 * minutes after midnight on the host's clock in the host's timezone.
 */

/** How long before each occurrence its room is made and its invitations go out. */
export const ROOM_REPEAT_LEAD_HOURS = 24
/** How many weekly rooms one person may run at once. */
export const MAX_ROOM_REPEATS_PER_HOST = 5

export type RoomRepeatProblem =
  | "no_days"
  | "not_a_time"
  | "too_many_invites"
  | "bad_email"

/** "09:30" from an `<input type="time">`, as minutes after midnight. */
export function parseClockTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

export function formatClockTime(startMinute: number) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(Math.floor(startMinute / 60))}:${pad(startMinute % 60)}`
}

/** The first thing wrong with a weekly room, or null when nothing is. */
export function roomRepeatProblem(
  weekdays: number,
  startMinute: number | null,
  invites: string[]
): RoomRepeatProblem | null {
  if (!isValidWeekdaySet(weekdays)) return "no_days"
  if (startMinute === null || startMinute < 0 || startMinute > 1439)
    return "not_a_time"
  if (invites.length > MAX_ROOM_INVITES) return "too_many_invites"
  if (invites.some((email) => !isLikelyEmail(email))) return "bad_email"
  return null
}

export function roomRepeatProblemMessage(problem: RoomRepeatProblem) {
  switch (problem) {
    case "no_days":
      return "Pick at least one day of the week."
    case "not_a_time":
      return "Pick the time the room should open."
    case "too_many_invites":
      return `One room can invite ${MAX_ROOM_INVITES} people. Remove a few addresses.`
    case "bad_email":
      return "One of those addresses doesn't look like an email. Check it and try again."
  }
}

/**
 * "every Tuesday at 09:00", "Mon to Fri at 09:00", "Mon, Thu at 18:30".
 * Phrased to follow the word "Repeats" or stand on a card by itself.
 */
export function describeRoomRepeat(weekdays: number, startMinute: number) {
  const days = [0, 1, 2, 3, 4, 5, 6].filter((day) => weekdaySetHas(weekdays, day))
  const when =
    days.length === 1
      ? `every ${weekdayNames[days[0]]}`
      : describeWeekdaySet(weekdays)
  return `${when} at ${formatClockTime(startMinute)}`
}

export type RoomOccurrence = { date: string; startsAt: Date }

/**
 * The next time this rule's room starts after `after`.
 *
 * Looks two weeks ahead, which is more than the furthest the next occurrence
 * can be. A day whose start time does not exist, the hour a spring clock
 * change jumps over, has no occurrence that week rather than one at a made-up
 * time.
 */
export function nextRoomOccurrence(
  rule: {
    weekdays: number
    startMinute: number
    timezone: string
  },
  after: Date
): RoomOccurrence | null {
  if (!isValidWeekdaySet(rule.weekdays)) return null
  const today = localDateIn(after, rule.timezone)
  if (!today) return null
  for (let offset = 0; offset <= 14; offset += 1) {
    const date = addDays(today, offset)
    const weekday = weekdayOfLocalDate(date)
    if (weekday === null || !weekdaySetHas(rule.weekdays, weekday)) continue
    const startsAt = zonedTimeToUtc(
      date,
      Math.floor(rule.startMinute / 60),
      rule.startMinute % 60,
      rule.timezone
    )
    if (startsAt && startsAt > after) return { date, startsAt }
  }
  return null
}

/** The calendar day `instant` falls on in `timezone`, as `yyyy-mm-dd`. */
export function localDateIn(instant: Date, timezone: string) {
  const parts = zonedParts(instant, timezone)
  if (!parts) return null
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function addDays(localDate: string, days: number) {
  const [year, month, day] = localDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * The instant a wall-clock time happens in a timezone. Tries the offsets
 * either side of the day so a clock change is covered; a time the clock skips
 * returns null, and a time the clock repeats uses the first one, so one rule
 * never opens two rooms in the same night.
 */
function zonedTimeToUtc(
  localDate: string,
  hour: number,
  minute: number,
  timezone: string
) {
  const [year, month, day] = localDate.split("-").map(Number)
  const guess = Date.UTC(year, month - 1, day, hour, minute)
  const spread = 36 * 60 * 60_000
  const offsets = new Set<number>()
  for (const distance of [-spread, 0, spread]) {
    const offset = offsetAt(new Date(guess + distance), timezone)
    if (offset !== null) offsets.add(offset)
  }
  const matches = [...offsets]
    .map((offset) => new Date(guess - offset))
    .filter((candidate) => {
      const parts = zonedParts(candidate, timezone)
      return (
        parts !== null &&
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      )
    })
    .sort((left, right) => left.getTime() - right.getTime())
  return matches[0] ?? null
}

function offsetAt(instant: Date, timezone: string) {
  const parts = zonedParts(instant, timezone)
  if (!parts) return null
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    Math.floor(instant.getTime() / 1000) * 1000
  )
}

function zonedParts(instant: Date, timezone: string) {
  let formatted: Intl.DateTimeFormatPart[]
  try {
    formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(instant)
  } catch {
    return null
  }
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(formatted.find((part) => part.type === type)?.value)
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  }
}
