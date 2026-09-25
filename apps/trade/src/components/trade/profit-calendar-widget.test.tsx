// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProfitCalendarWidget } from "@/components/trade/profit-calendar-widget"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradingOverview } from "@/lib/trade/dashboard/overview"

function overviewWith(fills: { at: string; money: number | null }[]) {
  return {
    readAt: new Date("2026-09-17T16:00:00.000Z").getTime(),
    wallets: [],
    fills: fills.map((fill, index) => ({
      walletId: "main",
      fillId: `fill-${index}`,
      at: new Date(fill.at).getTime(),
      money: fill.money,
    })),
    activeTrades: [],
    activeTradesUnavailable: [],
    bots: [],
    profit: [],
    missingVenues: [],
    unpricedFills: 0,
  } as unknown as TradingOverview
}

describe("the profit calendar widget", () => {
  it("adds the overview's fills into the current month's days", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProfitCalendarWidget
          className=""
          overview={overviewWith([
            { at: "2026-09-15T15:00:00.000Z", money: 40 },
            { at: "2026-09-15T18:00:00.000Z", money: -10 },
            { at: "2026-09-16T15:00:00.000Z", money: null },
          ])}
        />
      </TooltipProvider>
    )

    expect(html).toContain("September 2026")
    expect(html).toContain("+$30.00")
    expect(html).toContain("2026-09-15: +$30.00.")
    expect(html).toContain("1 unpriced")
    expect(html).not.toContain("across")
  })

  it("names the money for a month whose fills finished no trade", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProfitCalendarWidget
          className=""
          overview={overviewWith([
            { at: "2026-09-15T15:00:00.000Z", money: 12 },
          ])}
        />
      </TooltipProvider>
    )

    expect(html).not.toContain("No trades<")
    expect(html).toContain("+$12.00")
  })

  it("says No trades for a month with no fills", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <ProfitCalendarWidget className="" overview={overviewWith([])} />
      </TooltipProvider>
    )

    expect(html).toContain("No trades")
  })
})
