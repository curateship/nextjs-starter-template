import { describe, expect, it } from "vitest"

import {
  DEFAULT_CHART_OPTIONS,
  readChartOptions,
} from "@/lib/trade/chart-options"

describe("chart view options", () => {
  it("shows everything on a first visit", () => {
    expect(readChartOptions(null)).toEqual(DEFAULT_CHART_OPTIONS)
  })

  it("reads a complete saved choice", () => {
    expect(
      readChartOptions({
        grid: false,
        volume: true,
        crosshair: false,
        orderArrows: false,
        orderArrowTrades: 7,
        drawings: false,
        zone: "Europe/London",
      })
    ).toEqual({
      grid: false,
      volume: true,
      crosshair: false,
      orderArrows: false,
      orderArrowTrades: 7,
      drawings: false,
      zone: "Europe/London",
    })
  })

  it("fills in a setting an older build never saved, keeping the rest", () => {
    // A row from before the arrows and before the clock existed. Every other
    // choice on it survives; the missing ones come back as their defaults.
    expect(
      readChartOptions({ grid: false, volume: true, crosshair: false })
    ).toEqual({
      grid: false,
      volume: true,
      crosshair: false,
      orderArrows: true,
      orderArrowTrades: null,
      drawings: true,
      zone: "UTC",
    })
  })

  it("falls back to UTC for a timezone this build no longer offers", () => {
    // A chart that will not draw is worse than a chart on the wrong clock.
    expect(
      readChartOptions({ ...DEFAULT_CHART_OPTIONS, zone: "Mars/Olympus" })
    ).toEqual(DEFAULT_CHART_OPTIONS)
    expect(readChartOptions({ ...DEFAULT_CHART_OPTIONS, zone: 7 })).toEqual(
      DEFAULT_CHART_OPTIONS
    )
  })

  it("does not partly apply an invalid saved choice", () => {
    expect(readChartOptions({ grid: false })).toEqual(DEFAULT_CHART_OPTIONS)
  })
})
