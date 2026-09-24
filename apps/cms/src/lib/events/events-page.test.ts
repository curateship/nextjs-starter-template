import { describe, expect, it } from "vitest"

import {
  eventDateFilterText,
  eventDateWindow,
  eventsListHref,
  readEventsSearch,
} from "@/lib/events/events-page"

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

  it("reads a place on the list, and drops one that is not an address", () => {
    expect(readEventsSearch({ place: "the-rex", page: "2" })).toEqual({
      page: 2,
      place: "the-rex",
    })
    expect(readEventsSearch({ place: "The Rex!" })).toEqual({
      page: undefined,
    })
    expect(readEventsSearch({ view: "month", place: "the-rex" })).toEqual({
      view: "month",
      month: undefined,
    })
  })

  it("falls back to the list for a view it does not know", () => {
    expect(readEventsSearch({ view: "week" })).toEqual({ page: undefined })
  })

  it("reads a category on every view, and drops one that is not an address", () => {
    expect(readEventsSearch({ category: "live-music" })).toEqual({
      category: "live-music",
    })
    expect(
      readEventsSearch({ view: "month", month: "2026-10", category: "live-music" })
    ).toEqual({ view: "month", month: "2026-10", category: "live-music" })
    expect(readEventsSearch({ day: "2026-10-03", category: "live-music" })).toEqual(
      { day: "2026-10-03", category: "live-music" }
    )
    expect(readEventsSearch({ category: "Live Music!" })).toEqual({})
  })

  it("reads a date filter on the list only, and a named one wins over a range", () => {
    expect(readEventsSearch({ when: "weekend", page: "2" })).toEqual({
      page: 2,
      when: "weekend",
    })
    expect(
      readEventsSearch({ when: "today", from: "2026-10-01", to: "2026-10-05" })
    ).toEqual({ when: "today" })
    expect(readEventsSearch({ when: "someday" })).toEqual({})
    expect(readEventsSearch({ view: "month", when: "today" })).toEqual({
      view: "month",
    })
    expect(readEventsSearch({ day: "2026-10-03", from: "2026-10-01" })).toEqual({
      day: "2026-10-03",
    })
  })

  it("reads a range, one end of one, and a range typed backwards", () => {
    expect(readEventsSearch({ from: "2026-10-01", to: "2026-10-05" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    })
    expect(readEventsSearch({ from: "2026-10-05", to: "2026-10-01" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    })
    expect(readEventsSearch({ to: "2026-10-05" })).toEqual({ to: "2026-10-05" })
    expect(readEventsSearch({ from: "2026-02-30", to: "2026-10-05" })).toEqual({
      to: "2026-10-05",
    })
  })
})

describe("the days a date filter covers", () => {
  it("makes this weekend Saturday and Sunday, and on Sunday the rest of today", () => {
    // Monday 21 to Sunday 27 September 2026.
    const weekend = (today: string) =>
      eventDateWindow({ when: "weekend" }, today)
    const coming = { from: "2026-09-26", to: "2026-09-27" }
    expect(weekend("2026-09-21")).toEqual(coming) // Monday
    expect(weekend("2026-09-22")).toEqual(coming) // Tuesday
    expect(weekend("2026-09-23")).toEqual(coming) // Wednesday
    expect(weekend("2026-09-24")).toEqual(coming) // Thursday
    expect(weekend("2026-09-25")).toEqual(coming) // Friday
    expect(weekend("2026-09-26")).toEqual(coming) // Saturday
    expect(weekend("2026-09-27")).toEqual({
      from: "2026-09-27",
      to: "2026-09-27",
    }) // Sunday
  })

  it("crosses a month's end and a year's end", () => {
    expect(eventDateWindow({ when: "weekend" }, "2026-10-29")).toEqual({
      from: "2026-10-31",
      to: "2026-11-01",
    })
    expect(eventDateWindow({ when: "week" }, "2026-12-28")).toEqual({
      from: "2026-12-28",
      to: "2027-01-03",
    })
  })

  it("makes today one day and the next 7 days a week from today", () => {
    expect(eventDateWindow({ when: "today" }, "2026-09-24")).toEqual({
      from: "2026-09-24",
      to: "2026-09-24",
    })
    expect(eventDateWindow({ when: "week" }, "2026-09-24")).toEqual({
      from: "2026-09-24",
      to: "2026-09-30",
    })
  })

  it("passes a range through, open at a missing end, and nothing without a filter", () => {
    expect(eventDateWindow({ from: "2026-10-01" }, "2026-09-24")).toEqual({
      from: "2026-10-01",
      to: undefined,
    })
    expect(eventDateWindow({}, "2026-09-24")).toBeNull()
  })
})

describe("the words and links for a filtered list", () => {
  it("names the date filter", () => {
    expect(eventDateFilterText({ when: "weekend" })).toBe("this weekend")
    expect(eventDateFilterText({ from: "2026-10-03", to: "2026-10-04" })).toBe(
      "from Sat, Oct 3 to Sun, Oct 4"
    )
    expect(eventDateFilterText({ from: "2026-10-03", to: "2026-10-03" })).toBe(
      "on Sat, Oct 3"
    )
    expect(eventDateFilterText({ to: "2026-10-04" })).toBe("until Sun, Oct 4")
    expect(eventDateFilterText({})).toBe("")
  })

  it("keeps every filter on a page link and leaves page 1 out", () => {
    expect(
      eventsListHref({
        place: "the-rex",
        category: "live-music",
        when: "weekend",
        page: 2,
      })
    ).toBe("/events?place=the-rex&category=live-music&when=weekend&page=2")
    expect(eventsListHref({ from: "2026-10-01", page: 1 })).toBe(
      "/events?from=2026-10-01"
    )
    expect(eventsListHref({})).toBe("/events")
  })
})
