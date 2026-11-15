// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  MarketInfoFacts,
  type MarketSelection,
} from "@/components/trade/market-header"
import type { MarketKey, MarketRow } from "@/lib/protocols/contracts"
import { minimumOrderLabel } from "@/lib/trade/market-info"

/**
 * The market's facts, drawn as the Market info block on the market's page
 * (the Admin 3 panel design, 7 Nov 2026).
 */

// The header asks the window how wide it is, to decide between the one-row
// phone layout and the full row. jsdom has no `matchMedia`, and the hook's
// server answer — a desktop — is the layout these tests are about.
window.matchMedia = ((query: string) =>
  ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }) as unknown as MediaQueryList) as typeof window.matchMedia

vi.mock("@/lib/trade/use-pinned-markets", () => ({
  usePinnedMarkets: () => ({
    pins: [],
    loaded: true,
    busy: false,
    store: { setPin: vi.fn() },
  }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
  }: {
    children: React.ReactNode
    search: { network: string }
  }) => <a href={`?network=${search.network}`}>{children}</a>,
}))

const key = "hyperliquid:mainnet:BTC" as MarketKey

const row: MarketRow = {
  key,
  marketId: "BTC",
  symbol: "BTC",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 40,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0.01,
  volume24hUsd: 1_000_000,
  fundingHourly: null,
  openInterestUsd: null,
}

const market: MarketSelection = {
  kind: "market",
  row,
  protocolLabel: "Hyperliquid",
  networkLabel: "Mainnet",
  picker: {
    categories: "full",
    hip3: true,
    funding: true,
    openInterest: true,
  },
}

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

function draw(selection: MarketSelection): string {
  return renderToStaticMarkup(<MarketInfoFacts selection={selection} />)
}

describe("the market's facts", () => {
  it("names the exchange and network, the daily volume and the top leverage", () => {
    const markup = draw(market)
    expect(markup).toContain("Hyperliquid")
    expect(markup).toContain("Mainnet")
    expect(markup).toContain("$1.00m")
    expect(markup).toContain("40×")
  })

  it("adds a selected pool's liquidity only when the venue gives one", () => {
    expect(draw(market)).not.toContain("Pool liquidity")
    expect(
      draw({ ...market, row: { ...market.row, liquidityUsd: 2_000_000 } })
    ).toContain("$2.00m")
  })

  it("states a market's smallest dollar order when the venue gives one", () => {
    expect(minimumOrderLabel({ ...row, minOrderValueUsd: 5 })).toBe(
      "Smallest order: $5"
    )
    expect(minimumOrderLabel(row)).toBeNull()
    expect(
      minimumOrderLabel({
        ...row,
        price: 77_114.30360888,
        minOrderValueUsd: 5,
        minOrderSize: 0.001,
      })
    ).toBe("Smallest order now: $77.12")
    expect(draw({ ...market, row: { ...row, minOrderValueUsd: 5 } })).toContain(
      "Smallest order"
    )
  })
})
