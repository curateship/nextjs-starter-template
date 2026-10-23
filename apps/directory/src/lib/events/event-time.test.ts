import { describe, expect, it } from "vitest"

import {
  eventHasEnded,
  eventMomentText,
  eventDaysText,
  eventRowText,
  eventWhenLines,
  formatEventStart,
  isKnownTimeZone,
  wallClockAt,
  type EventWhen,
} from "@/lib/events/event-time"

/**
 * An event's times are the site's own clock. These pin down that "is it over"
 * is asked of the site's time zone and never of the machine running the test.
 */

const nightMarket: EventWhen = {
  startDate: "2026-09-26",
  startTime: "18:00",
  endDate: "2026-09-26",
  endTime: "23:00",
}

describe("whether an event is over", () => {
  // 03:30 UTC on the 27th is 11:30pm on the 26th in Toronto, and 8:30pm in
  // Vancouver.
  const halfPastThreeUtc = new Date("2026-09-27T03:30:00Z")
  const halfPastTwoUtc = new Date("2026-09-27T02:30:00Z")

  it("reads the site's clock, not the server's", () => {
    expect(
      eventHasEnded(nightMarket, "America/Toronto", halfPastThreeUtc)
    ).toBe(true)
    expect(
      eventHasEnded(nightMarket, "America/Vancouver", halfPastThreeUtc)
    ).toBe(false)
    // In UTC the same moment is already the 27th, so the market is long over.
    expect(eventHasEnded(nightMarket, "UTC", halfPastTwoUtc)).toBe(true)
    expect(eventHasEnded(nightMarket, "America/Toronto", halfPastTwoUtc)).toBe(
      false
    )
  })

  it("ends exactly at the end time", () => {
    const elevenPmToronto = new Date("2026-09-27T03:00:00Z")
    const oneMinuteBefore = new Date("2026-09-27T02:59:00Z")
    expect(eventHasEnded(nightMarket, "America/Toronto", elevenPmToronto)).toBe(
      true
    )
    expect(eventHasEnded(nightMarket, "America/Toronto", oneMinuteBefore)).toBe(
      false
    )
  })

  it("with no end time, is over when its day is over", () => {
    const noEnd: EventWhen = { ...nightMarket, endDate: null, endTime: null }
    const lateThatNight = new Date("2026-09-27T03:59:00Z") // 11:59pm Toronto
    const justAfterMidnight = new Date("2026-09-27T04:00:00Z")
    expect(eventHasEnded(noEnd, "America/Toronto", lateThatNight)).toBe(false)
    expect(eventHasEnded(noEnd, "America/Toronto", justAfterMidnight)).toBe(
      true
    )
  })

  it("runs to its end day when it goes past midnight", () => {
    const lateShow: EventWhen = {
      startDate: "2026-09-26",
      startTime: "22:00",
      endDate: "2026-09-27",
      endTime: "02:00",
    }
    const oneAmToronto = new Date("2026-09-27T05:00:00Z")
    expect(eventHasEnded(lateShow, "America/Toronto", oneAmToronto)).toBe(false)
  })

  it("keeps 6pm at 6pm across the clocks going back", () => {
    // Toronto leaves daylight time on 1 Nov 2026, so the 6pm to 7pm event
    // runs 23:00 to 00:00 UTC. Under daylight time 23:30 UTC would be 7:30pm
    // and the event would read as over.
    const afterChange: EventWhen = {
      startDate: "2026-11-07",
      startTime: "18:00",
      endDate: "2026-11-07",
      endTime: "19:00",
    }
    expect(
      eventHasEnded(
        afterChange,
        "America/Toronto",
        new Date("2026-11-07T23:30:00Z")
      )
    ).toBe(false)
    expect(
      eventHasEnded(
        afterChange,
        "America/Toronto",
        new Date("2026-11-08T00:00:00Z")
      )
    ).toBe(true)
  })
})

describe("the wall clock", () => {
  it("never prints midnight as hour 24", () => {
    expect(wallClockAt("UTC", new Date("2026-09-27T00:05:00Z"))).toBe(
      "2026-09-27T00:05"
    )
  })
})

describe("the words on the page", () => {
  it("names the day, the times and the zone", () => {
    expect(eventWhenLines(nightMarket, "America/Toronto")).toEqual({
      day: "Saturday, September 26, 2026",
      times: "6:00 PM to 11:00 PM, Eastern Time",
    })
  })

  it("shows only the start when there is no end time", () => {
    expect(
      eventWhenLines(
        { ...nightMarket, endDate: null, endTime: null },
        "America/Toronto"
      ).times
    ).toBe("6:00 PM, Eastern Time")
  })

  it("names both days when the event ends on a later one", () => {
    expect(
      eventWhenLines(
        {
          startDate: "2026-09-26",
          startTime: "22:00",
          endDate: "2026-09-27",
          endTime: "02:00",
        },
        "America/Toronto"
      )
    ).toEqual({
      day: "Saturday, September 26 to Sunday, September 27, 2026",
      times: "Starts 10:00 PM, ends 2:00 AM, Eastern Time",
    })
  })

  it("names the year on both days when the event crosses New Year", () => {
    expect(
      eventWhenLines(
        {
          startDate: "2026-12-31",
          startTime: "20:00",
          endDate: "2027-01-01",
          endTime: "01:00",
        },
        "America/Toronto"
      ).day
    ).toBe("Thursday, December 31, 2026 to Friday, January 1, 2027")
  })

  it("keeps an end on the same day as one day", () => {
    expect(eventWhenLines(nightMarket, "America/Toronto").day).toBe(
      "Saturday, September 26, 2026"
    )
    expect(
      eventWhenLines(
        { ...nightMarket, endDate: nightMarket.startDate },
        "America/Toronto"
      ).day
    ).toBe("Saturday, September 26, 2026")
  })

  it("prints the stored day whatever zone the reader is in", () => {
    expect(formatEventStart(nightMarket)).toBe("Sep 26, 2026, 6:00 PM")
  })
})

describe("time zone names", () => {
  it("accepts real zones and refuses made-up ones", () => {
    expect(isKnownTimeZone("America/Toronto")).toBe(true)
    expect(isKnownTimeZone("Mars/Olympus_Mons")).toBe(false)
    expect(isKnownTimeZone("")).toBe(false)
  })
})

describe("one moment for a search engine", () => {
  it("adds the site's offset on that day, and follows the clocks changing", () => {
    expect(eventMomentText("2026-09-26", "18:00", "America/Toronto")).toBe(
      "2026-09-26T18:00:00-04:00"
    )
    // Toronto goes back to standard time on 1 November 2026.
    expect(eventMomentText("2026-11-07", "18:00", "America/Toronto")).toBe(
      "2026-11-07T18:00:00-05:00"
    )
    // The night of the change, which happens at 2am: before it and after it.
    expect(eventMomentText("2026-11-01", "00:30", "America/Toronto")).toBe(
      "2026-11-01T00:30:00-04:00"
    )
    expect(eventMomentText("2026-11-01", "03:00", "America/Toronto")).toBe(
      "2026-11-01T03:00:00-05:00"
    )
    expect(eventMomentText("2026-09-26", "18:00:00", "Asia/Kolkata")).toBe(
      "2026-09-26T18:00:00+05:30"
    )
    expect(eventMomentText("2026-09-26", "18:00", "UTC")).toBe(
      "2026-09-26T18:00:00+00:00"
    )
  })
})

describe("a row in the Events page's list", () => {
  const festival = {
    startDate: "2026-10-02",
    startTime: "12:00",
    endDate: "2026-10-04",
    endTime: "20:00",
  }

  it("shows one day's times after the day", () => {
    expect(eventRowText(nightMarket)).toBe("Sat, Sep 26 · 6:00 PM to 11:00 PM")
  })

  it("puts each time beside its own day over several days", () => {
    expect(eventRowText(festival)).toBe(
      "Fri, Oct 2, 12:00 PM to Sun, Oct 4, 8:00 PM"
    )
    expect(eventRowText({ ...festival, endTime: null })).toBe(
      "Fri, Oct 2, 12:00 PM to Sun, Oct 4"
    )
  })

  it("names both days, or one", () => {
    expect(eventDaysText(festival)).toBe("Fri, Oct 2 to Sun, Oct 4")
    expect(eventDaysText(nightMarket)).toBe("Sat, Sep 26")
  })
})
