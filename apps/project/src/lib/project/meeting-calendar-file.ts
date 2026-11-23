import { offsetAt } from "@/lib/project/days"
import type { MeetingRepeat } from "@/lib/project/rules"

/**
 * "Add to my calendar": a meeting as a calendar file (.ics), which Google
 * Calendar, Outlook and Apple Calendar all open. It is a one-off copy. A
 * meeting changed later in Project doesn't change in anyone's calendar.
 *
 * The times are written in the meeting's own zone, with that zone's clock
 * changes spelled out, so the calendar shows them in each person's own time
 * and a weekly meeting stays at 10:00 in Toronto after the clocks change.
 */
export type CalendarMeeting = {
  id: string
  title: string
  /** The first day, in the meeting's own zone. */
  day: string
  startTime: string
  endTime: string
  timeZone: string
  repeatEvery: MeetingRepeat | null
  videoUrl: string | null
}

const REPEAT_RULE: Record<MeetingRepeat, string> = {
  week: "FREQ=WEEKLY",
  two_weeks: "FREQ=WEEKLY;INTERVAL=2",
}

export const CALENDAR_COPY_NOTE =
  "Added from Project. If the meeting changes there, this copy won't change. Add it again to catch up."

export function meetingCalendarFile(meeting: CalendarMeeting, at = new Date()): string {
  const description = [meeting.videoUrl ? `Join: ${meeting.videoUrl}` : null, CALENDAR_COPY_NOTE]
    .filter(Boolean)
    .join("\n\n")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Project//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...zoneLines(meeting.timeZone, Number(meeting.day.slice(0, 4))),
    "BEGIN:VEVENT",
    `UID:${meeting.id}@project-meetings`,
    `DTSTAMP:${utcStamp(at)}`,
    `DTSTART;TZID=${meeting.timeZone}:${wallStamp(meeting.day, meeting.startTime)}`,
    `DTEND;TZID=${meeting.timeZone}:${wallStamp(meeting.day, meeting.endTime)}`,
    ...(meeting.repeatEvery ? [`RRULE:${REPEAT_RULE[meeting.repeatEvery]}`] : []),
    `SUMMARY:${escapeText(meeting.title)}`,
    ...(meeting.videoUrl ? [`LOCATION:${escapeText(meeting.videoUrl)}`, `URL:${meeting.videoUrl}`] : []),
    `DESCRIPTION:${escapeText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return `${lines.map(fold).join("\r\n")}\r\n`
}

/** "weekly-client-call.ics", from the meeting's name. */
export function calendarFileName(title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${slug || "meeting"}.ics`
}

type Change = { month: number; day: number; time: string; from: number; to: number }

const DAY_MS = 86_400_000
const MINUTE_MS = 60_000

/**
 * The zone's clock changes in `year`: the moment each happens, found by
 * stepping a day at a time and then narrowing to the minute.
 */
function changesIn(timeZone: string, year: number): Change[] {
  const changes: Change[] = []
  const end = Date.UTC(year + 1, 0, 1)
  let before = Date.UTC(year, 0, 1)
  let offset = offsetAt(new Date(before), timeZone)
  for (let next = before + DAY_MS; next <= end; next += DAY_MS) {
    const nextOffset = offsetAt(new Date(next), timeZone)
    if (nextOffset !== offset) {
      let low = before
      let high = next
      while (high - low > MINUTE_MS) {
        const middle = low + Math.floor((high - low) / 2 / MINUTE_MS) * MINUTE_MS
        if (offsetAt(new Date(middle), timeZone) === offset) low = middle
        else high = middle
      }
      // The wall clock just before the change, which is how a calendar names it.
      const wall = new Date(high + offset)
      changes.push({
        month: wall.getUTCMonth() + 1,
        day: wall.getUTCDate(),
        time: `${pad(wall.getUTCHours())}${pad(wall.getUTCMinutes())}00`,
        from: offset,
        to: nextOffset,
      })
      offset = nextOffset
    }
    before = next
  }
  return changes
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const

/**
 * The zone written out for the calendar. A zone that changes its clocks twice
 * a year gets both changes as yearly rules ("the second Sunday of March");
 * any other zone gets its one offset.
 */
function zoneLines(timeZone: string, year: number): string[] {
  const changes = changesIn(timeZone, year)
  if (changes.length !== 2) {
    const offset = offsetText(offsetAt(new Date(Date.UTC(year, 0, 1)), timeZone))
    return [
      "BEGIN:VTIMEZONE",
      `TZID:${timeZone}`,
      "BEGIN:STANDARD",
      `TZOFFSETFROM:${offset}`,
      `TZOFFSETTO:${offset}`,
      "DTSTART:19700101T000000",
      "END:STANDARD",
      "END:VTIMEZONE",
    ]
  }
  const parts = changes.flatMap((change) => {
    const daysInMonth = new Date(Date.UTC(year, change.month, 0)).getUTCDate()
    const weekday = new Date(Date.UTC(year, change.month - 1, change.day)).getUTCDay()
    // The last such weekday of the month, or the first, second, third…
    const nth = change.day + 7 > daysInMonth ? -1 : Math.ceil(change.day / 7)
    const kind = change.to > change.from ? "DAYLIGHT" : "STANDARD"
    return [
      `BEGIN:${kind}`,
      `TZOFFSETFROM:${offsetText(change.from)}`,
      `TZOFFSETTO:${offsetText(change.to)}`,
      `DTSTART:${firstOf1970(change.month, weekday, nth)}T${change.time}`,
      `RRULE:FREQ=YEARLY;BYMONTH=${change.month};BYDAY=${nth}${WEEKDAY_CODES[weekday]}`,
      `END:${kind}`,
    ]
  })
  return ["BEGIN:VTIMEZONE", `TZID:${timeZone}`, ...parts, "END:VTIMEZONE"]
}

/** The rule's day in 1970, where a yearly rule conventionally starts. */
function firstOf1970(month: number, weekday: number, nth: number) {
  const daysInMonth = new Date(Date.UTC(1970, month, 0)).getUTCDate()
  const firstWeekday = new Date(Date.UTC(1970, month - 1, 1)).getUTCDay()
  const first = 1 + ((weekday - firstWeekday + 7) % 7)
  let day = first + 7 * (nth - 1)
  if (nth === -1) {
    day = first
    while (day + 7 <= daysInMonth) day += 7
  }
  return `1970${pad(month)}${pad(day)}`
}

function offsetText(offsetMs: number) {
  const minutes = Math.round(Math.abs(offsetMs) / MINUTE_MS)
  return `${offsetMs < 0 ? "-" : "+"}${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}`
}

function wallStamp(day: string, time: string) {
  return `${day.replaceAll("-", "")}T${time.replace(":", "")}00`
}

function utcStamp(at: Date) {
  return `${at.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`
}

/** Calendar text: backslashes, commas, semicolons and line breaks are written escaped. */
function escapeText(text: string) {
  return text.replace(/[\\;,]/g, (character) => `\\${character}`).replace(/\r\n|\r|\n/g, "\\n")
}

const encoder = new TextEncoder()

/** Lines longer than 75 bytes go on as indented lines, never splitting a letter. */
function fold(line: string) {
  if (encoder.encode(line).length <= 75) return line
  const pieces: string[] = []
  let piece = ""
  let size = 0
  for (const character of line) {
    const bytes = encoder.encode(character).length
    const room = pieces.length ? 74 : 75
    if (size + bytes > room) {
      pieces.push(piece)
      piece = ""
      size = 0
    }
    piece += character
    size += bytes
  }
  pieces.push(piece)
  return pieces.join("\r\n ")
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}
