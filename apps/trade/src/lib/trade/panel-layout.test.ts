import { describe, expect, it } from "vitest"

import { matchingPanelLayout } from "@/lib/trade/panel-layout"

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
  })
})
