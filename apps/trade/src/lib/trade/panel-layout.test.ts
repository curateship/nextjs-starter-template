import { describe, expect, it } from "vitest"

import {
  marketPanelScopeKey,
  matchingPanelLayout,
  readLegacyTradePanelLayouts,
  readTradePanelLayouts,
} from "@/lib/trade/panel-layout"
import { tradePanelLayoutKey } from "@/lib/trade/panel-keys"

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
        [tradePanelLayoutKey.workspaceMarketColumn]: {
          folders: 68,
          alerts: 32,
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
    expect(saved.current[tradePanelLayoutKey.workspaceMarketColumn]).toEqual({
      folders: 68,
      alerts: 32,
    })
  })

  it("reads the active layout and its open folder without dropping old layouts", () => {
    const saved = readTradePanelLayouts({
      legacyImported: true,
      current: {},
      openMarketRows: { [scope]: null, unknown: "watched" },
      headerProfitVisible: false,
      activeNamedId: "layout-1",
      named: [
        {
          id: "layout-1",
          name: "Reading",
          horizontal: { markets: 20, chart: 58, "smart-orders": 22 },
          marketColumn: { folders: 68, alerts: 32 },
          vertical: { workspace: 72, activity: 28 },
          openMarketRows: { [scope]: "watched", unknown: "all" },
          headerProfitVisible: false,
        },
        {
          id: "layout-2",
          name: "Older saved layout",
          horizontal: { markets: 20, chart: 58, "smart-orders": 22 },
          vertical: { workspace: 72, activity: 28 },
        },
      ],
    })

    expect(saved.openMarketRows).toEqual({ [scope]: null })
    expect(saved.headerProfitVisible).toBe(false)
    expect(saved.activeNamedId).toBe("layout-1")
    expect(saved.named[0]?.openMarketRows).toEqual({ [scope]: "watched" })
    expect(saved.named[0]?.marketColumn).toEqual({ folders: 68, alerts: 32 })
    expect(saved.named[0]?.headerProfitVisible).toBe(false)
    expect(saved.named[1]?.openMarketRows).toEqual({})
    expect(saved.named[1]?.marketColumn).toBeUndefined()
    expect(saved.named[1]?.headerProfitVisible).toBeUndefined()
  })

  it("clears an active id that no longer names a readable layout", () => {
    expect(
      readTradePanelLayouts({
        activeNamedId: "missing",
        named: [],
      }).activeNamedId
    ).toBeNull()
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
