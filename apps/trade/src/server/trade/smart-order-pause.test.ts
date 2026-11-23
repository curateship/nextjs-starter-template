import { describe, expect, it } from "vitest"

import {
  isSmartOrderRefusal,
  recordSmartOrderRefusal,
  recordSmartOrderSendSuccess,
  smartOrderRefusalLimit,
  smartOrderRefusalReason,
} from "@/server/trade/smart-order-pause"

describe("smart-order refusal streaks", () => {
  it("pauses on the fifth order-specific refusal", () => {
    const plan = { paused: false, refusalStreak: 0, pauseReason: null }
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = recordSmartOrderRefusal(
        plan,
        "The order is below the market minimum.",
        5
      )
      expect(result.pausedNow).toBe(attempt === 5)
    }
    expect(plan).toMatchObject({
      paused: true,
      refusalStreak: 5,
      pauseReason: "The order is below the market minimum.",
    })
  })

  it("starts over after a successful send", () => {
    const plan = { paused: false, refusalStreak: 4, pauseReason: "Too small." }
    recordSmartOrderSendSuccess(plan)
    recordSmartOrderRefusal(plan, "Still too small.", 5)
    expect(plan).toMatchObject({ paused: false, refusalStreak: 1 })
  })

  it("leaves the streak alone for an exchange-wide interruption", () => {
    expect(isSmartOrderRefusal(new Error("EXCHANGE_BUSY"))).toBe(false)
    expect(
      isSmartOrderRefusal(
        new Error("LIVE_NO_ANSWER:The exchange did not answer in time.")
      )
    ).toBe(false)
    expect(isSmartOrderRefusal(new Error("ASTER_CLOCK:Try again."))).toBe(false)
    expect(isSmartOrderRefusal(new Error("ASTER_REQUEST_LIMIT_MISSING"))).toBe(
      false
    )
    expect(isSmartOrderRefusal(new Error("ASTER_ACCOUNT_UNREADABLE"))).toBe(
      false
    )
  })

  it("counts local size checks and keeps the plain explanation", () => {
    const error = new Error(
      "LIVE_ORDER_TOO_SMALL:Aster's smallest order here is $5.00, and this order is $2.00."
    )
    expect(isSmartOrderRefusal(error)).toBe(true)
    expect(smartOrderRefusalReason(error)).toBe(
      "Aster's smallest order here is $5.00, and this order is $2.00."
    )
  })

  it("uses five by default and bounds a configured value", () => {
    expect(smartOrderRefusalLimit(undefined)).toBe(5)
    expect(smartOrderRefusalLimit("1")).toBe(2)
    expect(smartOrderRefusalLimit("99")).toBe(20)
  })
})
