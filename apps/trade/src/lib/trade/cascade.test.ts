import { describe, expect, it } from "vitest"

import type { CandleBar } from "@/lib/protocols/contracts"
import {
  defaultCascade,
  holdUntil,
  marketIsCascading,
  worstFallIn,
} from "@/lib/trade/cascade"

const HOUR = 3_600_000

function bar(over: Partial<CandleBar> & { openTime: number }): CandleBar {
  return {
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1_000,
    ...over,
  }
}

/** A coin that sits flat, then falls to `low` on the bar at `crashAt`. */
function coin(crashAt: number, low: number, bars = 4): CandleBar[] {
  return Array.from({ length: bars }, (_, index) => {
    const openTime = index * HOUR
    return openTime === crashAt
      ? bar({ openTime, open: 100, high: 100, low, close: low })
      : bar({ openTime })
  })
}

describe("worstFallIn", () => {
  it("reads highs in linear work instead of rescanning earlier candles", () => {
    let reads = 0
    const series = Array.from({ length: 96 }, (_, i) => ({
      ...bar({ openTime: i * HOUR }),
      get high() {
        reads += 1
        return 100 + i
      },
    }))
    worstFallIn(series)
    expect(reads).toBeLessThanOrEqual(series.length * 2)
  })

  it("matches the original scan exactly across 5,000 seeded series", () => {
    // Independent oracle for the calculation before the running maximum.
    function original(bars: readonly CandleBar[]): number {
      let worst = 0
      for (let j = 0; j < bars.length; j += 1) {
        const low = bars[j].low
        if (!(low > 0)) continue
        let from = bars[j].open
        for (let i = 0; i < j; i += 1) {
          if (bars[i].high > from) from = bars[i].high
        }
        if (!(from > 0)) continue
        const fall = 1 - low / from
        if (fall > worst) worst = fall
      }
      return worst
    }
    let seed = 123456789
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    const unusual = [0, -10, NaN, Infinity, -Infinity]
    function price() {
      return random() < 0.1
        ? unusual[Math.floor(random() * unusual.length)]
        : random() * 1000
    }
    for (let sample = 0; sample < 5000; sample += 1) {
      const series = Array.from(
        { length: Math.floor(random() * 150) },
        (_, i) =>
          bar({
            openTime: i * HOUR,
            open: price(),
            high: price(),
            low: price(),
          })
      )
      expect(worstFallIn(series), `series ${sample}`).toBe(original(series))
    }
  })

  it("keeps an earlier high even when that bar has an invalid low", () => {
    expect(
      worstFallIn([
        bar({ openTime: 0, high: 200, low: 0 }),
        bar({ openTime: HOUR, open: 100, low: 50 }),
      ])
    ).toBe(0.75)
  })

  it("does not carry an open higher than its high into the next bar", () => {
    expect(
      worstFallIn([
        bar({ openTime: 0, open: 200, high: 100, low: 200 }),
        bar({ openTime: HOUR, open: 100, low: 100 }),
      ])
    ).toBe(0)
  })

  it("measures a high to a LATER low, never a low to a later high", () => {
    // Falls to 40 on the second bar, then climbs to 200 over the two after
    // it. The climb must not be read backwards as a fall from 200 to 40.
    const bars = [
      bar({ openTime: 0, open: 100, high: 100, low: 100, close: 100 }),
      bar({ openTime: HOUR, open: 100, high: 100, low: 40, close: 40 }),
      bar({ openTime: 2 * HOUR, open: 40, high: 120, low: 40, close: 120 }),
      bar({ openTime: 3 * HOUR, open: 120, high: 200, low: 120, close: 200 }),
    ]
    expect(worstFallIn(bars)).toBeCloseTo(0.6, 6)
  })

  it("finds a whole crash that happened inside ONE bar", () => {
    // The case this was written for. October 2025 fell 8 minutes into a 4h
    // candle and bounced back before it closed, so the fall exists only as
    // that bar's own open against its own low. Comparing one bar's close to
    // the next bar's would miss it completely.
    const bars = [
      bar({ openTime: 0, open: 100, high: 100, low: 25, close: 90 }),
    ]
    expect(worstFallIn(bars)).toBeCloseTo(0.75, 6)
  })

  it("is zero for a market that only goes up", () => {
    const bars = [
      bar({ openTime: 0, open: 10, high: 20, low: 10, close: 20 }),
      bar({ openTime: HOUR, open: 20, high: 40, low: 20, close: 40 }),
    ]
    expect(worstFallIn(bars)).toBe(0)
  })

  it("does not read a coin that DOUBLED in one bar as a crash", () => {
    // A bar says what it opened, ranged and closed at, never in what order.
    // Scoring its own high against its own low would call this +100% bar a
    // 50% fall — and ten coins rallying together would fire the rule.
    const bars = [
      bar({ openTime: 0, open: 100, high: 200, low: 100, close: 200 }),
    ]
    expect(worstFallIn(bars)).toBe(0)
  })
})

describe("marketIsCascading", () => {
  const settings = defaultCascade()

  it("drops the earlier peak immediately after the inclusive window edge", () => {
    const coins = new Map([
      [
        "coin",
        [
          bar({ openTime: 0, open: 100, high: 200, low: 100 }),
          bar({ openTime: HOUR, open: 100, high: 100, low: 100 }),
        ],
      ],
    ])
    const rule = { ...settings, withinHours: 1, minCoins: 1 }
    expect(marketIsCascading({ settings: rule, coins, now: HOUR })).toBe(true)
    expect(marketIsCascading({ settings: rule, coins, now: HOUR + 1 })).toBe(
      false
    )
  })

  it("handles a window shorter than the interval, including an empty window", () => {
    const coins = new Map([["coin", [bar({ openTime: HOUR, low: 25 })]]])
    const rule = { ...settings, withinHours: 0.25, minCoins: 1 }
    expect(marketIsCascading({ settings: rule, coins, now: HOUR })).toBe(true)
    expect(marketIsCascading({ settings: rule, coins, now: 1.5 * HOUR })).toBe(
      false
    )
  })

  it("fires when enough coins fall far enough at the same time", () => {
    const coins = new Map(
      Array.from({ length: 10 }, (_, index) => [
        `c${index}`,
        coin(HOUR, 40) as readonly CandleBar[],
      ])
    )
    expect(marketIsCascading({ settings, coins, now: 3 * HOUR })).toBe(true)
  })

  it("refuses when only a few coins are falling, however hard", () => {
    // Nine coins wiped out is still not the market. This is the whole
    // difference between a book emptying and a handful of catastrophes.
    const coins = new Map<string, readonly CandleBar[]>()
    for (let index = 0; index < 9; index += 1) {
      coins.set(`dead${index}`, coin(HOUR, 5))
    }
    for (let index = 0; index < 40; index += 1) {
      coins.set(`fine${index}`, coin(HOUR, 100))
    }
    expect(marketIsCascading({ settings, coins, now: 3 * HOUR })).toBe(false)
  })

  it("refuses a fall that is wide but not deep", () => {
    const coins = new Map(
      Array.from({ length: 50 }, (_, index) => [
        `c${index}`,
        coin(HOUR, 70) as readonly CandleBar[],
      ])
    )
    expect(marketIsCascading({ settings, coins, now: 3 * HOUR })).toBe(false)
  })

  it("never reads a bar that has not happened yet", () => {
    // The replay holds every bar of the run in memory. Judging the first bar
    // must not see a crash three hours into its own future.
    const coins = new Map(
      Array.from({ length: 20 }, (_, index) => [
        `c${index}`,
        coin(3 * HOUR, 20) as readonly CandleBar[],
      ])
    )
    expect(marketIsCascading({ settings, coins, now: 0 })).toBe(false)
    expect(marketIsCascading({ settings, coins, now: 3 * HOUR })).toBe(true)
  })

  it("forgets a crash once it falls out of the window", () => {
    const coins = new Map(
      Array.from({ length: 20 }, (_, index) => [
        `c${index}`,
        coin(0, 20, 12) as readonly CandleBar[],
      ])
    )
    expect(marketIsCascading({ settings, coins, now: HOUR })).toBe(true)
    // Four-hour window, so by the ninth hour that bar is long gone.
    expect(marketIsCascading({ settings, coins, now: 9 * HOUR })).toBe(false)
  })
})

describe("holdUntil", () => {
  it("ends the hold holdHours after the crash was seen", () => {
    expect(holdUntil({ ...defaultCascade(), holdHours: 4 }, 1_000)).toBe(
      1_000 + 4 * HOUR
    )
  })
})
