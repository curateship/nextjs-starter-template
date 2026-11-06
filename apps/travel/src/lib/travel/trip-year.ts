import { daysBetween, lastDate, todayIn } from "@/lib/travel/dates"

/**
 * The Trips table's Year tab (Travel features 4, part 9; Tyler, 6 Nov 2026:
 * "Cover, name, dates"): each dated trip as a bar across its days of one
 * year. A trip crossing New Year shows in both years, cut at the year's edge.
 * Bars share a row when they don't overlap; each keeps room after its start
 * for its cover, name and dates, so a short trip's words never run into the
 * next bar.
 */

/** About six weeks of a year: enough room after a bar's start for its cover, name and dates. */
export const YEAR_LABEL_DAYS = 45

type DatedTrip = { id: string; startDate: string | null; days: number }

export type YearBar<T> = {
  trip: T
  /** Where the bar starts and how wide it is, as parts of the year from 0 to 1. */
  left: number
  width: number
  /** Which row it sits on, from 0. */
  row: number
}

const yearLength = (year: number) => daysBetween(`${year}-01-01`, `${year + 1}-01-01`)

/** Each trip with days in `year`, placed, the earliest first. Trips with no dates are left out. */
export function yearBars<T extends DatedTrip>(trips: readonly T[], year: number): { bars: YearBar<T>[]; rows: number } {
  const first = `${year}-01-01`
  const length = yearLength(year)
  const placed = trips
    .flatMap((trip) => {
      if (!trip.startDate) return []
      const start = daysBetween(first, trip.startDate)
      const end = daysBetween(first, lastDate(trip.startDate, trip.days)!) + 1
      if (end <= 0 || start >= length) return []
      return [{ trip, start: Math.max(0, start), end: Math.min(length, end) }]
    })
    .sort((a, b) => a.start - b.start || b.end - a.end)
  // Each row remembers the first day free after its last bar and that bar's words.
  const rowEnds: number[] = []
  const bars = placed.map(({ trip, start, end }) => {
    let row = rowEnds.findIndex((free) => free <= start)
    if (row === -1) row = rowEnds.push(0) - 1
    rowEnds[row] = Math.max(end, start + YEAR_LABEL_DAYS)
    return { trip, left: start / length, width: (end - start) / length, row }
  })
  return { bars, rows: rowEnds.length }
}

/**
 * The year the tab opens on: the one holding the next trip that hasn't ended,
 * or this year when there is none.
 */
export function startingYear(
  trips: readonly { startDate: string | null; days: number; timeZone: string | null }[],
  at: Date = new Date()
) {
  const today = todayIn(null, at)
  const next = trips
    .filter((trip) => trip.startDate && daysBetween(today, lastDate(trip.startDate, trip.days)!) >= 0)
    .map((trip) => trip.startDate!)
    .sort()[0]
  return Number((next && next > today ? next : today).slice(0, 4))
}
