import type { Meeting, MeetingOccurrence, TeamMeetings } from "@/lib/api/project/meetings"
import { addDays, clockLabel, daysBetween, localNow, weekdayOf } from "@/lib/project/days"
import type { MeetingRepeat, ProjectColor } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/**
 * Meetings on the Team dashboard's calendar, the parts both the server and the
 * screen need. Tyler's choices (11 Oct 2026): anyone on the team makes one,
 * only its maker, the owner and admins change or delete it, everyone on the
 * team sees it, and it repeats weekly or every two weeks or not at all.
 */

export const MEETING_REPEAT_LABEL: Record<MeetingRepeat | "none", string> = {
  none: "Doesn't repeat",
  week: "Every week",
  two_weeks: "Every 2 weeks",
}

const STEP_DAYS: Record<MeetingRepeat, number> = { week: 7, two_weeks: 14 }

/**
 * The days a meeting falls on between `from` and `to`, both included, in the
 * meeting's own calendar. A repeat keeps the first day's weekday.
 */
export function meetingDaysBetween(
  meeting: { day: string; repeatEvery: MeetingRepeat | null },
  from: string,
  to: string
): string[] {
  if (!meeting.repeatEvery) return meeting.day >= from && meeting.day <= to ? [meeting.day] : []
  const step = STEP_DAYS[meeting.repeatEvery]
  const skip = meeting.day >= from ? 0 : Math.ceil(daysBetween(meeting.day, from) / step)
  const days: string[] = []
  for (let day = addDays(meeting.day, skip * step); day <= to; day = addDays(day, step)) {
    days.push(day)
  }
  return days
}

/** "Every Monday" or "Every other Friday", for a meeting's row. Null for a one-off. */
export function repeatWords(day: string, repeatEvery: MeetingRepeat | null) {
  const weekday = WEEKDAY_NAMES[weekdayOf(day)]
  if (repeatEvery === "week") return `Every ${weekday}`
  if (repeatEvery === "two_weeks") return `Every other ${weekday}`
  return null
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** "10:00 to 10:45 AM", or "11:30 AM to 12:15 PM" across noon, read in the zone. No dashes on screen. */
export function timeRangeLabel(startsAt: string, endsAt: string, timeZone: string) {
  const start = clockLabel(localNow(new Date(startsAt), timeZone).time)
  const end = clockLabel(localNow(new Date(endsAt), timeZone).time)
  const [startClock, startHalf] = start.split(" ")
  return startHalf === end.split(" ")[1] ? `${startClock} to ${end}` : `${start} to ${end}`
}

const KNOWN_SERVICES: { name: string; matches: (host: string) => boolean }[] = [
  { name: "Google Meet", matches: (host) => host === "meet.google.com" },
  { name: "Zoom", matches: (host) => host === "zoom.us" || host.endsWith(".zoom.us") },
  {
    name: "Microsoft Teams",
    matches: (host) => host === "teams.microsoft.com" || host === "teams.live.com",
  },
  { name: "Webex", matches: (host) => host.endsWith(".webex.com") },
  { name: "Whereby", matches: (host) => host === "whereby.com" },
]

/**
 * The video link's service as the meeting's row names it: "Google Meet",
 * "Zoom" or "Microsoft Teams" when it is one of those, otherwise the site's
 * own address, such as "jitsi.example.org".
 */
export function videoServiceName(videoUrl: string | null) {
  if (!videoUrl) return null
  try {
    const host = new URL(videoUrl).hostname.toLowerCase()
    return KNOWN_SERVICES.find((service) => service.matches(host))?.name ?? host.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * A meeting's chip on the calendar: a light wash of its colour with the name
 * in a darker shade of it. Written out so Tailwind finds them.
 */
export const MEETING_CHIP: Record<ProjectColor, string> = {
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  green: "bg-green-600/10 text-green-700 dark:text-green-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
}

/** The Team dashboard on the month and day a meeting falls on. */
export function meetingHref(day: string) {
  return `/team?month=${day.slice(0, 7)}&day=${day}`
}

/**
 * The month grid the Team dashboard's calendar draws: weeks start on Monday,
 * and the grid runs from the Monday on or before the 1st to the Sunday on or
 * after the last day.
 */
export function monthGrid(month: string) {
  const first = `${month}-01`
  const lead = (weekdayOf(first) + 6) % 7
  const start = addDays(first, -lead)
  const daysInMonth = Number(addDays(`${addDays(first, 32).slice(0, 7)}-01`, -1).slice(8))
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7
  return { first, start, end: addDays(start, cells - 1), cells }
}

/** A day square's frame. Days from the months either side are greyed out. */
export function dayCellClassName(inMonth: boolean) {
  return cn(
    "flex min-h-20 min-w-0 flex-col items-start gap-1.5 rounded-lg border bg-background p-1.5 text-left text-xs sm:p-2",
    !inMonth && "border-transparent bg-muted/60 text-muted-foreground/60"
  )
}

export type DayMeeting = { occurrence: MeetingOccurrence; meeting: Meeting }

/** The team's meetings grouped by the viewer's day, each day's by start time. */
export function meetingsByDay(data: TeamMeetings) {
  const byId = new Map(data.meetings.map((meeting) => [meeting.id, meeting]))
  const days = new Map<string, DayMeeting[]>()
  for (const occurrence of data.occurrences) {
    const meeting = byId.get(occurrence.meetingId)
    if (!meeting) continue
    days.set(occurrence.day, [...(days.get(occurrence.day) ?? []), { occurrence, meeting }])
  }
  return days
}

/** A new meeting's colour: the first one the team isn't using, so meetings tell apart. */
const NEW_MEETING_ORDER: ProjectColor[] = ["blue", "green", "orange", "violet", "teal", "pink", "amber", "red", "slate"]
export function nextMeetingColor(meetings: Meeting[]): ProjectColor {
  const used = new Set(meetings.map((meeting) => meeting.color))
  return NEW_MEETING_ORDER.find((color) => !used.has(color)) ?? "blue"
}

/** "Weekly planning at 10:00 – 10:45 AM", for a day square's spoken name. */
export function meetingWords(meetings: DayMeeting[], zone: string) {
  if (meetings.length === 0) return null
  const names = meetings.map(
    ({ occurrence, meeting }) =>
      `${meeting.title} at ${timeRangeLabel(occurrence.startsAt, occurrence.endsAt, zone)}`
  )
  return `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}: ${names.join("; ")}`
}
