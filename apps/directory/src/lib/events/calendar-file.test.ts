import { describe, expect, it } from "vitest"

import {
  eventCalendarFile,
  eventCalendarTimes,
  googleCalendarLink,
  googleSubscribeLink,
  webcalLink,
  type CalendarEvent,
} from "@/lib/events/calendar-file"

/**
 * What a calendar app is handed. These pin down that every time is the site's
 * own clock time, turned into one exact moment by the site's time zone on that
 * day, so an event never arrives shifted by the visitor's zone or by a clock
 * change.
 */

const TORONTO = "America/Toronto"

const nightMarket: CalendarEvent = {
  id: "5b0c1f7e-0000-4000-8000-000000000001",
  title: "Night market",
  summary: "Food stalls, music, and a lantern walk.",
  placeName: "Harbourfront",
  placeAddress: "235 Queens Quay W, Toronto",
  url: "https://alpha.example.test/events/night-market",
  startDate: "2026-09-26",
  startTime: "18:00",
  endDate: "2026-09-26",
  endTime: "23:00",
}

const made = new Date("2026-09-23T12:00:00Z")

/** The file's lines with carried-on lines joined back up. */
function unfolded(file: string): string[] {
  return file.replace(/\r\n /g, "").split("\r\n")
}

describe("when an event starts and ends", () => {
  it("writes a timed event at the site's clock time", () => {
    // 6pm to 11pm in Toronto in September is 10pm to 3am UTC.
    expect(eventCalendarTimes(nightMarket, TORONTO)).toEqual({
      start: "20260926T220000Z",
      end: "20260927T030000Z",
    })
  })

  it("reads the same clock time in another site's zone", () => {
    expect(eventCalendarTimes(nightMarket, "Asia/Kolkata")).toEqual({
      start: "20260926T123000Z",
      end: "20260926T173000Z",
    })
  })

  it("runs an event with no end time to midnight at the end of its day", () => {
    const noEnd = { ...nightMarket, endDate: null, endTime: null }
    // Midnight on the 27th in Toronto is 4am UTC.
    expect(eventCalendarTimes(noEnd, TORONTO)).toEqual({
      start: "20260926T220000Z",
      end: "20260927T040000Z",
    })
  })

  it("runs an end day with no time to midnight at the end of that day", () => {
    const festival = {
      ...nightMarket,
      endDate: "2026-09-28",
      endTime: null,
    }
    expect(eventCalendarTimes(festival, TORONTO).end).toBe("20260929T040000Z")
  })

  it("spans every day of a festival from its start to its end", () => {
    // Noon on Fri 2 Oct to 8pm on Sun 4 Oct in Toronto.
    const festival = {
      ...nightMarket,
      startDate: "2026-10-02",
      startTime: "12:00",
      endDate: "2026-10-04",
      endTime: "20:00",
    }
    expect(eventCalendarTimes(festival, TORONTO)).toEqual({
      start: "20261002T160000Z",
      end: "20261005T000000Z",
    })
  })

  it("keeps each end of an event across a clock change at its own offset", () => {
    // The clocks go back at 2am on 1 Nov 2026. 10pm on 31 Oct is still
    // daylight time (UTC-4); 3am on 1 Nov is standard time (UTC-5).
    const overnight = {
      ...nightMarket,
      startDate: "2026-10-31",
      startTime: "22:00",
      endDate: "2026-11-01",
      endTime: "03:00",
    }
    expect(eventCalendarTimes(overnight, TORONTO)).toEqual({
      start: "20261101T020000Z",
      end: "20261101T080000Z",
    })
  })

  it("moves an all-evening event's midnight with the clock change", () => {
    // No end time on 31 Oct ends at midnight, which is still daylight time.
    // The same on 1 Nov ends at midnight standard time.
    const before = {
      ...nightMarket,
      startDate: "2026-10-31",
      endDate: null,
      endTime: null,
    }
    const after = { ...before, startDate: "2026-11-01" }
    expect(eventCalendarTimes(before, TORONTO).end).toBe("20261101T040000Z")
    expect(eventCalendarTimes(after, TORONTO).end).toBe("20261102T050000Z")
  })

  it("crosses the end of a month and a year", () => {
    const newYearsEve = {
      ...nightMarket,
      startDate: "2026-12-31",
      startTime: "21:00",
      endDate: null,
      endTime: null,
    }
    expect(eventCalendarTimes(newYearsEve, TORONTO)).toEqual({
      start: "20270101T020000Z",
      end: "20270101T050000Z",
    })
  })
})

describe("the calendar file", () => {
  it("holds one event with its times, place, words and link", () => {
    const lines = unfolded(
      eventCalendarFile([nightMarket], {
        siteName: "Alpha Guide",
        timeZone: TORONTO,
        now: made,
      })
    )
    expect(lines).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Alpha Guide//Events//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:5b0c1f7e-0000-4000-8000-000000000001@alpha.example.test",
      "DTSTAMP:20260923T120000Z",
      "DTSTART:20260926T220000Z",
      "DTEND:20260927T030000Z",
      "SUMMARY:Night market",
      "DESCRIPTION:Food stalls\\, music\\, and a lantern walk.\\n\\nhttps://alpha.example.test/events/night-market",
      "LOCATION:Harbourfront\\, 235 Queens Quay W\\, Toronto",
      "URL:https://alpha.example.test/events/night-market",
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ])
  })

  it("ends every line with a carriage return and a line feed", () => {
    const file = eventCalendarFile([nightMarket], {
      siteName: "Alpha Guide",
      timeZone: TORONTO,
      now: made,
    })
    expect(file.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(file.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
  })

  it("leaves out the place when there is none", () => {
    const file = eventCalendarFile(
      [{ ...nightMarket, placeName: "", placeAddress: "" }],
      { siteName: "Alpha Guide", timeZone: TORONTO, now: made }
    )
    expect(file).not.toContain("LOCATION")
  })

  it("keeps a semicolon, a backslash and a line break from breaking the file", () => {
    const lines = unfolded(
      eventCalendarFile(
        [
          {
            ...nightMarket,
            title: "Jazz; wine \\ cheese",
            summary: "One\nTwo",
          },
        ],
        { siteName: "Alpha Guide", timeZone: TORONTO, now: made }
      )
    )
    expect(lines).toContain("SUMMARY:Jazz\\; wine \\\\ cheese")
    expect(lines).toContain(
      "DESCRIPTION:One\\nTwo\\n\\nhttps://alpha.example.test/events/night-market"
    )
  })

  it("folds a long line at 75 bytes without splitting a letter", () => {
    const title = "Café crawl 🎉 ".repeat(20).trim()
    const file = eventCalendarFile([{ ...nightMarket, title }], {
      siteName: "Alpha Guide",
      timeZone: TORONTO,
      now: made,
    })
    const encoder = new TextEncoder()
    for (const line of file.split("\r\n")) {
      const bytes = encoder.encode(line)
      expect(bytes.length).toBeLessThanOrEqual(75)
      // Half an emoji is written out as the replacement character.
      expect(new TextDecoder().decode(bytes)).not.toContain(
        String.fromCodePoint(0xfffd)
      )
    }
    expect(unfolded(file)).toContain(`SUMMARY:${title}`)
  })

  it("names the feed, its zone and how often to check it", () => {
    const lines = unfolded(
      eventCalendarFile([], {
        siteName: "Alpha Guide",
        timeZone: TORONTO,
        now: made,
        feed: true,
      })
    )
    expect(lines).toContain("X-WR-CALNAME:Alpha Guide events")
    expect(lines).toContain("X-WR-TIMEZONE:America/Toronto")
    expect(lines).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
    expect(lines).not.toContain("BEGIN:VEVENT")
  })

  it("writes one block per event in the order given", () => {
    const second = {
      ...nightMarket,
      id: "5b0c1f7e-0000-4000-8000-000000000002",
      title: "Book swap",
    }
    const file = eventCalendarFile([nightMarket, second], {
      siteName: "Alpha Guide",
      timeZone: TORONTO,
      now: made,
      feed: true,
    })
    const titles = unfolded(file).filter((line) => line.startsWith("SUMMARY:"))
    expect(titles).toEqual(["SUMMARY:Night market", "SUMMARY:Book swap"])
  })
})

describe("the Google Calendar links", () => {
  it("fills in Google's form with the event's moments and the site's zone", () => {
    const link = new URL(googleCalendarLink(nightMarket, TORONTO))
    expect(link.origin + link.pathname).toBe(
      "https://calendar.google.com/calendar/render"
    )
    expect(link.searchParams.get("action")).toBe("TEMPLATE")
    expect(link.searchParams.get("text")).toBe("Night market")
    expect(link.searchParams.get("dates")).toBe(
      "20260926T220000Z/20260927T030000Z"
    )
    expect(link.searchParams.get("ctz")).toBe(TORONTO)
    expect(link.searchParams.get("location")).toBe(
      "Harbourfront, 235 Queens Quay W, Toronto"
    )
    expect(link.searchParams.get("details")).toContain(nightMarket.url)
  })

  it("subscribes through a webcal address", () => {
    const feed = "https://alpha.example.test/events.ics"
    expect(webcalLink(feed)).toBe("webcal://alpha.example.test/events.ics")
    expect(webcalLink("http://localhost:3000/events.ics")).toBe(
      "webcal://localhost:3000/events.ics"
    )
    expect(new URL(googleSubscribeLink(feed)).searchParams.get("cid")).toBe(
      "webcal://alpha.example.test/events.ics"
    )
  })
})
