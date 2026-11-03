/**
 * How the day board lays out a trip's activities. Pure functions, so the
 * order rules can be tested without a screen.
 */

export type BoardActivity = {
  id: string
  day: number | null
  position: number
  startTime: string | null
  durationMinutes: number | null
}

/** "09:30" as minutes after midnight. */
export function minutesOf(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * One column's cards in the order shown (task part 4). Cards with a start time
 * come first, earliest first. Cards without one sit below them in the order
 * they were dragged into. Two cards at the same time keep their dragged order.
 */
export function sortColumn<T extends BoardActivity>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    if (a.startTime && b.startTime) {
      return minutesOf(a.startTime) - minutesOf(b.startTime) || a.position - b.position
    }
    if (a.startTime) return -1
    if (b.startTime) return 1
    return a.position - b.position
  })
}

/** The key of a board column: "ideas", or "day-3". */
export function columnKey(day: number | null) {
  return day === null ? "ideas" : `day-${day}`
}

export function dayOfColumn(key: string): number | null {
  return key === "ideas" ? null : Number(key.slice(4))
}

/** Every column, Ideas first, then one per day, each sorted as shown. */
export function boardColumns<T extends BoardActivity>(days: number, activities: readonly T[]) {
  const columns = new Map<string, T[]>([[columnKey(null), []]])
  for (let day = 1; day <= days; day += 1) columns.set(columnKey(day), [])
  for (const activity of activities) {
    // A card on a day past the end (only after a failed save) shows in Ideas, never lost.
    const key = activity.day !== null && activity.day <= days ? columnKey(activity.day) : columnKey(null)
    columns.get(key)!.push(activity)
  }
  for (const [key, cards] of columns) columns.set(key, sortColumn(cards))
  return columns
}

/** "9:00 AM". */
export function formatTime(time: string) {
  const total = minutesOf(time)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const suffix = hours < 12 ? "AM" : "PM"
  const shown = hours % 12 === 0 ? 12 : hours % 12
  return `${shown}:${String(minutes).padStart(2, "0")} ${suffix}`
}

/** "9:00 AM to 11:00 AM", or "9:00 AM" with no length. A length past midnight ends the next day. */
export function formatTimeRange(startTime: string | null, durationMinutes: number | null) {
  if (!startTime) return null
  if (!durationMinutes) return formatTime(startTime)
  const end = (minutesOf(startTime) + durationMinutes) % (24 * 60)
  const endText = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`
  return `${formatTime(startTime)} to ${formatTime(endText)}`
}

/** "1h 30m", "45m", "2h". */
export function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours}h ${rest}m`
  if (hours) return `${hours}h`
  return `${rest}m`
}

export const SMALLEST_GAP_SHOWN = 15

export type Gap =
  | { afterId: string; beforeId: string; kind: "free"; minutes: number }
  | { afterId: string; beforeId: string; kind: "overlap"; minutes: number }

/**
 * The line between two timed cards in a day (task part 8): the free time from
 * the end of one to the start of the next, or how much they overlap. The
 * first card needs a length to know where it ends; without one there is no
 * line. Gaps under 15 minutes show nothing.
 */
export function gapsOf(sorted: readonly BoardActivity[]): Gap[] {
  const gaps: Gap[] = []
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const first = sorted[index]
    const next = sorted[index + 1]
    if (!first.startTime || !next.startTime || !first.durationMinutes) continue
    const end = minutesOf(first.startTime) + first.durationMinutes
    const between = minutesOf(next.startTime) - end
    if (between < 0) gaps.push({ afterId: first.id, beforeId: next.id, kind: "overlap", minutes: -between })
    else if (between >= SMALLEST_GAP_SHOWN) gaps.push({ afterId: first.id, beforeId: next.id, kind: "free", minutes: between })
  }
  return gaps
}

