import { describe, expect, it } from "vitest"

import type { BrokerFill, DesiredOrder } from "../strategies/contract"
import { BacktestBroker } from "./broker"

function makeBroker(startingCash = 10_000) {
  const fills: { fill: BrokerFill; purpose: string; cloid: string }[] = []
  let time = 1_000
  const broker = new BacktestBroker({
    startingCash,
    getTime: () => time,
    onFill: (fill, purpose, cloid) => fills.push({ fill, purpose, cloid }),
  })
  return { broker, fills, setTime: (t: number) => (time = t) }
}

function order(partial: Partial<DesiredOrder>): DesiredOrder {
  return {
    purpose: "test",
    side: "buy",
    orderType: "limit",
    sz: "1",
    tif: "Gtc",
    reduceOnly: false,
    ...partial,
  }
}

describe("BacktestBroker", () => {
  it("fills a market order at the current price with the taker fee", () => {
    const { broker, fills } = makeBroker()
    broker.setPrice(100)
    const placement = broker.place(
      "c1",
      order({ orderType: "market", tif: "Ioc", sz: "2" })
    )
    expect(placement).toEqual({ kind: "filled" })
    expect(fills).toHaveLength(1)
    expect(fills[0].fill.px).toBe("100")
    expect(Number(fills[0].fill.fee)).toBeCloseTo(100 * 2 * 0.00045, 10)
    expect(broker.positionState()).toEqual({ szi: "2", entryPx: "100" })
  })

  it("rests a limit away from price and fills it at the limit price (maker) when the bar crosses", () => {
    const { broker, fills } = makeBroker()
    broker.setPrice(110)
    const placement = broker.place("c1", order({ side: "buy", px: "100", sz: "1" }))
    expect(placement).toEqual({ kind: "resting" })
    expect(fills).toHaveLength(0)

    broker.matchBar(99) // bar low dips to/below the buy limit
    expect(fills).toHaveLength(1)
    expect(fills[0].fill.px).toBe("100")
    expect(Number(fills[0].fill.fee)).toBeCloseTo(100 * 1 * 0.00015, 10)
  })

  it("rejects a post-only limit that would cross", () => {
    const { broker } = makeBroker()
    broker.setPrice(100)
    const placement = broker.place(
      "c1",
      order({ side: "buy", px: "105", tif: "Alo" })
    )
    expect(placement.kind).toBe("rejected")
  })

  it("caps a reduce-only order at the position and rejects wrong-direction reduce", () => {
    const { broker, fills } = makeBroker()
    broker.setPrice(100)
    broker.place("open", order({ orderType: "market", tif: "Ioc", sz: "2" }))
    // Reduce-only sell larger than the position closes exactly the position.
    broker.setPrice(110)
    broker.place(
      "close",
      order({ orderType: "market", tif: "Ioc", side: "sell", sz: "5", reduceOnly: true })
    )
    expect(broker.positionState()).toBeNull()
    const closing = fills[fills.length - 1].fill
    expect(closing.sz).toBe("2")
    expect(Number(closing.closedPnl)).toBeCloseTo((110 - 100) * 2, 10)

    // A reduce-only order in the wrong direction while flat is rejected.
    const rejected = broker.place(
      "bad",
      order({ orderType: "market", tif: "Ioc", side: "sell", reduceOnly: true })
    )
    expect(rejected.kind).toBe("rejected")
  })

  it("applies slippage and custom fees to taker fills but not maker fills", () => {
    const fills: { fill: BrokerFill }[] = []
    const broker = new BacktestBroker({
      startingCash: 10_000,
      getTime: () => 1_000,
      onFill: (fill) => fills.push({ fill }),
      takerFeeRate: 0.001,
      makerFeeRate: 0.0005,
      slippageRate: 0.001, // 10 bps
    })
    broker.setPrice(100)
    broker.place("t1", order({ orderType: "market", tif: "Ioc", sz: "1" }))
    // Buy slips up: 100 · 1.001 = 100.1, fee at the taker rate on that px.
    expect(Number(fills[0].fill.px)).toBeCloseTo(100.1, 10)
    expect(Number(fills[0].fill.fee)).toBeCloseTo(100.1 * 0.001, 10)

    // Resting maker fill: exact limit price, maker fee, no slippage.
    broker.setPrice(110)
    broker.place("t2", order({ side: "sell", px: "115", sz: "1" }))
    broker.matchBar(116)
    expect(Number(fills[1].fill.px)).toBe(115)
    expect(Number(fills[1].fill.fee)).toBeCloseTo(115 * 0.0005, 10)
  })

  it("leaves un-crossed resting orders in place on matchBar", () => {
    const { broker, fills } = makeBroker()
    broker.setPrice(110)
    broker.place("c1", order({ side: "buy", px: "100" }))
    broker.matchBar(105) // never reaches 100
    expect(fills).toHaveLength(0)
    expect(broker.openOrderCount()).toBe(1)
  })
})
