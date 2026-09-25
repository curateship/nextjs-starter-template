import { describe, expect, it } from "vitest"
import { orderDistance, orderDistanceLabel } from "@/lib/trade/order-distance"

describe("waiting order distance", () => {
  it("matches the Watched percentage denominator", () => {
    expect(orderDistanceLabel(orderDistance({ px: 95, side: "buy" }, 100))).toBe("5.26% away")
  })
  it("honors watched trigger direction without treating exchange stops as reached", () => {
    expect(orderDistance({ px: 95, side: "sell" }, 100)).toBeCloseTo(5 / 95)
    expect(orderDistance({ px: 95, side: "sell", watched: true, triggerDirection: "down" }, 100)).toBeCloseTo(5 / 95)
    expect(orderDistance({ px: 95, side: "buy", watched: true, triggerDirection: "up" }, 100)).toBe(0)
  })
  it("leaves unavailable and invalid prices blank", () => {
    for (const mark of [null, 0, -1, NaN, Infinity]) {
      expect(orderDistanceLabel(orderDistance({ px: 95, side: "buy" }, mark))).toBe("")
    }
    expect(orderDistance({ px: 0, side: "buy" }, 100)).toBeNull()
  })
})
