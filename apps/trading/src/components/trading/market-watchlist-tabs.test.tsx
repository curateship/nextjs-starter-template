import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { MarketWatchlist } from "@/components/trading/market-watchlist"
import type { MarketRow } from "@/lib/hl/hooks"

function market(coin: string, volume = "1000000"): MarketRow {
  return {
    coin,
    dex: "",
    dexName: "",
    dexIndex: 0,
    assetIndex: 0,
    assetId: 0,
    category: "crypto",
    collateralToken: 0,
    collateralSymbol: "USDC",
    szDecimals: 2,
    maxLeverage: 20,
    onlyIsolated: false,
    markPx: "110",
    oraclePx: "110",
    prevDayPx: "100",
    funding: "0",
    openInterest: "0",
    dayNtlVlm: volume,
    liveData: true,
  }
}

const ROWS = [market("BTC"), market("ETH"), market("SOL"), market("DOGE")]

function render(
  tab: string,
  sets: {
    positions?: string[]
    orders?: string[]
    alerts?: string[]
    favorites?: string[]
  }
) {
  return renderToStaticMarkup(
    <MarketWatchlist
      rows={ROWS}
      selected="BTC"
      positionMarkets={new Set(sets.positions ?? [])}
      openOrderMarkets={new Set(sets.orders ?? [])}
      alertMarkets={new Set(sets.alerts ?? [])}
      favorites={new Set(sets.favorites ?? [])}
      onToggleFavorite={vi.fn()}
      onSelect={vi.fn()}
      // The first tab in the order is the one that opens.
      initialTabOrder={[tab]}
    />
  )
}

/** Which markets the list is showing, ignoring the tab bar and search box. */
function listed(markup: string): string[] {
  return ROWS.map((row) => row.coin).filter((coin) =>
    markup.includes(`>${coin}</span>`)
  )
}

describe("market watchlist tabs", () => {
  it("offers Active, Open, Fav and Watch — and nothing else", () => {
    const markup = render("active", {})
    for (const label of ["Active", "Open", "Fav", "Watch"]) {
      expect(markup).toContain(`>${label}</button>`)
    }
    expect(markup).not.toContain("Gainers")
    expect(markup).not.toContain("Losers")
    // The category filter is gone with them.
    expect(markup).not.toContain("All categories")
  })

  it("shows positions on Active and unfilled orders on Open", () => {
    expect(listed(render("active", { positions: ["ETH"], orders: ["SOL"] })))
      .toEqual(["ETH"])
    expect(listed(render("orders", { positions: ["ETH"], orders: ["SOL"] })))
      .toEqual(["SOL"])
  })

  it("shows only markets with an alert on Watch", () => {
    const markup = render("watch", { alerts: ["SOL", "DOGE"], favorites: ["ETH"] })
    expect(listed(markup)).toEqual(["SOL", "DOGE"])
  })

  it("says why each tab is empty rather than a bare 'no matches'", () => {
    expect(render("active", {})).toContain("No active positions.")
    expect(render("orders", {})).toContain("No open orders.")
    expect(render("favorites", {})).toContain("No favorite markets.")
    expect(render("watch", {})).toContain("No markets with alerts.")
  })

  it("keeps an alerted market that has no volume, so Watch can list it", () => {
    const quiet = [...ROWS, market("QUIET", "0")]
    const markup = renderToStaticMarkup(
      <MarketWatchlist
        rows={quiet}
        selected="BTC"
        positionMarkets={new Set()}
        openOrderMarkets={new Set()}
        alertMarkets={new Set(["QUIET"])}
        favorites={new Set()}
        onToggleFavorite={vi.fn()}
        onSelect={vi.fn()}
        initialTabOrder={["watch"]}
      />
    )
    expect(markup).toContain(">QUIET</span>")
  })
})
