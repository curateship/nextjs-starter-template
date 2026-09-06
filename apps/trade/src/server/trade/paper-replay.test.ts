import { describe, expect, it } from "vitest"
import type { CandleBar } from "@/lib/protocols/contracts"
import {
  defaultPaperCosts,
  type TradeOrder,
  type TradePosition,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  fill,
  settleMarket,
  type WalletBook,
} from "@/server/trade/paper-replay"

const BTC = "hyperliquid:mainnet:BTC"
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

function order(px: number, sz: number): TradeOrder {
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

function bookWith(orders: TradeOrder[]): WalletBook {
  return {
    wallet,
    costs: defaultPaperCosts(),
    cash: 10_000,
    marks: new Map([[BTC, 100]]),
    positions: new Map<string, TradePosition>(),
    orders,
    fills: [],
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    entryLimit: null,
    openedAt: [],
    liquidatedThisPass: new Set(),
    crashEntry: { cascading: false, leastLeverage: null },
    addedOrders: [],
    ordersVersion: 0,
  }
}

function holding(short = false): WalletBook {
  const book = bookWith([])
  book.costs = { makerFeeRate: 0, takerFeeRate: 0, slippageRate: 0 }
  fill(book, {
    marketKey: BTC,
    side: short ? "sell" : "buy",
    px: 100,
    sz: 1,
    leverage: 1,
    maxLeverage: 1,
    feeRate: 0,
    reason: "order",
    at: 0,
    brackets: { slPx: short ? 105 : 95, tpPx: short ? 90 : 110 },
  })
  book.fills = []
  return book
}

function replay(book: WalletBook, prices: Partial<CandleBar>) {
  settleMarket(book, BTC, {
    bars: [
      {
        openTime: MINUTE,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
        volume: 1,
        ...prices,
      },
    ],
    barMs: MINUTE,
    mark: null,
    now: 2 * MINUTE,
  })
}

describe("fair fills in historical candles", () => {
  it.each([
    [false, { open: 93, high: 94, low: 91, close: 92 }, 93],
    [true, { open: 107, high: 109, low: 106, close: 108 }, 107],
    [false, { open: 93, high: 101, low: 92, close: 100 }, 93],
  ] as const)(
    "fills a skipped stop at the opening price, short=%s",
    (short, prices, px) => {
      const book = holding(short)
      replay(book, prices)
      expect(book.fills).toMatchObject([{ reason: "stop_loss", px }])
      expect(book.positions.size).toBe(0)
    }
  )

  it("charges slippage and taker fees on the opening price", () => {
    const book = holding()
    book.costs = { makerFeeRate: 0, takerFeeRate: 0.01, slippageRate: 0.01 }
    replay(book, { open: 90, high: 92, low: 88, close: 91 })
    expect(book.fills[0].px).toBeCloseTo(89.1)
    expect(book.fills[0].fee).toBeCloseTo(0.891)
  })

  it.each([99, 101])(
    "gives both brackets to the stop when the candle closes at %s",
    (close) => {
      const book = holding()
      replay(book, { high: 112, low: 93, close })
      expect(book.fills).toMatchObject([{ reason: "stop_loss", px: 95 }])
    }
  )

  it.each([
    [{ low: 94 }, "stop_loss", 95],
    [{ high: 112 }, "take_profit", 110],
    [{ open: 115, high: 117, low: 114, close: 116 }, "take_profit", 110],
  ] as const)(
    "fills an isolated exit at its own price",
    (prices, reason, px) => {
      const book = holding()
      replay(book, prices)
      expect(book.fills).toMatchObject([{ reason, px }])
    }
  )

  it("fills a skipped resting buy at its limit without awarding the better open", () => {
    const book = bookWith([order(95, 1)])
    replay(book, { open: 90, high: 92, low: 88, close: 91 })
    expect(book.fills).toMatchObject([{ reason: "order", px: 95 }])
  })

  it("settles a skipped liquidation before a waiting buy can change the average", () => {
    const book = holding()
    const held = book.positions.get(BTC)!
    book.positions.set(BTC, {
      ...held,
      leverage: 2,
      maxLeverage: 10,
      slPx: null,
    })
    book.orders.push(order(80, 1))
    replay(book, { open: 40, high: 42, low: 38, close: 41 })
    expect(book.fills).toMatchObject([
      { reason: "liquidated", px: 40 },
      { reason: "order", px: 80 },
    ])
  })

  it("stops a new gap entry before the candle can recover", () => {
    const book = bookWith([{ ...order(100, 1), slPx: 95 }])
    replay(book, { open: 90, high: 102, low: 89, close: 101 })
    expect(book.fills).toMatchObject([
      { reason: "order", px: 100 },
      { reason: "stop_loss", px: 90 },
    ])
  })

  it.each([99, 101])(
    "gives a short's bracket tie to the stop at close %s",
    (close) => {
      const book = holding(true)
      replay(book, { high: 107, low: 88, close })
      expect(book.fills).toMatchObject([{ reason: "stop_loss", px: 105 }])
    }
  )

  it("walks separate minutes in their known order", () => {
    const book = holding()
    replay(book, { high: 111, low: 99, close: 110 })
    replay(book, {
      openTime: 2 * MINUTE,
      open: 110,
      high: 110,
      low: 90,
      close: 92,
    })
    expect(book.fills).toMatchObject([{ reason: "take_profit", px: 110 }])
  })

  it("does not fill an order created after the candle opened", () => {
    const book = bookWith([{ ...order(95, 1), updatedAt: MINUTE + 1 }])
    replay(book, { open: 90, high: 92, low: 88, close: 91 })
    expect(book.fills).toEqual([])
  })
})
