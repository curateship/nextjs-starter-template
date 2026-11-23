import { describe, expect, it } from "vitest"

import { orderIdSchema } from "@/lib/trade/order-id"

/**
 * The three exchanges name their orders in three different ways, and the
 * cancel and move doors have to accept all of them. Real ids, copied off each
 * exchange, so a rule written for one of them fails here rather than in front
 * of someone trying to cancel an order.
 */

describe("an exchange's own order id", () => {
  it("accepts the id each exchange actually hands back", () => {
    // Hyperliquid: a plain number.
    expect(orderIdSchema.safeParse("103712964021").success).toBe(true)
    // Phemex: a uuid. This is the one the app used to refuse, which is why a
    // real Phemex order could not be cancelled from the app at all.
    expect(orderIdSchema.safeParse("3124000e-9c7f-4c3a-8f24-6f6f2d0a1b55").success).toBe(
      true
    )
    // KuCoin: a hex string, and the client id the app sends with an order.
    expect(orderIdSchema.safeParse("66a1f0c2d4e5b60001a9c3f7").success).toBe(true)
    expect(orderIdSchema.safeParse("trade_9f201f21_6d68").success).toBe(true)
  })

  it("still refuses anything that is not an id", () => {
    expect(orderIdSchema.safeParse("").success).toBe(false)
    expect(orderIdSchema.safeParse("a".repeat(65)).success).toBe(false)
    // No spaces, quotes or slashes — an id goes straight into a request path.
    expect(orderIdSchema.safeParse("12 34").success).toBe(false)
    expect(orderIdSchema.safeParse("../../etc/passwd").success).toBe(false)
    expect(orderIdSchema.safeParse("id'or'1'='1").success).toBe(false)
  })
})
