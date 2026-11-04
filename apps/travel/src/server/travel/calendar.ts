import { and, asc, eq, isNull } from "drizzle-orm"

import { dateOfDay } from "@/lib/travel/dates"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { appUrlFor } from "@/server/app-url"
import { createSecretToken } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip, type ActivityRow, type TripRow } from "@/server/travel/access"
import { travelActivities, travelTrips } from "@/server/travel/schema"

/**
 * A trip as a calendar that Apple and Google Calendar subscribe to (task part
 * 45). The address carries a long secret instead of a sign-in, because a
 * phone's calendar can't sign in. Anyone holding the address can read the
 * trip's timed activities, so Reset link swaps the secret for a new one and
 * the old address stops working at once.
 */

/** An activity with no length set shows as an hour. */
const DEFAULT_MINUTES = 60

/** 64 hex characters, the shape `createSecretToken` makes. */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/

type CalendarTrip = Pick<TripRow, "id" | "name" | "days" | "startDate" | "timeZone">
type CalendarActivity = Pick<
  ActivityRow,
  "id" | "day" | "title" | "startTime" | "durationMinutes" | "place" | "deletedAt" | "updatedAt"
>

/** Text inside a calendar line, with the four characters the format reserves escaped. */
export function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

/**
 * Splits a line so no piece is longer than 75 bytes, as the calendar format
 * asks. Each piece after the first starts with a space, which counts toward
 * its 75. A character written in several bytes is never cut in half.
 */
export function foldLine(line: string) {
  const encoder = new TextEncoder()
  const pieces: string[] = []
  let current = ""
  let size = 0
  for (const character of line) {
    const bytes = encoder.encode(character).length
    if (size + bytes > 75) {
      pieces.push(current)
      current = " "
      size = 1
    }
    current += character
    size += bytes
  }
  pieces.push(current)
  return pieces.join("\r\n")
}

/** "2026-03-04" and "09:30" as "20260304T093000". */
function localStamp(date: string, time: string) {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`
}

/** A moment as "20260304T093000Z". */
function utcStamp(at: Date) {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/**
 * The calendar file for one trip. Each activity on a day with a start time
 * becomes an event at that time where the trip is. A trip with no time zone
 * gives times with no zone, which a phone reads as its own local time. A trip
 * with no start date gives a calendar with no events, because its days have
 * no dates yet.
 */
export function buildTripCalendar(
  trip: CalendarTrip,
  activities: readonly CalendarActivity[],
  at: Date = new Date()
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travel//Trip calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(trip.name)}`,
    // Asks the phone to look for changes every hour. Apple and Google each
    // keep their own schedule, so this is a request, not a promise.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ]
  if (trip.timeZone) lines.push(`X-WR-TIMEZONE:${trip.timeZone}`)

  for (const activity of activities) {
    if (activity.deletedAt || activity.day === null || activity.day > trip.days || !activity.startTime) continue
    const date = dateOfDay(trip.startDate, activity.day)
    if (!date) continue
    const start = localStamp(date, activity.startTime)
    const minutes = activity.durationMinutes ?? DEFAULT_MINUTES
    lines.push(
      "BEGIN:VEVENT",
      `UID:${activity.id}@travel`,
      `DTSTAMP:${utcStamp(at)}`,
      `LAST-MODIFIED:${utcStamp(activity.updatedAt)}`,
      trip.timeZone ? `DTSTART;TZID=${trip.timeZone}:${start}` : `DTSTART:${start}`,
      `DURATION:PT${minutes}M`,
      `SUMMARY:${escapeText(activity.title)}`
    )
    const location = [activity.place?.name, activity.place?.address]
      .map((part) => part?.trim())
      .filter((part, index, all) => part && all.indexOf(part) === index)
      .join(", ")
    if (location) lines.push(`LOCATION:${escapeText(location)}`)
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return `${lines.map(foldLine).join("\r\n")}\r\n`
}

/** The calendar file for a link's secret, or null when no trip has it. */
export async function loadCalendarFeed(token: string, database: CustomShellDb = db, at: Date = new Date()) {
  if (!TOKEN_PATTERN.test(token)) return null
  // A trip in the bin has no calendar until it is put back (Travel features part 8).
  const [trip] = await database
    .select()
    .from(travelTrips)
    .where(and(eq(travelTrips.calendarToken, token), isNull(travelTrips.deletedAt)))
    .limit(1)
  if (!trip) return null
  const activities = await database
    .select()
    .from(travelActivities)
    .where(and(eq(travelActivities.tripId, trip.id), isNull(travelActivities.deletedAt)))
    .orderBy(asc(travelActivities.day), asc(travelActivities.position))
  return buildTripCalendar(trip, activities, at)
}

export type CalendarLink = {
  /** The address as the web reads it, for copying. */
  url: string
  /** The same address starting webcal://, which a phone opens in its calendar app. */
  webcalUrl: string
}

function linkFor(token: string): CalendarLink {
  const url = appUrlFor(`/api/travel/calendar/${token}`)
  return { url, webcalUrl: url.replace(/^https?:\/\//, "webcal://") }
}

/** The trip's calendar link, made the first time it's asked for. Needs a start date. */
export async function makeCalendarLink(userId: string, tripId: string, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, tripId, database)
  if (!trip.startDate) throw new Error(TRAVEL_ERRORS.needsStartDate)
  if (trip.calendarToken) return linkFor(trip.calendarToken)
  const token = createSecretToken()
  await database.update(travelTrips).set({ calendarToken: token }).where(eq(travelTrips.id, trip.id))
  return linkFor(token)
}

/** A new secret for the trip's calendar link. The old link stops working at once. */
export async function resetCalendarLink(userId: string, tripId: string, database: CustomShellDb = db) {
  const trip = await requireTrip(userId, tripId, database)
  if (!trip.startDate) throw new Error(TRAVEL_ERRORS.needsStartDate)
  const token = createSecretToken()
  await database.update(travelTrips).set({ calendarToken: token }).where(eq(travelTrips.id, trip.id))
  return linkFor(token)
}
