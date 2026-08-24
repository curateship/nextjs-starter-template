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

  it("puts the combined PnL Graph first on a new dashboard", () => {
    expect(createDefaultTradingDashboardWidgets().top[0]).toBe("equity")
  })

  it("keeps a dashboard somebody emptied on purpose", () => {
    expect(
      normalizeTradingDashboardWidgets({ top: [], left: [], right: [] })
    ).toEqual({ top: [], left: [], right: [] })
  })

  it("drops unknown cards and repeats", () => {
    expect(
      normalizeTradingDashboardWidgets({
        top: ["equity", "gone"],
        left: ["wallets", "equity"],
        right: ["trades"],
      })
    ).toEqual({
      top: ["equity"],
      left: [],
      right: ["trades"],
    })
  })
})
