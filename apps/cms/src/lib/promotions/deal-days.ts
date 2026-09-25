import { wallClockAt } from "@/lib/events/event-time"

/**
 * The one set of rules for a deal's days, used by Admin → Promotions, the
 * Deals page, the deal page and the server alike.
 *
 * A deal stores a first day and an optional last day, like 2026-10-03 and
 * 2026-10-12, and the site stores a time zone. A deal is on through the whole
 * of its last day by the site's clock, so "today" is the only thing that ever
 * needs the time, and it is always the site's today, never the reader's.
 */

/** A deal's days, as stored. */
export type DealDays = {
  startDate: string
  /** Null for a deal with no end, which runs until somebody ends it. */
  endDate: string | null
}

/** On now, starting on a later day, or over. */
export type DealStage = "on" | "soon" | "ended"

/** "2026-09-24", the site's today, read from its wall clock. */
export function siteToday(timeZone: string, at: Date): string {
  return wallClockAt(timeZone, at).slice(0, 10)
}

/**
 * Where the deal stands on `today`, a "2026-09-24" day. Plain text compares
 * the days, because the stored form sorts the same way the calendar does.
 */
export function dealStage(days: DealDays, today: string): DealStage {
  if (days.endDate && days.endDate < today) return "ended"
  return days.startDate > today ? "soon" : "on"
}

/**
 * The stored day, printed as it is. Reading it in UTC only stops the reader's
 * own zone from moving it.
 */
function asPrintable(day: string): Date {
  return new Date(`${day}T00:00:00Z`)
}

const MEDIUM_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
})

const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
})

const WEEKDAY_AND_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
})

/** "Sat, Oct 3". */
function shortDay(day: string): string {
  return WEEKDAY_AND_DAY.format(asPrintable(day))
}

/**
 * The deal page's line: "Saturday, October 3, 2026 only", "Oct 3, 2026 to
 * Oct 12, 2026", or "From Oct 3, 2026. No end date".
 */
export function dealDaysText(days: DealDays): string {
  if (!days.endDate) {
    return `From ${MEDIUM_DAY.format(asPrintable(days.startDate))}. No end date`
  }
  if (days.endDate === days.startDate) {
    return `${LONG_DAY.format(asPrintable(days.startDate))} only`
  }
  return `${MEDIUM_DAY.format(asPrintable(days.startDate))} to ${MEDIUM_DAY.format(asPrintable(days.endDate))}`
}

/**
 * A card's line on the Deals page: "Until Sun, Oct 12", "Today only",
 * "No end date", "Starts Sat, Oct 3 · until Mon, Oct 12", or
 * "Ended Sun, Oct 12".
 */
export function dealCardDaysText(days: DealDays, today: string): string {
  const stage = dealStage(days, today)
  if (stage === "ended") return `Ended ${shortDay(days.endDate ?? days.startDate)}`
  if (stage === "soon") {
    if (!days.endDate) return `Starts ${shortDay(days.startDate)}`
    return days.endDate === days.startDate
      ? `${shortDay(days.startDate)} only`
      : `Starts ${shortDay(days.startDate)} · until ${shortDay(days.endDate)}`
  }
  if (!days.endDate) return "No end date"
  return days.endDate === today ? "Today only" : `Until ${shortDay(days.endDate)}`
}

/** A row in Admin → Promotions: "Oct 3, 2026 to Oct 12, 2026", or "From Oct 3, 2026". */
export function dealAdminDaysText(days: DealDays): string {
  const start = MEDIUM_DAY.format(asPrintable(days.startDate))
  if (!days.endDate) return `From ${start}`
  if (days.endDate === days.startDate) return start
  return `${start} to ${MEDIUM_DAY.format(asPrintable(days.endDate))}`
}
