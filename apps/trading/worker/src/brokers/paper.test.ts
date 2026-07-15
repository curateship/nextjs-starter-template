import { describe, expect, it } from "vitest"
import type { L2BookWsEvent, TradesWsEvent } from "@nktkas/hyperliquid"

import type { MarketHub } from "../market-hub"
import type { BrokerFill } from "../strategies/contract"
import { PaperBroker } from "./paper"

describe("PaperBroker resting fills", () => {
  it("uses the aggressing side and caps each fill by printed trade size", () => {
    let onBook: (book: L2BookWsEvent) => void = () => undefined
    let onTrades: (trades: TradesWsEvent) => void = () => undefined
    const hub = {
      subscribeBook: (
        _network: string,
        _coin: string,
        listener: typeof onBook
      ) => {
        onBook = listener
        return () => {}
      },
      subscribeTrades: (
        _network: string,
        _coin: string,
        listener: typeof onTrades
      ) => {
        onTrades = listener
        return () => {}
      },
    } as unknown as MarketHub
    const fills: BrokerFill[] = []
    const broker = new PaperBroker({
      network: "testnet",
      coin: "TEST",
      startingCash: 10_000,
      hub,
      onFill: (fill) => fills.push(fill),
    })
    broker.start()
    onBook({
      coin: "TEST",
      time: 1,
      levels: [[{ px: "99", sz: "10", n: 1 }], [{ px: "102", sz: "10", n: 1 }]],
    } as L2BookWsEvent)
    broker.place("sell", {
      purpose: "wall:entry",
      side: "sell",
      orderType: "limit",
      px: "101",
      sz: "1",
      tif: "Alo",
      reduceOnly: false,
    })

    onTrades([
      { coin: "TEST", side: "A", px: "101", sz: "0.8", time: 2 },
      { coin: "TEST", side: "B", px: "101", sz: "0.4", time: 3 },
      { coin: "TEST", side: "B", px: "101", sz: "0.6", time: 4 },
    ] as TradesWsEvent)

    expect(fills.map((fill) => fill.sz)).toEqual(["0.4", "0.6"])
    expect(fills.map((fill) => fill.remainingSz)).toEqual(["0.6", "0"])
    expect(fills.map((fill) => fill.orderStatus)).toEqual([
      "partially_filled",
      "filled",
    ])
    expect(broker.openOrderCount()).toBe(0)
  })
})
