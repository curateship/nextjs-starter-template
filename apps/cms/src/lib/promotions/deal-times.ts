import {
  LISTING_WEEKDAYS,
  listingDayShifts,
  type ListingHours,
  type ListingShift,
  type ListingWeekday,
} from "@/lib/directory/listing-details"
import type { DealDays, DealStage } from "@/lib/promotions/deal-days"

/**
 * The one set of rules for the times a deal runs, used by the admin window,
 * the server and the public pages alike.
 *
 * A deal's times are shaped exactly like a listing's opening hours: each
 * weekday is off, or has a start and an end, and optionally a second stretch.
 * Every day off means the deal runs all day, every day of its days.
 *
 * A stretch that ends at or before its start runs past midnight, and belongs
 * to the night it started: 10 PM to 2 AM on Friday is still Friday's at 1 AM
 * Saturday, and it runs on the deal's last day too. A stretch whose start and
 * end are the same runs for 24 hours.
 *
 * "Now" is always the site's wall clock, "2026-10-06T16:30", never a phone's.
 */

export type DealTimes = ListingHours

/**
 * A deal as these rules need it: its days, its times, and whether it was
 * ended early with "End now", which ends it whatever its days say.
 */
export type TimedDeal = DealDays & {
  times: DealTimes
  endedAt?: Date | string | null
}

/** One stretch the deal runs, as site wall-clock moments, end not included. */
type Stretch = { from: string; until: string }

const WEEKDAY_SHORT: Record<ListingWeekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
}

/** Whether any day has times. With none, the deal runs all day, every day. */
export function hasDealTimes(times: DealTimes): boolean {
  return LISTING_WEEKDAYS.some((day) => times[day] !== null)
}

/** "2026-10-06" plus or minus whole days, on the calendar alone. */
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

/** The weekday a "2026-10-06" day falls on. */
export function weekdayOf(day: string): ListingWeekday {
  const sundayFirst = new Date(`${day}T00:00:00Z`).getUTCDay()
  return LISTING_WEEKDAYS[(sundayFirst + 6) % 7]!
}

/** Every stretch that starts on this calendar day, in order. */
function stretchesStarting(times: DealTimes, day: string): Stretch[] {
  if (!hasDealTimes(times)) {
    return [{ from: `${day}T00:00`, until: `${addDays(day, 1)}T00:00` }]
  }
  return listingDayShifts(times[weekdayOf(day)]).map((shift) => ({
    from: `${day}T${shift.open}`,
    until:
      shift.close > shift.open
        ? `${day}T${shift.close}`
        : `${addDays(day, 1)}T${shift.close}`,
  }))
}

function withinDays(deal: DealDays, day: string): boolean {
  return day >= deal.startDate && (!deal.endDate || day <= deal.endDate)
}

/**
 * The moment the deal is over: midnight after its end day, or later when the
 * end day's last stretch runs past midnight. Null for a deal with no end.
 */
export function dealEndsAt(deal: TimedDeal): string | null {
  if (!deal.endDate) return null
  const midnight = `${addDays(deal.endDate, 1)}T00:00`
  return stretchesStarting(deal.times, deal.endDate).reduce(
    (latest, stretch) => (stretch.until > latest ? stretch.until : latest),
    midnight
  )
}

/** Where the deal stands at `now`, the site's "2026-10-06T16:30". */
export function dealStage(deal: TimedDeal, now: string): DealStage {
  if (deal.endedAt) return "ended"
  const endsAt = dealEndsAt(deal)
  if (endsAt && now >= endsAt) return "ended"
  return now.slice(0, 10) < deal.startDate ? "soon" : "on"
}

/** The stretch running at `now`, tonight's or last night's, or null. */
function runningStretch(deal: TimedDeal, now: string): Stretch | null {
  const today = now.slice(0, 10)
  for (const day of [addDays(today, -1), today]) {
    if (!withinDays(deal, day)) continue
    const found = stretchesStarting(deal.times, day).find(
      (stretch) => stretch.from <= now && now < stretch.until
    )
    if (found) return found
  }
  return null
}

/** The next stretch to start after `now`, looking one week past today. */
function nextStretch(deal: TimedDeal, now: string): Stretch | null {
  const today = now.slice(0, 10)
  const first = deal.startDate > today ? deal.startDate : today
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = addDays(first, offset)
    if (!withinDays(deal, day)) return null
    const found = stretchesStarting(deal.times, day).find(
      (stretch) => stretch.from > now
    )
    if (found) return found
  }
  return null
}

/** "4 PM", "4:30 PM", or "midnight". */
function clockText(clock: string): string {
  if (clock === "00:00") return "midnight"
  const [hours = 0, minutes = 0] = clock.split(":").map(Number)
  const hour = hours % 12 || 12
  const shown = minutes ? `${hour}:${String(minutes).padStart(2, "0")}` : `${hour}`
  return `${shown} ${hours < 12 ? "AM" : "PM"}`
}

/** "4 to 6 PM", "11 AM to 2 PM", "10 PM to 2 AM", or "all day". */
function shiftText(shift: ListingShift): string {
  if (shift.open === shift.close) return "all day"
  const open = clockText(shift.open)
  const close = clockText(shift.close)
  const openHalf = open.slice(-2)
  // "4 to 6 PM" only when both are the same half of one day.
  if (
    shift.open < shift.close &&
    shift.open !== "00:00" &&
    openHalf === close.slice(-2) &&
    (openHalf === "AM" || openHalf === "PM")
  ) {
    return `${open.slice(0, -3)} to ${close}`
  }
  return `${open} to ${close}`
}

/**
 * The card's and the deal page's line: "On now · until 6 PM", "On now", or
 * "Next: today at 4 PM", "Next: tomorrow at 4 PM", "Next: Sat at 4 PM",
 * "Next: Sat, Oct 10 at 4 PM". Null when there is nothing to add to the days,
 * which is an ended deal, or one with no times that is not on yet.
 */
export function dealNowText(deal: TimedDeal, now: string): string | null {
  if (dealStage(deal, now) === "ended") return null
  const timed = hasDealTimes(deal.times)
  const running = runningStretch(deal, now)
  if (running) {
    return timed ? `On now · until ${clockText(running.until.slice(11))}` : "On now"
  }
  if (!timed) return null
  const next = nextStretch(deal, now)
  if (!next) return null
  return `Next: ${dayWord(next.from.slice(0, 10), now.slice(0, 10))} at ${clockText(next.from.slice(11))}`
}

const WEEKDAY_AND_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
})

/** "today", "tomorrow", "Sat" within the week, then "Sat, Oct 10". */
function dayWord(day: string, today: string): string {
  if (day === today) return "today"
  if (day === addDays(today, 1)) return "tomorrow"
  if (day < addDays(today, 7)) return WEEKDAY_SHORT[weekdayOf(day)]
  return WEEKDAY_AND_DAY.format(new Date(`${day}T00:00:00Z`))
}

/** "Mon to Fri", "Sat and Sun", "Mon, Wed and Fri", or "Every day". */
function daysText(days: ListingWeekday[]): string {
  if (days.length === 7) return "Every day"
  const runs: ListingWeekday[][] = []
  for (const day of days) {
    const last = runs[runs.length - 1]
    const previous = last?.[last.length - 1]
    if (
      last &&
      previous &&
      LISTING_WEEKDAYS.indexOf(previous) + 1 === LISTING_WEEKDAYS.indexOf(day)
    ) {
      last.push(day)
    } else {
      runs.push([day])
    }
  }
  const parts = runs.flatMap((run) =>
    run.length >= 3
      ? [`${WEEKDAY_SHORT[run[0]!]} to ${WEEKDAY_SHORT[run[run.length - 1]!]}`]
      : run.map((day) => WEEKDAY_SHORT[day])
  )
  return parts.length === 1
    ? parts[0]!
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

/**
 * The times in words, one line per set of days that share them:
 * ["Mon to Fri, 4 to 6 PM", "Sat and Sun, 12 to 3 PM and 10 PM to 2 AM"].
 * Empty when the deal runs all day, every day.
 */
export function dealTimesLines(times: DealTimes): string[] {
  const groups = new Map<string, ListingWeekday[]>()
  for (const day of LISTING_WEEKDAYS) {
    const shifts = listingDayShifts(times[day])
    if (!shifts.length) continue
    const key = shifts.map(shiftText).join(" and ")
    groups.set(key, [...(groups.get(key) ?? []), day])
  }
  return [...groups].map(([when, days]) => `${daysText(days)}, ${when}`)
}
