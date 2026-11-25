/**
 * The one set of rules for an event's time, used by the admin screen, the
 * event page and the server alike.
 *
 * An event stores a day and a clock time, like 2026-09-27 and 18:00, and the
 * site stores a time zone. The pair is never turned into one moment and back,
 * so nothing here can shift an event by the server's or the reader's own
 * clock. The one question that needs "now" is whether the event is over, and
 * that reads the wall clock in the site's time zone and compares like with
 * like.
 */

/** What every site starts with until an admin changes it. */
export const DEFAULT_SITE_TIME_ZONE = "America/Toronto"

/** When an event happens, as stored. Clock times are "HH:MM". */
export type EventWhen = {
  startDate: string
  startTime: string
  endDate: string | null
  endTime: string | null
}

/** A zone name the running JavaScript knows, like 'Europe/London'. */
export function isKnownTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * Every zone to offer in the picker, with the saved one always among them even
 * if this browser's list lacks it.
 */
export function timeZoneChoices(saved: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone")
  return zones.includes(saved) ? zones : [saved, ...zones]
}

const zoneNames = new Map<string, string>()

/**
 * "Eastern Time" for America/Toronto. The generic name has no daylight-saving
 * half, so it is right on every day of the year.
 */
export function timeZoneLabel(timeZone: string): string {
  const cached = zoneNames.get(timeZone)
  if (cached) return cached
  let label = timeZone.replaceAll("_", " ")
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date(0))
      .find((each) => each.type === "timeZoneName")?.value
    if (part) label = part
  } catch {
    // An unknown zone keeps its own name rather than failing a page.
  }
  zoneNames.set(timeZone, label)
  return label
}

const wallClocks = new Map<string, Intl.DateTimeFormat>()

/** "2026-09-27T18:05": what a clock on the wall in that zone reads then. */
export function wallClockAt(timeZone: string, at: Date): string {
  let format = wallClocks.get(timeZone)
  if (!format) {
    // `hourCycle: "h23"` rather than `hour12: false`, which may print
    // midnight as hour 24.
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: isKnownTimeZone(timeZone) ? timeZone : DEFAULT_SITE_TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    wallClocks.set(timeZone, format)
  }
  const parts = format.formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00"
  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}`
}

/**
 * Whether the event is over, by the site's clock.
 *
 * An event with no end time is over when its last day is over. "24:00" sorts
 * after every real clock time, so the comparison stays plain text.
 */
export function eventHasEnded(
  when: EventWhen,
  timeZone: string,
  now: Date
): boolean {
  const lastDay = when.endDate ?? when.startDate
  const ends = `${lastDay}T${when.endTime ?? "24:00"}`
  return wallClockAt(timeZone, now) >= ends
}

/** Whether the event's start time has come, by the site's clock. */
export function eventHasStarted(
  when: Pick<EventWhen, "startDate" | "startTime">,
  timeZone: string,
  now: Date
): boolean {
  return (
    wallClockAt(timeZone, now) >= `${when.startDate}T${toClock(when.startTime)}`
  )
}

/**
 * The wall-clock moment sign-ups close, as "2026-11-20T14:00": the start, or
 * that many hours before it (task events/37, Part 8). Worked on the clock as
 * written, so "2 days before" a 2:00 PM class is 2:00 PM two days earlier,
 * whatever the clocks do in between.
 */
export function signUpsCloseAt(
  when: Pick<EventWhen, "startDate" | "startTime">,
  closeHours: number | null
): string {
  const start = `${when.startDate}T${toClock(when.startTime)}`
  if (!closeHours) return start
  const shifted = new Date(asPrintable(when.startDate, toClock(when.startTime)))
  shifted.setUTCHours(shifted.getUTCHours() - closeHours)
  return shifted.toISOString().slice(0, 16)
}

/** Whether sign-ups for the event have closed, by the site's clock. */
export function signUpsHaveClosed(
  when: Pick<EventWhen, "startDate" | "startTime">,
  closeHours: number | null,
  timeZone: string,
  now: Date
): boolean {
  return wallClockAt(timeZone, now) >= signUpsCloseAt(when, closeHours)
}

/** "Thu, Nov 20, 7:00 PM" from a wall-clock moment, "2026-11-20T19:00". */
export function formatWallClock(moment: string): string {
  const [day = "", clock = ""] = moment.split("T")
  return `${formatEventShortDay(day)}, ${formatEventClock(clock)}`
}

/** "18:00:00" from the database, or "18:00" from a form, as "18:00". */
export function toClock(value: string): string {
  return value.slice(0, 5)
}

/**
 * The stored values are printed as they are. Reading them in UTC is only a
 * way of stopping the reader's own zone from moving them.
 */
function asPrintable(date: string, clock = "00:00"): Date {
  return new Date(`${date}T${clock}:00Z`)
}

const LONG_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
})

const LONG_DAY_NO_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
})

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
})

const WEEKDAY_AND_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
})

const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
})

/** "Saturday, September 27, 2026". */
export function formatEventDay(date: string): string {
  return LONG_DAY.format(asPrintable(date))
}

/** "6:00 PM". */
export function formatEventClock(clock: string): string {
  return CLOCK.format(asPrintable("2000-01-01", toClock(clock)))
}

/** "Sat, Sep 26", for a row in the Events page's list. */
export function formatEventShortDay(date: string): string {
  return WEEKDAY_AND_DAY.format(asPrintable(date))
}

/** Whether the event ends on a later day than it starts. */
export function spansSeveralDays(when: EventWhen): boolean {
  return Boolean(when.endDate && when.endDate !== when.startDate)
}

/** "Sat, Sep 26", or "Fri, Oct 2 to Sun, Oct 4" over several days. */
export function eventDaysText(when: EventWhen): string {
  const start = formatEventShortDay(when.startDate)
  return spansSeveralDays(when) && when.endDate
    ? `${start} to ${formatEventShortDay(when.endDate)}`
    : start
}

/**
 * The line under a title in the Events page's list. One day reads
 * "Sat, Sep 26 · 6:00 PM to 11:00 PM". Several days put each time beside its
 * own day, "Fri, Oct 2, 6:00 PM to Sun, Oct 4, 11:00 PM", because the times
 * are when the event starts and ends, not its hours on each day.
 */
export function eventRowText(when: EventWhen): string {
  if (!spansSeveralDays(when) || !when.endDate) {
    return `${formatEventShortDay(when.startDate)} · ${eventTimesText(when)}`
  }
  const start = `${formatEventShortDay(when.startDate)}, ${formatEventClock(when.startTime)}`
  const end = formatEventShortDay(when.endDate)
  return when.endTime
    ? `${start} to ${end}, ${formatEventClock(when.endTime)}`
    : `${start} to ${end}`
}

/** "6:00 PM to 11:00 PM", or "6:00 PM" with no end time. */
export function eventTimesText(when: EventWhen): string {
  const start = formatEventClock(when.startTime)
  return when.endTime ? `${start} to ${formatEventClock(when.endTime)}` : start
}

const MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
})

/**
 * The date block on an event card: "OCT" over "04". The day is padded to two
 * figures so the block is the same width on the 4th as on the 14th, and a row
 * of cards lines up.
 */
export function eventDateChip(date: string): { month: string; day: string } {
  const printable = asPrintable(date)
  return {
    month: MONTH.format(printable).toUpperCase(),
    day: String(printable.getUTCDate()).padStart(2, "0"),
  }
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
})

const MONTH_AND_YEAR = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
})

/**
 * The day at the left of a row in the Events page's list: "THU" over "26".
 * Not padded, because the rows stack and nothing has to line up beside it.
 */
export function eventListDay(date: string): { weekday: string; day: string } {
  const printable = asPrintable(date)
  return {
    weekday: WEEKDAY.format(printable).toUpperCase(),
    day: String(printable.getUTCDate()),
  }
}

/** "November 2026", the heading over a month of rows in the Events list. */
export function eventListMonth(date: string): string {
  return MONTH_AND_YEAR.format(asPrintable(date))
}

/**
 * The times in a row of the Events page's list, as Tyler's drawing of
 * 25 Nov 2026 writes them: "7:00 – 10:00 PM" when both ends share AM or PM,
 * "11:00 AM – 2:00 PM" when they do not, and "7:00 PM" with no end. Several
 * days show the whole thing, days included, like a card.
 */
export function eventListTimesText(when: EventWhen): string {
  if (spansSeveralDays(when)) return eventRowText(when)
  const start = formatEventClock(when.startTime)
  if (!when.endTime) return start
  const end = formatEventClock(when.endTime)
  // `\s`, because some runtimes put a narrow no-break space before the PM.
  const [, startClock, startHalf] = /^(.*)\s(\S+)$/u.exec(start) ?? []
  const [, , endHalf] = /^(.*)\s(\S+)$/u.exec(end) ?? []
  return startHalf && startHalf === endHalf
    ? `${startClock} – ${end}`
    : `${start} – ${end}`
}

/**
 * The times on an event card. One day shows the clock alone, because the day
 * is already in the card's date block. Several days show the whole thing, days
 * included, or the card would say a festival runs 12:00 PM to 8:00 PM and not
 * say it runs for three of them.
 */
export function eventCardTimesText(when: EventWhen): string {
  return spansSeveralDays(when) ? eventRowText(when) : eventTimesText(when)
}

/** "Sep 27, 2026, 6:00 PM", for a row in Admin → Events. */
export function formatEventStart(when: EventWhen): string {
  return `${SHORT_DAY.format(asPrintable(when.startDate))}, ${formatEventClock(when.startTime)}`
}

/**
 * The event page's two "when" lines: the day, then the times with the zone
 * named, so a visitor from elsewhere knows whose 6pm it is.
 */
export function eventWhenLines(
  when: EventWhen,
  timeZone: string
): { day: string; times: string } {
  const zone = timeZoneLabel(timeZone)
  const start = formatEventClock(when.startTime)
  const end = when.endTime ? formatEventClock(when.endTime) : null

  if (spansSeveralDays(when) && when.endDate) {
    // The year is said once when both days share it.
    const first =
      when.startDate.slice(0, 4) === when.endDate.slice(0, 4)
        ? LONG_DAY_NO_YEAR.format(asPrintable(when.startDate))
        : formatEventDay(when.startDate)
    return {
      day: `${first} to ${formatEventDay(when.endDate)}`,
      times: end
        ? `Starts ${start}, ends ${end}, ${zone}`
        : `Starts ${start}, ${zone}`,
    }
  }
  return {
    day: formatEventDay(when.startDate),
    times: `${eventTimesText(when)}, ${zone}`,
  }
}

/** "GMT-04:00" read as minutes east of UTC, so -240. Plain "GMT" is 0. */
function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  const match = /([+-])(\d{2}):(\d{2})/.exec(name)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return match[1] === "-" ? -minutes : minutes
}

/**
 * "2026-09-26T18:00:00-04:00": a day and clock time on the site's calendar,
 * with the zone's offset on that day, for a search engine that needs one
 * moment rather than a wall clock.
 *
 * The offset is asked twice. Reading the wall time as if it were UTC gives an
 * instant a few hours off, which lands on the wrong side of a clock change on
 * the night of one; asking again at the corrected instant settles it.
 */
export function eventMomentText(
  date: string,
  clock: string,
  timeZone: string
): string {
  const zone = isKnownTimeZone(timeZone) ? timeZone : DEFAULT_SITE_TIME_ZONE
  const time = toClock(clock)
  const asUtc = Date.parse(`${date}T${time}:00Z`)
  const guess = zoneOffsetMinutes(zone, new Date(asUtc))
  const offset = zoneOffsetMinutes(zone, new Date(asUtc - guess * 60_000))
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0")
  return `${date}T${time}:00${offset < 0 ? "-" : "+"}${hours}:${minutes}`
}
