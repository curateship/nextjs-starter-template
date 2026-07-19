import { describe, expect, it } from "vitest"

import {
  clampDefaultLeverage,
  DEFAULT_ORDER_DEFAULTS,
  normalizeOrderDefaults,
} from "./order-defaults"

describe("clampDefaultLeverage", () => {
  it("keeps whole numbers inside the allowed range", () => {
    expect(clampDefaultLeverage(12)).toBe(12)
    expect(clampDefaultLeverage("7")).toBe(7)
  })

  it("clamps out-of-range and rounds fractional values", () => {
    expect(clampDefaultLeverage(0)).toBe(1)
    expect(clampDefaultLeverage(999)).toBe(50)
    expect(clampDefaultLeverage(3.6)).toBe(4)
  })

  it("falls back to the default when the value is not a number", () => {
    expect(clampDefaultLeverage("abc")).toBe(DEFAULT_ORDER_DEFAULTS.leverage)
    expect(clampDefaultLeverage(undefined)).toBe(
      DEFAULT_ORDER_DEFAULTS.leverage
    )
  })
})

describe("normalizeOrderDefaults", () => {
  it("returns the defaults for settings saved before this card existed", () => {
    expect(normalizeOrderDefaults(undefined)).toEqual(DEFAULT_ORDER_DEFAULTS)
    expect(normalizeOrderDefaults("nonsense")).toEqual(DEFAULT_ORDER_DEFAULTS)
  })

  it("keeps valid saved values", () => {
    expect(
      normalizeOrderDefaults({
        leverage: 20,
        marginMode: "isolated",
        orderType: "market",
        sizeUnit: "pct",
      })
    ).toEqual({
      leverage: 20,
      marginMode: "isolated",
      orderType: "market",
      sizeUnit: "pct",
    })
  })

  it("replaces unknown values field by field", () => {
    expect(
      normalizeOrderDefaults({ marginMode: "elsewhere", sizeUnit: "coin" })
    ).toEqual({ ...DEFAULT_ORDER_DEFAULTS, sizeUnit: "coin" })
  })
})
