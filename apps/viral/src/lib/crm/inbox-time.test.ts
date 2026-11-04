import { describe, expect, it } from "vitest"

import { formatInboxTime, initialsFor } from "@/lib/crm/inbox-time"

// Built from local parts, not from a UTC string, and the day cases all sit at
// midday. A date written as "15:00Z" lands on a different calendar day in
// Auckland than in Los Angeles, which would make the weekday cases below pass
// or fail depending on where the machine is.
const now = new Date(2026, 9, 2, 15, 0, 0) // Friday 2 October 2026, 3pm

function minutesAgo(minutes: number) {
  return new Date(now.getTime() - minutes * 60_000)
}

describe("formatInboxTime", () => {
  it("says now for anything under a minute", () => {
    expect(formatInboxTime(now, now)).toBe("now")
    expect(formatInboxTime(minutesAgo(0.9), now)).toBe("now")
  })

  it("says now for a clock that is slightly ahead of this one", () => {
    expect(formatInboxTime(new Date(now.getTime() + 5_000), now)).toBe("now")
  })

  it("counts minutes up to the hour", () => {
    expect(formatInboxTime(minutesAgo(2), now)).toBe("2m")
    expect(formatInboxTime(minutesAgo(18), now)).toBe("18m")
    expect(formatInboxTime(minutesAgo(59), now)).toBe("59m")
  })

  it("counts hours for the rest of the same day", () => {
    expect(formatInboxTime(minutesAgo(60), now)).toBe("1h")
    expect(formatInboxTime(minutesAgo(180), now)).toBe("3h")
  })

  it("says Yesterday rather than 21h, because the day is what you remember", () => {
    expect(formatInboxTime(new Date(2026, 9, 1, 18, 0), now)).toBe("Yesterday")
  })

  it("names the weekday inside the last week", () => {
    expect(formatInboxTime(new Date(2026, 8, 29, 12, 0), now)).toBe("Tue")
    expect(formatInboxTime(new Date(2026, 8, 26, 12, 0), now)).toBe("Sat")
  })

  it("gives the date once it is more than a week old", () => {
    expect(formatInboxTime(new Date(2026, 8, 22, 12, 0), now)).toBe("Sep 22")
  })

  it("adds the year once it is a different one", () => {
    expect(formatInboxTime(new Date(2025, 8, 28, 9, 0), now)).toBe(
      "Sep 28, 2025"
    )
  })

  it("says nothing for a date it cannot read", () => {
    expect(formatInboxTime(null, now)).toBe("")
    expect(formatInboxTime("not a date", now)).toBe("")
  })
})

describe("initialsFor", () => {
  it("takes the first and last initial of a full name", () => {
    expect(initialsFor("Maya Chen", "maya@example.com")).toBe("MC")
    expect(initialsFor("Priya Devi Natarajan", "p@example.com")).toBe("PN")
  })

  it("takes two letters from a one-word name", () => {
    expect(initialsFor("Cher", "cher@example.com")).toBe("CH")
  })

  it("falls back to the address when there is no name", () => {
    expect(initialsFor(null, "jane@buyer.com")).toBe("JA")
    expect(initialsFor("   ", "jane@buyer.com")).toBe("JA")
  })

  it("ignores punctuation in an address", () => {
    expect(initialsFor(null, "d.marsh@northgate.co.uk")).toBe("DM")
  })

  it("ignores a name that is only punctuation", () => {
    expect(initialsFor("--", "sam@example.com")).toBe("SA")
  })
})
