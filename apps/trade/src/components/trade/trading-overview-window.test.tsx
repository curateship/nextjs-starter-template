// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/trading-overview", () => ({
  loadTradingOverviewPage: vi.fn(),
}))

import { TradingOverviewDashboard } from "@/components/trade/trading-overview-dashboard"
import { TooltipProvider } from "@/components/ui/tooltip"
import { loadTradingOverviewPage } from "@/lib/api/trade/trading-overview"
import type { TradingOverview } from "@/lib/trade/dashboard/overview"

/**
 * What the dashboard actually says about when it started counting.
 *
 * The arithmetic is pinned in `lib/trade/profit-window.test.ts`; this file
 * covers the half that kept going wrong on screen — the words. Twice the
 * period was correct underneath and still read "two days ago" in the widget,
 * because the phrase was typed into the sentence instead of worked out. PnL
 * Graph now names its period as real dates on its dates button, so this
 * renders the real widget on two different days and reads those dates back.
 */

const overview: TradingOverview = {
  readAt: new Date("2026-08-24T16:00:00.000Z").getTime(),
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
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  })
  window.localStorage.clear()
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("what the widgets say about when they started", () => {
  it("puts the result for the selected row in the card's header", () => {
    const shown = show("2026-08-24T16:00:00.000Z")
    expect(shown).toContain("Profit and loss · All wallets")
    expect(shown).toContain("+$190.00+3.65%")
    expect(
      host.querySelector('[aria-label="Current made or lost"] > .font-mono')
        ?.className
    ).toContain("text-3xl")
    const chart = host.querySelector(
      'section[aria-label="All wallets profit history"]'
    )
    const result = host.querySelector('[aria-label="Current made or lost"]')
    const header = host.querySelector('[data-slot="dashboard-card-header"]')
    expect(header?.contains(result)).toBe(true)
    expect(chart?.contains(result)).toBe(false)
    expect(chart?.textContent).toContain(
      "Balance$5,200.00Settled+$150.00Open+$40.00Fees$3.00"
    )
    expect(shown).not.toContain("PnL Graph")
    expect(shown).not.toContain("1 wallet")
    expect(shown).toContain("1D1W1M3M6MAll")
    expect(shown).toContain("Aug 20 – Aug 24, 2026")
  })

  it("filters 1D to today and names the day on the dates button", async () => {
    show("2026-08-24T16:00:00.000Z")
    const today = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "1D"
    )

    await act(async () => {
      today?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })

    expect(
      host.querySelector('[role="tab"][aria-selected="true"]')?.textContent
    ).toBe("1D")
    expect(
      host.querySelector('button[aria-label^="Dates shown"]')?.textContent
    ).toBe("Aug 24, 2026")
  })

  it("moves the dates button with the calendar", async () => {
    show("2026-08-25T16:00:00.000Z")
    const today = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "1D"
    )
    await act(async () => {
      today?.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      )
    })
    expect(
      host.querySelector('button[aria-label^="Dates shown"]')?.textContent
    ).toBe("Aug 25, 2026")
  })

  it("selects All wallets first and makes the whole card follow the selection", () => {
    const secondWallet: TradingOverview["wallets"][number] = {
      ...overview.wallets[0],
      id: "alpha",
      label: "Alpha",
      summary: {
        walletId: "alpha",
        state: "ok",
        equity: 1_000,
        free: 1_000,
        inTrades: 0,
        openProfit: 0,
        madeOrLost: -20,
        settled: -20,
        unpricedFills: 0,
      },
      performance: { settled: -20, fees: 1, open: 0, madeOrLost: -20 },
    }
    show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [...overview.wallets, secondWallet],
    })
    const walletButtons = [
      ...host.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ]

    expect(walletButtons).toHaveLength(3)
    expect(walletButtons[0].textContent).toContain("All wallets")
    expect(walletButtons[0].getAttribute("aria-pressed")).toBe("true")
    expect(walletButtons[0].className).toContain("bg-muted")
    expect(walletButtons[1].className).toContain("cursor-pointer")
    expect(host.textContent).toContain("+$170.00")

    const alpha = walletButtons.find((button) =>
      button.textContent?.includes("Alpha")
    )
    act(() => alpha?.click())

    expect(walletButtons[0].getAttribute("aria-pressed")).toBe("false")
    expect(alpha?.getAttribute("aria-pressed")).toBe("true")
    expect(host.textContent).toContain("Profit and loss · Alpha")
    expect(host.textContent).toContain("-$20.00-2.00%")
    expect(
      host.querySelector('section[aria-label="Alpha profit history"]')
        ?.textContent
    ).toContain("Balance$1,000.00Settled-$20.00Open$0.00Fees$1.00")
  })

  it("folds wallets holding nothing under Show empty wallets", () => {
    const emptyWallet: TradingOverview["wallets"][number] = {
      ...overview.wallets[0],
      id: "empty",
      label: "Empty one",
      summary: {
        walletId: "empty",
        state: "ok",
        equity: 0,
        free: 0,
        inTrades: 0,
        openProfit: 0,
        madeOrLost: 0,
        settled: 0,
        unpricedFills: 0,
      },
      performance: { settled: 0, fees: 0, open: 0, madeOrLost: 0 },
      profit: [],
    }
    show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [...overview.wallets, emptyWallet],
    })

    expect(host.textContent).toContain("2 connected")
    expect(host.textContent).not.toContain("Empty one")
    const toggle = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Show 1 empty wallet"
    )
    act(() => toggle?.click())
    expect(host.textContent).toContain("Empty one")
    expect(host.textContent).toContain("Hide 1 empty wallet")
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
    expect(shown).not.toContain("3 wallets")
    expect(shown).not.toContain("4 wallets")
    expect(shown).toContain("1 connected · 2 missing")
    expect(shown).toContain("Phemex did not answer")
    expect(shown).toContain("2 missing")
  })

  it("keeps the card useful before a real wallet has any trades", () => {
    const shown = show("2026-08-24T16:00:00.000Z", {
      ...overview,
      wallets: [],
      profit: [],
    })

    expect(shown).toContain("0 connected")
    expect(shown).not.toContain("0 wallets")
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
    expect(
      host.querySelector('[data-slot="dashboard-card-header"]')?.className
    ).toContain("border-b-0")
    expect(
      host.querySelector('[data-slot="table-container"]')?.className
    ).toContain("color-mix")
  })
})

describe("keeping the overview current", () => {
  it("replaces the figures after one refresh", async () => {
    const fresh: TradingOverview = {
      ...overview,
      readAt: new Date("2026-08-24T16:00:15.000Z").getTime(),
      wallets: overview.wallets.map((wallet) => ({
        ...wallet,
        summary:
          wallet.summary.state === "ok"
            ? { ...wallet.summary, openProfit: 80 }
            : wallet.summary,
        performance: wallet.performance
          ? { ...wallet.performance, open: 80, madeOrLost: 230 }
          : null,
      })),
    }
    vi.mocked(loadTradingOverviewPage).mockResolvedValue({
      overview: fresh,
      layout: { top: ["equity"], left: [], right: [] },
    })
    show("2026-08-24T16:00:00.000Z")

    await act(async () => vi.advanceTimersByTimeAsync(15_000))

    expect(loadTradingOverviewPage).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain("+$230.00")
    expect(host.textContent).toContain("Open+$80.00")
  })

  it("keeps the last good figures when a refresh fails", async () => {
    vi.mocked(loadTradingOverviewPage).mockRejectedValue(
      new Error("exchange unavailable")
    )
    show("2026-08-24T16:00:00.000Z")

    await act(async () => vi.advanceTimersByTimeAsync(15_000))

    expect(host.textContent).toContain("+$190.00")
    expect(host.textContent).toContain("Open+$40.00")
    expect(host.textContent).not.toContain("+$0.00")
  })

  it("pauses while hidden and makes one catch-up read when shown", async () => {
    vi.mocked(loadTradingOverviewPage).mockResolvedValue({
      overview,
      layout: { top: ["equity"], left: [], right: [] },
    })
    show("2026-08-24T16:00:00.000Z")
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    })
    document.dispatchEvent(new Event("visibilitychange"))

    await act(async () => vi.advanceTimersByTimeAsync(60_000))
    expect(loadTradingOverviewPage).not.toHaveBeenCalled()

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    })
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"))
      await Promise.resolve()
    })

    expect(loadTradingOverviewPage).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(loadTradingOverviewPage).toHaveBeenCalledTimes(1)
  })
})
