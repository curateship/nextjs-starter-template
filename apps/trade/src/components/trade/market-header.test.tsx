import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  MarketHeader,
  type MarketSelection,
} from "@/components/trade/market-header"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketKey, MarketRow } from "@/lib/protocols/contracts"

/**
 * The star at the head of the market header.
 *
 * The empty Fav tab tells you to press "the star beside its name", so the
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

function draw(selection: MarketSelection, favorites: string[]): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <MarketHeader
        selection={selection}
        markets={[row]}
        favorites={new Set(favorites)}
        onToggleFavorite={() => {}}
        onSelectMarket={() => {}}
      />
    </TooltipProvider>
  )
}

describe("the market header's star", () => {
  it("names the exchange, network and quote asset and offers market rules", () => {
    const markup = draw(market, [])
    expect(markup).toContain("BTC-USDC")
    expect(markup).toContain("Hyperliquid")
    expect(markup).toContain("Mainnet")
    expect(markup).toContain('aria-label="About BTC market"')
  })

  it("offers to star the market on screen, naming it", () => {
    const markup = draw(market, [])
    expect(markup).toContain('aria-label="Add BTC to Fav"')
    expect(markup).toContain('aria-pressed="false"')
  })

  it("offers to unstar a market that is already starred", () => {
    const markup = draw(market, [key])
    expect(markup).toContain('aria-label="Remove BTC from Fav"')
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
    const name = markup.indexOf('aria-label="Choose market"')
    expect(star).toBeLessThan(art)
    expect(art).toBeLessThan(name)
  })

  it("shows no star when there is no market to star", () => {
    for (const selection of [
      { kind: "none" },
      { kind: "missing", marketId: "BTC" },
      { kind: "volume-hidden", marketId: "BTC" },
    ] satisfies MarketSelection[]) {
      expect(draw(selection, [key])).not.toContain("Fav")
    }
  })
})
