import { describe, expect, it } from "vitest"

import { mustDoWarning } from "@/lib/travel/must-do"
import { isOutdoors, rainyDayMove } from "@/lib/travel/rainy-day"

const park = { kinds: ["park", "tourist_attraction"] }
const museum = { kinds: ["museum", "tourist_attraction"] }
const trip = { startDate: "2099-11-02" }
const forecast = [
  { day: 1, rain: 20 },
  { day: 2, rain: 80 },
  { day: 3, rain: 10 },
  { day: 4, rain: 10 },
  { day: 5, rain: null },
]

describe("swap a rainy day (More Travel features part 9)", () => {
  it("counts a place as outdoors from Google's kinds, and an older place without them as not", () => {
    expect(isOutdoors(park)).toBe(true)
    expect(isOutdoors(museum)).toBe(false)
    expect(isOutdoors({})).toBe(false)
    expect(isOutdoors(null)).toBe(false)
  })

  it("moves an outdoor card off a day of 70 or more to the driest day, the nearer one on a tie", () => {
    // 2 Nov 2099 is a Monday, so Day 2 is a Tuesday.
    expect(rainyDayMove({ day: 2, place: park }, trip, forecast)).toEqual({ warning: "Rain on Tue", toDay: 3 })
    expect(rainyDayMove({ day: 2, place: museum }, trip, forecast)).toBeNull()
    expect(rainyDayMove({ day: 1, place: park }, trip, forecast)).toBeNull()
    expect(rainyDayMove({ day: null, place: park }, trip, forecast)).toBeNull()
    expect(rainyDayMove({ day: 5, place: park }, trip, forecast)).toBeNull()
  })

  it("warns with no day to move to when no day is under 30", () => {
    const wet = [
      { day: 1, rain: 90 },
      { day: 2, rain: 40 },
    ]
    expect(rainyDayMove({ day: 1, place: park }, trip, wet)).toEqual({ warning: "Rain on Mon", toDay: null })
  })
})

describe("a Must do left in Ideas (More Travel features part 4)", () => {
  const dated = { startDate: "2099-11-02", timeZone: "Asia/Tokyo" }
  it("warns once the trip has started, and never before, on a day, or with no dates", () => {
    const during = new Date("2099-11-03T03:00:00Z")
    const before = new Date("2099-10-30T03:00:00Z")
    expect(mustDoWarning({ mustDo: true, day: null }, dated, during)).toBe("Must do, not on a day yet")
    expect(mustDoWarning({ mustDo: true, day: null }, dated, before)).toBeNull()
    expect(mustDoWarning({ mustDo: true, day: 2 }, dated, during)).toBeNull()
    expect(mustDoWarning({ mustDo: false, day: null }, dated, during)).toBeNull()
    expect(mustDoWarning({ mustDo: true, day: null }, { startDate: null, timeZone: null }, during)).toBeNull()
  })
})
