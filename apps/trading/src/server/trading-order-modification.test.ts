import { describe, expect, it } from "vitest"

import {
  assertMoveWithinMark,
  buildModifiedOrder,
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

describe("assertMoveWithinMark", () => {
  it("rejects missing or invalid market prices", () => {
    expect(() => assertMoveWithinMark("1720", Number.NaN, true)).toThrow(
      "Current market price is unavailable"
    )
  })

  it("allows passive order moves far from market", () => {
    expect(() => assertMoveWithinMark("50", 100, true)).not.toThrow()
    expect(() => assertMoveWithinMark("150", 100, false)).not.toThrow()
  })

  it("rejects marketable order moves more than twenty percent through market", () => {
    expect(() => assertMoveWithinMark("130", 100, true)).toThrow(
      "30.0% above mark"
    )
    expect(() => assertMoveWithinMark("70", 100, false)).toThrow(
      "30.0% below mark"
    )
  })

  it("accepts order moves within twenty percent of market", () => {
    expect(() => assertMoveWithinMark("115", 100, true)).not.toThrow()
    expect(() => assertMoveWithinMark("85", 100, false)).not.toThrow()
  })
})
