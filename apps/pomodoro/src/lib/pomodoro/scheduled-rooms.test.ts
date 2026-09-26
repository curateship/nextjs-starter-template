import { describe, expect, it } from "vitest"

import {
  MAX_ROOM_INVITES,
  describeWaitUntil,
  formatRoomStart,
  isLikelyEmail,
  parseInviteEmails,
  scheduleProblem,
} from "@/lib/pomodoro/scheduled-rooms"

const NOW = new Date("2026-09-25T10:00:00.000Z")
const minutesFromNow = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000)

describe("parseInviteEmails", () => {
  it("splits on commas, semicolons, spaces and new lines", () => {
    expect(
      parseInviteEmails("sam@example.com, alex@example.com;jo@example.com\nkit@example.com")
    ).toEqual([
      "sam@example.com",
      "alex@example.com",
      "jo@example.com",
      "kit@example.com",
    ])
  })

  it("lowercases and invites a repeated address once", () => {
    expect(parseInviteEmails("Sam@Example.com, sam@example.com")).toEqual([
      "sam@example.com",
    ])
  })

  it("is empty when nothing was typed", () => {
    expect(parseInviteEmails("   \n , ; ")).toEqual([])
  })
})

describe("isLikelyEmail", () => {
  it("accepts an ordinary address", () => {
    expect(isLikelyEmail("sam@example.com")).toBe(true)
    expect(isLikelyEmail("sam.jones+rooms@mail.example.co.uk")).toBe(true)
  })

  it("refuses text that is not an address", () => {
    for (const bad of ["sam", "sam@", "@example.com", "sam@example", "a b@c.com"]) {
      expect(isLikelyEmail(bad)).toBe(false)
    }
  })
})

describe("scheduleProblem", () => {
  it("passes a booking a couple of minutes out", () => {
    expect(scheduleProblem(minutesFromNow(2), ["sam@example.com"], NOW)).toBeNull()
  })

  it("refuses a time in the past or this very second", () => {
    expect(scheduleProblem(minutesFromNow(-5), [], NOW)).toBe("too_soon")
    expect(scheduleProblem(NOW, [], NOW)).toBe("too_soon")
  })

  it("refuses a booking more than ninety days out", () => {
    expect(scheduleProblem(minutesFromNow(91 * 24 * 60), [], NOW)).toBe("too_far")
  })

  it("refuses no time at all", () => {
    expect(scheduleProblem(null, [], NOW)).toBe("not_a_time")
    expect(scheduleProblem(new Date("nonsense"), [], NOW)).toBe("not_a_time")
  })

  it("refuses more invitations than one room may send", () => {
    const many = Array.from(
      { length: MAX_ROOM_INVITES + 1 },
      (_, index) => `person${index}@example.com`
    )
    expect(scheduleProblem(minutesFromNow(60), many, NOW)).toBe("too_many_invites")
    expect(scheduleProblem(minutesFromNow(60), many.slice(0, MAX_ROOM_INVITES), NOW)).toBeNull()
  })

  it("refuses an address that is not one", () => {
    expect(scheduleProblem(minutesFromNow(60), ["sam@example.com", "nope"], NOW)).toBe(
      "bad_email"
    )
  })
})

describe("formatRoomStart", () => {
  it("writes the time in the timezone it is given", () => {
    const london = formatRoomStart(new Date("2026-09-25T18:00:00.000Z"), "Europe/London")
    expect(london).toContain("Friday")
    expect(london).toContain("19:00")
  })

  it("falls back to UTC when the timezone name is nonsense", () => {
    expect(formatRoomStart(new Date("2026-09-25T18:00:00.000Z"), "Mars/Olympus")).toContain(
      "18:00"
    )
  })
})

describe("describeWaitUntil", () => {
  it("counts in minutes, then hours, then days", () => {
    expect(describeWaitUntil(minutesFromNow(1), NOW)).toBe("in 1 minute")
    expect(describeWaitUntil(minutesFromNow(45), NOW)).toBe("in 45 minutes")
    expect(describeWaitUntil(minutesFromNow(180), NOW)).toBe("in 3 hours")
    expect(describeWaitUntil(minutesFromNow(5 * 24 * 60), NOW)).toBe("in 5 days")
  })

  it("says the wait is over once the time has passed", () => {
    expect(describeWaitUntil(minutesFromNow(-1), NOW)).toBe("any moment now")
  })
})
