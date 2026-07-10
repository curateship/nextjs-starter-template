import { describe, expect, it } from "vitest"

import {
  NYSE_FULL_HOLIDAYS,
  nyseSessionsInRange,
} from "@/lib/trading/nyse-sessions"

/** Sessions across the full UTC day containing the given date. */
function sessionsOnDay(iso: string) {
  const dayStart = Date.parse(`${iso}T00:00:00Z`)
  return nyseSessionsInRange(dayStart, dayStart + 24 * 60 * 60 * 1000)
}

const utc = (iso: string) => Date.parse(iso)

describe("nyseSessionsInRange", () => {
  it("regular day in summer (EDT, UTC-4)", () => {
    expect(sessionsOnDay("2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T13:30:00Z"), closeMs: utc("2024-06-05T20:00:00Z") },
    ])
  })

  it("regular day in winter (EST, UTC-5)", () => {
    expect(sessionsOnDay("2024-01-10")).toEqual([
      { openMs: utc("2024-01-10T14:30:00Z"), closeMs: utc("2024-01-10T21:00:00Z") },
    ])
  })

  it("spring-forward week: Friday EST, Monday EDT (DST starts 2024-03-10)", () => {
    expect(sessionsOnDay("2024-03-08")[0]?.openMs).toBe(utc("2024-03-08T14:30:00Z"))
    expect(sessionsOnDay("2024-03-11")[0]?.openMs).toBe(utc("2024-03-11T13:30:00Z"))
  })

  it("fall-back week: Friday EDT, Monday EST (DST ends 2024-11-03)", () => {
    expect(sessionsOnDay("2024-11-01")[0]?.openMs).toBe(utc("2024-11-01T13:30:00Z"))
    expect(sessionsOnDay("2024-11-04")[0]?.openMs).toBe(utc("2024-11-04T14:30:00Z"))
  })

  it("weekend range has no sessions", () => {
    expect(
      nyseSessionsInRange(utc("2024-06-08T00:00:00Z"), utc("2024-06-10T00:00:00Z"))
    ).toEqual([])
  })

  it("full holidays have no sessions", () => {
    expect(sessionsOnDay("2024-07-04")).toEqual([]) // Independence Day
    expect(sessionsOnDay("2024-01-01")).toEqual([]) // New Year's Day
    expect(sessionsOnDay("2025-01-09")).toEqual([]) // Carter day of mourning
    expect(sessionsOnDay("2022-06-20")).toEqual([]) // Juneteenth observed
  })

  it("Juneteenth is a normal session before NYSE observed it (2021)", () => {
    expect(sessionsOnDay("2021-06-18")).toHaveLength(1)
  })

  it("Saturday New Year's is not observed: Fri 2021-12-31 trades", () => {
    expect(sessionsOnDay("2021-12-31")).toHaveLength(1)
  })

  it("early-close days end at 1:00 PM New York", () => {
    expect(sessionsOnDay("2024-07-03")[0]?.closeMs).toBe(utc("2024-07-03T17:00:00Z")) // EDT
    expect(sessionsOnDay("2024-11-29")[0]?.closeMs).toBe(utc("2024-11-29T18:00:00Z")) // EST
    expect(sessionsOnDay("2024-12-24")[0]?.closeMs).toBe(utc("2024-12-24T18:00:00Z")) // EST
  })

  it("clips sessions to the requested range", () => {
    const midSessionStart = utc("2024-06-05T15:00:00Z")
    const midSessionEnd = utc("2024-06-05T19:00:00Z")
    expect(nyseSessionsInRange(midSessionStart, midSessionEnd)).toEqual([
      { openMs: midSessionStart, closeMs: midSessionEnd },
    ])
  })

  it("holiday table has 9–11 full closures each year 2020–2030", () => {
    for (let year = 2020; year <= 2030; year++) {
      const count = [...NYSE_FULL_HOLIDAYS].filter((key) =>
        key.startsWith(`${year}-`)
      ).length
      expect(count, `year ${year}`).toBeGreaterThanOrEqual(9)
      expect(count, `year ${year}`).toBeLessThanOrEqual(11)
    }
  })
})
