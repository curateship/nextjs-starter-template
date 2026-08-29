// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  MarketHeader,
  type MarketSelection,
} from "@/components/trade/market-header"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketKey, MarketRow } from "@/lib/protocols/contracts"
import { minimumOrderLabel } from "@/lib/trade/market-info"

/**
 * The star at the head of the market header.
 *
 * The empty Fav folder tells you to press "the star beside its name", so the
 * header has to have one for every market it can chart — and none of the
 * header's other three states may grow one, because there is no market there
 * to star. It leads the row, ahead of the market's own art.
 */

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

function header(selection: MarketSelection, favorites: string[]) {
  return (
    <TooltipProvider>
      <MarketHeader
        selection={selection}
        markets={[row]}
        folders={[
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "Fav",
            isFav: true,
            position: 0,
            hidden: false,
            marketKeys: favorites,
          },
        ]}
        folderActions={{
          busy: false,
          quickAdd: () => {},
          toggle: async () => {},
          create: async () => true,
        }}
        onSelectMarket={() => {}}
      />
    </TooltipProvider>
  )
}

function draw(selection: MarketSelection, favorites: string[]): string {
  return renderToStaticMarkup(header(selection, favorites))
}

describe("the market header's star", () => {
  it("names the exchange, network and quote asset and offers market rules", () => {
    const markup = draw(market, [])
    expect(markup.match(/bg-muted\/60/g)?.length).toBeGreaterThanOrEqual(2)
    expect(markup).toContain("BTC-USDC")
    expect(markup).toContain("text-xs font-medium text-muted-foreground")
    expect(markup).toContain("Hyperliquid")
    expect(markup).toContain("Mainnet")
    expect(markup).toContain(
      'aria-label="About BTC market, Hyperliquid, Mainnet"'
    )
  })

  it("uses the same light gray as the other header buttons", () => {
    const host = document.createElement("div")
    host.innerHTML = draw(market, [])
    const picker = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose market"]'
    )

    expect(picker?.className.split(/\s+/)).not.toContain("bg-muted")
    expect(picker?.parentElement?.className).toContain("bg-muted/60")
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
  })

  it("shows the market's daily dollar volume in its information tooltip", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => root.render(header(market, [])))
    const info = host.querySelector<HTMLButtonElement>(
      'button[aria-label="About BTC market, Hyperliquid, Mainnet"]'
    )!
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      )
      info.focus()
    })

    expect(document.body.textContent).toContain("Daily volume: $1.00m")

    await act(async () => root.unmount())
    host.remove()
  })

  it("offers to star the market on screen, naming it", () => {
    const markup = draw(market, [])
    expect(markup).toContain('aria-label="Add BTC to Fav"')
    expect(markup).toContain('aria-pressed="false"')
  })

  it("opens the folder choices for a market that is already saved", () => {
    const markup = draw(market, [key])
    expect(markup).toContain('aria-label="Choose folders for BTC"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("fills the star only when the market is starred, so colour is not the only difference", () => {
    expect(draw(market, [key])).toContain("fill-current")
    expect(draw(market, [])).not.toContain("fill-current")
  })

  it("leads the header row: the star, then the market's art, then its name", () => {
    const markup = draw(market, [])
    const star = markup.indexOf('aria-label="Add BTC to Fav"')
    // No logo on this row, so the art is the first-letter circle.
    const art = markup.indexOf("rounded-full")
    const name = markup.indexOf(">BTC-USDC<")
    expect(star).toBeLessThan(art)
    expect(art).toBeLessThan(name)
  })
})
