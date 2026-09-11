import { describe, expect, it } from "vitest"

import {
  orderStopGroups,
  orderTargetGroups,
  stopMerges,
  type OrderLineGroup,
} from "@/lib/trade/order-line-groups"
import type { TradeOrder } from "@/lib/trade/paper"

function order(
  id: string,
  px: number,
  slPx: number | null,
  extra: Partial<TradeOrder> = {}
): TradeOrder {
  return {
    id,
    walletId: "wallet",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy",
    px,
    sz: 1,
    leverage: 1,
    maxLeverage: 50,
    reduceOnly: false,
    tpPx: null,
    slPx,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  }
}

/** The ids in a group, for reading an expectation at a glance. */
function ids(group: OrderLineGroup): string[] {
  return group.orders.map((one) => one.id)
}

describe("orderStopGroups", () => {
  it("puts two buys with stops a hair apart on one line", () => {
    const groups = orderStopGroups([
      order("a", 100, 90),
      order("b", 104, 91),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].price).toBe(91)
    expect(ids(groups[0])).toEqual(["a", "b"])
    expect(groups[0].movable).toBe(true)
  })

  it("takes the stop that loses least, which is the lower one on a short", () => {
    const groups = orderStopGroups([
      order("a", 100, 110, { side: "sell" }),
      order("b", 100, 108, { side: "sell" }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].price).toBe(108)
  })

  it("leaves an order out when the winning stop is above what it buys at", () => {
    const groups = orderStopGroups([order("cheap", 92, 90), order("dear", 120, 95)])
    expect(groups).toHaveLength(2)
    expect(ids(groups[0])).toEqual(["cheap"])
    expect(groups[0].price).toBe(90)
    expect(ids(groups[1])).toEqual(["dear"])
    expect(groups[1].price).toBe(95)
  })

  it("keeps a buy and a sell apart", () => {
    const groups = orderStopGroups([
      order("long", 100, 90),
      order("short", 100, 110, { side: "sell" }),
    ])
    expect(groups.map(ids)).toEqual([["long"], ["short"]])
  })

  it("keeps two wallets apart", () => {
    const groups = orderStopGroups([
      order("mine", 100, 90),
      order("theirs", 100, 91, { walletId: "other" }),
    ])
    expect(groups.map(ids)).toEqual([["mine"], ["theirs"]])
  })

  it("never merges a real resting order, which cannot be changed in place", () => {
    const groups = orderStopGroups([
      order("resting", 100, 90, { live: true }),
      order("ours", 100, 91),
    ])
    expect(groups.map(ids)).toEqual([["resting"], ["ours"]])
    expect(groups[0].movable).toBe(false)
  })

  it("draws no stop at all for an order still being placed", () => {
    const groups = orderStopGroups([
      order("sending", 100, 90, { placing: true }),
      order("ours", 100, 91),
    ])
    expect(groups.map(ids)).toEqual([["ours"]])
  })

  it("ignores an order with no stop", () => {
    expect(orderStopGroups([order("bare", 100, null)])).toEqual([])
  })
})

describe("stopMerges", () => {
  it("saves only the orders whose stop has to move", () => {
    const groups = orderStopGroups([order("a", 100, 90), order("b", 104, 91)])
    expect(stopMerges(groups)).toEqual([
      { walletId: "wallet", orderId: "a", price: 91 },
    ])
  })

  it("asks for nothing when the stops already agree", () => {
    const groups = orderStopGroups([order("a", 100, 90), order("b", 104, 90)])
    expect(stopMerges(groups)).toEqual([])
  })

  it("asks for nothing when an order is on its own", () => {
    expect(stopMerges(orderStopGroups([order("a", 100, 90)]))).toEqual([])
  })
})

describe("orderTargetGroups", () => {
  function target(
    id: string,
    px: number,
    tpPx: number | null,
    extra: Partial<TradeOrder> = {}
  ): TradeOrder {
    return { ...order(id, px, null, extra), tpPx }
  }

  it("draws one line for two exits at the same price", () => {
    const groups = orderTargetGroups([
      target("a", 100, 120),
      target("b", 104, 120),
    ])
    expect(groups).toHaveLength(1)
    expect(ids(groups[0])).toEqual(["a", "b"])
    expect(groups[0].price).toBe(120)
  })

  it("never moves an exit onto another, so two prices stay two lines", () => {
    const groups = orderTargetGroups([
      target("a", 100, 120),
      target("b", 104, 130),
    ])
    expect(groups.map(ids)).toEqual([["a"], ["b"]])
  })

  it("keeps a buy and a sell apart even at one price", () => {
    const groups = orderTargetGroups([
      target("long", 100, 120),
      target("short", 140, 120, { side: "sell" }),
    ])
    expect(groups.map(ids)).toEqual([["long"], ["short"]])
  })

  it("draws no exit at all for an order still being placed", () => {
    const groups = orderTargetGroups([
      target("sending", 100, 120, { placing: true }),
      target("ours", 104, 120),
    ])
    expect(groups.map(ids)).toEqual([["ours"]])
  })

  it("leaves a real resting order its own line", () => {
    const groups = orderTargetGroups([
      target("resting", 100, 120, { live: true }),
      target("ours", 104, 120),
    ])
    expect(groups.map(ids)).toEqual([["resting"], ["ours"]])
    expect(groups[0].movable).toBe(false)
  })
})

describe("the ids a chart keys its lines on", () => {
  function both(px: number, slPx: number, tpPx: number): TradeOrder {
    return { ...order("a", px, slPx), tpPx }
  }

  it("never gives an order's stop and its exit the same id", () => {
    const one = both(100, 90, 120)
    const stop = orderStopGroups([one])[0]
    const exit = orderTargetGroups([one])[0]
    expect(stop.id).not.toBe(exit.id)
    expect([stop.id, exit.id]).toEqual(["order-sl:a", "order-tp:a"])
  })
})
