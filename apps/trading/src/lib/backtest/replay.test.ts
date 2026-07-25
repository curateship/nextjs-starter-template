import { describe, expect, it } from "vitest"

import { aggregateCandles, visibleCandlesUpTo } from "./replay"

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
