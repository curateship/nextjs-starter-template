import { describe, expect, it } from "vitest"

import {
  createDefaultTradingDashboardWidgets,
  normalizeTradingDashboardWidgets,
} from "./widgets"

describe("the trading dashboard layout", () => {
  it("uses the familiar layout before a choice has been saved", () => {
    expect(normalizeTradingDashboardWidgets(null)).toEqual(
      createDefaultTradingDashboardWidgets()
    )
  })

  it("puts active trades on a new dashboard", () => {
    expect(createDefaultTradingDashboardWidgets().top).toContain(
      "active-trades"
    )
  })

  it("keeps a dashboard somebody emptied on purpose", () => {
    expect(
      normalizeTradingDashboardWidgets({ top: [], left: [], right: [] })
    ).toEqual({ top: [], left: [], right: [] })
  })

  it("drops unknown cards and repeats", () => {
    expect(
      normalizeTradingDashboardWidgets({
        top: ["figures", "gone"],
        left: ["wallets", "figures"],
        right: ["trades"],
      })
    ).toEqual({
      top: ["figures"],
      left: ["wallets"],
      right: ["trades"],
    })
  })
})
