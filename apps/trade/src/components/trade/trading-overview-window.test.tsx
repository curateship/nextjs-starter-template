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
      profit: [
        { at: new Date("2026-08-20T04:00:00.000Z").getTime(), money: 0 },
        { at: new Date("2026-08-24T16:00:00.000Z").getTime(), money: 190 },
      ],
    },
  ],
  fills: [],
  activeTrades: [],
  activeTradesUnavailable: [],
  bots: [],
  profit: [],
  missingVenues: [],
  unpricedFills: 0,
}

let host: HTMLDivElement
let root: Root

function show(on: string, shownOverview = overview) {
  vi.setSystemTime(new Date(on))
  act(() => {
    root.render(
      <TooltipProvider>
        <TradingOverviewDashboard
          overview={shownOverview}
          layout={{ top: ["equity"], left: [], right: [] }}
        />
      </TooltipProvider>
    )
  })
  return host.textContent ?? ""
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
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
  it("replaces the separate money cards with PnL Graph", () => {
    const shown = show("2026-08-24T16:00:00.000Z")
    expect(shown).toContain("PnL Graph")
    expect(shown).toContain("1W1M3M6MAll")
    expect(shown).toContain("Reset")
    expect(shown).not.toContain("Total balance")
  })

  it("selects All wallets first and lets another wallet be selected", () => {
    show("2026-08-24T16:00:00.000Z")
    const walletButtons = [
      ...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ]

    expect(walletButtons).toHaveLength(2)
    expect(walletButtons[0].textContent).toContain("All wallets")
    expect(walletButtons[0].getAttribute("aria-pressed")).toBe("true")
    expect(walletButtons[0].className).toContain("bg-muted/60")
    expect(walletButtons[0].className).toContain("border-r-foreground")
    expect(walletButtons[1].className).toContain("border-r-transparent")
    expect(walletButtons[1].className).toContain("cursor-pointer")
    const accountBreakdown = host.querySelector(
      '[aria-label="All wallets current breakdown"]'
    )
    expect(accountBreakdown).not.toBeNull()
    expect(
      accountBreakdown?.closest("section")?.getAttribute("aria-label")
    ).toBe("Wallets")
    expect(
      host.querySelector(
        '[aria-label="Money over time"] [aria-label$="current breakdown"]'
      )
    ).toBeNull()

    act(() => walletButtons[1].click())

    expect(walletButtons[0].getAttribute("aria-pressed")).toBe("false")
    expect(walletButtons[1].getAttribute("aria-pressed")).toBe("true")
    expect(walletButtons[1].className).toContain("bg-muted/60")
    expect(walletButtons[0].className).toContain("border-r-transparent")
    expect(walletButtons[1].className).toContain("border-r-foreground")
    expect(
      host.querySelector('[aria-label="Main current breakdown"]')
    ).not.toBeNull()
  })

  it("sorts wallet columns and remembers the choice", () => {
    const secondWallet: TradingOverview["wallets"][number] = {
      ...overview.wallets[0],
      id: "alpha",
      label: "Alpha",
      summary: {
        walletId: "alpha",
        state: "ok",
        equity: 5_010,
        free: 5_010,
        inTrades: 0,
        openProfit: 0,
        madeOrLost: 10,
        settled: 10,
        unpricedFills: 0,
      },
      performance: { settled: 10, fees: 1, open: 0, madeOrLost: 10 },
    }
    show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [...overview.wallets, secondWallet],
    })

    const walletHeader = host.querySelector<HTMLButtonElement>(
      'button[aria-label^="Sort wallets by wallet"]'
    )
    expect(walletHeader).not.toBeNull()
    act(() => walletHeader?.click())

    const walletRows = [
      ...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ]
    expect(walletRows[1].textContent).toContain("Alpha")
    expect(walletRows[2].textContent).toContain("Main")
    expect(window.localStorage.getItem("trade-overview-wallet-sort")).toBe(
      "wallet-asc"
    )
  })

  it("reads four days ago on 24 August 2026", () => {
    expect(show("2026-08-24T16:00:00.000Z")).toContain("since 4 days ago")
  })

  it("reads five days ago the next day, with nothing rebuilt", () => {
    // The whole failure was a sentence that stayed still while the calendar
    // moved. One day later the same widget must say something different.
    expect(show("2026-08-25T16:00:00.000Z")).toContain("since 5 days ago")
  })

  it("never says two days ago again", () => {
    const shown = show("2026-08-24T16:00:00.000Z")
    expect(shown).not.toContain("two days ago")
    expect(shown).not.toContain("2 days ago")
  })

  it("hides switched-off wallets and keeps unreachable wallets honest", () => {
    const shown = show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [
        ...overview.wallets,
        {
          id: "off",
          label: "Off wallet",
          network: "mainnet",
          venue: "Aster",
          startingBalance: 1_000,
          summary: { walletId: "off", state: "inactive" },
          performance: null,
          profit: null,
        },
        {
          id: "missing",
          label: "Missing wallet",
          network: "mainnet",
          venue: "Phemex",
          startingBalance: 1_000,
          summary: { walletId: "missing", state: "unreachable" },
          performance: null,
          profit: null,
        },
        {
          id: "also-missing",
          label: "Also missing",
          network: "mainnet",
          venue: "Phemex",
          startingBalance: 1_000,
          summary: { walletId: "also-missing", state: "unreachable" },
          performance: null,
          profit: null,
        },
      ],
      missingVenues: ["Phemex"],
    })

    expect(shown).not.toContain("Off wallet")
    expect(shown).not.toContain("Switched off")
    expect(shown).toContain("Phemex did not answer")
    expect(shown).toContain("2 missing")
  })

  it("keeps the card useful before a real wallet has any trades", () => {
    const shown = show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [],
      profit: [],
    })

    expect(shown).toContain("0 wallets")
    expect(shown).toContain("No real trades have been recorded yet.")
  })

  it("uses the shared trade badges for buys and sells", () => {
    vi.setSystemTime(new Date("2026-08-24T16:00:00.000Z"))
    const fills: TradingOverview["fills"] = [
      {
        fillId: "buy-1",
        walletId: "main",
        walletLabel: "Main",
        venue: "Hyperliquid",
        market: "BTC",
        side: "buy",
        px: 65_000,
        sz: 0.01,
        at: new Date("2026-08-24T15:00:00.000Z").getTime(),
        fee: 0.1,
        money: -0.1,
      },
      {
        fillId: "sell-1",
        walletId: "main",
        walletLabel: "Main",
        venue: "Hyperliquid",
        market: "ETH",
        side: "sell",
        px: 3_000,
        sz: 0.1,
        at: new Date("2026-08-24T14:00:00.000Z").getTime(),
        fee: 0.1,
        money: 12,
      },
    ]
    act(() => {
      root.render(
        <TooltipProvider>
          <TradingOverviewDashboard
            overview={{ ...overview, fills }}
            layout={{ top: ["trades"], left: [], right: [] }}
          />
        </TooltipProvider>
      )
    })

    const buy = [...host.querySelectorAll("span")].find(
      (node) => node.textContent === "BUY"
    )
    const sell = [...host.querySelectorAll("span")].find(
      (node) => node.textContent === "SELL"
    )
    expect(buy?.className).toContain("bg-emerald-500/10")
    expect(buy?.className).toContain("rounded-md")
    expect(sell?.className).toContain("bg-destructive/10")
    expect(sell?.className).toContain("rounded-md")
  })
})
