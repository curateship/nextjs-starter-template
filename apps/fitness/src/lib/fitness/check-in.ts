import { addDays, weekStart, weekdayOf, type Day } from "@/lib/fitness/dates"

/**
 * The weekly check-in a person with a coach sends (Tyler, 21 Oct 2026):
 * bodyweight, sleep, stress and how training felt, each 1 to 5, and a note to
 * the coach. Every answer may be left empty.
 */

export const CHECK_IN_SCORES = [
  { key: "sleep", label: "Sleep this week", low: "Badly", high: "Very well" },
  { key: "stress", label: "Stress this week", low: "Calm", high: "Very stressed" },
  { key: "training", label: "How training felt", low: "Hard going", high: "Great" },
] as const

export type CheckInScoreKey = (typeof CHECK_IN_SCORES)[number]["key"]

/**
 * The week a check-in answers for, by its Monday. It is asked on Sunday, so
 * from Sunday it is this week's, and from Monday to Saturday it is still last
 * week's until it's sent. Asked on Sun, Oct 25, it is the week of Mon, Oct 19,
 * and it stays open until Sat, Oct 31.
 */
export function checkInWeek(today: Day): Day {
  const monday = weekStart(today)
  return weekdayOf(today) === 0 ? monday : addDays(monday, -7)
}
