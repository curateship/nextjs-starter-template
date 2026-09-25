/**
 * A repeat rule's picked days, as a seven-bit set: bit 0 is Sunday through
 * bit 6 is Saturday. One field rather than a kind plus a day list, so there
 * is no way for two fields to disagree — "every day" is all seven bits.
 *
 * The weekday comes from the user's own calendar day (`yyyy-mm-dd`, already
 * worked out in their timezone by `localDateFor`), so this file never touches
 * a clock and the same string always gives the same day.
 */

export const EVERY_DAY = 127
export const WEEKDAYS_MON_TO_FRI = 0b0111110

export const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** The single letter under each toggle, Sunday first. */
export const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"] as const

export function weekdayOfLocalDate(localDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return date.getUTCDay()
}

export function isValidWeekdaySet(weekdays: unknown): weekdays is number {
  return (
    typeof weekdays === "number" &&
    Number.isInteger(weekdays) &&
    weekdays >= 1 &&
    weekdays <= EVERY_DAY
  )
}

export function weekdaySetHas(weekdays: number, weekday: number) {
  return (weekdays & (1 << weekday)) !== 0
}

export function toggleWeekdayInSet(weekdays: number, weekday: number) {
  return weekdays ^ (1 << weekday)
}

/** True when the rule should make a copy on that calendar day. */
export function repeatsOnLocalDate(weekdays: number, localDate: string) {
  const weekday = weekdayOfLocalDate(localDate)
  if (weekday === null || !isValidWeekdaySet(weekdays)) return false
  return weekdaySetHas(weekdays, weekday)
}

/**
 * The short line shown beside a repeating task, phrased to sit after the word
 * "Repeats" — "Repeats every day", "Repeats Mon to Fri". Every day and Mon to
 * Fri get their own words because those are the two sets people actually pick;
 * any other set lists its days.
 */
export function describeWeekdaySet(weekdays: number) {
  if (!isValidWeekdaySet(weekdays)) return ""
  if (weekdays === EVERY_DAY) return "every day"
  if (weekdays === WEEKDAYS_MON_TO_FRI) return "Mon to Fri"
  return weekdayNames
    .filter((_, weekday) => weekdaySetHas(weekdays, weekday))
    .map((name) => name.slice(0, 3))
    .join(", ")
}
