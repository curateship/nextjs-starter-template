import { describe, expect, it } from "vitest"

import {
  cancelOpenOrders,
  describeOpenOrder,
} from "@/lib/trading/open-order"

const baseOrder = {
  coin: "ETH",
  side: "A" as const,
  limitPx: "0",
  sz: "0.0845",
  oid: 123,
  timestamp: 0,
  origSz: "0.0845",
  triggerCondition: "",
  children: [],
  isPositionTpsl: false,
  reduceOnly: true,
  tif: null,
  cloid: null,
}

describe("cancel open orders", () => {
  it("cancels orders one at a time", async () => {
    let inFlight = 0
    let peakInFlight = 0
    const orders = [
      { coin: "ETH", oid: 1 },
      { coin: "ETH", oid: 2 },
      { coin: "ETH", oid: 3 },
    ]

    const cancelled = await cancelOpenOrders(orders, async () => {
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })

    expect(cancelled).toBe(3)
    expect(peakInFlight).toBe(1)
  })

  it("continues cancelling after one order fails", async () => {
    const attempted: number[] = []
    const orders = [
      { coin: "ETH", oid: 1 },
      { coin: "ETH", oid: 2 },
      { coin: "ETH", oid: 3 },
    ]

    const cancelled = await cancelOpenOrders(orders, async (order) => {
      attempted.push(order.oid)
      if (order.oid === 2) throw new Error("Order is already gone")
    })

    expect(cancelled).toBe(2)
    expect(attempted).toEqual([1, 2, 3])
  })
})

describe("open order display and modification", () => {
  it("identifies a stop-loss trigger and uses its trigger price", () => {
    const order = describeOpenOrder({
      ...baseOrder,
      isTrigger: true,
      triggerPx: "1717.3",
      orderType: "Stop Market",
    })

    expect(order).toMatchObject({
      price: "1717.3",
      label: "Stop Loss",
      modification: { kind: "trigger", isMarket: true, tpsl: "sl" },
    })
  })

  it("identifies take-profit separately from stop-loss", () => {
    const order = describeOpenOrder({
      ...baseOrder,
      isTrigger: true,
      triggerPx: "1859",
      orderType: "Take Profit Market",
    })

    expect(order).toMatchObject({
      price: "1859",
      label: "Take Profit",
      modification: { kind: "trigger", isMarket: true, tpsl: "tp" },
    })
  })

  it("keeps the execution price for a stop-limit order", () => {
    const order = describeOpenOrder({
      ...baseOrder,
      limitPx: "1715",
      isTrigger: true,
      triggerPx: "1717.3",
      orderType: "Stop Limit",
    })

    expect(order.modification).toEqual({
      kind: "trigger",
      executionPx: "1715",
      isMarket: false,
      tpsl: "sl",
    })
  })

  it("rejects inconsistent trigger data", () => {
    expect(() =>
      describeOpenOrder({
        ...baseOrder,
        isTrigger: true,
        triggerPx: "1717.3",
        orderType: "Limit",
      })
    ).toThrow("Unsupported trigger order type")
  })
})
