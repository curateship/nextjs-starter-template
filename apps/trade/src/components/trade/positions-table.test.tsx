// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  OpenOrdersTable,
  PositionsTable,
  TradesTable,
} from "@/components/trade/positions-table"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { MarketRow } from "@/lib/protocols/contracts"
import { orderCancelKind } from "@/lib/trade/cancel-order"
import type { LiveTrade, UnmatchedTradeHistory } from "@/lib/trade/live-trades"
import type { TradeOrder, TradePosition } from "@/lib/trade/paper"
import type { SmartOrder } from "@/lib/trade/smart-plan"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
Object.assign(globalThis, {
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

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

/** Only the positions table reads fills; the other two never see them. */
const positionsShared = {
  ...shared,
  fills: [],
  smartOrders: [],
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

function position(symbol: string, size: number): TradePosition {
  return {
    id: symbol,
    walletId: "practice",
    marketKey: `hyperliquid:mainnet:${symbol}`,
    szi: size,
    entryPx: 100,
    leverage: 1,
    maxLeverage: 10,
    targets: [],
    tpPx: null,
    slPx: null,
    feesPaid: 0,
    updatedAt: 1,
  }
}

function liveOrder(network: "mainnet" | "testnet"): TradeOrder {
  return {
    id: `${network}-order`,
    walletId: "live-wallet",
    marketKey: `hyperliquid:${network}:BTC`,
    side: "buy",
    px: 100,
    sz: 1,
    leverage: 1,
    maxLeverage: 10,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
    createdAt: 1,
    updatedAt: 1,
    live: true,
  }
}

function liveTrade(network: "mainnet" | "testnet"): LiveTrade {
  return {
    id: `${network}-trade`,
    walletId: "live-wallet",
    marketKey: `hyperliquid:${network}:BTC`,
    live: true,
    direction: "long",
    openedAt: 1,
    closedAt: 2,
    heldMs: 1,
    entryPx: 100,
    exitPx: 110,
    sz: 1,
    amountUsd: 100,
    pnl: 10,
    returnPct: 10,
    ending: "closed",
    stopPx: null,
    fills: [],
  }
}

function incompleteHistory(
  symbol: string,
  open: boolean,
  fillCount = 1
): UnmatchedTradeHistory {
  const marketKey = `hyperliquid:mainnet:${symbol}`
  const fill = {
    fillId: `${symbol}-fill`,
    orderId: `${symbol}-order`,
    walletId: "live-wallet",
    marketKey,
    side: "buy" as const,
    px: 100,
    sz: 1,
    at: 1_000,
    closedPnl: 0,
    fee: 0.05,
    dir: "Buy",
    liquidation: false,
    live: true,
  }
  return {
    id: `unpaired:live-wallet:${marketKey}:${fill.fillId}`,
    walletId: "live-wallet",
    marketKey,
    live: true,
    fills: Array.from({ length: fillCount }, (_, index) => ({
      ...fill,
      fillId: `${fill.fillId}-${index}`,
    })),
    open,
    position: open ? { szi: -1, entryPx: 100 } : null,
    firstAt: fill.at,
    lastAt: fill.at,
  }
}

/**
 * The provider the app's root already wraps every screen in. Needed here
 * because the Fees column carries an info mark saying whose figure it is.
 */
function draw(node: React.ReactNode): string {
  return renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>)
}

function drawPositions(state: { settled: boolean; failed: boolean }): string {
  return draw(
    <PositionsTable
      {...positionsShared}
      {...state}
      positions={[]}
      onAdd={() => {}}
      onEdit={() => {}}
      onFlip={() => {}}
      onClose={() => {}}
      onClosePart={() => {}}
      onMargin={null}
    />
  )
}

function drawOrders(state: { settled: boolean; failed: boolean }): string {
  return renderToStaticMarkup(
    <OpenOrdersTable
      {...shared}
      {...state}
      orders={[]}
      onCancel={() => {}}
      onResume={async () => true}
    />
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
      ticked={new Set<string>()}
      onTickTrade={() => {}}
      onTickVisible={() => {}}
      tickAllState={() => false}
    />
  )
}

describe("the bottom panel's tables say what they know", () => {
  it("keeps incomplete and open history visible in the Journal", () => {
    const stale = incompleteHistory("BTC", false, 26)
    const open = incompleteHistory("ETH", true)
    const html = draw(
      <TradesTable
        {...shared}
        trades={[]}
        unmatchedHistory={[stale, open]}
        settled={true}
        failed={false}
        selectedId={null}
        onSelectTrade={() => {}}
        onRemove={() => {}}
        ticked={new Set<string>()}
        onTickTrade={() => {}}
        onTickVisible={() => {}}
        tickAllState={() => false}
      />
    )

    expect(html).toContain("History incomplete")
    expect(html).toContain("Open, history incomplete")
    expect(html).toContain("26 saved fills")
    expect(html).toContain("1 saved fill")
    expect(html).toContain("Unknown")
    expect(html).toContain("First saved")
    expect(html).toContain('aria-label="About incomplete trade history"')
    expect(html).toContain(
      'aria-label="Remove the incomplete BTC history from the Journal"'
    )
    expect(html).not.toContain(
      'aria-label="Remove the incomplete ETH history from the Journal"'
    )
    expect(html).toContain(
      'aria-label="ETH is still open and cannot be removed"'
    )
  })

  it("keeps the Real chip off every mainnet row", () => {
    const mainnetPosition: TradePosition = {
      ...position("BTC", 1),
      walletId: "live-wallet",
      live: {
        marginUsed: 100,
        liquidationPx: 50,
        tpOrderId: null,
        slOrderId: null,
      },
    }
    const positions = draw(
      <PositionsTable
        {...positionsShared}
        positions={[mainnetPosition]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )
    const orders = renderToStaticMarkup(
      <OpenOrdersTable
        {...shared}
        orders={[liveOrder("mainnet")]}
        settled={true}
        failed={false}
        onCancel={() => {}}
        onResume={async () => true}
      />
    )
    const trades = renderToStaticMarkup(
      <TradesTable
        {...shared}
        trades={[liveTrade("mainnet")]}
        settled={true}
        failed={false}
        selectedId={null}
        onSelectTrade={() => {}}
        onRemove={() => {}}
        ticked={new Set<string>()}
        onTickTrade={() => {}}
        onTickVisible={() => {}}
        tickAllState={() => false}
      />
    )

    expect(`${positions}${orders}${trades}`).not.toContain(">Real<")
  })

  it("keeps the Testnet chip on exchange rows", () => {
    const html = renderToStaticMarkup(
      <OpenOrdersTable
        {...shared}
        orders={[liveOrder("testnet")]}
        settled={true}
        failed={false}
        onCancel={() => {}}
        onResume={async () => true}
      />
    )

    expect(html).toContain(">Testnet<")
  })

  it("hands the live exchange row to its cancel action", async () => {
    const live: TradeOrder = {
      id: "aster-order-77",
      walletId: "live-wallet",
      marketKey: "aster:mainnet:SOLUSDT",
      side: "sell",
      px: 144,
      sz: 0.1,
      leverage: 0,
      maxLeverage: 0,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      live: true,
    }
    const cancelled: TradeOrder[] = []
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <OpenOrdersTable
          {...shared}
          orders={[live]}
          settled={true}
          failed={false}
          onCancel={(order) => cancelled.push(order)}
          onResume={async () => true}
        />
      )
    })
    const cancel = host.querySelector<HTMLButtonElement>(
      '[aria-label="Cancel the SOLUSDT order"]'
    )
    expect(cancel).not.toBeNull()
    await act(async () => cancel?.click())

    expect(cancelled).toEqual([live])
    expect(orderCancelKind(cancelled[0])).toBe("live")
    await act(async () => root.unmount())
  })

  it("sends one press on a watched row through the watched-order cancel path", async () => {
    const watched: TradeOrder = {
      id: "new-watch",
      walletId: "live-wallet",
      marketKey: "aster:mainnet:ETHUSDT",
      side: "buy",
      px: 1995,
      sz: 0.1,
      leverage: 1,
      maxLeverage: 1,
      reduceOnly: false,
      tpPx: null,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
    }
    const cancelKinds: string[] = []
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <OpenOrdersTable
          {...shared}
          orders={[watched]}
          settled={true}
          failed={false}
          onCancel={(order) => cancelKinds.push(orderCancelKind(order))}
          onResume={async () => true}
        />
      )
    })
    const cancel = host.querySelector<HTMLButtonElement>(
      '[aria-label="Cancel the ETHUSDT order"]'
    )
    expect(cancel).not.toBeNull()
    await act(async () => cancel?.click())

    expect(cancelKinds).toEqual(["watch"])
    await act(async () => root.unmount())
  })

  it("says a watched row is paused and sends Resume to the watch, not the cancel", async () => {
    // A half close of SOL that Hyperliquid refused five times on 2 Sep 2026.
    // Nothing rests on the exchange, so the row is the only place to see it
    // stopped and start it again.
    const paused: TradeOrder = {
      id: "watch-sol",
      walletId: "live-wallet",
      marketKey: "hyperliquid:mainnet:SOL",
      side: "buy",
      px: 99.45,
      sz: 25.95,
      leverage: 1,
      maxLeverage: 20,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
      createdAt: 1,
      updatedAt: 1,
      watched: true,
      paused: true,
    }
    const resumed: string[] = []
    const cancelled: string[] = []
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <OpenOrdersTable
          {...shared}
          orders={[paused]}
          settled={true}
          failed={false}
          onCancel={(order) => cancelled.push(order.id)}
          onResume={async (order) => {
            resumed.push(order.id)
            return true
          }}
        />
      )
    })
    expect(host.textContent).toContain("Paused")
    const resume = host.querySelector<HTMLButtonElement>(
      '[aria-label="Resume the SOL order"]'
    )
    expect(resume).not.toBeNull()
    await act(async () => resume?.click())

    expect(resumed).toEqual(["watch-sol"])
    expect(cancelled).toEqual([])
    await act(async () => root.unmount())
  })

  it("ticks Journal rows for a mass remove without firing the row", async () => {
    const trade = (id: string, symbol: string): LiveTrade => ({
      id,
      walletId: "practice",
      marketKey: `hyperliquid:mainnet:${symbol}`,
      live: false,
      direction: "long",
      openedAt: 1,
      closedAt: 2,
      heldMs: 1,
      entryPx: 100,
      exitPx: 110,
      sz: 1,
      amountUsd: 100,
      pnl: 10,
      returnPct: 10,
      ending: "closed",
      stopPx: null,
      fills: [],
    })
    const ticked: string[] = []
    const tickedAll: string[][] = []
    const opened: string[] = []
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TradesTable
          {...shared}
          trades={[trade("one", "BTC"), trade("two", "ETH")]}
          settled={true}
          failed={false}
          selectedId={null}
          onSelectTrade={(chosen) => opened.push(chosen.id)}
          onRemove={() => {}}
          ticked={new Set<string>()}
          onTickTrade={(id) => ticked.push(id)}
          onTickVisible={(ids) => tickedAll.push(ids)}
          tickAllState={() => false}
          onLoadOlder={() => {}}
        />
      )
    })

    const rowTick = host.querySelector<HTMLButtonElement>(
      '[aria-label="Select the BTC trade"]'
    )
    expect(rowTick).not.toBeNull()
    await act(async () => rowTick?.click())
    const headerTick = host.querySelector<HTMLButtonElement>(
      '[aria-label="Select every removable Journal row"]'
    )
    expect(headerTick).not.toBeNull()
    await act(async () => headerTick?.click())

    expect(ticked).toEqual(["one"])
    expect(tickedAll).toEqual([["one", "two"]])
    // Ticking is never also a press on the row that draws it on the chart.
    expect(opened).toEqual([])
    expect(host.querySelector("tfoot tr")?.className).toContain(
      "border-y bg-muted/50"
    )
    await act(async () => root.unmount())
  })

  it("opens positions with the largest unrealized profit first", () => {
    const markets = [market("BTC", 150), market("ETH", 110), market("SOL", 80)]
    const html = draw(
      <PositionsTable
        {...positionsShared}
        markets={new Map(markets.map((one) => [one.key, one]))}
        positions={[
          position("SOL", 10),
          position("ETH", 2),
          position("BTC", 1),
        ]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )

    expect(html.indexOf(">BTC</button>")).toBeLessThan(
      html.indexOf(">ETH</button>")
    )
    expect(html.indexOf(">ETH</button>")).toBeLessThan(
      html.indexOf(">SOL</button>")
    )
  })

  it("marks a settled position that has no stop", () => {
    const html = draw(
      <PositionsTable
        {...positionsShared}
        positions={[position("BTC", 1)]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )

    expect(html).toContain("No stop")
  })

  it("draws a coin that is simply owned as held, not levered, and never warns it has no stop", () => {
    // A Solana holding: no leverage, no liquidation, no record of what it
    // cost, and on the second row no price either. Nothing can act on it
    // yet, so no buttons are offered.
    const jup = "solana:mainnet:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
    const stray = "solana:mainnet:124L55JoFbitT9aAEYwfencH1Puqa1UnKuGZWU2cRiZZ"
    const owned = (marketKey: string, szi: number, priced: boolean) => ({
      ...position(marketKey, szi),
      marketKey,
      entryPx: priced ? 0.2 : 0,
      live: {
        marginUsed: 0,
        liquidationPx: null,
        tpOrderId: null,
        slOrderId: null,
      },
      owned: { entryKnown: false, priced },
    })
    const markets = new Map(positionsShared.markets)
    markets.set(jup, { ...market("JUP", 0.2), key: jup })
    const html = draw(
      <PositionsTable
        {...positionsShared}
        markets={markets}
        positions={[owned(jup, 1_125.365, true), owned(stray, 100, false)]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )
    // The list's own ticker, not the shortened mint.
    expect(html).toContain(">JUP<")
    expect(html).toContain("Owned 1,125.365")
    expect(html).not.toContain("Long 1×")
    expect(html).not.toContain("No stop")
    // A price but no entry: worth shows, profit does not.
    expect(html).toContain("$225.07")
    // No price at all: says so rather than $0.00.
    expect(html).toContain("Unpriced")
    // An owned coin can be bought more of and sold outright, and nothing
    // else: no short to turn into, no leverage, no stop or target to edit.
    expect(html).toContain("Add to the")
    expect(html).toContain("Sell all the")
    expect(html).not.toContain("Close the")
    expect(html).not.toContain("stop and target")
    expect(html).not.toContain("leverage and margin")
    expect(html).not.toContain("position around")
  })

  it("explains the missing-stop mark on keyboard focus", async () => {
    const host = document.createElement("div")
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <PositionsTable
            {...positionsShared}
            positions={[position("BTC", 1)]}
            settled={true}
            failed={false}
            onAdd={() => {}}
            onEdit={() => {}}
            onFlip={() => {}}
            onClose={() => {}}
            onClosePart={() => {}}
            onMargin={null}
          />
        </TooltipProvider>
      )
    })

    const warning = host.querySelector<HTMLButtonElement>(
      '[aria-label="BTC has no stop"]'
    )
    expect(warning?.textContent).toBe("No stop")
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      )
      warning?.focus()
    })
    expect(document.body.textContent).toContain("This position has no stop.")

    await act(async () => root.unmount())
    host.remove()
  })

  it("does not mark a position that has a stop", () => {
    const html = draw(
      <PositionsTable
        {...positionsShared}
        positions={[{ ...position("BTC", 1), slPx: 90 }]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )

    expect(html).not.toContain("No stop")
  })

  it("says what a position loses, or banks, if its stop fires now", () => {
    const btc = market("BTC", 100)
    const drawWithStop = (slPx: number | null) =>
      draw(
        <PositionsTable
          {...positionsShared}
          markets={new Map([[btc.key, btc]])}
          positions={[{ ...position("BTC", 2), slPx }]}
          settled={true}
          failed={false}
          onAdd={() => {}}
          onEdit={() => {}}
          onFlip={() => {}}
          onClose={() => {}}
          onClosePart={() => {}}
          onMargin={null}
        />
      )

    // Two coins at $100, stop at $90: $10 a coin, $20 in all.
    expect(drawWithStop(90)).toContain(">-$20.00<")
    // The stop has moved above the price, so firing it banks a gain.
    expect(drawWithStop(105)).toContain(">+$10.00<")
    // No stop, so no figure — a dash, never a made-up zero.
    const cells = drawWithStop(null).split("<td ")
    expect(cells[6]).toContain("—")
  })

  it("reads the If stopped figure from a running grid's stop", () => {
    const btc = market("BTC", 100)
    const held = position("BTC", 2)
    const html = draw(
      <PositionsTable
        {...positionsShared}
        markets={new Map([[btc.key, btc]])}
        positions={[held]}
        smartOrders={[
          {
            id: "grid-1",
            kind: "grid",
            status: "active",
            walletId: held.walletId,
            marketKey: held.marketKey,
            plan: {
              direction: "long",
              topPx: 120,
              bottomPx: 80,
              stopLoss: { mode: "fixed", underPct: 5, px: 75, base: null },
              baseWatch: null,
            },
          } as unknown as SmartOrder,
        ]}
        settled={true}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )

    expect(html).toContain(">-$50.00<")
    expect(html).not.toContain("No stop")
  })

  it("sorts If stopped with the biggest loss first and no stop last", async () => {
    const markets = [market("BTC", 100), market("ETH", 100), market("SOL", 100)]
    const host = document.createElement("div")
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <TooltipProvider>
          <PositionsTable
            {...positionsShared}
            markets={new Map(markets.map((one) => [one.key, one]))}
            positions={[
              { ...position("SOL", 1), slPx: null },
              { ...position("ETH", 1), slPx: 95 },
              { ...position("BTC", 1), slPx: 80 },
            ]}
            settled={true}
            failed={false}
            onAdd={() => {}}
            onEdit={() => {}}
            onFlip={() => {}}
            onClose={() => {}}
            onClosePart={() => {}}
            onMargin={null}
          />
        </TooltipProvider>
      )
    })

    const heading = Array.from(host.querySelectorAll("th button")).find(
      (one) => one.textContent?.trim() === "If stopped"
    ) as HTMLButtonElement | undefined
    expect(heading).toBeDefined()
    await act(async () => heading?.click())

    const order = Array.from(host.querySelectorAll("td button"))
      .map((one) => one.textContent)
      .filter((text) => text === "BTC" || text === "ETH" || text === "SOL")
    expect(order).toEqual(["BTC", "ETH", "SOL"])
    await act(async () => root.unmount())
  })

  it("does not mark a position until both halves of the first read have landed", () => {
    const html = draw(
      <PositionsTable
        {...positionsShared}
        positions={[position("BTC", 1)]}
        settled={false}
        failed={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onFlip={() => {}}
        onClose={() => {}}
        onClosePart={() => {}}
        onMargin={null}
      />
    )

    expect(html).not.toContain("No stop")
  })

  it("claims empty only after a read has landed, and keeps its headings", () => {
    for (const [draw, words] of [
      [drawPositions, "No open positions"],
      [drawOrders, "No open orders"],
      [drawTrades, "No trade history yet"],
    ] as const) {
      const html = draw({ settled: true, failed: false })
      expect(html).toContain(words)
      // The heading row stays put, so closing the last position does not take
      // the columns off screen and jog the whole panel.
      expect(html).toContain("<thead ")
      expect(html).toContain("Market")
      // Inside the table's frame, under the headings — not instead of them.
      expect(html.indexOf("<thead ")).toBeLessThan(html.indexOf(words))
    }
  })

  /**
   * The Journal has eleven columns and thousands of rows. Scrolled, its
   * headings used to leave with the rows, and a column of dollars with nothing
   * written over it answers nothing. Every heading cell is pinned to the top of
   * the box it scrolls in, and pinned cells have rows sliding under them — so
   * an opaque background is part of the fix, not decoration. A half-transparent
   * tint would let the numbers read through the words.
   */
  it("pins every heading cell, over a background that hides the rows", () => {
    for (const draw of [drawPositions, drawOrders, drawTrades]) {
      const html = draw({ settled: true, failed: false })
      const headings = html
        .slice(html.indexOf("<thead "), html.indexOf("</thead>"))
        .split("<th ")
        .slice(1)
      expect(headings.length).toBeGreaterThan(1)
      for (const cell of headings) {
        expect(cell).toContain("sticky")
        expect(cell).toContain("top-0")
        // Mixed with the surface behind it rather than a tint over it.
        expect(cell).toContain("color-mix")
        expect(cell).not.toContain("bg-muted/50")
      }
    }
  })

  it("uses the heading's one hairline instead of stacking the first row's border", () => {
    for (const draw of [drawPositions, drawOrders, drawTrades]) {
      const html = draw({ settled: true, failed: false })
      const body = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"))
      expect(body).toContain("[&amp;&gt;tr:first-child]:border-t-0")
    }
  })

  it("says it is still reading until BOTH halves are in, inside the table frame", () => {
    for (const [draw, label] of [
      [drawPositions, "Reading what you are holding"],
      [drawOrders, "Reading your open orders"],
      [drawTrades, "Reading your trade history"],
    ] as const) {
      const html = draw({ settled: false, failed: false })
      expect(html).toContain(label)
      // The real header is already up, so nothing moves when the rows land.
      expect(html).toContain("<thead ")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })

  it("says the read failed, with a retry, never that things are empty", () => {
    for (const draw of [drawPositions, drawOrders, drawTrades]) {
      const html = draw({ settled: true, failed: true })
      expect(html).toContain("could not be read")
      expect(html).toContain("Try again")
      expect(html).toContain("<thead ")
      expect(html).not.toContain("No open")
      expect(html).not.toContain("No finished")
    }
  })
})
