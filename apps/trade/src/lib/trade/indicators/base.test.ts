import { describe, expect, it } from "vitest"

import {
  BASE_FIELDS,
  baseIndicator,
  baseInForce,
  baseLevelsInForce,
  baseDashes,
  cappedHold,
} from "@/lib/trade/indicators/base"
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

describe("the base in force", () => {
  it("is the level that confirmed last, whatever price has done since", () => {
    expect(baseInForce(bars(TWO_BASES), settings())).toBeCloseTo(4, 9)
  })

  it("is null until one has confirmed, so nothing rests on a guess", () => {
    expect(baseInForce(bars([10, 9, 8]), settings())).toBeNull()
    expect(baseInForce([], settings())).toBeNull()
  })

  it("answers the same level the chart draws a dash at", () => {
    const candles = bars(ONE_BASE)
    const paint = baseIndicator.compute(candles, settings())
    expect(baseInForce(candles, settings())).toBeCloseTo(paint.dashes[0].price, 9)
  })
})

describe("the base at every candle, in one pass", () => {
  /**
   * The claim the backtest now leans on: the level at candle `k` is decided by
   * candles 0 to `k` and cannot be changed by anything after it.
   *
   * That is why a replay can work the whole history out once and then look the
   * answer up, instead of handing the history over again on every bar and
   * asking afresh. Asking afresh is what it used to do, and on 250 coins over
   * ten years it was billions of comparisons — the run that never finished and
   * took the server's memory with it.
   *
   * So this checks the two ways of asking give the same answer at EVERY
   * candle, not just the last one. If they ever diverge, the shortcut is wrong
   * and every backtest built on it is wrong with it.
   */
  it("gives the same answer as asking about each stretch on its own", () => {
    const lows = [
      50, 48, 46, 44, 42, 40, 41, 43, 45, 44, 42, 39, 38, 40, 41, 42, 43, 41,
      37, 36, 38, 39, 40, 42, 44, 43, 41, 39, 45, 47, 49, 46, 44, 42, 40, 38,
    ]
    const candles = bars(lows)
    const params = settings({ searchBars: 5, holdBars: 2 })

    const onePass = baseLevelsInForce(candles, params)

    expect(onePass).toHaveLength(candles.length)
    for (let k = 0; k < candles.length; k += 1) {
      expect(onePass[k]).toBe(baseInForce(candles.slice(0, k + 1), params))
    }
    // And it really did find something, or the check above proves nothing.
    expect(onePass.some((one) => one !== null)).toBe(true)
  })

  it("answers nothing for a stretch too short to have confirmed a level", () => {
    const params = settings({ searchBars: 5, holdBars: 2 })
    expect(baseLevelsInForce(bars([]), params)).toEqual([])
    expect(baseLevelsInForce(bars([50, 48, 46]), params)).toEqual([
      null,
      null,
      null,
    ])
  })
})

describe("the chart and the ladder mean the same thing by a base", () => {
  /**
   * Every base a ladder anchors to is a base the chart drew an arrow on.
   *
   * They used to disagree, badly and silently. Two settings decide whether a
   * confirmed level actually counts — it must sit above the one before it, and
   * it must not crowd the last one — and both were applied to the chart's
   * arrows and to nothing else. On twenty of one account's coins the chart drew
   * 1,387 bases while the ladder followed 1,622, so a ladder re-aimed at levels
   * that were never on screen and the two could not be compared at all.
   */
  function priced(lows: number[]): IndicatorCandle[] {
    return lows.map((low, index) => ({
      openTime: index * HOUR,
      low,
      high: low + 100,
      close: low + 0.5,
    }))
  }

  // A long, uneven walk so bases confirm often, some higher than the last and
  // some lower, and some only a few candles apart.
  const walk = Array.from({ length: 400 }, (_, i) =>
    Math.round(
      100 +
        Math.sin(i / 5) * 6 +
        Math.sin(i / 23) * 14 -
        i * 0.05
    )
  )

  for (const withTrendOnly of [true, false]) {
    for (const minBarsApart of [1, 20, 60]) {
      it(`agrees with the arrows — trend ${withTrendOnly}, ${minBarsApart} apart`, () => {
        const candles = priced(walk)
        const params = settings({
          searchBars: 8,
          holdBars: 3,
          withTrendOnly,
          minBarsApart,
          showBases: true,
          showCeilings: false,
        })

        const drawn = baseIndicator.compute(candles, params).marks
        const levels = baseLevelsInForce(candles, params)

        // Every moment the ladder's level MOVES is a moment the chart drew an
        // arrow, at the same candle.
        const moved: number[] = []
        let last: number | null = null
        for (const [index, one] of levels.entries()) {
          if (one !== null && one !== last) moved.push(candles[index].openTime)
          last = one
        }

        expect(moved).toEqual(drawn.map((mark) => mark.time))
      })
    }
  }
})

describe("the bases a backtest chart draws", () => {
  /**
   * A dash at each base the run actually used, sitting on the low that made it.
   *
   * Two things went wrong here in one go. The chart drew the indicator's own
   * dashes, which mark every level that ever confirmed whatever the spacing
   * rule says — so turning "fewest candles between bases" up changed the run
   * and nothing on screen. Then the fix for that drew each base as a line from
   * where it took over to where the next one did, which put rules straight
   * across the chart miles from any candle, because a base stays in force long
   * after price has left it.
   */
  const walk = Array.from({ length: 400 }, (_, i) =>
    Math.round(100 + Math.sin(i / 5) * 6 + Math.sin(i / 23) * 14 - i * 0.05)
  )
  const candles = walk.map((low, index) => ({
    openTime: index * HOUR,
    low,
    high: low + 100,
    close: low + 0.5,
  }))

  function withApart(minBarsApart: number) {
    return settings({
      searchBars: 8,
      holdBars: 3,
      withTrendOnly: false,
      minBarsApart,
      showBases: true,
      showCeilings: false,
    })
  }

  it("draws fewer of them when bases must be further apart", () => {
    expect(baseDashes(candles, withApart(60)).length).toBeLessThan(
      baseDashes(candles, withApart(1)).length
    )
  })

  it("draws one for every base the chart puts an arrow on, and no others", () => {
    const params = withApart(20)
    expect(baseDashes(candles, params)).toHaveLength(
      baseIndicator.compute(candles, params).marks.length
    )
  })

  it("never floats: every dash sits on a low that really happened", () => {
    // The whole point of a base is that it is a price price stopped at. A mark
    // hanging in space above the candles is not a base, it is a bug — and it is
    // what a line drawn from one base to the next looks like.
    for (const dash of baseDashes(candles, withApart(20))) {
      const under = candles.filter(
        (bar) => bar.openTime >= dash.fromTime && bar.openTime <= dash.toTime
      )
      expect(Math.min(...under.map((bar) => bar.low))).toBe(dash.price)
    }
  })

  it("draws nothing at all before any candles have arrived", () => {
    // The backtest chart asks for these while the prices are still loading. A
    // throw here is a blank page instead of a chart.
    expect(baseDashes([], withApart(20))).toEqual([])
    expect(baseDashes(candles.slice(0, 3), withApart(20))).toEqual([])
  })

  it("stays a mark on a spot, never a line across the chart", () => {
    // Nine candles wide at these settings — the same span the trading chart's
    // own dashes use, so the two draw one level the same way.
    for (const dash of baseDashes(candles, withApart(20))) {
      const wide = (dash.toTime - dash.fromTime) / HOUR
      expect(wide).toBeLessThanOrEqual(2 * 3 + 1)
    }
  })
})
