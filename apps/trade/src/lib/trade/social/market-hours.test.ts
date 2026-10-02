import { describe, expect, it } from "vitest"

import {
  inSessionAt,
  nextOpenLabel,
  nextSessionOpenFrom,
  priceMomentFor,
  sessionNoteFor,
  followsTheUsSession,
} from "@/lib/trade/social/market-hours"

/**
 * New York's clock is 4 hours behind UTC in summer and 5 behind in winter, so
 * 09:30 New York is 13:30 UTC in July and 14:30 UTC in January. Every moment
 * below is written as UTC with the New York time it reads as in the name.
 */
const JULY_OPEN = Date.UTC(2026, 6, 1, 13, 30) // Wednesday 09:30 New York
const JANUARY_OPEN = Date.UTC(2026, 0, 7, 14, 30) // Wednesday 09:30 New York

describe("which markets this file claims to know the hours of", () => {
  it("is stocks, and nothing else", () => {
    expect(followsTheUsSession("stock")).toBe(true)
    // A coin never shuts.
    expect(followsTheUsSession("coin")).toBe(false)
    // Gold, oil and currency pairs trade almost round the clock on a weekday,
    // so New York's session would be a wrong answer rather than a rough one.
    expect(followsTheUsSession("commodity")).toBe(false)
    expect(followsTheUsSession("currency")).toBe(false)
  })
})

describe("when the US market is open", () => {
  it("opens at 09:30 New York in summer and in winter", () => {
    expect(inSessionAt(JULY_OPEN)).toBe(true)
    expect(inSessionAt(JULY_OPEN - 60_000)).toBe(false)
    expect(inSessionAt(JANUARY_OPEN)).toBe(true)
    expect(inSessionAt(JANUARY_OPEN - 60_000)).toBe(false)
  })

  it("shuts at 16:00 New York", () => {
    const close = JULY_OPEN + (6 * 60 + 30) * 60_000
    expect(inSessionAt(close - 60_000)).toBe(true)
    expect(inSessionAt(close)).toBe(false)
  })

  it("is shut all weekend", () => {
    // Saturday and Sunday 09:30 New York, the week of JULY_OPEN.
    expect(inSessionAt(JULY_OPEN + 3 * 86_400_000)).toBe(false)
    expect(inSessionAt(JULY_OPEN + 4 * 86_400_000)).toBe(false)
  })
})

describe("the next open", () => {
  it("is Monday's for a Sunday post", () => {
    // Sunday 03:00 New York, two days before Tuesday 7 July 2026.
    const sunday = Date.UTC(2026, 6, 5, 7, 0)
    const monday = Date.UTC(2026, 6, 6, 13, 30)
    expect(nextSessionOpenFrom(sunday)).toBe(monday)
  })

  it("is Monday's for a Friday-evening post", () => {
    const fridayNight = Date.UTC(2026, 6, 3, 23, 0) // Friday 19:00 New York
    expect(nextSessionOpenFrom(fridayNight)).toBe(
      Date.UTC(2026, 6, 6, 13, 30)
    )
  })

  it("is this morning's open for a post made at the open", () => {
    expect(nextSessionOpenFrom(JULY_OPEN)).toBe(JULY_OPEN)
  })

  it("is tomorrow's for a post after the close", () => {
    const afterClose = JULY_OPEN + 7 * 60 * 60_000 // Wednesday 16:30 New York
    expect(nextSessionOpenFrom(afterClose)).toBe(JULY_OPEN + 86_400_000)
  })

  it("crosses the March clock change without skipping a day", () => {
    // Saturday 7 March 2026 in New York; the clocks go forward on Sunday 8th,
    // so Monday's 09:30 is 13:30 UTC while Saturday's would have been 14:30.
    const saturday = Date.UTC(2026, 2, 7, 17, 0)
    expect(nextSessionOpenFrom(saturday)).toBe(Date.UTC(2026, 2, 9, 13, 30))
  })
})

describe("the moment a figure reads a price at", () => {
  it("is the post's own moment for a coin, whatever the hour", () => {
    const sunday = Date.UTC(2026, 6, 5, 7, 0)
    expect(priceMomentFor("coin", sunday)).toEqual({ at: sunday, own: true })
  })

  it("is the post's own moment for a metal or a currency too", () => {
    const sunday = Date.UTC(2026, 6, 5, 7, 0)
    expect(priceMomentFor("commodity", sunday)).toEqual({
      at: sunday,
      own: true,
    })
    expect(priceMomentFor("currency", sunday)).toEqual({
      at: sunday,
      own: true,
    })
  })

  it("is the post's own moment for a stock named in hours", () => {
    expect(priceMomentFor("stock", JULY_OPEN)).toEqual({
      at: JULY_OPEN,
      own: true,
    })
  })

  it("is the next open for a stock named on a Sunday, and says so", () => {
    const sunday = Date.UTC(2026, 6, 5, 7, 0)
    expect(priceMomentFor("stock", sunday)).toEqual({
      at: Date.UTC(2026, 6, 6, 13, 30),
      own: false,
    })
  })
})

describe("what the panel's heading says", () => {
  it("says nothing at all about coins", () => {
    expect(sessionNoteFor("coin", JULY_OPEN)).toBeNull()
  })

  it("says nothing about a metal or a currency either", () => {
    // 3am on a Tuesday: a stock is shut, but gold and EURUSD are trading, so
    // a heading calling them shut would be wrong on screen.
    const earlyTuesday = Date.UTC(2026, 6, 7, 7, 0)
    expect(sessionNoteFor("commodity", earlyTuesday)).toBeNull()
    expect(sessionNoteFor("currency", earlyTuesday)).toBeNull()
    expect(sessionNoteFor("stock", earlyTuesday)?.open).toBe(false)
  })

  it("says a stock is open in hours and shut out of them", () => {
    expect(sessionNoteFor("stock", JULY_OPEN)?.open).toBe(true)
    const sunday = Date.UTC(2026, 6, 5, 7, 0)
    const note = sessionNoteFor("stock", sunday)
    expect(note?.open).toBe(false)
    expect(nextOpenLabel(note!.nextOpen)).toBe("Mon 09:30")
  })
})
