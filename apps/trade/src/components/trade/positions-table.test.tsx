import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"
import type { MarketRow } from "@/lib/protocols/contracts"
import type { PaperPosition } from "@/lib/trade/paper"

/**
 * The answers an empty bottom-panel table can give, told apart.
 *
 * "Nothing here", "still reading" and "could not read" are different answers,
 * and only the first is safe to act on. These render each table with no rows
 * in each state and check the words: a table that is still waiting or failed
 * must never show the empty state's "No open positions", because that is a
 * claim about money it has not looked at.
 *
 * **Still reading includes half-read.** These tables draw practice rows and
 * real ones together, and the two halves of the read land separately. `settled`
 * is both of them being in; the half that landed first is not an answer, and a
 * table that treats it as one says "No open positions" while real ones are on
 * their way. See `settled` on `Trading`.
 */

const shared = {
  markets: new Map(),
  walletName: () => "Practice",
  busy: false,
  onSelectMarket: () => {},
  onRetry: () => {},
}

function market(symbol: string, price: number): MarketRow {
  return {
    key: `hyperliquid:mainnet:${symbol}`,
    marketId: symbol,
    symbol,
    quoteAsset: "USDC",
    subExchange: null,
    category: "crypto",
    sizeDecimals: 2,
    priceTick: null,
    minOrderValueUsd: null,
    maxLeverage: 10,
    isolatedOnly: false,
    iconUrl: null,
    price,
    change24h: null,
    volume24hUsd: 0,
    fundingHourly: null,
    openInterestUsd: null,
  }
}

function position(symbol: string, size: number): PaperPosition {
  return {
    id: symbol,
    walletId: "practice",
    marketKey: `hyperliquid:mainnet:${symbol}`,
    szi: size,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 10,
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
  }
}

function drawPositions(state: { settled: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <PositionsTable
      {...shared}
      {...state}
      positions={[]}
      onEdit={() => {}}
      onFlip={() => {}}
      onClose={() => {}}
    />
  )
}

function drawOrders(state: { settled: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <OpenOrdersTable {...shared} {...state} orders={[]} onCancel={() => {}} />
  )
}

function drawTrades(state: { settled: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <TradesTable
      {...shared}
      {...state}
      trades={[]}
      selectedId={null}
      onSelectTrade={() => {}}
      onRemove={() => {}}
    />
  )
}

describe("the bottom panel's tables say what they know", () => {
  it("opens positions with the largest unrealized profit first", () => {
    const markets = [market("BTC", 150), market("ETH", 110), market("SOL", 80)]
    const html = renderToStaticMarkup(
      <PositionsTable
        {...shared}
        markets={new Map(markets.map((one) => [one.key, one]))}
        positions={[
          position("SOL", 10),
          position("ETH", 2),
          position("BTC", 1),
        ]}
        settled={true}
        failed={false}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
      />
    )

    expect(html.indexOf(">BTC</button>")).toBeLessThan(
      html.indexOf(">ETH</button>")
    )
    expect(html.indexOf(">ETH</button>")).toBeLessThan(
      html.indexOf(">SOL</button>")
    )
  })

  it("claims empty only after a read has landed", () => {
    expect(drawPositions({ settled: true, failed: false })).toContain(
      "No open positions"
    )
    expect(drawOrders({ settled: true, failed: false })).toContain(
      "No open orders"
    )
    expect(drawTrades({ settled: true, failed: false })).toContain(
      "No finished trades yet"
    )
  })

  it("says it is still reading until BOTH halves are in, inside the table frame", () => {
    for (const [draw, label] of [
      [drawPositions, "Reading what you are holding"],
      [drawOrders, "Reading your open orders"],
      [drawTrades, "Reading your finished trades"],
    ] as const) {
      const html = draw({ settled: false, failed: false })
      expect(html).toContain(label)
      // The real header is already up, so nothing moves when the rows land.
      expect(html).toContain("<thead>")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })

  it("says the read failed, with a retry, never that things are empty", () => {
    for (const draw of [drawPositions, drawOrders, drawTrades]) {
      const html = draw({ settled: true, failed: true })
      expect(html).toContain("could not be read")
      expect(html).toContain("Try again")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })
})
