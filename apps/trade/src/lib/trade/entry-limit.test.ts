import { describe, expect, it } from "vitest"

import { canOpenAnother, defaultEntryLimit } from "@/lib/trade/entry-limit"

const HOUR = 3_600_000
const NOON = Date.parse("2025-10-10T12:00:00Z")

describe("how many coins a wallet may open at once", () => {
  it("lets anything through when it is off", () => {
    expect(canOpenAnother(null, [NOON, NOON, NOON, NOON, NOON], NOON)).toBe(true)
  })

  it("stops at the count", () => {
    const opened = [1, 2, 3, 4].map((n) => NOON - n * 60_000)
    expect(canOpenAnother(defaultEntryLimit(), opened, NOON)).toBe(true)
    expect(
      canOpenAnother(defaultEntryLimit(), [...opened, NOON - 5_000], NOON)
    ).toBe(false)
  })

  it("forgets coins older than the window", () => {
    // Five opened, but all of them over an hour ago.
    const opened = [1, 2, 3, 4, 5].map((n) => NOON - HOUR - n * 60_000)
    expect(canOpenAnother(defaultEntryLimit(), opened, NOON)).toBe(true)
  })

  it("counts the ones inside the window and no others", () => {
    const opened = [
      NOON - 5 * HOUR,
      NOON - 4 * HOUR,
      NOON - 30 * 60_000,
      NOON - 20 * 60_000,
      NOON - 10 * 60_000,
    ]
    // Three inside the hour, so a limit of three is used up and four is not.
    expect(canOpenAnother({ coins: 3, withinHours: 1 }, opened, NOON)).toBe(false)
    expect(canOpenAnother({ coins: 4, withinHours: 1 }, opened, NOON)).toBe(true)
  })

  it("moves with the clock", () => {
    const opened = [1, 2, 3, 4, 5].map((n) => NOON - n * 60_000)
    expect(canOpenAnother(defaultEntryLimit(), opened, NOON)).toBe(false)
    // An hour later the same five are all outside the window.
    expect(canOpenAnother(defaultEntryLimit(), opened, NOON + HOUR)).toBe(true)
  })
})
