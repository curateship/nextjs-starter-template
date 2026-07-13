import { describe, expect, it } from "vitest"

import {
  cacheTrendlines,
  distanceToSegment,
  moveTrendlinePoint,
  nearestCandleTime,
  type Trendline,
} from "@/lib/trading/trendlines"

describe("trendline model", () => {
  it("finds the shortest distance from a pointer to a trendline", () => {
    expect(
      distanceToSegment({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(4)
    expect(
      distanceToSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })
    ).toBe(5)
  })

  it("moves only the chosen endpoint", () => {
    const line: Trendline = {
      id: "line-1",
      start: { time: 100, price: 10 },
      end: { time: 200, price: 20 },
      color: "#2962ff",
    }

    expect(moveTrendlinePoint(line, "start", { time: 150, price: 15 })).toEqual(
      {
        ...line,
        start: { time: 150, price: 15 },
      }
    )
  })

  it("snaps an anchor to the nearest candle on a coarser timeframe", () => {
    expect(nearestCandleTime([0, 86_400, 172_800], 57_600)).toBe(86_400)
    expect(nearestCandleTime([0, 86_400, 172_800], 10_000)).toBe(0)
  })

  it("keeps each market's trendlines cached while switching markets", () => {
    const line: Trendline = {
      id: "line-1",
      start: { time: 100, price: 10 },
      end: { time: 200, price: 20 },
      color: "#2962ff",
    }

    const suiCached = cacheTrendlines(new Map(), "testnet:SUI", [line])
    const bothCached = cacheTrendlines(suiCached, "testnet:ETH", [])

    expect(bothCached.get("testnet:SUI")).toEqual([line])
    expect(bothCached.get("testnet:ETH")).toEqual([])
  })
})
