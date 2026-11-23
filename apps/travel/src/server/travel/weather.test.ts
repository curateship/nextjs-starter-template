import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createTrip } from "@/server/travel/trips"
import { forgetWeather, loadTripWeather } from "@/server/travel/weather"
import { rainLine } from "@/lib/travel/weather"
import { cardRainLine } from "@/lib/travel/rainy-day"

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
const AT = new Date("2026-03-01T12:00:00Z")

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  forgetWeather()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await client.close()
})

/** Open-Meteo, stubbed: Kyoto and Tokyo are found, and every place forecasts sun from 1 March. */
function stubOpenMeteo() {
  const asked: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const url = new URL(input)
      asked.push(`${url.hostname}${url.searchParams.get("name") ? `:${url.searchParams.get("name")}` : ""}`)
      if (url.hostname.startsWith("geocoding")) {
        const name = url.searchParams.get("name")
        const found = name === "Kyoto" ? { latitude: 35.0, longitude: 135.7 } : name === "Tokyo" ? { latitude: 35.6, longitude: 139.6 } : null
        return Response.json({ results: found ? [found] : [] })
      }
      const time = Array.from({ length: 16 }, (_, index) => new Date(Date.UTC(2026, 2, 1 + index)).toISOString().slice(0, 10))
      return Response.json({
        daily: {
          time,
          weather_code: time.map(() => 0),
          temperature_2m_max: time.map(() => 18.4),
          temperature_2m_min: time.map(() => 8.6),
          // 1 March 70, 2 March 29.6, 3 March nothing given, then 10.
          precipitation_probability_max: time.map((_, index) => (index < 3 ? [70, 29.6, null][index] : 10)),
        },
        // 2 March only: 40 at 2 PM, nothing given at 3 PM, and 5 every other hour.
        hourly: {
          time: Array.from({ length: 24 }, (_, hour) => `2026-03-02T${String(hour).padStart(2, "0")}:00`),
          precipitation_probability: Array.from({ length: 24 }, (_, hour) => (hour === 14 ? 40 : hour === 15 ? null : 5)),
        },
      })
    })
  )
  return asked
}

describe("weather on each day (part 33)", () => {
  it("forecasts days in the next 14 days at the trip's destination", async () => {
    const asked = stubOpenMeteo()
    const { id } = await createTrip(anna.id, { name: "Japan", days: 20, currency: "JPY", startDate: "2026-03-02", destination: "Tokyo, Japan" }, database)
    const days = await loadTripWeather(anna.id, id, database, AT)
    // 2 March to 14 March is inside 14 days of 1 March; Day 14 (15 March) isn't.
    expect(days.map((day) => day.day)).toEqual(Array.from({ length: 13 }, (_, index) => index + 1))
    // Day 1 is 2 March: a 29.6 chance rounds to 30, the first chance that shows.
    expect(days[0]).toMatchObject({ day: 1, high: 18, low: 9, kind: "clear", rain: 30 })
    // Each hour's chance on its own day (Travel features 4, part 3); a day with no hours given has none.
    expect(days[0].hourlyRain).toHaveLength(24)
    expect(days[0].hourlyRain[14]).toBe(40)
    expect(days[0].hourlyRain[15]).toBeNull()
    expect(days[0].hourlyRain[9]).toBe(5)
    expect(days[1].hourlyRain).toEqual([])
    expect(days[1].rain).toBeNull()
    expect(days[2].rain).toBe(10)
    expect(asked.some((call) => call.includes("Kyoto"))).toBe(false)
    expect(asked).toContain("geocoding-api.open-meteo.com:Tokyo")
  })

  it("shows nothing for a trip with no dates, and nothing when the service fails", async () => {
    const { id } = await createTrip(anna.id, { name: "Someday", days: 3, currency: "USD", startDate: null, destination: "Tokyo" }, database)
    expect(await loadTripWeather(anna.id, id, database, AT)).toEqual([])
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })))
    const dated = await createTrip(anna.id, { name: "Soon", days: 3, currency: "USD", startDate: "2026-03-02", destination: "Tokyo" }, database)
    expect(await loadTripWeather(anna.id, dated.id, database, AT)).toEqual([])
  })
})

describe("chance of rain (Travel features part 3)", () => {
  it('reads "70% rain" from 30 out of 100, and nothing under it or with no chance given', () => {
    expect(rainLine({ rain: 70 })).toBe("70% rain")
    expect(rainLine({ rain: 30 })).toBe("30% rain")
    expect(rainLine({ rain: 29 })).toBeNull()
    expect(rainLine({ rain: 0 })).toBeNull()
    expect(rainLine({ rain: null })).toBeNull()
  })
})

describe("rain at the card's hour (Travel features 4, part 3)", () => {
  const hours = Array.from({ length: 24 }, (_, hour) => (hour === 14 ? 40 : hour === 9 ? 29 : null))
  const forecast = [{ day: 2, hourlyRain: hours }]
  const park = { kinds: ["park"] }

  it("reads the chance in the hour an outdoor card starts", () => {
    expect(cardRainLine({ day: 2, startTime: "14:30", place: park }, forecast)).toBe("40% rain at 2:30 PM")
  })

  it("shows nothing under 30, with no chance given, indoors, untimed or on a day past the forecast", () => {
    expect(cardRainLine({ day: 2, startTime: "09:00", place: park }, forecast)).toBeNull()
    expect(cardRainLine({ day: 2, startTime: "16:00", place: park }, forecast)).toBeNull()
    expect(cardRainLine({ day: 2, startTime: "14:00", place: { kinds: ["museum"] } }, forecast)).toBeNull()
    expect(cardRainLine({ day: 2, startTime: null, place: park }, forecast)).toBeNull()
    expect(cardRainLine({ day: 3, startTime: "14:00", place: park }, forecast)).toBeNull()
    expect(cardRainLine({ day: null, startTime: "14:00", place: park }, forecast)).toBeNull()
  })
})
