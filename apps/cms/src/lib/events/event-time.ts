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
function timeZoneLabel(timeZone: string): string {
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

const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  dateStyle: "medium",
})

const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "numeric",
  minute: "2-digit",
})

/** "Saturday, September 27, 2026". */
function formatEventDay(date: string): string {
  return LONG_DAY.format(asPrintable(date))
}

/** "6:00 PM". */
function formatEventClock(clock: string): string {
  return CLOCK.format(asPrintable("2000-01-01", toClock(clock)))
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

  if (when.endDate && when.endDate !== when.startDate) {
    return {
      day: `${formatEventDay(when.startDate)} to ${formatEventDay(when.endDate)}`,
      times: end
        ? `Starts ${start}, ends ${end}, ${zone}`
        : `Starts ${start}, ${zone}`,
    }
  }
  return {
    day: formatEventDay(when.startDate),
    times: end ? `${start} to ${end}, ${zone}` : `${start}, ${zone}`,
  }
}
