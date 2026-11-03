import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  buildTripCalendar,
  escapeText,
  foldLine,
  loadCalendarFeed,
  makeCalendarLink,
  resetCalendarLink,
} from "@/server/travel/calendar"
import { createActivity, createTrip, updateActivity, updateTrip } from "@/server/travel/trips"

const AT = new Date("2026-02-01T12:00:00Z")

function activity(overrides: Partial<Parameters<typeof buildTripCalendar>[1][number]> = {}) {
  return {
    id: "a1",
    day: 1,
    title: "Senso-ji",
    startTime: "09:30",
    durationMinutes: null,
    place: null,
    deletedAt: null,
    updatedAt: AT,
    ...overrides,
  }
}

const TRIP = { id: "t1", name: "Tokyo", days: 5, startDate: "2026-03-04", timeZone: "Asia/Tokyo" }

/** The lines of a calendar file with folded lines joined back up. */
function unfolded(calendar: string) {
  return calendar.replace(/\r\n /g, "").split("\r\n")
}

describe("the calendar file", () => {
  it("escapes the characters the format reserves", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne")
  })

  it("folds lines at 75 bytes without cutting a character", () => {
    const line = `SUMMARY:${"あ".repeat(60)}`
    const folded = foldLine(line)
    const pieces = folded.split("\r\n")
    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75)
    for (const piece of pieces.slice(1)) expect(piece.startsWith(" ")).toBe(true)
    expect(folded.replace(/\r\n /g, "")).toBe(line)
    expect(foldLine("SHORT:line")).toBe("SHORT:line")
  })

  it("puts each timed activity at its day and time in the trip's time zone", () => {
    const calendar = buildTripCalendar(
      TRIP,
      [
        activity({
          durationMinutes: 90,
          place: { name: "Senso-ji", address: "2-3-1 Asakusa, Taito City", lat: null, lng: null, placeId: null },
        }),
        activity({ id: "a2", day: 3, startTime: "19:00", title: "Dinner, sushi" }),
      ],
      AT
    )
    expect(calendar.endsWith("\r\n")).toBe(true)
    expect(calendar).not.toMatch(/[^\r]\n/)
    const lines = unfolded(calendar)
    expect(lines).toContain("X-WR-CALNAME:Tokyo")
    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260304T093000")
    expect(lines).toContain("DURATION:PT90M")
    expect(lines).toContain("LOCATION:Senso-ji\\, 2-3-1 Asakusa\\, Taito City")
    expect(lines).toContain("DTSTART;TZID=Asia/Tokyo:20260306T190000")
    expect(lines).toContain("DURATION:PT60M")
    expect(lines).toContain("SUMMARY:Dinner\\, sushi")
    expect(lines).toContain("UID:a1@travel")
    expect(lines).toContain("DTSTAMP:20260201T120000Z")
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(2)
  })

  it("uses floating times when the trip has no time zone", () => {
    const lines = unfolded(buildTripCalendar({ ...TRIP, timeZone: null }, [activity()], AT))
    expect(lines).toContain("DTSTART:20260304T093000")
    expect(lines.some((line) => line.startsWith("X-WR-TIMEZONE"))).toBe(false)
  })

  it("leaves out ideas, untimed, binned and past-the-end activities", () => {
    const calendar = buildTripCalendar(
      TRIP,
      [
        activity({ id: "idea", day: null }),
        activity({ id: "untimed", startTime: null }),
        activity({ id: "binned", deletedAt: AT }),
        activity({ id: "late", day: 6 }),
      ],
      AT
    )
    expect(calendar).not.toContain("BEGIN:VEVENT")
  })

  it("has no events for a trip with no start date", () => {
    const calendar = buildTripCalendar({ ...TRIP, startDate: null }, [activity()], AT)
    expect(calendar).toContain("BEGIN:VCALENDAR")
    expect(calendar).not.toContain("BEGIN:VEVENT")
  })
})

describe("the calendar link", () => {
  let client: PGlite
  let database: CustomShellDb
  let anna: CustomShellUser
  let ben: CustomShellUser

  beforeEach(async () => {
    const testDb = await createTestDatabase()
    client = testDb.client
    database = testDb.db
    anna = await insertUser(database, { name: "Anna", email: "anna@example.test" })
    ben = await insertUser(database, { name: "Ben", email: "ben@example.test" })
  })

  afterEach(async () => {
    await client.close()
  })

  it("serves the trip for its secret and nothing for a wrong one", async () => {
    const { id: tripId } = await createTrip(
      anna.id,
      { name: "Tokyo", days: 5, currency: "JPY", startDate: "2026-03-04" },
      database
    )
    await updateTrip(anna.id, { tripId, timeZone: "Asia/Tokyo" }, database)
    const { id: activityId } = await createActivity(
      anna.id,
      { tripId, day: 2, title: "Tsukiji breakfast", startTime: "08:00" },
      database
    )

    const link = await makeCalendarLink(anna.id, tripId, database)
    expect(link.webcalUrl.startsWith("webcal://")).toBe(true)
    const token = link.url.split("/").pop()!
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect((await makeCalendarLink(anna.id, tripId, database)).url).toBe(link.url)

    const calendar = await loadCalendarFeed(token, database)
    expect(calendar).toContain("DTSTART;TZID=Asia/Tokyo:20260305T080000")
    expect(calendar).toContain(`UID:${activityId}@travel`)

    // A moved card shows at its new time on the next read.
    await updateActivity(anna.id, { activityId, startTime: "10:15" }, database)
    expect(await loadCalendarFeed(token, database)).toContain("DTSTART;TZID=Asia/Tokyo:20260305T101500")

    expect(await loadCalendarFeed("0".repeat(64), database)).toBeNull()
    expect(await loadCalendarFeed("not-a-token", database)).toBeNull()

    const fresh = await resetCalendarLink(anna.id, tripId, database)
    expect(fresh.url).not.toBe(link.url)
    expect(await loadCalendarFeed(token, database)).toBeNull()
  })

  it("is the owner's alone and needs a start date", async () => {
    const { id: tripId } = await createTrip(
      anna.id,
      { name: "Kyoto", days: 3, currency: "JPY", startDate: null },
      database
    )
    await expect(makeCalendarLink(anna.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.needsStartDate)
    await updateTrip(anna.id, { tripId, startDate: "2026-04-01" }, database)
    await expect(makeCalendarLink(ben.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
    await expect(resetCalendarLink(ben.id, tripId, database)).rejects.toThrow(TRAVEL_ERRORS.tripNotFound)
  })
})
