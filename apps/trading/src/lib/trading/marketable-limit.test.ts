import { describe, expect, it } from "vitest"

import { isMarketableLimit } from "./marketable-limit"

const base = { orderType: "limit", tif: "Gtc" } as const

describe("isMarketableLimit", () => {
  it("treats a sell below the mark as marketable", () => {
    expect(isMarketableLimit({ ...base, side: "sell", px: "99" }, "100")).toBe(
      true
    )
  })

  it("treats a buy above the mark as marketable", () => {
    expect(isMarketableLimit({ ...base, side: "buy", px: "101" }, "100")).toBe(
      true
    )
  })

  it("leaves a resting limit alone", () => {
    expect(isMarketableLimit({ ...base, side: "sell", px: "101" }, "100")).toBe(
      false
    )
    expect(isMarketableLimit({ ...base, side: "buy", px: "99" }, "100")).toBe(
      false
    )
  })

  it("leaves a limit exactly at the mark alone", () => {
    expect(isMarketableLimit({ ...base, side: "sell", px: "100" }, "100")).toBe(
      false
    )
  })

  it("never converts a post-only order", () => {
    expect(
      isMarketableLimit(
        { orderType: "limit", tif: "Alo", side: "sell", px: "99" },
        "100"
      )
    ).toBe(false)
  })

  it("ignores market orders and missing or unusable prices", () => {
    expect(
      isMarketableLimit({ ...base, orderType: "market", side: "sell" }, "100")
    ).toBe(false)
    expect(isMarketableLimit({ ...base, side: "sell", px: "" }, "100")).toBe(
      false
    )
    expect(isMarketableLimit({ ...base, side: "sell", px: "abc" }, "100")).toBe(
      false
    )
    expect(isMarketableLimit({ ...base, side: "sell", px: "99" }, 0)).toBe(false)
  })
})
