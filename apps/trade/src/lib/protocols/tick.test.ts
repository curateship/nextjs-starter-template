import { describe, expect, it } from "vitest"

import { snapToTick, stepToDecimals } from "@/lib/protocols/tick"

/**
 * The sums shared by every exchange that publishes a step. Both are used on
 * the order path, so both are wrong in a way that costs money: a price with
 * float dust on it is refused by the venue, and a size step read as the wrong
 * number of decimals sizes a trade by a factor of ten.
 */

describe("snapping a price to its tick", () => {
  it("lands on the tick, without float dust", () => {
    // The naive multiply answers 8583.500000000001, which no exchange
    // accepts as a price string.
    expect(snapToTick(8583.3, 0.5)).toBe(8583.5)
    expect(snapToTick(0.123456, 0.0001)).toBe(0.1235)
    expect(snapToTick(30000.4, 1)).toBe(30000)
  })

  it("handles a tick written in exponent form", () => {
    // KuCoin states 1e-5 on its cheaper coins, and counting the decimals of
    // the string "1e-5" would answer zero — every price rounded to whole
    // dollars, on a coin worth a tenth of one.
    expect(snapToTick(1.108512, 1e-5)).toBe(1.10851)
    expect(snapToTick(0.074645, 1e-5)).toBe(0.07465)
  })

  it("leaves the price alone when there is no tick to snap to", () => {
    expect(snapToTick(123.456, null)).toBe(123.456)
    expect(snapToTick(123.456, 0)).toBe(123.456)
  })
})

describe("reading a size step as decimal places", () => {
  it("reads a power of ten as its decimal places", () => {
    expect(stepToDecimals(0.001)).toBe(3)
    expect(stepToDecimals(1)).toBe(0)
  })

  it("reports 0 for a step that is not a power of ten", () => {
    // Ten whole coins at a time cannot be said in decimal places at all, so
    // the shared sizing stays conservative and the connector enforces the
    // real step when it places the order.
    expect(stepToDecimals(0.5)).toBe(0)
    expect(stepToDecimals(10)).toBe(0)
  })

  it("answers null when the exchange did not say", () => {
    expect(stepToDecimals(null)).toBe(null)
  })
})
