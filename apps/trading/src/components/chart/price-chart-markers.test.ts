import { describe, expect, it } from "vitest"

import {
  toNativeSignalMarkers,
  type ChartMarker,
} from "@/components/chart/chart-markers"

describe("native chart signal markers", () => {
  it("anchors large signal-arrow tips to the exact signal price", () => {
    const markers: ChartMarker[] = [
      { time: 2_000, side: "sell", price: 90 },
      { time: 1_000, side: "buy", price: 100 },
      { time: 3_000, side: "buy", price: 110, letter: "O" },
    ]

    expect(toNativeSignalMarkers(markers)).toEqual([
      expect.objectContaining({
        time: 1,
        position: "atPriceBottom",
        price: 100,
        shape: "arrowUp",
        size: 2,
      }),
      expect.objectContaining({
        time: 2,
        position: "atPriceTop",
        price: 90,
        shape: "arrowDown",
        size: 2,
      }),
    ])
  })

  it("gives same-candle ladder fills unique ids so every rung draws", () => {
    // A DCA ladder fills several rungs inside one crash candle: same time,
    // same side, different fill prices. Each must keep a distinct id, or the
    // chart dedupes them to a single arrow (the bunched-at-the-bottom bug).
    const markers: ChartMarker[] = [
      { time: 5_000, side: "buy", price: 276.85 },
      { time: 5_000, side: "buy", price: 268.54 },
      { time: 5_000, side: "buy", price: 260.49 },
      { time: 5_000, side: "buy", price: 252.67 },
    ]

    const native = toNativeSignalMarkers(markers)
    const ids = native.map((marker) => marker.id)

    expect(native).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(native.map((marker) => marker.price)).toEqual([
      276.85, 268.54, 260.49, 252.67,
    ])
  })
})
