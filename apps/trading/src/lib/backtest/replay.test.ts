import { describe, expect, it } from "vitest"

import {
  aggregateCandles,
  REPLAY_KEEP_BARS,
  REPLAY_TRIM_STEP,
  trailingWindow,
  trimToRunway,
  visibleCandlesUpTo,
} from "./replay"

const M15 = 900_000
const H1 = 3_600_000

/** A 15m candle n bars after epoch-aligned START. */
const START = 1_700_000_000_000 - (1_700_000_000_000 % H1)
function bar(n: number, o: number, h: number, l: number, c: number) {
  const t = START + n * M15
  return { t, T: t + M15, o, h, l, c, v: 1, n: 1 }
}

describe("aggregateCandles", () => {
  it("folds four 15m candles into one aligned 1h bucket", () => {
    const out = aggregateCandles(
      [bar(0, 10, 12, 9, 11), bar(1, 11, 15, 10, 14), bar(2, 14, 14, 8, 9), bar(3, 9, 10, 9, 10)],
      H1
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      t: START,
      T: START + H1,
      o: 10,
      h: 15,
      l: 8,
      c: 10,
      v: 4,
      n: 4,
    })
  })

  it("keeps the newest bucket partial — no future leaks", () => {
    const out = aggregateCandles(
      [bar(0, 10, 12, 9, 11), bar(1, 11, 15, 10, 14), bar(2, 14, 14, 8, 9), bar(3, 9, 10, 9, 10), bar(4, 10, 11, 10, 11)],
      H1
    )
    expect(out).toHaveLength(2)
    // The second bucket holds only its one revealed 15m candle so far.
    expect(out[1]).toMatchObject({ t: START + H1, o: 10, h: 11, l: 10, c: 11, v: 1 })
  })

  it("aligns buckets to the target grid even when data starts mid-bucket", () => {
    const out = aggregateCandles([bar(2, 14, 14, 8, 9), bar(3, 9, 10, 9, 10)], H1)
    expect(out).toHaveLength(1)
    expect(out[0].t).toBe(START)
    expect(out[0].o).toBe(14)
  })

  it("handles empty input", () => {
    expect(aggregateCandles([], H1)).toEqual([])
  })
})

describe("visibleCandlesUpTo", () => {
  it("clips to candles opening at or before the cutoff", () => {
    const candles = [bar(0, 1, 1, 1, 1), bar(1, 1, 1, 1, 1), bar(2, 1, 1, 1, 1)]
    expect(visibleCandlesUpTo(candles, START + M15)).toHaveLength(2)
    expect(visibleCandlesUpTo(candles, null)).toHaveLength(3)
  })
})

describe("trailingWindow", () => {
  const bars = Array.from({ length: 40_000 }, (_, i) => i)

  it("hands back everything until the keep size is passed", () => {
    expect(trailingWindow(bars, 10)).toHaveLength(10)
    expect(trailingWindow(bars, REPLAY_KEEP_BARS)).toHaveLength(REPLAY_KEEP_BARS)
  })

  it("grows to keep+step before trimming, then snaps back to keep", () => {
    const grown = REPLAY_KEEP_BARS + REPLAY_TRIM_STEP - 1
    expect(trailingWindow(bars, grown)).toHaveLength(grown)
    // One more bar crosses the boundary and cuts back to the keep size.
    expect(trailingWindow(bars, grown + 1)).toHaveLength(REPLAY_KEEP_BARS)
  })

  it("always ends on the newest revealed bar", () => {
    for (const revealed of [1, 500, REPLAY_KEEP_BARS + 123, 25_000]) {
      const window = trailingWindow(bars, revealed)
      expect(window[window.length - 1]).toBe(revealed - 1)
    }
  })

  /**
   * The invariant the whole design rests on: between trims the first bar must
   * not move, because that is what lets the chart append instead of being
   * re-sent wholesale. A window that slid every bar is what corrupted the
   * chart's copy of history and made drawings jump.
   */
  it("holds its first bar steady between trims, and moves it only in steps", () => {
    let moves = 0
    let previous = trailingWindow(bars, REPLAY_KEEP_BARS)[0]
    for (let revealed = REPLAY_KEEP_BARS + 1; revealed <= 30_000; revealed += 1) {
      const first = trailingWindow(bars, revealed)[0]
      if (first === previous) continue
      moves += 1
      expect(first - previous).toBe(REPLAY_TRIM_STEP)
      previous = first
    }
    // 24,000 bars of replay, trimmed once every REPLAY_TRIM_STEP — not 24,000
    // times, which is what sliding every bar would do.
    expect(moves).toBe((30_000 - REPLAY_KEEP_BARS) / REPLAY_TRIM_STEP)
  })

  it("never exceeds the ceiling the chart is allowed to hold", () => {
    for (let revealed = 1; revealed <= 30_000; revealed += 37) {
      expect(trailingWindow(bars, revealed).length).toBeLessThanOrEqual(
        REPLAY_KEEP_BARS + REPLAY_TRIM_STEP
      )
    }
  })
})

describe("trimToRunway", () => {
  const candles = Array.from({ length: 10 }, (_, i) => ({ t: i * M15 }))

  it("drops bars older than the runway", () => {
    expect(trimToRunway(candles, 4 * M15)).toHaveLength(6)
  })

  it("leaves a set that already starts inside the runway untouched", () => {
    expect(trimToRunway(candles, 0)).toBe(candles)
    expect(trimToRunway(candles, -M15)).toBe(candles)
  })

  it("handles an empty set", () => {
    expect(trimToRunway([], 5)).toEqual([])
  })
})
