/**
 * The month grid on the Events page, copied from the old Directory app's
 * `lib/utils/calendar-grid.ts` with its tests.
 *
 * Every day here is a `YYYY-MM-DD` string on the site's own calendar. The
 * maths works on year, month and day numbers and uses `Date.UTC` only as a
 * calendar calculator, so no reader's or server's time zone can move a day.
 * What "today" is comes from the server, read in the site's time zone.
 */

export type YearMonth = {
  year: number
  /** 1 to 12, as printed, not JavaScript's 0 to 11. */
  month: number
}

export type CalendarDayCell = {
  /** "2026-09-26". */
  date: string
  /** 1 to 31. */
  day: number
  /** False for the days borrowed from the month before or after. */
  inCurrentMonth: boolean
}

export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** A real calendar day: "2026-02-30" has the right shape and is not one. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const built = new Date(Date.UTC(year, month - 1, day))
  return (
    built.getUTCFullYear() === year &&
    built.getUTCMonth() === month - 1 &&
    built.getUTCDate() === day
  )
}

export function toDateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

/** "2026-09" for the address bar. */
export function toMonthString({ year, month }: YearMonth) {
  return `${year}-${pad(month)}`
}

/** The month a "2026-09-26" day or a "2026-09" address falls in, or null. */
export function parseYearMonth(value: unknown): YearMonth | null {
  if (typeof value !== "string") return null
  const day = /^\d{4}-\d{2}$/.test(value) ? `${value}-01` : value
  if (!isValidDateString(day)) return null
  const [year, month] = day.split("-").map(Number)
  return { year, month }
}

export function addMonths(
  { year, month }: YearMonth,
  delta: number
): YearMonth {
  const zeroBased = month - 1 + delta
  const nextYear = year + Math.floor(zeroBased / 12)
  const nextMonth = ((zeroBased % 12) + 12) % 12
  return { year: nextYear, month: nextMonth + 1 }
}

/**
 * Whole weeks, Sunday first, covering every day of the month, padded with the
 * last days of the month before and the first days of the month after.
 */
export function monthMatrix({ year, month }: YearMonth): CalendarDayCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  const cells: CalendarDayCell[] = []
  for (let index = 0; index < totalCells; index++) {
    const cellDate = new Date(
      Date.UTC(year, month - 1, 1 + index - firstWeekday)
    )
    const cellYear = cellDate.getUTCFullYear()
    const cellMonth = cellDate.getUTCMonth() + 1
    const cellDay = cellDate.getUTCDate()
    cells.push({
      date: toDateString(cellYear, cellMonth, cellDay),
      day: cellDay,
      inCurrentMonth: cellMonth === month && cellYear === year,
    })
  }
  return cells
}

/**
 * Every day an event covers that falls between `from` and `to`, both
 * included, first to last. An event with no end day covers its start day
 * only. Clamping to the window keeps a year-long event to one grid's days.
 */
export function daysCovered(
  startDate: string,
  endDate: string | null,
  from: string,
  to: string
): string[] {
  const first = startDate > from ? startDate : from
  const lastDay = endDate && endDate > startDate ? endDate : startDate
  const last = lastDay < to ? lastDay : to
  const days: string[] = []
  const [year, month, day] = first.split("-").map(Number)
  for (let step = 0; ; step++) {
    const at = new Date(Date.UTC(year, month - 1, day + step))
    const date = toDateString(
      at.getUTCFullYear(),
      at.getUTCMonth() + 1,
      at.getUTCDate()
    )
    if (date > last) return days
    days.push(date)
  }
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "September 2026". */
export function formatMonthLabel({ year, month }: YearMonth) {
  return MONTH_LABEL.format(new Date(Date.UTC(year, month - 1, 1)))
}
