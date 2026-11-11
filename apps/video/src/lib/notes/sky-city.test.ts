import { describe, expect, it } from "vitest"

import { readSkyCity, skyPhaseFor, sunTimes } from "@/lib/notes/sky-city"

const toronto = { label: "Toronto, Ontario", latitude: 43.70011, longitude: -79.4163 }
const minutesApart = (a: Date, b: Date) => Math.abs(a.valueOf() - b.valueOf()) / 60_000

/** The cover sky by a city's real sun (Settings → General → Sky city). */
describe("the sky by a city's sun", () => {
  it("puts Toronto's sunrise near 7 AM and its sunset near 5 PM on 8 Nov 2026", () => {
    const { sunrise, sunset } = sunTimes(new Date("2026-11-08T17:00:00Z"), toronto.latitude, toronto.longitude)
    expect(minutesApart(sunrise!, new Date("2026-11-08T12:00:00Z"))).toBeLessThan(10)
    expect(minutesApart(sunset!, new Date("2026-11-08T22:00:00Z"))).toBeLessThan(10)
  })

  it("finds the long days of June too", () => {
    // NOAA: sunrise 5:36 AM EDT, sunset 9:03 PM EDT on 21 Jun 2026.
    const { sunrise, sunset } = sunTimes(new Date("2026-06-21T16:00:00Z"), toronto.latitude, toronto.longitude)
    expect(minutesApart(sunrise!, new Date("2026-06-21T09:36:00Z"))).toBeLessThan(4)
    expect(minutesApart(sunset!, new Date("2026-06-22T01:03:00Z"))).toBeLessThan(4)
  })

  it("is gold by 3:45 PM in Toronto in November, and night by 6:30 PM", () => {
    expect(skyPhaseFor(new Date("2026-11-08T20:45:00Z"), toronto)).toBe("golden")
    expect(skyPhaseFor(new Date("2026-11-08T22:30:00Z"), toronto)).toBe("sunset")
    expect(skyPhaseFor(new Date("2026-11-08T23:30:00Z"), toronto)).toBe("night")
    expect(skyPhaseFor(new Date("2026-11-08T12:30:00Z"), toronto)).toBe("sunrise")
    expect(skyPhaseFor(new Date("2026-11-08T17:00:00Z"), toronto)).toBe("day")
    expect(skyPhaseFor(new Date("2026-11-09T05:00:00Z"), toronto)).toBe("night")
  })

  it("keeps the sun up through a polar summer and down through a polar winter", () => {
    const tromso = { label: "Tromsø", latitude: 69.65, longitude: 18.96 }
    expect(skyPhaseFor(new Date("2026-06-21T23:00:00Z"), tromso)).toBe("day")
    expect(skyPhaseFor(new Date("2026-12-21T12:00:00Z"), tromso)).toBe("night")
  })

  it("reads a stored city back, and anything else as none", () => {
    expect(readSkyCity(toronto)).toEqual(toronto)
    expect(readSkyCity({ label: "x", latitude: 200, longitude: 0 })).toBeNull()
    expect(readSkyCity(null)).toBeNull()
  })
})
