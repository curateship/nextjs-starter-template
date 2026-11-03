import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { createTestDatabase } from "@/server/test-support"
import {
  autocompletePlaces,
  googleEnabled,
  placeDetails,
  routeMinutes,
  toOpeningHours,
} from "@/server/travel/google"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

describe("google with no key", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", ""))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("says Google is off and never calls it", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(googleEnabled()).toBe(false)
    await expect(autocompletePlaces("kyoto", "t")).rejects.toThrow(TRAVEL_ERRORS.googleOff)
    await expect(placeDetails("abc", "t")).rejects.toThrow(TRAVEL_ERRORS.googleOff)
    await expect(routeMinutes({ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, "walk")).rejects.toThrow(
      TRAVEL_ERRORS.googleOff
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("google places", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"))
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("keeps only real places from the suggestions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        suggestions: [
          {
            placePrediction: {
              placeId: "p1",
              text: { text: "Kinkaku-ji, Kyoto, Japan" },
              structuredFormat: { mainText: { text: "Kinkaku-ji" }, secondaryText: { text: "Kyoto, Japan" } },
            },
          },
          { queryPrediction: { text: { text: "kinkakuji tickets" } } },
        ],
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    expect(await autocompletePlaces("kinkaku", "session-1")).toEqual([
      { placeId: "p1", name: "Kinkaku-ji", detail: "Kyoto, Japan" },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete")
    expect(JSON.parse(String(init.body))).toEqual({ input: "kinkaku", sessionToken: "session-1" })
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-key")
  })

  it("turns a details answer into a place with hours, website and phone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        id: "p1",
        displayName: { text: "Kinkaku-ji" },
        formattedAddress: "1 Kinkakujicho, Kyoto",
        location: { latitude: 35.0394, longitude: 135.7292 },
        websiteUri: "https://www.shokoku-ji.jp/kinkakuji/",
        internationalPhoneNumber: "+81 75-461-0013",
        regularOpeningHours: {
          periods: [1, 2, 3, 4, 5].map((day) => ({
            open: { day, hour: 9 },
            close: { day, hour: 17 },
          })),
        },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const details = await placeDetails("p1", "session-1")
    expect(details.place).toEqual({
      name: "Kinkaku-ji",
      address: "1 Kinkakujicho, Kyoto",
      lat: 35.0394,
      lng: 135.7292,
      placeId: "p1",
    })
    expect(details.website).toBe("https://www.shokoku-ji.jp/kinkakuji/")
    expect(details.phone).toBe("+81 75-461-0013")
    expect(details.openingHours?.[0]).toEqual([])
    expect(details.openingHours?.[1]).toEqual([{ open: "09:00", close: "17:00" }])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://places.googleapis.com/v1/places/p1?sessionToken=session-1")
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("regularOpeningHours")
  })

  it("says Google failed on a bad answer or no answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: {} }, 403)))
    await expect(placeDetails("p1", "t")).rejects.toThrow(TRAVEL_ERRORS.googleFailed)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")))
    await expect(autocompletePlaces("kyoto", "t")).rejects.toThrow(TRAVEL_ERRORS.googleFailed)
  })
})

describe("opening hours from google", () => {
  it("is null with no periods", () => {
    expect(toOpeningHours(undefined)).toBeNull()
    expect(toOpeningHours([])).toBeNull()
  })

  it("keeps an overnight span on the day it opens", () => {
    const hours = toOpeningHours([
      { open: { day: 5, hour: 22 }, close: { day: 6, hour: 2 } },
      { open: { day: 6, hour: 22 }, close: { day: 0, hour: 3, minute: 30 } },
    ])
    expect(hours?.[5]).toEqual([{ open: "22:00", close: "02:00" }])
    expect(hours?.[6]).toEqual([{ open: "22:00", close: "03:30" }])
    expect(hours?.[0]).toEqual([])
  })

  it("opens every day all day when a period has no close", () => {
    const hours = toOpeningHours([{ open: { day: 0, hour: 0, minute: 0 } }])
    expect(hours).toEqual(Array.from({ length: 7 }, () => [{ open: "00:00", close: "23:59" }]))
  })

  it("reads missing zero fields as zero, as Google sends them", () => {
    const hours = toOpeningHours([{ open: {}, close: { hour: 12 } }])
    expect(hours?.[0]).toEqual([{ open: "00:00", close: "12:00" }])
  })

  it("writes a midnight-to-midnight day as 00:00 to 23:59", () => {
    const hours = toOpeningHours([{ open: { day: 2 }, close: { day: 3 } }])
    expect(hours?.[2]).toEqual([{ open: "00:00", close: "23:59" }])
    expect(hours?.[3]).toEqual([])
  })

  it("splits a span longer than a day into one span per day", () => {
    const hours = toOpeningHours([{ open: { day: 1, hour: 8 }, close: { day: 3, hour: 20 } }])
    expect(hours?.[1]).toEqual([{ open: "08:00", close: "23:59" }])
    expect(hours?.[2]).toEqual([{ open: "00:00", close: "23:59" }])
    expect(hours?.[3]).toEqual([{ open: "00:00", close: "20:00" }])
  })

  it("sorts a split day's spans by opening time", () => {
    const hours = toOpeningHours([
      { open: { day: 2, hour: 17 }, close: { day: 2, hour: 22 } },
      { open: { day: 2, hour: 11 }, close: { day: 2, hour: 14, minute: 30 } },
    ])
    expect(hours?.[2]).toEqual([
      { open: "11:00", close: "14:30" },
      { open: "17:00", close: "22:00" },
    ])
  })
})

describe("travel time between two places", () => {
  let client: PGlite

  beforeEach(async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key")
    ;({ client } = await createTestDatabase())
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    await client.close()
  })

  const temple = { lat: 35.0394, lng: 135.7292 }
  const station = { lat: 34.9858, lng: 135.7588 }

  it("asks Google once, then reuses the saved time until an address moves", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ routes: [{ duration: "1250s" }] }))
    vi.stubGlobal("fetch", fetchMock)

    expect(await routeMinutes(temple, station, "walk")).toBe(21)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://routes.googleapis.com/directions/v2:computeRoutes")
    expect((init.headers as Record<string, string>)["X-Goog-FieldMask"]).toBe("routes.duration")
    expect(JSON.parse(String(init.body)).travelMode).toBe("WALK")

    // Same places, a hair apart after rounding: no second call.
    expect(await routeMinutes({ lat: 35.039401, lng: 135.729201 }, station, "walk")).toBe(21)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Another mode is another question.
    await routeMinutes(temple, station, "drive")
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // A changed address is a new position, so Google is asked again.
    await routeMinutes({ lat: 35.0116, lng: 135.7681 }, station, "walk")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("returns null and saves nothing when Google finds no route", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({}))
    vi.stubGlobal("fetch", fetchMock)
    expect(await routeMinutes(temple, station, "transit")).toBeNull()
    expect(await routeMinutes(temple, station, "transit")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
