import { describe, expect, it } from "vitest"

import {
  clockFace,
  clockSeconds,
  clockTotal,
  guessGap,
  parseMinutes,
  readClockFix,
  readClockPause,
  weekStartIn,
} from "@/lib/project/clock"

describe("the clock's words", () => {
  it("shows a running clock as minutes and seconds, then hours", () => {
    expect(clockFace(0)).toBe("0:00")
    expect(clockFace(42)).toBe("0:42")
    expect(clockFace(5045)).toBe("1:24:05")
  })

  it("writes a total in hours and minutes", () => {
    expect(clockTotal(30)).toBe("0m")
    expect(clockTotal(45 * 60)).toBe("45m")
    expect(clockTotal(3 * 3600)).toBe("3h")
    expect(clockTotal(2 * 3600 + 15 * 60)).toBe("2h 15m")
  })

  it("compares the time with a guess", () => {
    expect(guessGap(65 * 60, 45)).toBe("20m over")
    expect(guessGap(35 * 60, 45)).toBe("10m left")
    expect(guessGap(45 * 60, 45)).toBe("On the guess")
  })

  it("counts a running stretch up to now", () => {
    const now = Date.parse("2099-03-02T09:10:00Z")
    expect(clockSeconds({ seconds: 60, runningSince: "2099-03-02T09:00:00.000Z" }, now)).toBe(660)
    expect(clockSeconds({ seconds: 60, runningSince: null }, now)).toBe(60)
  })

  it("reads what a person types as minutes", () => {
    expect(parseMinutes("45")).toBe(45)
    expect(parseMinutes("45m")).toBe(45)
    expect(parseMinutes("1h")).toBe(60)
    expect(parseMinutes("1h 30m")).toBe(90)
    expect(parseMinutes("1.5h")).toBe(90)
    expect(parseMinutes("1:30")).toBe(90)
    expect(parseMinutes("")).toBeNull()
    expect(parseMinutes("soon")).toBeNull()
  })

  it("reads the history lines' reasons", () => {
    expect(readClockPause("2700")).toEqual({ seconds: 2700, midnight: false })
    expect(readClockPause("2700 midnight")).toEqual({ seconds: 2700, midnight: true })
    expect(readClockFix("10800 4200")).toEqual({ from: 10800, to: 4200 })
  })

  it("starts the week on Monday at midnight in the person's zone", () => {
    // Sunday 8 March 2099, 23:00 in New York (after the clocks went forward
    // that morning), is still the week of Monday 2 March, which began in winter time.
    expect(weekStartIn(new Date("2099-03-09T03:00:00Z"), "America/New_York").toISOString()).toBe(
      "2099-03-02T05:00:00.000Z"
    )
    expect(weekStartIn(new Date("2099-03-04T12:00:00Z"), "UTC").toISOString()).toBe("2099-03-02T00:00:00.000Z")
  })
})
