import { describe, expect, it } from "vitest"

import {
  matchingPanelLayout,
  readLegacyTradePanelLayouts,
  readTradePanelLayouts,
} from "@/lib/trade/panel-layout"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"

const panels = ["markets", "chart", "smart-orders"] as const

describe("remembered trade panel layouts", () => {
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

  it("drops one stale group without losing the other saved groups", () => {
    const saved = readTradePanelLayouts({
      legacyImported: true,
      current: {
        [tradePanelLayoutKey.workspaceHorizontal]: {
          markets: 20,
          chart: 58,
          account: 22,
        },
        [tradePanelLayoutKey.workspaceVertical]: {
          workspace: 72,
          activity: 28,
        },
      },
      named: [],
    })

    expect(
      saved.current[tradePanelLayoutKey.workspaceHorizontal]
    ).toBeUndefined()
    expect(saved.current[tradePanelLayoutKey.workspaceVertical]).toEqual({
      workspace: 72,
      activity: 28,
    })
  })

  it("reads every valid old browser key and ignores malformed neighbours", () => {
    const values = new Map<string, string>([
      [
        tradePanelLayoutKey.workspaceHorizontal,
        JSON.stringify({ markets: 20, chart: 58, "smart-orders": 22 }),
      ],
      [tradePanelLayoutKey.workspaceVertical, "not json"],
      [
        tradePanelLayoutKey.flowRunVertical,
        JSON.stringify({ workspace: 65, trades: 35 }),
      ],
    ])
    const imported = readLegacyTradePanelLayouts({
      getItem: (key) => values.get(key) ?? null,
    })

    expect(imported).toEqual({
      [tradePanelLayoutKey.workspaceHorizontal]: {
        markets: 20,
        chart: 58,
        "smart-orders": 22,
      },
      [tradePanelLayoutKey.flowRunVertical]: { workspace: 65, trades: 35 },
    })
  })
})
