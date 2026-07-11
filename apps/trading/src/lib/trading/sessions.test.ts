import { describe, expect, it } from "vitest"

import { nyseSessionsInRange } from "@/lib/trading/nyse-sessions"
import {
  isSessionKey,
  sessionsInRange,
  type SessionKey,
} from "@/lib/trading/sessions"

const utc = (iso: string) => Date.parse(iso)
const DAY_MS = 24 * 60 * 60 * 1000

/** Sessions across the full UTC day containing the given date. */
function sessionsOnDay(key: SessionKey, iso: string) {
  const dayStart = utc(`${iso}T00:00:00Z`)
  return sessionsInRange(key, dayStart, dayStart + DAY_MS)
}

describe("sessionsInRange", () => {
  it("nyse delegates to the NYSE calendar (holidays and DST included)", () => {
    const from = utc("2024-06-30T00:00:00Z")
    const to = utc("2024-07-08T00:00:00Z") // spans the Jul 3 early close + Jul 4 holiday
    expect(sessionsInRange("nyse", from, to)).toEqual(
      nyseSessionsInRange(from, to)
    )
  })

  it("tokyo trades 9:00–15:00 JST (fixed UTC+9, no DST)", () => {
    expect(sessionsOnDay("tokyo", "2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T00:00:00Z"), closeMs: utc("2024-06-05T06:00:00Z") },
    ])
    // Winter too: Japan has no DST.
    expect(sessionsOnDay("tokyo", "2024-01-10")).toEqual([
      { openMs: utc("2024-01-10T00:00:00Z"), closeMs: utc("2024-01-10T06:00:00Z") },
    ])
  })

  it("tokyo skips weekends", () => {
    expect(
      sessionsInRange(
        "tokyo",
        utc("2024-06-08T00:00:00Z"), // Saturday
        utc("2024-06-10T00:00:00Z") // through Sunday
      )
    ).toEqual([])
  })

  it("london trades 8:00–16:30 UK: 07:00–15:30 UTC in summer, 08:00–16:30 UTC in winter", () => {
    expect(sessionsOnDay("london", "2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T07:00:00Z"), closeMs: utc("2024-06-05T15:30:00Z") },
    ])
    expect(sessionsOnDay("london", "2024-01-10")).toEqual([
      { openMs: utc("2024-01-10T08:00:00Z"), closeMs: utc("2024-01-10T16:30:00Z") },
    ])
  })

  it("london DST transition weeks (BST starts 2024-03-31, ends 2024-10-27)", () => {
    // Friday before / Monday after the spring switch.
    expect(sessionsOnDay("london", "2024-03-29")[0]?.openMs).toBe(
      utc("2024-03-29T08:00:00Z")
    )
    expect(sessionsOnDay("london", "2024-04-01")[0]?.openMs).toBe(
      utc("2024-04-01T07:00:00Z")
    )
    // Friday before / Monday after the autumn switch.
    expect(sessionsOnDay("london", "2024-10-25")[0]?.openMs).toBe(
      utc("2024-10-25T07:00:00Z")
    )
    expect(sessionsOnDay("london", "2024-10-28")[0]?.openMs).toBe(
      utc("2024-10-28T08:00:00Z")
    )
  })

  it("london skips weekends", () => {
    expect(
      sessionsInRange(
        "london",
        utc("2024-06-08T00:00:00Z"),
        utc("2024-06-10T00:00:00Z")
      )
    ).toEqual([])
  })

  it("UTC blocks sit on their fixed hours", () => {
    expect(sessionsOnDay("utcAsia", "2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T00:00:00Z"), closeMs: utc("2024-06-05T08:00:00Z") },
    ])
    expect(sessionsOnDay("utcLondon", "2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T08:00:00Z"), closeMs: utc("2024-06-05T16:00:00Z") },
    ])
    expect(sessionsOnDay("utcNewYork", "2024-06-05")).toEqual([
      { openMs: utc("2024-06-05T13:00:00Z"), closeMs: utc("2024-06-05T21:00:00Z") },
    ])
  })

  it("UTC blocks include weekends (crypto trades 24/7)", () => {
    expect(sessionsOnDay("utcAsia", "2024-06-08")).toHaveLength(1) // Saturday
    expect(sessionsOnDay("utcAsia", "2024-06-09")).toHaveLength(1) // Sunday
  })

  it("clips UTC blocks to the requested range", () => {
    const midBlockStart = utc("2024-06-05T14:00:00Z")
    const midBlockEnd = utc("2024-06-05T20:00:00Z")
    expect(sessionsInRange("utcNewYork", midBlockStart, midBlockEnd)).toEqual([
      { openMs: midBlockStart, closeMs: midBlockEnd },
    ])
  })

  it("multi-day ranges return one block per day", () => {
    const spans = sessionsInRange(
      "utcAsia",
      utc("2024-06-03T00:00:00Z"),
      utc("2024-06-10T00:00:00Z")
    )
    expect(spans).toHaveLength(7)
  })
})

describe("isSessionKey", () => {
  it("accepts known keys and rejects everything else", () => {
    expect(isSessionKey("nyse")).toBe(true)
    expect(isSessionKey("utcNewYork")).toBe(true)
    expect(isSessionKey("nycSession")).toBe(false)
    expect(isSessionKey(null)).toBe(false)
  })
})
