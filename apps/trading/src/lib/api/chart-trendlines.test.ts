import { describe, expect, it } from "vitest"

import {
  chartTrendlineScopeSchema,
  parseChartTrendlines,
  saveChartTrendlinesSchema,
} from "@/lib/api/chart-trendlines"

describe("chart trendline API validation", () => {
  it("keys drawings by market without accepting a timeframe", () => {
    expect(
      chartTrendlineScopeSchema.safeParse({
        network: "testnet",
        market: "ETH",
      }).success
    ).toBe(true)
    expect(
      chartTrendlineScopeSchema.safeParse({
        network: "testnet",
        market: "ETH",
        interval: "4h",
      }).success
    ).toBe(false)
  })

  it("rejects oversized drawing sets", () => {
    const trendlines = Array.from({ length: 201 }, (_, index) => ({
      id: `line-${index}`,
      start: { time: 1_700_000_000, price: 10 },
      end: { time: 1_700_000_001, price: 11 },
      color: "#2962ff",
    }))

    expect(
      saveChartTrendlinesSchema.safeParse({
        network: "testnet",
        market: "ETH",
        trendlines,
      }).success
    ).toBe(false)
  })

  it("rejects invalid prices and market keys", () => {
    expect(
      saveChartTrendlinesSchema.safeParse({
        network: "testnet",
        market: "../../ETH",
        trendlines: [
          {
            id: "line-1",
            start: { time: 1_700_000_000, price: -1 },
            end: { time: 1_700_000_001, price: 11 },
            color: "#2962ff",
          },
        ],
      }).success
    ).toBe(false)
  })

  it("accepts safe hex colors and rejects other color values", () => {
    const input = {
      network: "testnet" as const,
      market: "ETH",
      trendlines: [
        {
          id: "line-1",
          start: { time: 1_700_000_000, price: 10 },
          end: { time: 1_700_000_001, price: 11 },
          color: "#f23645",
        },
      ],
    }

    expect(saveChartTrendlinesSchema.safeParse(input).success).toBe(true)
    expect(
      saveChartTrendlinesSchema.safeParse({
        ...input,
        trendlines: [{ ...input.trendlines[0], color: "url(evil)" }],
      }).success
    ).toBe(false)
  })

  it("requires the current color format for saved and loaded trendlines", () => {
    const colorlessLine = {
      id: "line-1",
      start: { time: 1_700_000_000, price: 10 },
      end: { time: 1_700_000_001, price: 11 },
    }

    expect(
      saveChartTrendlinesSchema.safeParse({
        network: "testnet",
        market: "ETH",
        trendlines: [colorlessLine],
      }).success
    ).toBe(false)
    expect(() => parseChartTrendlines([colorlessLine])).toThrow()
  })
})
