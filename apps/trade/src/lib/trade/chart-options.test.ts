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
      readChartOptions({ grid: false, volume: true, crosshair: false })
    ).toEqual({ grid: false, volume: true, crosshair: false })
  })

  it("does not partly apply an invalid saved choice", () => {
    expect(readChartOptions({ grid: false })).toEqual(DEFAULT_CHART_OPTIONS)
  })
})
