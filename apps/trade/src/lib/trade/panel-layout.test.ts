import { describe, expect, it } from "vitest"

import {
  marketPanelScopeKey,
  matchingPanelLayout,
  readTradePanelLayouts,
} from "@/lib/trade/panel-layout"

const panels = ["markets", "chart", "smart-orders"] as const

describe("remembered trade panel layouts", () => {
  const scope = marketPanelScopeKey({
    protocol: "hyperliquid",
    network: "mainnet",
  })

  it("accepts sizes for the panels now on screen", () => {
    expect(
      matchingPanelLayout(
        { markets: 20, chart: 58, "smart-orders": 22 },
        panels
      )
    ).toEqual({ markets: 20, chart: 58, "smart-orders": 22 })
  })

  it("refuses the old account panel record after that panel is replaced", () => {
    expect(
      matchingPanelLayout({ markets: 20, chart: 58, account: 22 }, panels)
    ).toBeNull()
  })

  it("refuses missing, extra, and unreadable sizes", () => {
    expect(matchingPanelLayout({ markets: 20, chart: 80 }, panels)).toBeNull()
    expect(
      matchingPanelLayout(
        { markets: 20, chart: 58, "smart-orders": 22, extra: 0 },
        panels
      )
    ).toBeNull()
    expect(
      matchingPanelLayout(
        { markets: 20, chart: 58, "smart-orders": undefined },
        panels
      )
    ).toBeNull()
    expect(
      matchingPanelLayout({ markets: 0, chart: 0, "smart-orders": 0 }, panels)
    ).toBeNull()
    expect(
      matchingPanelLayout(
        { markets: 200, chart: 58, "smart-orders": 22 },
        panels
      )
    ).toBeNull()
  })

  it("reads a row that still holds the old chart-over-trades split without it", () => {
    // The backtest's and bot's bottom trades panel went on 10 Nov 2026, and
    // its saved split with it; a row still holding one reads as before.
    const saved = readTradePanelLayouts({
      legacyImported: true,
      current: { "trade-backtest-vertical": { workspace: 72, trades: 28 } },
      openMarketRows: {},
    })

    expect(saved).not.toHaveProperty("current")
    expect(saved).not.toHaveProperty("legacyImported")
  })

  it("reads the open folder and drops the saved layouts that were removed", () => {
    // Saved layouts left the dashboard on 7 Nov 2026 (Tyler: "also remove the
    // saved layout feature"); a row still holding them reads without them.
    const saved = readTradePanelLayouts({
      openMarketRows: { [scope]: null, unknown: "watched" },
      headerProfitVisible: false,
      chartToolbarPosition: { x: 0.25, y: 0.75 },
      activeNamedId: "layout-1",
      named: [{ id: "layout-1", name: "Reading" }],
    })

    expect(saved.openMarketRows).toEqual({ [scope]: null })
    expect(saved.headerProfitVisible).toBe(false)
    expect(saved.chartToolbarPosition).toEqual({ x: 0.25, y: 0.75 })
    expect(saved).not.toHaveProperty("named")
    expect(saved).not.toHaveProperty("activeNamedId")
  })

  it("ignores unreadable drawing toolbar coordinates", () => {
    expect(
      readTradePanelLayouts({ chartToolbarPosition: { x: 2, y: 0.5 } })
        .chartToolbarPosition
    ).toBeNull()
  })
})
