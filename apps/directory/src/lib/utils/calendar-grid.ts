// Pure, isomorphic helpers for the events calendar block's month grid and list.
//
// Event dates are floating wall-clock strings (`YYYY-MM-DD`) with no timezone —
// the same shape the .ics feed reads out of the event-content block. Every
// calculation here works on integer year/month/day parts and never builds a
// local `Date` from a date string, which would shift the day backwards or
// forwards across timezones. All date math goes through `Date.UTC(...)` purely
// as a timezone-neutral calendar calculator (build from parts, read parts back).

export interface YearMonth {
  /** Full year, e.g. 2026. */
  year: number
  /** Month 1-12 (not the JS 0-11). */
  month: number
}

export interface CalendarDayCell {
  /** Wall-clock date for this cell, `YYYY-MM-DD`. */
  date: string
  /** Day of month, 1-31. */
  day: number
  /** False for the leading/trailing days that belong to a neighbouring month. */
  inCurrentMonth: boolean
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const

function pad(value: number) {
  return String(value).padStart(2, "0")
}

// Strict `YYYY-MM-DD` with a real month/day. Rejects anything else so a bad
// stored value can never break grid placement.
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  // Reject impossible days (e.g. 2026-02-30) by round-tripping through UTC.
  const built = new Date(Date.UTC(year, month - 1, day))
  return built.getUTCFullYear() === year && built.getUTCMonth() === month - 1 && built.getUTCDate() === day
}

export function toDateString(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

// Today's wall-clock date as `YYYY-MM-DD`, read in the viewer's own zone so it
// matches the floating dates authors typed.
export function todayDateString() {
  const now = new Date()
  return toDateString(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function parseYearMonth(dateString: string): YearMonth | null {
  if (!isValidDateString(dateString)) return null
  const [year, month] = dateString.split("-").map(Number)
  return { year, month }
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const zeroBased = month - 1 + delta
  const nextYear = year + Math.floor(zeroBased / 12)
  const nextMonth = ((zeroBased % 12) + 12) % 12
  return { year: nextYear, month: nextMonth + 1 }
}

// The visible grid for a month: whole weeks (Sunday-first) covering every day of
// the month, padded with the trailing days of the previous month and the leading
// days of the next so each row has seven cells.
export function monthMatrix({ year, month }: YearMonth): CalendarDayCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay() // 0 = Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7

  const cells: CalendarDayCell[] = []
  for (let index = 0; index < totalCells; index++) {
    const dayOffset = index - firstWeekday
    const cellDate = new Date(Date.UTC(year, month - 1, 1 + dayOffset))
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

// timeZone: "UTC" because the date below is built with Date.UTC; without it the
// formatter reads the date in the viewer's zone and can slip to the prior month.
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })

// "July 2026". Built from a UTC date so the month never rolls over a boundary.
export function formatMonthLabel({ year, month }: YearMonth) {
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, month - 1, 1)))
}

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" })

// "18:00" -> "6:00 PM", matching the event page. Returns "" for missing/invalid.
export function formatTimeLabel(time?: string) {
  const match = time ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time) : null
  if (!match) return ""
  return TIME_LABEL_FORMATTER.format(new Date(2000, 0, 1, Number(match[1]), Number(match[2])))
}

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

// "Sat, Jul 25" for the list view. Built from UTC parts so it never shifts a day.
export function formatDayLabel(dateString: string) {
  const parsed = parseYearMonth(dateString)
  if (!parsed) return ""
  const day = Number(dateString.split("-")[2])
  return DAY_LABEL_FORMATTER.format(new Date(Date.UTC(parsed.year, parsed.month - 1, day)))
}
