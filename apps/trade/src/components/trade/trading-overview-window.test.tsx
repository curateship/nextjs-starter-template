// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TradingOverviewDashboard } from "@/components/trade/trading-overview-dashboard"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { TradingOverview } from "@/lib/trade/dashboard/overview"

/**
 * What the dashboard actually says about when it started counting.
 *
 * The arithmetic is pinned in `lib/trade/profit-window.test.ts`; this file
 * covers the half that kept going wrong on screen — the words. Twice the
 * period was correct underneath and still read "two days ago" in the widget,
 * because the phrase was typed into the sentence instead of worked out. So
 * this renders the real widget on two different days and reads the text back.
 */

const overview: TradingOverview = {
  wallets: [
    {
      id: "main",
      label: "Main",
      network: "mainnet",
      venue: "Hyperliquid",
      startingBalance: 5_000,
      summary: {
        walletId: "main",
        state: "ok",
        equity: 5_200,
        free: 4_000,
        inTrades: 1_200,
        openProfit: 40,
        madeOrLost: 190,
        settled: 150,
        unpricedFills: 0,
      },
      performance: { settled: 150, fees: 3, open: 40, madeOrLost: 190 },
    },
  ],
  fills: [],
  activeTrades: [],
  activeTradesUnavailable: [],
  profit: [],
  missingVenues: [],
  unpricedFills: 0,
}

let host: HTMLDivElement
let root: Root

function show(on: string) {
  vi.setSystemTime(new Date(on))
  act(() => {
    root.render(
      <TooltipProvider>
        <TradingOverviewDashboard
          overview={overview}
          layout={{ top: ["figures"], left: [], right: [] }}
        />
      </TooltipProvider>
    )
  })
  return host.textContent ?? ""
}

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe("what the widgets say about when they started", () => {
  it("reads four days ago on 24 August 2026", () => {
    expect(show("2026-08-24T16:00:00.000Z")).toContain(
      "from 4 days ago until now"
    )
  })

  it("reads five days ago the next day, with nothing rebuilt", () => {
    // The whole failure was a sentence that stayed still while the calendar
    // moved. One day later the same widget must say something different.
    expect(show("2026-08-25T16:00:00.000Z")).toContain(
      "from 5 days ago until now"
    )
  })

  it("never says two days ago again", () => {
    const shown = show("2026-08-24T16:00:00.000Z")
    expect(shown).not.toContain("two days ago")
    expect(shown).not.toContain("2 days ago")
  })
})
