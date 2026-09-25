import { runAtFromTimezoneInput } from "@/lib/automations/schedule"
import { walletProfitWindowStart } from "@/lib/trade/wallets"

/**
 * The clock the P&L page keeps: Toronto, the same one the trading overview
 * already uses for its start day. A day on the month grid runs from midnight
 * to midnight in Toronto, and so does every period the cards can be set to.
 */
export const PNL_TIMEZONE = "America/Toronto"

/** The three windows the pattern cards and the score can be set to. */
export const PNL_PERIODS = ["week", "month", "quarter"] as const
export type PnlPeriod = (typeof PNL_PERIODS)[number]

export const PNL_PERIOD_LABELS: Record<PnlPeriod, string> = {
  week: "This week",
  month: "This month",
  quarter: "Three months",
}

export function isPnlPeriod(value: unknown): value is PnlPeriod {
  return (
    typeof value === "string" &&
    (PNL_PERIODS as readonly string[]).includes(value)
  )
}

/** A calendar day as "YYYY-MM-DD", in the page's clock. */
export type DayKey = string

type DayParts = {
  year: number
  month: number
  day: number
  hour: number
  weekday: number
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function torontoParts(at: number): DayParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PNL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(at))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")) % 24,
    weekday: WEEKDAYS.indexOf(read("weekday")),
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

/** The Toronto calendar day an instant falls on. */
export function dayKeyOf(at: number): DayKey {
  const { year, month, day } = torontoParts(at)
  return `${year}-${pad(month)}-${pad(day)}`
}

/** The hour of the Toronto day an instant falls in, 0 to 23. */
export function hourOf(at: number): number {
  return torontoParts(at).hour
}

/** Midnight at the start of a Toronto calendar day, as epoch ms. */
export function dayStart(dayKey: DayKey): number {
  const instant = runAtFromTimezoneInput(`${dayKey}T00:00`, PNL_TIMEZONE)
  if (!instant) throw new Error(`PNL_DAY:${dayKey}`)
  return new Date(instant).getTime()
}

/** The first day of a month, as a day key. Month is 1 to 12. */
function monthKey(year: number, month: number): DayKey {
  return `${year}-${pad(month)}-01`
}

/** Every day of a month, oldest first. */
export function daysOfMonth(year: number, month: number): DayKey[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from(
    { length: count },
    (_, index) => `${year}-${pad(month)}-${pad(index + 1)}`
  )
}

/** Monday is 0, Sunday is 6: the column a day sits in on the grid. */
export function weekdayColumn(dayKey: DayKey): number {
  const { weekday } = torontoParts(dayStart(dayKey) + 12 * 3_600_000)
  return (weekday + 6) % 7
}

/**
 * When a period begins, as epoch ms, never earlier than the day records
 * begin (20 August 2026, the overview's own start day).
 *
 * - This week: midnight on the most recent Monday.
 * - This month: midnight on the 1st.
 * - Three months: midnight on the 1st of the month two months back, so the
 *   window is this calendar month and the two whole months before it.
 */
export function periodStart(period: PnlPeriod, now: number): number {
  const { year, month, day } = torontoParts(now)
  let start: number
  if (period === "week") {
    const column = weekdayColumn(`${year}-${pad(month)}-${pad(day)}`)
    const monday = new Date(Date.UTC(year, month - 1, day - column))
    start = dayStart(
      `${monday.getUTCFullYear()}-${pad(monday.getUTCMonth() + 1)}-${pad(monday.getUTCDate())}`
    )
  } else if (period === "month") {
    start = dayStart(monthKey(year, month))
  } else {
    const first = new Date(Date.UTC(year, month - 3, 1))
    start = dayStart(monthKey(first.getUTCFullYear(), first.getUTCMonth() + 1))
  }
  return Math.max(start, walletProfitWindowStart())
}

/** The month the page opens on, and the earliest it can go back to. */
export function currentMonth(now: number): { year: number; month: number } {
  const { year, month } = torontoParts(now)
  return { year, month }
}

export function earliestMonth(): { year: number; month: number } {
  const { year, month } = torontoParts(walletProfitWindowStart())
  return { year, month }
}
