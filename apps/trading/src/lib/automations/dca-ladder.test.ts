import { describe, expect, it } from "vitest"

import type { IndicatorCandle } from "@/lib/indicators/contract"

import {
  advanceBaseTracker,
  baseRespectScore,
  createBaseTracker,
  type BaseRespectSettings,
} from "./dca-ladder"
import { baseLevels } from "../strategies/indicators"

const settings: BaseRespectSettings = {
  basePeriods: 4,
  pumpPeriods: 1,
  crackPct: 2.5,
  recoveryTargetPct: -2,
  respectLookbackMonths: 1,
}

function candle(
  t: number,
  close: number,
  low: number,
  high = close,
  volume = 10
): IndicatorCandle {
  return { t, o: close, h: high, l: low, c: close, v: volume }
}

describe("base tracking and respect scoring", () => {
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

  it("keeps lower bases inside the first broken-base recovery test", () => {
    const day = 86_400_000
    const candles = Array.from({ length: 40 }, (_, index) =>
      candle(index * day, 101, 100, 102)
    )
    candles[25] = candle(25 * day, 92, 90, 93)
    candles[26] = candle(26 * day, 95, 91, 96)
    candles[27] = candle(27 * day, 87, 86, 88)
    candles[28] = candle(28 * day, 82, 80, 83)
    candles[29] = candle(29 * day, 85, 81, 86)
    candles[30] = candle(30 * day, 77, 76, 78)
    candles[31] = candle(31 * day, 88, 77, 89)

    expect(baseRespectScore(candles.slice(0, 32), settings)).toMatchObject({
      respected: 1,
      total: 1,
      rate: 100,
      hasFullHistory: true,
    })

    candles[31] = candle(31 * day, 84, 77, 87)
    expect(baseRespectScore(candles.slice(0, 32), settings)).toMatchObject({
      respected: 0,
      total: 1,
      rate: 0,
    })
  })

  it("never lets candles after the scoring time improve base respect", () => {
    const day = 86_400_000
    const candles = Array.from({ length: 32 }, (_, index) =>
      candle(index * day, 101, 100, 102)
    )
    candles[25] = candle(25 * day, 92, 90, 93)
    candles[26] = candle(26 * day, 95, 91, 96)
    candles[27] = candle(27 * day, 87, 86, 88)
    const scoredAt = candles[27].t
    candles.push(candle(32 * day, 101, 85, 102))

    expect(baseRespectScore(candles, settings, scoredAt)).toMatchObject({
      respected: 0,
      total: 1,
      rate: 0,
    })
  })
})
