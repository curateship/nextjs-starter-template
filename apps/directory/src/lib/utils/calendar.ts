// Calendar helpers: turn an event into iCalendar (.ics) text and a Google
// Calendar "add event" link. Pure and isomorphic (no DB), so both the server
// routes and the frontend event renderer can import it.
//
// Events store a wall-clock date/time with NO timezone and NO end time
// (eventDate `YYYY-MM-DD`, eventTime `HH:MM`, both in the event-content block).
// With no timezone to anchor to, calendar files use "floating" time: a start
// like `20260815T180000` with no `Z` and no `TZID`, which every calendar app
// shows at that wall-clock time in the viewer's own zone — the same time the
// event page prints. Timed events get a default 1-hour duration; a date with
// no time becomes an all-day event.

const DEFAULT_EVENT_DURATION_MINUTES = 60

export interface CalendarEvent {
  /** Globally unique, stable id for this event (e.g. `<uuid>@host`). */
  uid: string
  title: string
  description?: string
  location?: string
  /** Absolute link back to the event page. */
  url?: string
  /** Wall-clock start date, `YYYY-MM-DD`. */
  startDate: string
  /** Wall-clock start time, `HH:MM` (24h). Absent => all-day event. */
  startTime?: string
  /** Used for DTSTAMP / LAST-MODIFIED so output is stable per event. */
  updatedAt?: Date | string | null
}

interface DateParts {
  year: number
  month: number
  day: number
}

interface TimeParts {
  hour: number
  minute: number
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function parseDateParts(startDate: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null

  return { year, month, day }
}

function parseTimeParts(startTime?: string): TimeParts | null {
  if (!startTime) return null

  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime)
  if (!match) return null

  return { hour: Number(match[1]), minute: Number(match[2]) }
}

// UTC is used purely as a timezone-neutral calendar calculator here: we build a
// date from the wall-clock parts, add the offset, and read the parts back out.
// The result is still formatted without a `Z`, so it stays floating time.
function shiftDateTime(date: DateParts, time: TimeParts, minutes: number) {
  const base = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute)
  const shifted = new Date(base + minutes * 60_000)
  return {
    date: {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    },
    time: { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() },
  }
}

function shiftDate(date: DateParts, days: number): DateParts {
  const base = Date.UTC(date.year, date.month - 1, date.day)
  const shifted = new Date(base + days * 86_400_000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function formatDateOnly(date: DateParts) {
  return `${date.year}${pad(date.month)}${pad(date.day)}`
}

function formatFloatingDateTime(date: DateParts, time: TimeParts) {
  return `${formatDateOnly(date)}T${pad(time.hour)}${pad(time.minute)}00`
}

// UTC timestamp in iCalendar basic format, e.g. `20260815T180000Z`.
function formatUtcStamp(value?: Date | string | null) {
  const parsed = value ? new Date(value) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  )
}

// Escape reserved characters in an iCalendar TEXT value (RFC 5545 §3.3.11).
function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Fold long content lines to <=75 characters (RFC 5545 §3.1). Continuation
// lines start with a single space. Char-based folding is a safe approximation.
function foldIcsLine(line: string) {
  if (line.length <= 75) return line

  const parts: string[] = [line.slice(0, 75)]
  let index = 75
  while (index < line.length) {
    parts.push(` ${line.slice(index, index + 74)}`)
    index += 74
  }
  return parts.join('\r\n')
}

// Strip HTML to plain text for a calendar DESCRIPTION.
export function htmlToPlainText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildEventLocation(venueName?: string, venueAddress?: string) {
  return [venueName, venueAddress]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ')
}

// Combine an optional description with a "More info" link for the body text.
function buildEventBodyText(event: CalendarEvent) {
  const parts: string[] = []
  if (event.description) parts.push(event.description.trim())
  if (event.url) parts.push(`More info: ${event.url}`)
  return parts.filter(Boolean).join('\n\n')
}

function property(name: string, value: string) {
  return foldIcsLine(`${name}:${escapeIcsText(value)}`)
}

// One VEVENT. Returns null when the date is missing/invalid (can't schedule it).
export function buildVevent(event: CalendarEvent): string | null {
  const date = parseDateParts(event.startDate)
  if (!date) return null

  const time = parseTimeParts(event.startTime)
  const stamp = formatUtcStamp(event.updatedAt)

  const lines: string[] = ['BEGIN:VEVENT']
  lines.push(property('UID', event.uid))
  lines.push(`DTSTAMP:${stamp}`)

  if (time) {
    const end = shiftDateTime(date, time, DEFAULT_EVENT_DURATION_MINUTES)
    lines.push(`DTSTART:${formatFloatingDateTime(date, time)}`)
    lines.push(`DTEND:${formatFloatingDateTime(end.date, end.time)}`)
  } else {
    // All-day: DTEND is exclusive, so it points at the next day.
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(date)}`)
    lines.push(`DTEND;VALUE=DATE:${formatDateOnly(shiftDate(date, 1))}`)
  }

  lines.push(property('SUMMARY', event.title))

  const body = buildEventBodyText(event)
  if (body) lines.push(property('DESCRIPTION', body))
  if (event.location) lines.push(property('LOCATION', event.location))
  if (event.url) lines.push(property('URL', event.url))

  lines.push(`LAST-MODIFIED:${stamp}`)
  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

interface IcsCalendarOptions {
  /** Product identifier, e.g. `-//Acme//Events//EN`. */
  prodId: string
  /** Display name for a subscribe-able feed (X-WR-CALNAME). */
  calendarName?: string
  /** When true, adds refresh hints so calendar apps re-poll the feed. */
  feed?: boolean
}

// Full VCALENDAR wrapping zero or more events. Invalid-date events are skipped.
export function buildIcsCalendar(events: CalendarEvent[], options: IcsCalendarOptions) {
  const veventBlocks = events
    .map((event) => buildVevent(event))
    .filter((block): block is string => block !== null)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    property('PRODID', options.prodId),
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  if (options.calendarName) {
    lines.push(property('X-WR-CALNAME', options.calendarName))
    lines.push(property('NAME', options.calendarName))
  }

  if (options.feed) {
    lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT12H')
    lines.push('X-PUBLISHED-TTL:PT12H')
  }

  lines.push(...veventBlocks, 'END:VCALENDAR')
  // Trailing CRLF is expected by strict parsers.
  return `${lines.join('\r\n')}\r\n`
}

// Google Calendar "add event" URL (the TEMPLATE render endpoint).
export function buildGoogleCalendarUrl(event: CalendarEvent): string | null {
  const date = parseDateParts(event.startDate)
  if (!date) return null

  const time = parseTimeParts(event.startTime)

  let dates: string
  if (time) {
    const end = shiftDateTime(date, time, DEFAULT_EVENT_DURATION_MINUTES)
    dates = `${formatFloatingDateTime(date, time)}/${formatFloatingDateTime(end.date, end.time)}`
  } else {
    dates = `${formatDateOnly(date)}/${formatDateOnly(shiftDate(date, 1))}`
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
  })

  const details = buildEventBodyText(event)
  if (details) params.set('details', details)
  if (event.location) params.set('location', event.location)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

// Turn the https feed URL into a `webcal:` link. Clicking a `webcal:` link
// hands the feed straight to the visitor's default calendar app (Apple Calendar,
// Outlook, etc.), which prompts to subscribe — no "add by URL" settings hunt.
export function buildWebcalUrl(feedUrl: string) {
  return feedUrl.replace(/^https?:\/\//, 'webcal://')
}

// One-click subscribe link for Google Calendar: opens Google Calendar with an
// "Add calendar?" prompt for this feed. Google fetches the feed from its own
// servers, so the feed URL must be publicly reachable (won't work on localhost).
export function buildGoogleSubscribeUrl(feedUrl: string) {
  const cid = buildWebcalUrl(feedUrl)
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(cid)}`
}

// Pull the calendar-relevant fields out of an event's content_blocks. The
// date/time/venue live on the event-content block (per-event values, never on
// the template), so reading the row's blocks directly is enough.
export function extractEventContentFields(contentBlocks: unknown): {
  eventDate?: string
  eventTime?: string
  venueName?: string
  venueAddress?: string
  body?: string
} {
  if (!contentBlocks || typeof contentBlocks !== 'object') return {}

  for (const value of Object.values(contentBlocks as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue
    const block = value as { type?: unknown; content?: unknown }
    if (block.type !== 'event-content') continue

    const content = (block.content && typeof block.content === 'object' ? block.content : {}) as Record<string, unknown>
    return {
      eventDate: typeof content.eventDate === 'string' ? content.eventDate : undefined,
      eventTime: typeof content.eventTime === 'string' ? content.eventTime : undefined,
      venueName: typeof content.venueName === 'string' ? content.venueName.trim() : undefined,
      venueAddress: typeof content.venueAddress === 'string' ? content.venueAddress.trim() : undefined,
      body: typeof content.body === 'string' ? content.body : undefined,
    }
  }

  return {}
}
