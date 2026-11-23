// @vitest-environment jsdom

import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}))

import { ActiveTradesWidget } from "@/components/trade/active-trades-widget"
import type {
  TradingOverview,
  TradingOverviewActiveTrade,
} from "@/lib/trade/dashboard/overview"

function trade(
  over: Partial<TradingOverviewActiveTrade>
): TradingOverviewActiveTrade {
  return {
    id: "trade-1",
    walletId: "wallet-1",
    walletLabel: "Main",
    accountType: "Real",
    protocol: "Hyperliquid",
    marketKey: "hyperliquid:mainnet:BTC",
    market: "BTC",
    side: "long",
    orderKind: "manual",
    value: 100,
    profit: 10,
    profitShare: 0.1,
    ...over,
  }
}

function overview(activeTrades: TradingOverviewActiveTrade[]): TradingOverview {
  return {
    readAt: 0,
    wallets: [],
    fills: [],
    activeTrades,
    activeTradesUnavailable: [],
    bots: [],
    profit: [],
    missingVenues: [],
    unpricedFills: 0,
  }
}

describe("the Active Trades widget", () => {
  it("shows the requested ticker, type, value, and P/L columns", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget
        overview={overview([
          trade({ id: "long" }),
          trade({ id: "short", side: "short" }),
        ])}
        className=""
      />
    )
    const document = new DOMParser().parseFromString(html, "text/html")
    const headings = Array.from(document.querySelectorAll("thead th")).map(
      (heading) => heading.textContent
    )
    const rows = Array.from(document.querySelectorAll("tbody tr")).map(
      (row) => row.textContent
    )

    expect(headings).toEqual(["Ticker", "Type", "Order", "Value", "P/L"])
    expect(document.querySelectorAll("tbody tr:first-child td")).toHaveLength(5)
    expect(rows.some((row) => row?.includes("Long"))).toBe(true)
    expect(rows.some((row) => row?.includes("Short"))).toBe(true)
    expect(rows.every((row) => !row?.includes("Hyperliquid"))).toBe(true)
    expect(rows.every((row) => !row?.includes("Main"))).toBe(true)
    expect(rows.every((row) => row?.includes("Manual"))).toBe(true)
  })

  it("uses the standard panel bars for its heading and footer", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget overview={overview([trade({})])} className="" />
    )
    const document = new DOMParser().parseFromString(html, "text/html")
    const title = document.querySelector('[data-slot="dashboard-card-header"]')
    const table = document.querySelector('[data-slot="table-container"]')
    const footer = document.querySelector("tfoot tr")

    expect(title?.className).toContain("border-b-0")
    expect(table?.className).toContain("color-mix")
    expect(footer?.className).toContain("border-y")
    expect(footer?.className).toContain("color-mix")
  })

  it("labels pretend accounts without repeating Real on live trades", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget
        overview={overview([
          trade({ id: "real" }),
          trade({ id: "testnet", accountType: "Testnet" }),
          trade({ id: "practice", accountType: "Practice" }),
        ])}
        className=""
      />
    )

    expect(html).not.toContain(">Real<")
    expect(html).toContain(">Testnet<")
    expect(html).toContain(">Practice<")
  })

  it("shows the total for the rows in the widget", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget
        overview={overview([
          trade({ id: "btc" }),
          trade({
            id: "eth",
            marketKey: "hyperliquid:mainnet:ETH",
            market: "ETH",
            value: 300,
            profit: -2,
            profitShare: -0.02,
          }),
        ])}
        className=""
      />
    )
    const document = new DOMParser().parseFromString(html, "text/html")
    const footer = document.querySelector("tfoot")

    expect(footer?.querySelectorAll("td")).toHaveLength(5)
    expect(footer?.textContent).toContain("Total")
    expect(footer?.textContent).not.toContain("Average")
    expect(footer?.textContent).toContain("$400.00")
    expect(footer?.textContent).toContain("+$8.00")
  })

  it("names the order managing an active trade", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget
        overview={overview([
          trade({ id: "ladder", orderKind: "dca" }),
          trade({ id: "grid", orderKind: "grid" }),
          trade({ id: "signal", orderKind: "signal" }),
        ])}
        className=""
      />
    )

    expect(html).toContain("DCA ladder")
    expect(html).toContain("Grid")
    expect(html).toContain("Signal")
  })

  it("does not turn a missing market price into a partial tally", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget
        overview={overview([
          trade({ id: "priced" }),
          trade({
            id: "unpriced",
            marketKey: "hyperliquid:mainnet:ETH",
            market: "ETH",
            value: null,
            profit: null,
            profitShare: null,
          }),
        ])}
        className=""
      />
    )
    const document = new DOMParser().parseFromString(html, "text/html")

    expect(
      document.querySelector("tfoot")?.textContent?.match(/—/g)
    ).toHaveLength(2)
  })

  it("does not add a warning row for a wallet that did not answer", () => {
    const unavailable = overview([trade({ id: "priced" })])
    unavailable.activeTradesUnavailable = ["Live"]
    const html = renderToStaticMarkup(
      <ActiveTradesWidget overview={unavailable} className="" />
    )

    expect(html).not.toContain("Could not read Live")
    expect(html).not.toContain("active trades may be missing")
    expect(html).toContain("BTC")
  })

  it("leaves the footer out when there are no shown trades", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget overview={overview([])} className="" />
    )

    expect(html).not.toContain("<tfoot")
    expect(html).toContain("No active trades across your wallets.")
  })
})
