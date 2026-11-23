import { describe, expect, it } from "vitest"

import { marketLeverageLimit } from "@/lib/trade/leverage"

describe("marketLeverageLimit", () => {
  it("uses the market's whole-number limit in both order windows", () => {
    expect(marketLeverageLimit(12.9)).toBe(12)
  })

  it("falls back to 50 and keeps stated limits inside the app's range", () => {
    expect(marketLeverageLimit(null)).toBe(50)
    expect(marketLeverageLimit(80)).toBe(50)
    expect(marketLeverageLimit(0.5)).toBe(1)
  })
})
