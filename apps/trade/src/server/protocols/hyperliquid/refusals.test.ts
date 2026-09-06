import { describe, expect, it } from "vitest"

import {
  isHyperliquidPostOnlyRefusal,
  hyperliquidRefusalCode,
  hyperliquidRefusalError,
} from "@/server/protocols/hyperliquid/refusals"

describe("Hyperliquid refusals", () => {
  it.each([
    [
      "order 0: Order must have minimum value of $10. asset=1",
      "HYPERLIQUID_ORDER_TOO_SMALL",
    ],
    ["order 0: Insufficient margin to place order.", "HYPERLIQUID_MARGIN"],
    ["Post only order would have immediately matched", "HYPERLIQUID_POST_ONLY"],
    ["Reduce only order would increase position", "HYPERLIQUID_REDUCE_ONLY"],
    [
      "Order was never placed, already canceled, or filled",
      "HYPERLIQUID_ORDER_GONE",
    ],
    ["429 Too Many Requests", "HYPERLIQUID_BUSY"],
  ])("maps %s", (reason, code) => {
    expect(hyperliquidRefusalCode(reason)).toBe(code)
    expect(hyperliquidRefusalError(reason).message).toContain("Hyperliquid")
  })

  it("keeps an unknown exchange reason", () => {
    const message = hyperliquidRefusalError("new reason 77").message
    expect(message).toContain("reason Trade does not recognize")
    expect(message).toContain("new reason 77")
  })

  it("strikes a key-shaped value from an unknown reason", () => {
    const key = `0x${"a".repeat(64)}`
    expect(hyperliquidRefusalError(`new ${key}`).message).not.toContain(key)
  })
})

describe("post-only refusal identity", () => {
  it.each(["LIVE_EXCHANGE:", "LIVE_ORDER_REFUSED:"])(
    "recognizes raw and translated %s refusals",
    (prefix) => {
      const raw =
        "Post only order would have immediately matched, bbo was 100@101"
      expect(isHyperliquidPostOnlyRefusal(new Error(prefix + raw))).toBe(true)
      expect(
        isHyperliquidPostOnlyRefusal(
          new Error(prefix + hyperliquidRefusalError(raw).message)
        )
      ).toBe(true)
    }
  )
  it.each([
    "LIVE_EXCHANGE:fetch failed",
    "LIVE_EXCHANGE:Insufficient margin",
    "LIVE_SMART_ORDER_NOT_RESTING",
  ])("does not treat %s as a confirmed exchange rejection", (message) => {
    expect(isHyperliquidPostOnlyRefusal(new Error(message))).toBe(false)
  })
})
