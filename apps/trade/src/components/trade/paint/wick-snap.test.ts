import { describe, expect, it } from "vitest"

import {
  nearestWickTip,
  projectCandleWicks,
  type ScreenCandleWicks,
} from "@/components/trade/paint/wick-snap"

describe("candle wick snapping", () => {
  it("uses the chart coordinates for candle highs and lows", () => {
    const projected = projectCandleWicks(
      [
        {
          openTime: 1_000,
          open: 90,
          high: 101,
          low: 80,
          close: 95,
          volume: 1,
        },
      ],
      {
        xOf: (time) => time / 10,
        yOf: (price) => 200 - price,
      }
    )

    expect(projected).toEqual([
      {
        time: 1_000,
        x: 100,
        high: { price: 101, y: 99 },
        low: { price: 80, y: 120 },
      },
    ])
  })

  it("prefers the tip nearest in price when dense candles share the radius", () => {
    const candles: ScreenCandleWicks[] = [
      {
        time: 1_000,
        x: 100,
        high: { price: 197, y: 103 },
        low: { price: 180, y: 120 },
      },
      {
        time: 2_000,
        x: 104,
        high: { price: 199, y: 101 },
        low: { price: 179, y: 121 },
      },
    ]

    expect(nearestWickTip(candles, 100, 100, 8)).toEqual({
      time: 2_000,
      price: 199,
      x: 104,
      y: 101,
    })
  })

  it("does not snap to a tip outside the eight-pixel circle", () => {
    const candles: ScreenCandleWicks[] = [
      {
        time: 1_000,
        x: 106,
        high: { price: 194, y: 106 },
        low: null,
      },
    ]

    expect(nearestWickTip(candles, 100, 100, 8)).toBeNull()
  })
})
