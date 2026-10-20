import { dayLabel } from "@/lib/project/days"

/**
 * The team's days off from today on, for the warning under a due date that
 * lands on one (Seven features, part 1). Only the dates of someone's time off
 * travel here, never its reason, the same as "Away until Dec 4".
 */
export type DaysOff = {
  /** Each teammate's time off that hasn't ended, by their id. */
  away: Record<string, { first: string; last: string }[]>
  /** The team's holidays from today on. */
  holidays: { day: string; name: string }[]
}

/** Whether the person is on time off that day. */
function awayThatDay(daysOff: DaysOff, userId: string, day: string) {
  return (daysOff.away[userId] ?? []).some((off) => off.first <= day && off.last >= day)
}

/**
 * "Leo Hart is away Dec 4." or "Dec 25 is a team holiday, Christmas Day.",
 * or null when the day is a working one for them. It only warns: the date
 * still saves (Tyler, 20 Oct 2026: the line only, no greyed days).
 */
export function dayOffNote(
  daysOff: DaysOff | null,
  day: string | null,
  person: { id: string; name: string } | null
) {
  if (!daysOff || !day) return null
  const holiday = daysOff.holidays.find((one) => one.day === day)
  if (holiday) return `${dayLabel(day)} is a team holiday, ${holiday.name}.`
  if (person && awayThatDay(daysOff, person.id, day)) return `${person.name} is away ${dayLabel(day)}.`
  return null
}
