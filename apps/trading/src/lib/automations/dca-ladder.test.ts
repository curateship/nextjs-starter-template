import { describe, expect, it } from "vitest"

import type { IndicatorCandle } from "@/lib/indicators/contract"

import { advanceBaseTracker, createBaseTracker } from "./dca-ladder"
import { baseLevels } from "../strategies/indicators"

function candle(
  t: number,
  close: number,
  low: number,
  high = close,
  volume = 10
): IndicatorCandle {
  return { t, o: close, h: high, l: low, c: close, v: volume }
}

describe("base tracking", () => {
  it("tracks the same base one candle at a time", () => {
    const candles = [20, 18, 16, 14, 12, 10, 12, 13, 9, 11, 12, 13].map(
      (low, index) => candle(index, low + 1, low)
    )
    const batch = baseLevels(candles, 4, 2).raw
    let tracker = createBaseTracker(4, 2)

    candles.forEach((item, index) => {
      tracker = advanceBaseTracker(tracker, item)
      const expected = batch[index]
      expect(tracker.currentBase).toBe(
        Number.isFinite(expected) ? expected : null
      )
      const previous = batch[index - 1]
      expect(tracker.previousBase).toBe(
        Number.isFinite(previous) ? previous : null
      )
    })
  })
})
