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
    const bars = [bar({ openTime: 0, open: 100, high: 100, low: 25, close: 90 })]
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
    const bars = [bar({ openTime: 0, open: 100, high: 200, low: 100, close: 200 })]
    expect(worstFallIn(bars)).toBe(0)
  })
})

describe("marketIsCascading", () => {
  const settings = defaultCascade()

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
