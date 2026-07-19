import { describe, expect, it } from "vitest"

import {
  chartDrawingScopeSchema,
  parseChartPositions,
  parseChartTrendlines,
  saveChartDrawingsSchema,
} from "@/lib/api/chart-drawings"

const line = {
  id: "line-1",
  start: { time: 1_700_000_000, price: 10 },
  end: { time: 1_700_000_001, price: 11 },
  color: "#2962ff",
}

const position = {
  id: "position-1",
  side: "long" as const,
  startTime: 1_700_000_000,
  endTime: 1_700_020_000,
  entry: 100,
  target: 120,
  stop: 90,
}

describe("chart drawing API validation", () => {
  it("keys drawings by market without accepting a timeframe", () => {
    expect(
      chartDrawingScopeSchema.safeParse({ network: "testnet", market: "ETH" })
        .success
    ).toBe(true)
    expect(
      chartDrawingScopeSchema.safeParse({
        network: "testnet",
        market: "ETH",
        interval: "4h",
      }).success
    ).toBe(false)
  })

  it("rejects oversized drawing sets", () => {
    expect(
      saveChartDrawingsSchema.safeParse({
        network: "testnet",
        market: "ETH",
        trendlines: Array.from({ length: 201 }, (_, index) => ({
          ...line,
          id: `line-${index}`,
        })),
        positions: [],
      }).success
    ).toBe(false)
    expect(
      saveChartDrawingsSchema.safeParse({
        network: "testnet",
        market: "ETH",
        trendlines: [],
        positions: Array.from({ length: 101 }, (_, index) => ({
          ...position,
          id: `position-${index}`,
        })),
      }).success
    ).toBe(false)
  })

  it("rejects invalid prices and market keys", () => {
    expect(
      saveChartDrawingsSchema.safeParse({
        network: "testnet",
        market: "../../ETH",
        trendlines: [{ ...line, start: { time: 1_700_000_000, price: -1 } }],
        positions: [],
      }).success
    ).toBe(false)
  })

  it("accepts safe hex colors and rejects other color values", () => {
    const input = {
      network: "testnet" as const,
      market: "ETH",
      trendlines: [{ ...line, color: "#f23645" }],
      positions: [],
    }

    expect(saveChartDrawingsSchema.safeParse(input).success).toBe(true)
    expect(
      saveChartDrawingsSchema.safeParse({
        ...input,
        trendlines: [{ ...line, color: "url(evil)" }],
      }).success
    ).toBe(false)
  })

  it("requires the current color format for saved and loaded trendlines", () => {
    const { color: _color, ...colorlessLine } = line

    expect(
      saveChartDrawingsSchema.safeParse({
        network: "testnet",
        market: "ETH",
        trendlines: [colorlessLine],
        positions: [],
      }).success
    ).toBe(false)
    expect(() => parseChartTrendlines([colorlessLine])).toThrow()
  })

  it("accepts a saved position and rejects a broken one", () => {
    expect(parseChartPositions([position])).toEqual([position])
    expect(() => parseChartPositions([{ ...position, side: "flat" }])).toThrow()
    expect(() =>
      parseChartPositions([{ ...position, qty: 1 }])
    ).toThrow()
    expect(() => parseChartPositions([{ ...position, entry: -1 }])).toThrow()
  })
})
