import { DAY_PART_LABEL, DAY_PARTS, partOfTime, type DayPart } from "@/lib/travel/rules"

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
  /** Morning, afternoon, evening or night, for a card with no start time (Travel features part 2). */
  dayPart?: DayPart | null
}

/** Where a card sorts in its day: the part its time falls in, its own part, or after every part. */
function partRank(card: BoardActivity) {
  const part = card.startTime ? partOfTime(card.startTime) : (card.dayPart ?? null)
  return part ? DAY_PARTS.indexOf(part) : DAY_PARTS.length
}

/** "09:30" as minutes after midnight. */
export function minutesOf(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * One column's cards in the order shown (task part 4, and Travel features part
 * 2). Cards go Morning, Afternoon, Evening, then Night: a timed card by the
 * part its hour falls in, an untimed one by the part it was set to. Inside a
 * part, timed cards come first, earliest first, then untimed ones in the order
 * they were dragged into. Cards with no time and no part go last, in dragged
 * order. Two cards at the same time keep their dragged order. With no parts
 * set this is the old order: timed cards by time, then the rest.
 */
export function sortColumn<T extends BoardActivity>(cards: readonly T[]): T[] {
  return [...cards].sort((a, b) => {
    const byPart = partRank(a) - partRank(b)
    if (byPart) return byPart
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

/** "9:00 AM to 11:00 AM" for a timed card, "Morning" for one set to a part of the day, otherwise null. */
export function formatWhen(card: Pick<BoardActivity, "startTime" | "durationMinutes" | "dayPart">) {
  if (card.startTime) return formatTimeRange(card.startTime, card.durationMinutes)
  return card.dayPart ? DAY_PART_LABEL[card.dayPart] : null
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


/** The hours a day is measured against for How full each day is (Tyler, 5 Nov 2026: "12 hours, warn past it"). */
export const FULL_DAY_MINUTES = 12 * 60

/**
 * How many minutes of a day are planned (Travel features 3, part 8): the
 * timed cards' lengths added up, with any overlap counted once. A card with
 * no start time or no length counts as nothing, and so does a stay, since
 * its nights aren't hours of the day. Nothing runs past midnight.
 */
export function plannedMinutes(cards: readonly (BoardActivity & { nights?: number | null })[]) {
  const spans = cards
    .filter((card) => card.startTime && card.durationMinutes && !card.nights)
    .map((card) => {
      const start = minutesOf(card.startTime!)
      return [start, Math.min(24 * 60, start + card.durationMinutes!)] as const
    })
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let reached = 0
  for (const [start, end] of spans) {
    const from = Math.max(start, reached)
    if (end > from) total += end - from
    reached = Math.max(reached, end)
  }
  return total
}
