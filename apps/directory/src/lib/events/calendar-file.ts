import {
  DEFAULT_SITE_TIME_ZONE,
  eventMomentText,
  isKnownTimeZone,
  type EventWhen,
} from "@/lib/events/event-time"

/**
 * An event as a calendar app reads it: the file Apple Calendar and Outlook
 * open, and the link that fills in Google Calendar's new-event form.
 *
 * Every start and end is written as one exact moment in UTC, worked out from
 * the event's day and clock time in the site's time zone on that day. A
 * calendar app then shows it at the visitor's own local time, and 6pm in
 * Toronto is 6pm in Toronto on either side of a clock change. A time with no
 * zone at all would be read as the visitor's own 6pm instead.
 *
 * The end is the event's real end. With no end time, the event runs to
 * midnight at the end of its last day, the same moment the site counts it as
 * over.
 */

export type CalendarEvent = EventWhen & {
  id: string
  title: string
  summary: string
  placeName: string
  placeAddress: string
  /** The event page's full address, like https://site.test/events/night-market. */
  url: string
}

/** "2026-09-27" for "2026-09-26". */
function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/** "20260926T220000Z", the form a calendar file writes a UTC moment in. */
function utcStamp(at: Date): string {
  return at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
}

function moment(date: string, clock: string, timeZone: string): string {
  return utcStamp(new Date(eventMomentText(date, clock, timeZone)))
}

/**
 * The moment the event ends: its end time on its end day, or midnight at the
 * end of its last day when it has no end time. The same moment the site
 * counts it as over.
 */
export function eventEndMoment(when: EventWhen, timeZone: string): Date {
  const lastDay = when.endDate ?? when.startDate
  return new Date(
    when.endDate && when.endTime
      ? eventMomentText(when.endDate, when.endTime, timeZone)
      : eventMomentText(nextDay(lastDay), "00:00", timeZone)
  )
}

/** When the event starts and ends, as UTC moments. */
export function eventCalendarTimes(
  when: EventWhen,
  timeZone: string
): { start: string; end: string } {
  return {
    start: moment(when.startDate, when.startTime, timeZone),
    end: utcStamp(eventEndMoment(when, timeZone)),
  }
}

function location(event: CalendarEvent): string {
  return [event.placeName, event.placeAddress]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ")
}

/** The summary, then a link back to the page for everything else. */
function description(event: CalendarEvent): string {
  return [event.summary.trim(), event.url].filter(Boolean).join("\n\n")
}

/** Commas, semicolons, backslashes and line breaks are special in the file. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

function utf8Length(char: string): number {
  const code = char.codePointAt(0) ?? 0
  if (code < 0x80) return 1
  if (code < 0x800) return 2
  if (code < 0x10000) return 3
  return 4
}

/**
 * A calendar file's lines may be 75 bytes long at most, and a longer one
 * carries on in lines that start with a space. Counted in bytes, and never
 * split inside a letter, so an accented name survives.
 */
function fold(line: string): string {
  const lines: string[] = []
  let current = ""
  let bytes = 0
  let limit = 75
  for (const char of line) {
    const size = utf8Length(char)
    if (bytes + size > limit) {
      lines.push(current)
      current = ""
      bytes = 0
      // The leading space of a carried-on line counts towards its 75.
      limit = 74
    }
    current += char
    bytes += size
  }
  lines.push(current)
  return lines.join("\r\n ")
}

function textLine(name: string, value: string): string {
  return fold(`${name}:${escapeText(value)}`)
}

function eventLines(
  event: CalendarEvent,
  timeZone: string,
  stamp: string
): string[] {
  const { start, end } = eventCalendarTimes(event, timeZone)
  const where = location(event)
  return [
    "BEGIN:VEVENT",
    // The same id in every file, so importing an event twice updates it.
    textLine("UID", `${event.id}@${new URL(event.url).hostname}`),
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    textLine("SUMMARY", event.title),
    textLine("DESCRIPTION", description(event)),
    ...(where ? [textLine("LOCATION", where)] : []),
    textLine("URL", event.url),
    "END:VEVENT",
  ]
}

/**
 * The text of a calendar file holding the events given. `feed` names the
 * calendar and asks the app to check for changes every few hours, for the
 * site's subscribe address. `now` is when the file was made.
 */
export function eventCalendarFile(
  events: CalendarEvent[],
  options: {
    siteName: string
    timeZone: string
    now: Date
    feed?: boolean
  }
): string {
  const stamp = utcStamp(options.now)
  const timeZone = isKnownTimeZone(options.timeZone)
    ? options.timeZone
    : DEFAULT_SITE_TIME_ZONE
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    textLine("PRODID", `-//${options.siteName}//Events//EN`),
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.feed
      ? [
          textLine("X-WR-CALNAME", `${options.siteName} events`),
          textLine("NAME", `${options.siteName} events`),
          textLine("X-WR-TIMEZONE", timeZone),
          "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
          "X-PUBLISHED-TTL:PT6H",
        ]
      : []),
    ...events.flatMap((event) => eventLines(event, timeZone, stamp)),
    "END:VCALENDAR",
  ]
  return `${lines.join("\r\n")}\r\n`
}

/**
 * Google Calendar's new-event form, filled in. The times go as UTC moments,
 * and `ctz` shows them in the site's zone on the form.
 */
export function googleCalendarLink(
  event: CalendarEvent,
  timeZone: string
): string {
  const { start, end } = eventCalendarTimes(event, timeZone)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${start}/${end}`,
    ctz: isKnownTimeZone(timeZone) ? timeZone : DEFAULT_SITE_TIME_ZONE,
    details: description(event),
  })
  const where = location(event)
  if (where) params.set("location", where)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * The feed's address as a `webcal:` link, which a phone or computer hands to
 * its own calendar app to subscribe.
 */
export function webcalLink(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, "webcal://")
}

/**
 * Google Calendar's "Add calendar" prompt for the feed. Google fetches the
 * feed from its own servers, so this only works on an address the internet
 * can reach.
 */
export function googleSubscribeLink(feedUrl: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalLink(feedUrl))}`
}
