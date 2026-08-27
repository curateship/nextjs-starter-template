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
    leverage: 5,
    value: 100,
    profit: 10,
    profitShare: 0.1,
    ...over,
  }
}

function overview(activeTrades: TradingOverviewActiveTrade[]): TradingOverview {
  return {
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

describe("the Active Trades footer", () => {
  it("keeps the sticky header opaque while rows scroll underneath it", () => {
    const html = renderToStaticMarkup(
      <ActiveTradesWidget overview={overview([trade({})])} className="" />
    )

    expect(html).toContain("[&amp;_thead_th]:bg-muted")
    expect(html).not.toContain("[&amp;_thead_th]:bg-muted/50")
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

    expect(footer?.textContent).toContain("Total")
    expect(footer?.textContent).not.toContain("Average")
    expect(footer?.textContent).toContain("$400.00")
    expect(footer?.textContent).toContain("+$8.00")
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
