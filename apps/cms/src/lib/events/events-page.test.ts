import { describe, expect, it } from "vitest"

import { readEventsSearch } from "@/lib/events/events-page"

/**
 * What the Events page reads out of its address. Every odd value lands on a
 * view the page can draw, never on an error page.
 */
describe("the Events page's address", () => {
  it("opens on the list, paged", () => {
    expect(readEventsSearch({})).toEqual({ page: undefined })
    expect(readEventsSearch({ page: "2" })).toEqual({ page: 2 })
  })

  it("reads a month, and a month given as a whole day", () => {
    expect(readEventsSearch({ view: "month", month: "2026-10" })).toEqual({
      view: "month",
      month: "2026-10",
    })
    expect(readEventsSearch({ view: "month", month: "2026-10-03" })).toEqual({
      view: "month",
      month: "2026-10",
    })
    expect(readEventsSearch({ view: "month", month: "2026-13" })).toEqual({
      view: "month",
      month: undefined,
    })
  })

  it("reads one day, and drops a day that does not exist", () => {
    expect(readEventsSearch({ day: "2026-09-26", page: "3" })).toEqual({
      day: "2026-09-26",
    })
    expect(readEventsSearch({ day: "2026-02-30" })).toEqual({
      page: undefined,
    })
  })

  it("falls back to the list for a view it does not know", () => {
    expect(readEventsSearch({ view: "week" })).toEqual({ page: undefined })
  })
})
