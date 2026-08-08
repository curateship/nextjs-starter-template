import { describe, expect, it } from "vitest"

import { BASE_FIELDS, baseIndicator, cappedHold } from "@/lib/trade/indicators/base"
import { readIndicatorParams } from "@/lib/trade/indicators/contract"
import type { IndicatorCandle } from "@/lib/trade/indicators/contract"

const HOUR = 3_600_000

/**
 * Candles built from their lows alone (or their highs, for the ceiling side).
 * The other side is pushed well out of the way so one test's shape can never
 * accidentally make a level on the other.
 */
function bars(lows: number[], highs?: number[]): IndicatorCandle[] {
  return lows.map((low, index) => ({
    openTime: index * HOUR,
    low,
    high: highs?.[index] ?? low + 100,
    close: low + 0.5,
  }))
}

/** The settings every test starts from: the smallest search the rule allows. */
function settings(over: Record<string, number | boolean> = {}) {
  return {
    searchBars: 4,
    holdBars: 1,
    minBarsApart: 1,
    withTrendOnly: false,
    showBases: true,
    showCeilings: false,
    ...over,
  }
}

// One dip to 5 at candle 4. The window is 4 candles and the wait is 1, so the
// level is confirmed at candle 5 — one candle after the low held.
const ONE_BASE = [10, 9, 8, 7, 5, 6, 7, 8, 9, 10]

// The same again, then a deeper dip to 4 at candle 10, confirmed at candle 11.
const TWO_BASES = [10, 9, 8, 7, 5, 6, 7, 8, 9, 10, 4, 5, 6, 7, 8, 9]

describe("the base indicator", () => {
  it("marks a floor on the candle its wait finishes on", () => {
    const paint = baseIndicator.compute(bars(ONE_BASE), settings())

    // At candle 5's own close — the candle the wait finished on, which sits
    // well above the level itself. Timing an entry near a level is a different
    // job; this only says the level is now there.
    expect(paint.marks).toEqual([{ time: 5 * HOUR, price: 6.5, side: "up" }])
    // The dash sits on the candles that made the level, not across the chart:
    // the low was candle 4, and it reaches two candles either side of it.
    expect(paint.dashes).toEqual([
      { fromTime: 2 * HOUR, toTime: 6 * HOUR, price: 5, side: "up" },
    ])
  })

  it("finds a ceiling by exactly the same rule, upside down", () => {
    const highs = [5, 6, 7, 8, 10, 9, 8, 7, 6, 5]
    const paint = baseIndicator.compute(
      bars(
        highs.map((high) => high - 100),
        highs
      ),
      settings({ showBases: false, showCeilings: true })
    )

    expect(paint.marks).toEqual([{ time: 5 * HOUR, price: -90.5, side: "down" }])
    expect(paint.dashes).toEqual([
      { fromTime: 2 * HOUR, toTime: 6 * HOUR, price: 10, side: "down" },
    ])
  })

  it("draws nothing at all for a side that is switched off", () => {
    const paint = baseIndicator.compute(
      bars(ONE_BASE),
      settings({ showBases: false })
    )
    expect(paint).toEqual({ dashes: [], marks: [] })
  })

  it("keeps the dash but drops the arrow on a floor that is lower than the last", () => {
    const candles = bars(TWO_BASES)
    const both = baseIndicator.compute(candles, settings())
    expect(both.marks.map((mark) => mark.time)).toEqual([5 * HOUR, 11 * HOUR])

    const withTrend = baseIndicator.compute(
      candles,
      settings({ withTrendOnly: true })
    )
    // The second floor is at 4, below the first at 5 — no arrow.
    expect(withTrend.marks.map((mark) => mark.time)).toEqual([5 * HOUR])
    // But it is still a level, and it still shows as one.
    expect(withTrend.dashes).toEqual(both.dashes)
    expect(both.dashes.map((dash) => dash.price)).toEqual([5, 4])
  })

  it("never lets two arrows land closer together than the spacing", () => {
    const candles = bars(TWO_BASES)
    // The two arrows are 6 candles apart, so 10 is more than they can clear.
    const spaced = baseIndicator.compute(candles, settings({ minBarsApart: 10 }))
    expect(spaced.marks.map((mark) => mark.time)).toEqual([5 * HOUR])
    // Spacing thins the arrows and never the dashes.
    expect(spaced.dashes).toHaveLength(2)
  })

  it("says nothing about a chart with less history than the search needs", () => {
    expect(baseIndicator.compute(bars([10, 9, 8]), settings())).toEqual({
      dashes: [],
      marks: [],
    })
    expect(baseIndicator.compute([], settings())).toEqual({
      dashes: [],
      marks: [],
    })
  })

  it("reads its own settings, so junk in a saved row draws the defaults", () => {
    const fromJunk = baseIndicator.compute(bars(ONE_BASE), {
      searchBars: Number.NaN,
    } as never)
    // 36 candles of search over 10 candles of history finds nothing, which is
    // the honest answer — not a crash, and not a chart drawn from NaN.
    expect(fromJunk).toEqual({ dashes: [], marks: [] })
  })

  it("caps the wait below the search, because there is nothing longer to wait for", () => {
    expect(cappedHold(36, 8)).toBe(8)
    expect(cappedHold(36, 36)).toBe(35)
    expect(cappedHold(36, 400)).toBe(35)
  })
})

describe("reading an indicator's settings", () => {
  it("fills every field from the defaults when nothing is stored", () => {
    expect(readIndicatorParams(BASE_FIELDS, null)).toEqual({
      searchBars: 36,
      holdBars: 8,
      minBarsApart: 20,
      withTrendOnly: true,
      showBases: true,
      showCeilings: true,
    })
  })

  it("keeps what it can read and falls back on what it cannot", () => {
    const read = readIndicatorParams(BASE_FIELDS, {
      searchBars: 50,
      holdBars: "eight",
      showBases: 1,
    })
    expect(read.searchBars).toBe(50)
    expect(read.holdBars).toBe(8)
    expect(read.showBases).toBe(true)
  })

  it("holds a number to whole candles inside the range it offered", () => {
    const read = readIndicatorParams(BASE_FIELDS, {
      searchBars: 9000,
      holdBars: 0,
      minBarsApart: 12.6,
    })
    expect(read.searchBars).toBe(500)
    expect(read.holdBars).toBe(1)
    expect(read.minBarsApart).toBe(13)
  })

  it("ignores a setting nobody offered", () => {
    const read = readIndicatorParams(BASE_FIELDS, { crackPercent: 3 })
    expect(read.crackPercent).toBeUndefined()
  })
})
