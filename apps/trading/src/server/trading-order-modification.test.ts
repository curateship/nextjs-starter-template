import { describe, expect, it } from "vitest"

import {
  assertPassiveLimitPrice,
  buildModifiedOrder,
  buildRiskBracketModifications,
  inferPreMarkerRiskUsd,
} from "@/server/trading-order-modification"

const baseOrder = {
  coin: "ETH",
  side: "A" as const,
  limitPx: "1715",
  sz: "0.0845",
  oid: 123,
  timestamp: 0,
  origSz: "0.0845",
  triggerCondition: "",
  triggerPx: "1717.3",
  children: [],
  isPositionTpsl: false,
  reduceOnly: true,
  tif: null,
  cloid: null,
}

describe("buildModifiedOrder", () => {
  it("moves a stop-market trigger without changing its order type", () => {
    const modified = buildModifiedOrder(
      4,
      { ...baseOrder, isTrigger: true, orderType: "Stop Market" },
      "1720"
    )

    expect(modified).toMatchObject({
      kind: "trigger",
      px: "1720",
      triggerPx: "1720",
      isMarket: true,
      tpsl: "sl",
    })
  })

  it("moves only the trigger price of a stop-limit order", () => {
    const modified = buildModifiedOrder(
      4,
      { ...baseOrder, isTrigger: true, orderType: "Stop Limit" },
      "1720"
    )

    expect(modified).toMatchObject({
      kind: "trigger",
      px: "1715",
      triggerPx: "1720",
      isMarket: false,
      tpsl: "sl",
    })
  })
})

describe("buildRiskBracketModifications", () => {
  it("keeps the original risk amount while resizing every bracket leg", () => {
    const stop = {
      ...baseOrder,
      oid: 303,
      sz: "0.22",
      origSz: "0.22",
      limitPx: "1464.9",
      triggerPx: "1464.9",
      isTrigger: true,
      orderType: "Stop Market" as const,
    }
    const takeProfit = {
      ...baseOrder,
      oid: 302,
      sz: "0.22",
      origSz: "0.22",
      limitPx: "1974.5",
      triggerPx: "1974.5",
      isTrigger: true,
      orderType: "Take Profit Market" as const,
    }
    const entry = {
      ...baseOrder,
      oid: 301,
      side: "B" as const,
      limitPx: "1510.3",
      triggerPx: "0",
      sz: "0.22",
      origSz: "0.22",
      isTrigger: false,
      reduceOnly: false,
      tif: "Gtc" as const,
      orderType: "Limit" as const,
      children: [takeProfit, stop],
    }

    const result = buildRiskBracketModifications({
      assetId: 4,
      entry,
      stopOid: stop.oid,
      nextStopPrice: "1429.7",
      szDecimals: 4,
      riskUsd: 0.22 * (1510.3 - 1464.9),
    })

    expect(result.sz).toBe("0.1239")
    expect(result.modifications.map(({ oid }) => oid)).toEqual([301, 302, 303])
    expect(result.modifications.map(({ order }) => order.sz)).toEqual([
      "0.1239",
      "0.1239",
      "0.1239",
    ])
    expect(result.modifications[0]?.order.px).toBe("1510.3")
    expect(result.modifications[1]?.order).toMatchObject({
      triggerPx: "1974.5",
      tpsl: "tp",
    })
    expect(result.modifications[2]?.order).toMatchObject({
      triggerPx: "1429.7",
      tpsl: "sl",
    })
  })

  it("rejects a stop placed exactly at the entry price", () => {
    const stop = {
      ...baseOrder,
      oid: 303,
      isTrigger: true,
      orderType: "Stop Market" as const,
    }
    const entry = {
      ...baseOrder,
      oid: 301,
      side: "B" as const,
      limitPx: "1715",
      triggerPx: "0",
      isTrigger: false,
      reduceOnly: false,
      tif: "Gtc" as const,
      orderType: "Limit" as const,
      children: [stop],
    }

    expect(() =>
      buildRiskBracketModifications({
        assetId: 4,
        entry,
        stopOid: stop.oid,
        nextStopPrice: "1715",
        szDecimals: 4,
      })
    ).toThrow("Stop loss cannot equal the entry price")
  })
})

describe("inferPreMarkerRiskUsd", () => {
  const entry = { px: 1510.3, sz: 0.22 }
  const stop = { px: 1464.9, sz: 0.22 }

  it("recognizes the original Risk template for a pre-marker order", () => {
    expect(
      inferPreMarkerRiskUsd(entry, stop, [
        { sizingMode: "wallet", stopLossPct: 2 },
        { sizingMode: "risk", stopLossPct: 3 },
      ])
    ).toBeCloseTo(9.988)
  })

  it("fails closed when more than one template matches", () => {
    expect(
      inferPreMarkerRiskUsd(entry, stop, [
        { sizingMode: "risk", stopLossPct: 3 },
        { sizingMode: "wallet", stopLossPct: 3 },
      ])
    ).toBeNull()
  })
})

describe("assertPassiveLimitPrice", () => {
  it("rejects missing or invalid market prices", () => {
    expect(() => assertPassiveLimitPrice("1720", Number.NaN, true)).toThrow(
      "Current market price is unavailable"
    )
  })

  it("allows passive order moves far from market", () => {
    expect(() => assertPassiveLimitPrice("50", 100, true)).not.toThrow()
    expect(() => assertPassiveLimitPrice("150", 100, false)).not.toThrow()
  })

  it("rejects any limit order that crosses the current price", () => {
    expect(() => assertPassiveLimitPrice("100.01", 100, true)).toThrow(
      "Buy limit price must be at or below mark"
    )
    expect(() => assertPassiveLimitPrice("99.99", 100, false)).toThrow(
      "Sell limit price must be at or above mark"
    )
  })

  it("accepts limit orders at the current price", () => {
    expect(() => assertPassiveLimitPrice("100", 100, true)).not.toThrow()
    expect(() => assertPassiveLimitPrice("100", 100, false)).not.toThrow()
  })
})
