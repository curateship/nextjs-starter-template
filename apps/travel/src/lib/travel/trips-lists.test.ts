import { describe, expect, it } from "vitest"

import type { TripListRow } from "@/lib/api/travel/trips"
import { dayOfTripLine, monthGroupOf, nextTripOf, tabOf, whereFromAddress } from "@/lib/travel/trips-lists"
import { readTripsSearch, sectionOf } from "@/lib/travel/trips-search"

// Noon on 12 Nov 2026, in the reader's own time zone.
const NOW = new Date(2026, 10, 12, 12)

const trip = (patch: Partial<TripListRow>): TripListRow => ({
  id: "t",
  name: "Trip",
  destination: null,
  days: 3,
  startDate: null,
  currency: "CAD",
  status: "planning",
  coverUrl: null,
  tags: [],
  isSample: false,
  archived: false,
  deletedAt: null,
  activityCount: 0,
  rating: null,
  timeZone: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...patch,
})

describe("which tab a trip is under", () => {
  it("puts the Bin first, then Archived, then Past for a trip that has ended", () => {
    expect(tabOf(trip({ deletedAt: "2026-11-01T00:00:00.000Z", archived: true }))).toBe("bin")
    expect(tabOf(trip({ archived: true }))).toBe("archived")
    expect(tabOf(trip({ startDate: "2020-01-01" }))).toBe("past")
    expect(tabOf(trip({ startDate: null }))).toBe("upcoming")
  })
})

describe("Upcoming's month folds", () => {
  it("is This month for one on now or starting this month, then Next month, Later and No dates", () => {
    expect(monthGroupOf(trip({ startDate: "2026-11-10" }), NOW)).toBe("This month")
    expect(monthGroupOf(trip({ startDate: "2026-11-28" }), NOW)).toBe("This month")
    expect(monthGroupOf(trip({ startDate: "2026-12-01" }), NOW)).toBe("Next month")
    expect(monthGroupOf(trip({ startDate: "2027-01-19" }), NOW)).toBe("Later")
    expect(monthGroupOf(trip({ startDate: null }), NOW)).toBe("No dates")
  })
})

describe("the trip Overview leads with", () => {
  it("is the one on today, else the soonest still to come, leaving out archived and undated trips", () => {
    const soon = trip({ id: "soon", startDate: "2026-12-01" })
    const later = trip({ id: "later", startDate: "2027-03-01" })
    const archived = trip({ id: "archived", startDate: "2026-11-20", archived: true })
    const undated = trip({ id: "undated" })
    expect(nextTripOf([later, soon, archived, undated], NOW)?.id).toBe("soon")
    const onNow = trip({ id: "on", startDate: "2026-11-11", days: 4 })
    expect(nextTripOf([later, onNow, soon], NOW)?.id).toBe("on")
    expect(dayOfTripLine(onNow, NOW)).toBe("Day 2 of 4")
    expect(dayOfTripLine(soon, NOW)).toBeNull()
    expect(nextTripOf([undated], NOW)).toBeNull()
  })
})

describe("reading a country from an address", () => {
  it("takes the country from the end and the city before it, without its postcode", () => {
    expect(whereFromAddress("Hanedakuko, Ota City, Tokyo 144-0041, Japan")).toEqual({ country: "Japan", city: "Tokyo" })
    expect(whereFromAddress("Rua Augusta, Lisbon, Portugal")).toEqual({ country: "Portugal", city: "Lisbon" })
    expect(whereFromAddress("Okutan")).toBeNull()
    expect(whereFromAddress(null)).toBeNull()
  })
})

describe("the Trips dashboard's address", () => {
  it("keeps what it knows and drops the rest, Trips being the section with none", () => {
    expect(readTripsSearch({ section: "places", tab: "been", sort: "stars", group: "trip", open: "abc", junk: "x" })).toEqual({
      section: "places",
      tab: "been",
      sort: "stars",
      group: "trip",
      open: "abc",
    })
    expect(readTripsSearch({ section: "trips", show: "year", tab: "nope" })).toEqual({ open: undefined })
    expect(sectionOf(readTripsSearch({ show: "bin" }))).toBe("trips")
  })
})
