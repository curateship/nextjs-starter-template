// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  BlockColumnsProvider,
  BlockHiddenColumns,
} from "@/components/trade/block-columns"
import { WatchedOrdersList } from "@/components/trade/watched-orders-list"
import {
  readHiddenBlockColumns,
  type HiddenBlockColumns,
} from "@/lib/trade/block-columns"
import type { MarketRow } from "@/lib/protocols/contracts"
import type { TradePosition } from "@/lib/trade/paper"

/**
 * Hiding columns from a trade block's ⋮ (Tyler, 10 Nov 2026: "I want to hide
 * avatar, type value and pnl"). Each block keeps its own list, and the table
 * and its totals row drop the same columns so every sum stays under its own
 * heading.
 */

describe("readHiddenBlockColumns", () => {
  it("keeps known blocks and columns, once each, in the menu's order", () => {
    expect(
      readHiddenBlockColumns({
        "grid-trades": ["pnl", "avatar", "pnl", "ticker"],
        "dca-trades": [],
        rules: ["type"],
      })
    ).toEqual({ "grid-trades": ["avatar", "pnl"] })
  })

  it("reads anything else as nothing hidden", () => {
    expect(readHiddenBlockColumns(null)).toEqual({})
    expect(readHiddenBlockColumns(["avatar"])).toEqual({})
    expect(readHiddenBlockColumns({ "manual-trades": "avatar" })).toEqual({})
  })
})

const held: TradePosition = {
  id: "p1",
  walletId: "w1",
  marketKey: "hyperliquid:mainnet:SOL",
  szi: 4,
  entryPx: 90,
  leverage: 2,
  maxLeverage: 20,
  targets: [],
  tpPx: null,
  slPx: null,
  feesPaid: 1,
  updatedAt: 1,
}

const sol = {
  key: held.marketKey,
  marketId: "SOL",
  symbol: "SOL",
  quoteAsset: "USDC",
  subExchange: null,
  category: "crypto",
  sizeDecimals: 3,
  priceTick: null,
  minOrderValueUsd: null,
  maxLeverage: 20,
  isolatedOnly: false,
  iconUrl: null,
  price: 100,
  change24h: 0,
  volume24hUsd: 1_000_000,
  fundingHourly: null,
  openInterestUsd: null,
} satisfies MarketRow

function draw(hidden: HiddenBlockColumns, block: "manual-trades" | "grid-trades") {
  const host = document.createElement("div")
  host.innerHTML = renderToStaticMarkup(
    <BlockColumnsProvider value={{ hidden, change: () => {} }}>
      <BlockHiddenColumns block={block}>
        <WatchedOrdersList
          orders={[]}
          positions={[held]}
          smartOrders={[]}
          markets={[sol]}
          cacheScope="test:hyperliquid"
          refusals={new Map()}
          walletName={() => "Main"}
          settled
          failed={false}
          onRetry={() => {}}
          onSelectMarket={() => {}}
          selectedKey={null}
        />
      </BlockHiddenColumns>
    </BlockColumnsProvider>
  )
  return {
    headings: [...host.querySelectorAll("thead th")].map((cell) => cell.textContent?.trim()),
    rowCells: host.querySelectorAll("tbody tr:first-child td").length,
    totalCells: host.querySelectorAll("tfoot td").length,
    html: host.innerHTML,
  }
}

describe("a trade block's hidden columns", () => {
  it("shows every column when the block hides none", () => {
    const table = draw({}, "manual-trades")
    expect(table.headings).toEqual(["Ticker", "Type", "Value", "PnL"])
    expect(table.rowCells).toBe(4)
    expect(table.totalCells).toBe(4)
  })

  it("drops a hidden column from the headings, the rows and the totals", () => {
    const table = draw({ "manual-trades": ["type", "pnl"] }, "manual-trades")
    expect(table.headings).toEqual(["Ticker", "Value"])
    expect(table.rowCells).toBe(2)
    expect(table.totalCells).toBe(2)
  })

  it("takes the coin's picture off the ticker when Avatar is hidden", () => {
    // With no picture saved, the coin's picture is its first letter in a circle.
    const picture = (html: string) => {
      const host = document.createElement("div")
      host.innerHTML = html
      return host.querySelectorAll("tbody td:first-child .rounded-full").length
    }
    expect(picture(draw({}, "manual-trades").html)).toBe(1)
    expect(picture(draw({ "manual-trades": ["avatar"] }, "manual-trades").html)).toBe(0)
  })

  it("leaves a block alone when another block hides columns", () => {
    expect(draw({ "grid-trades": ["type"] }, "manual-trades").headings).toEqual([
      "Ticker",
      "Type",
      "Value",
      "PnL",
    ])
  })
})
