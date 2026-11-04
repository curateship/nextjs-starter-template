import { describe, expect, it } from "vitest"

import { filterActivities, filterCount, readTripSearch } from "@/lib/travel/trip-search"
import { describeTripView, keptTripFilters } from "@/lib/travel/trip-views"

const card = (id: string, patch: Record<string, unknown> = {}) => ({
  id,
  typeId: null,
  title: id,
  place: null as { name: string; address: string; placeId?: string | null } | null,
  done: false,
  startTime: null as string | null,
  dayPart: null as "morning" | "afternoon" | "evening" | "night" | null,
  costCents: null as number | null,
  mustDo: false,
  ...patch,
})

const cards = [
  card("breakfast", { startTime: "08:30", costCents: 1200, done: true }),
  card("temple", { dayPart: "morning", place: { name: "Senso-ji", address: "2-3-1 Asakusa", placeId: "ChIJ" } }),
  card("dinner", { startTime: "19:00", mustDo: true }),
  card("typed", { place: { name: "Somewhere", address: "Somewhere", placeId: null } }),
]
const ids = (search: Parameters<typeof filterActivities>[1]) => filterActivities(cards, search).map((item) => item.id)

describe("more filters (More Travel features part 11)", () => {
  it("filters by done, part of the day (timed cards by their hour), no place, cost and must do", () => {
    expect(ids({ done: "done" })).toEqual(["breakfast"])
    expect(ids({ done: "todo" })).toEqual(["temple", "dinner", "typed"])
    expect(ids({ part: "morning" })).toEqual(["breakfast", "temple"])
    expect(ids({ part: "evening" })).toEqual(["dinner"])
    expect(ids({ place: "none" })).toEqual(["breakfast", "dinner"])
    expect(ids({ cost: "yes" })).toEqual(["breakfast"])
    expect(ids({ cost: "no" })).toEqual(["temple", "dinner", "typed"])
    expect(ids({ must: "yes" })).toEqual(["dinner"])
    expect(ids({ done: "todo", part: "morning" })).toEqual(["temple"])
  })

  it("reads only known values from the address, and counts each filter set", () => {
    const search = readTripSearch({ done: "todo", part: "night", place: "none", cost: "maybe", must: "yes", view: "list", q: "x" })
    expect(search).toEqual({ done: "todo", part: "night", place: "none", must: "yes", view: "list", q: "x" })
    expect(filterCount(search)).toBe(4)
    expect(readTripSearch({ part: "dawn", must: "no" })).toEqual({})
  })

  it("keeps every filter in a saved view, and says what it shows", () => {
    const kept = keptTripFilters({ type: "t1", done: "done", part: "evening", place: "none", cost: "no", must: "yes", q: " ramen ", junk: "x" })
    expect(kept).toEqual({ type: "t1", done: "done", part: "evening", place: "none", cost: "no", must: "yes", q: "ramen" })
    expect(describeTripView(kept, { type: "Food" })).toBe('Food · Done · Evening · No place yet · No cost · Must do · "ramen"')
  })
})
