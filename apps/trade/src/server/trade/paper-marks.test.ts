import { describe, expect, it } from "vitest"

import { defaultPaperCosts } from "@/lib/trade/paper"
import type { PaperOrder, PaperPosition } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  closeBar,
  freeCash,
  settleMarket,
  type WalletBook,
} from "@/server/trade/paper"

/**
 * What the book is worth WHILE a bar is being walked.
 *
 * **A bar is not a moment.** On 10 October 2025 coins fell eighty percent and
 * came back inside one four-hour candle. Valuing the book at that candle's
 * close while its own wick was still filling orders turned the recovery into
 * money to spend — one replay filled 208 rungs across 67 coins on a wallet
 * holding $10,151, and the pot went from $10,151 to $119,175 in that single
 * bar. Nothing inside a bar may be valued at the price it ended on.
 */

const BTC = "hyperliquid:mainnet:BTC"
const ETH = "hyperliquid:mainnet:ETH"
const MINUTE = 60_000

const wallet: TradeWallet = {
  id: "w1",
  label: "Practice",
  kind: "paper",
  status: "active",
  protocol: "hyperliquid",
  network: "mainnet",
  startingBalance: 10_000,
  address: null,
  hasKey: false,
  keyValidUntil: null,
}

function order(px: number, sz: number): PaperOrder {
  return {
    id: `o-${px}`,
    walletId: "w1",
    marketKey: BTC,
    side: "buy",
    px,
    sz,
    leverage: 1,
    maxLeverage: 1,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** A ladder's worth of waiting buys on one coin. */
function rungs(market: string): PaperOrder[] {
  return [
    [90, 55],
    [70, 71],
    [50, 100],
  ].map(([px, sz]) => ({ ...order(px, sz), id: `o-${market}-${px}`, marketKey: market }))
}

function bookWith(orders: PaperOrder[]): WalletBook {
  return {
    wallet,
    costs: defaultPaperCosts(),
    cash: 10_000,
    marks: new Map([[BTC, 100]]),
    positions: new Map<string, PaperPosition>(),
    orders,
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    entryLimit: null,
    openedAt: [],
    crashEntry: { cascading: false, leastLeverage: null },
    addedOrders: [],
    ordersVersion: 0,
  }
}

describe("what a book is worth while a bar is walked", () => {
  it("will not let a bar's own recovery pay for buying inside it", () => {
    // Two waiting buys that together cost more than the wallet holds, and one
    // candle that wicks through both before closing far above where it began.
    const book = bookWith([order(90, 66), order(80, 66)])
    settleMarket(book, BTC, {
      bars: [
        { openTime: MINUTE, open: 100, high: 200, low: 78, close: 200, volume: 1 },
      ],
      barMs: MINUTE,
      // A replay never has a price "right now" — only what the bar said.
      mark: null,
      now: 2 * MINUTE,
    })

    // One of them. The second was dropped for want of cash, whatever the bar
    // went on to close at.
    const held = book.positions.get(BTC)
    expect(held?.szi).toBeCloseTo(66, 6)
    expect(book.orders).toHaveLength(0)
  })

  it("will not spend one coin's recovery on the next coin's rungs", () => {
    // **10 October 2025, in miniature.** Two coins, both with rungs down the
    // ladder, and one candle that falls to 14 and closes at 500. Marking a
    // coin at that close while the rest of the list is still being walked
    // hands the next coin a wallet fattened by a recovery that has not
    // happened yet — which is how one replay bought $125,274 of coin on a
    // wallet holding $10,151, 208 fills across 67 coins in a single bar.
    //
    // Before this rule the same case bought $29,840 on a $10,000 wallet at 1×.
    const book = bookWith([
      ...rungs(BTC),
      ...rungs(ETH),
    ])
    book.marks.set(ETH, 100)
    const bar = {
      openTime: MINUTE,
      open: 100,
      high: 500,
      low: 14,
      close: 500,
      volume: 1,
    }
    for (const market of [BTC, ETH]) {
      settleMarket(book, market, { bars: [bar], barMs: MINUTE, mark: null, now: 2 * MINUTE })
    }

    const spend = (market: string) => {
      const held = book.positions.get(market)
      return held ? Math.abs(held.szi) * held.entryPx : 0
    }
    // At 1× the wallet cannot hold more coin than it has money, however the
    // bar ends.
    expect(spend(BTC) + spend(ETH)).toBeLessThanOrEqual(10_000 + 1e-6)
    // And the second coin gets what is left, which here is nothing.
    expect(spend(ETH)).toBe(0)
  })

  it("stops buying as the coin falls through the bar", () => {
    // The 10 October shape: a wallet of $10,000 with rungs all the way down,
    // and one candle that falls 85% and comes back. Each fill is checked
    // against a book valued at the price the fall has REACHED, so the money
    // runs out on the way down instead of buying every rung.
    const book = bookWith([
      order(90, 55),
      order(70, 71),
      order(50, 100),
      order(30, 166),
      order(15, 333),
    ])
    settleMarket(book, BTC, {
      bars: [
        { openTime: MINUTE, open: 100, high: 101, low: 14, close: 100, volume: 1 },
      ],
      barMs: MINUTE,
      mark: null,
      now: 2 * MINUTE,
    })

    const held = book.positions.get(BTC)
    const spent = held ? Math.abs(held.szi) * held.entryPx : 0
    // At 1× the wallet cannot hold more coin than it has money.
    expect(spent).toBeLessThanOrEqual(10_000 + 1e-6)
  })

  it("is worth the bar's close only once every coin has been walked", () => {
    // Settling one coin says nothing about what it is worth to the wallet yet
    // — the rest of the list is still being walked through the same four
    // hours. `closeBar` is what ends the bar, and the replay calls it after
    // the loop.
    const book = bookWith([])
    const bar = { openTime: MINUTE, open: 100, high: 200, low: 78, close: 200, volume: 1 }
    settleMarket(book, BTC, { bars: [bar], barMs: MINUTE, mark: null, now: 2 * MINUTE })
    expect(book.marks.get(BTC)).toBe(100)

    closeBar(book, new Map([[BTC, bar.close]]))
    expect(book.marks.get(BTC)).toBe(200)
  })

  it("counts an open loss against what is left to spend", () => {
    const book = bookWith([])
    book.positions.set(BTC, {
      id: "p1",
      walletId: "w1",
      marketKey: BTC,
      szi: 50,
      entryPx: 100,
      leverage: 1,
      maxLeverage: 1,
      tpPx: null,
      slPx: null,
      feesPaid: 0,
      updatedAt: 0,
    })
    // $5,000 of margin against $10,000 of cash, and the coin has halved.
    book.marks.set(BTC, 50)
    expect(freeCash(book)).toBeCloseTo(10_000 - 2_500 - 5_000, 6)
  })
})
