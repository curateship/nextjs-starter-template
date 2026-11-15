import { describe, expect, it } from "vitest"

import {
  DEFAULT_TRADING_WIDGET_LAYOUT,
  readTradingWidgetLayout,
  TRADING_WIDGET_OFFER,
  tradingOverviewWidgetReads,
} from "@/lib/trade/dashboard/widgets"

/** The Trade dashboard's Overview widgets, in the shell's rows. */
describe("the Trade Overview's widgets", () => {
  it("offers Trade's six widgets and nothing of the shell's", () => {
    expect(TRADING_WIDGET_OFFER.choices.map((choice) => choice.id)).toEqual([
      "equity",
      "active-trades",
      "running-bots",
      "profit-calendar",
      "trades",
      "moving-now",
    ])
  })

  it("starts fresh with PnL Graph and Active Trades over Running bots and All trades", () => {
    expect(readTradingWidgetLayout(null)).toEqual(DEFAULT_TRADING_WIDGET_LAYOUT)
    expect(DEFAULT_TRADING_WIDGET_LAYOUT).toEqual({
      top: { columns: 2, spots: ["equity", "active-trades"] },
      bottom: { columns: 2, spots: ["running-bots", "trades"] },
    })
  })

  it("asks for positions and bots only when their widgets are shown", () => {
    expect(tradingOverviewWidgetReads(DEFAULT_TRADING_WIDGET_LAYOUT)).toEqual({
      includeActiveTrades: true,
      includeBots: true,
    })
    expect(
      tradingOverviewWidgetReads({
        top: { columns: 1, spots: ["equity"] },
        // A bottom row set to None hides what it held.
        bottom: { columns: 0, spots: ["running-bots"] },
      })
    ).toEqual({ includeActiveTrades: false, includeBots: false })
  })
})
