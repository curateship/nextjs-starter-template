import { runAtFromTimezoneInput } from "@/lib/automations/schedule"
import { walletProfitWindowStart } from "@/lib/trade/wallets"

/**
 * The clock the month grid keeps: Toronto, the same one the trading overview
 * already uses for its start day. A day on the grid runs from midnight to
 * midnight in Toronto.
 */
const PNL_TIMEZONE = "America/Toronto"

/** A calendar day as "YYYY-MM-DD", in the grid's clock. */
export type DayKey = string

type DayParts = {
  year: number
  month: number
  day: number
  weekday: number
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function torontoParts(at: number): DayParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PNL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(at))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
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

/** Midnight at the start of a Toronto calendar day, as epoch ms. */
export function dayStart(dayKey: DayKey): number {
  const instant = runAtFromTimezoneInput(`${dayKey}T00:00`, PNL_TIMEZONE)
  if (!instant) throw new Error(`PNL_DAY:${dayKey}`)
  return new Date(instant).getTime()
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

/** The month the grid opens on, and the earliest it can go back to. */
export function currentMonth(now: number): { year: number; month: number } {
  const { year, month } = torontoParts(now)
  return { year, month }
}

export function earliestMonth(): { year: number; month: number } {
  const { year, month } = torontoParts(walletProfitWindowStart())
  return { year, month }
}
