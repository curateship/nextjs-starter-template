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
})
