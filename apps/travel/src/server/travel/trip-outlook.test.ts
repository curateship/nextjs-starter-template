import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { addDays } from "@/lib/travel/dates"
import { typicalLine } from "@/lib/travel/weather"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { forgetOutlook, loadTripOutlook, typicalFor } from "@/server/travel/trip-outlook"
import { createTrip } from "@/server/travel/trips"
import { forgetWeather } from "@/server/travel/weather"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
const AT = new Date("2099-09-01T12:00:00Z")

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  forgetWeather()
  forgetOutlook()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

/** Every day from `start` to `end`: 24° high, 15° low, and rain on every third day. */
function archiveAnswer(start: string, end: string) {
  const time: string[] = []
  for (let date = start; date <= end; date = addDays(date, 1)) time.push(date)
  return {
    daily: {
      time,
      temperature_2m_max: time.map(() => 24.2),
      temperature_2m_min: time.map(() => 14.8),
      precipitation_sum: time.map((_, index) => (index % 3 === 0 ? 4.5 : 0)),
    },
  }
}

/** Open-Meteo's place search, its archive, and Nager.Date, stubbed. Tokyo is in Japan. */
function stubServices({ holidays = true }: { holidays?: boolean } = {}) {
  const asked: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input)
      asked.push(url.hostname + url.pathname)
      if (url.hostname.startsWith("geocoding")) {
        return Response.json({ results: [{ latitude: 35.6, longitude: 139.6, country_code: "jp" }] })
      }
      if (url.hostname.startsWith("archive-api")) {
        return Response.json(archiveAnswer(url.searchParams.get("start_date")!, url.searchParams.get("end_date")!))
      }
      if (url.hostname === "date.nager.at") {
        if (!holidays) return new Response("", { status: 404 })
        const year = url.pathname.split("/")[4]
        return Response.json([
          { date: `${year}-11-03`, name: "Culture Day", global: true },
          { date: `${year}-11-04`, name: "A regional day", global: false },
        ])
      }
      return new Response("", { status: 500 })
    })
  )
  return asked
}

describe("what far-off days are usually like (More Travel features part 7)", () => {
  it('reads "Usually 24° / 15° · rain on 10 of 30 days" for days past the forecast only', async () => {
    const asked = stubServices()
    // 1 Sep to 20 Sep, made on 1 Sep: days 1 to 14 are inside the 14-day forecast, 15 to 20 aren't.
    const { id } = await createTrip(anna.id, { name: "Tokyo", days: 20, currency: "JPY", startDate: "2099-09-01", destination: "Tokyo" }, database)
    const { typical } = await loadTripOutlook(anna.id, id, database, AT)
    expect(typical.map((day) => day.day)).toEqual([15, 16, 17, 18, 19, 20])
    expect(typical[0]).toEqual({ day: 15, high: 24, low: 15, rainDays: 10 })
    expect(typicalLine(typical[0])).toBe("Usually 24° / 15° · rain on 10 of 30 days")
    // One archive request for every day of the trip.
    expect(asked.filter((call) => call.startsWith("archive-api"))).toHaveLength(1)
  })

  it("leaves out a date with too little history, and shows nothing when the archive fails", async () => {
    expect(typicalFor(["2099-01-10"], 1, new Map())).toEqual(new Map())
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })))
    const { id } = await createTrip(anna.id, { name: "Later", days: 3, currency: "JPY", startDate: "2099-12-01", destination: "Tokyo" }, database)
    expect(await loadTripOutlook(anna.id, id, database, AT)).toEqual({ typical: [], holidays: [] })
  })
})

describe("public holidays (More Travel features part 8)", () => {
  it("names the country's own holidays on their day, and leaves regional ones off", async () => {
    stubServices()
    const { id } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: "2099-11-02", destination: "Tokyo" }, database)
    expect((await loadTripOutlook(anna.id, id, database, AT)).holidays).toEqual([{ day: 2, name: "Culture Day" }])
  })

  it("shows none for a country Nager.Date doesn't list, or a trip with no dates", async () => {
    stubServices({ holidays: false })
    const { id } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: "2099-11-02", destination: "Tokyo" }, database)
    expect((await loadTripOutlook(anna.id, id, database, AT)).holidays).toEqual([])
    const undated = await createTrip(anna.id, { name: "Someday", days: 3, currency: "JPY", startDate: null, destination: "Tokyo" }, database)
    expect(await loadTripOutlook(anna.id, undated.id, database, AT)).toEqual({ typical: [], holidays: [] })
  })
})
