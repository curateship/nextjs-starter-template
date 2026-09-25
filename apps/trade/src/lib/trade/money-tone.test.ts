import { describe, expect, it } from "vitest"

import { LOST_MONEY, MADE_MONEY, moneyTone } from "@/lib/trade/money-tone"

describe("moneyTone", () => {
  it("paints a gain green and a loss red", () => {
    expect(moneyTone(12.34)).toBe(MADE_MONEY)
    expect(moneyTone(-12.34)).toBe(LOST_MONEY)
  })

  it("leaves a plain zero alone, so it never reads as a missing figure", () => {
    expect(moneyTone(0)).toBeUndefined()
  })

  it("carries its own dark mode, so no call site can forget it", () => {
    // Green has no theme token to take, so it names both halves here. Red is
    // the `destructive` token, which the theme already redefines for dark.
    expect(MADE_MONEY).toContain("dark:")
    expect(LOST_MONEY).toBe("text-destructive")
  })
})
