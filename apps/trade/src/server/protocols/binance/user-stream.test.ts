import { describe, expect, it } from "vitest"

import { binanceMarksOf } from "@/server/protocols/binance/live-prices"
import {
  binanceStreamFill,
  binanceStreamStop,
} from "@/server/protocols/binance/user-stream"

const trade = {
  e: "ORDER_TRADE_UPDATE",
  o: {
    s: "1000PEPEUSDT",
    S: "SELL",
    x: "TRADE",
    X: "FILLED",
    i: 77,
    l: "500",
    L: "0.0102",
    n: "0.002",
    T: 1_790_000_000_000,
    t: 901,
    rp: "0.35",
    o: "MARKET",
    ot: "STOP_MARKET",
  },
}

describe("Binance account stream", () => {
  it("reads a fill whether or not Binance wraps it", () => {
    const expected = {
      fillId: "901",
      orderId: "77",
      marketId: "kPEPE",
      side: "sell",
      px: 0.0102,
      sz: 500,
      at: 1_790_000_000_000,
      closedPnl: 0.35,
      fee: 0.002,
      dir: "Close long",
      liquidation: false,
    }
    expect(binanceStreamFill(trade)).toEqual(expected)
    expect(binanceStreamFill({ stream: "key", data: trade })).toEqual(expected)
  })

  it("ignores an order update that is not a trade", () => {
    expect(binanceStreamFill({ ...trade, o: { ...trade.o, x: "NEW" } })).toBeNull()
  })

  it("remembers which plain order a fired stop became", () => {
    expect(
      binanceStreamStop({ e: "ALGO_UPDATE", o: { o: "STOP_MARKET", ai: "77", tp: "0.0101", X: "TRIGGERED" } })
    ).toEqual({ orderId: "77", info: { kind: "stop", triggerPx: 0.0101 } })
    expect(binanceStreamStop({ e: "ALGO_UPDATE", o: { o: "STOP_MARKET", ai: "" } })).toBeNull()
  })
})

describe("Binance pushed marks", () => {
  it("keys every mark by the app's coin name", () => {
    expect(
      binanceMarksOf([
        { e: "markPriceUpdate", s: "BTCUSDT", p: "84340.1" },
        { e: "markPriceUpdate", s: "1000PEPEUSDT", p: "0.0101" },
        { e: "markPriceUpdate", s: "BADUSDT", p: "0" },
      ])
    ).toEqual(new Map([["BTC", 84340.1], ["kPEPE", 0.0101]]))
  })
})
