import { afterEach, describe, expect, it } from "vitest"

import {
  APEX_ACCOUNT_GETS_PER_MINUTE,
  APEX_ACCOUNT_POSTS_PER_MINUTE,
  APEX_IP_PER_MINUTE,
  assertApexNotHeld,
  clearApexBudgets,
  holdApexLane,
  releaseApexLane,
  reserveApexRequest,
} from "@/server/protocols/apex/budget"

const T = 1_790_000_000_000

afterEach(() => {
  clearApexBudgets()
  delete (globalThis as { __tradeEngine?: boolean }).__tradeEngine
})

function fill(count: number, input: Parameters<typeof reserveApexRequest>[1], at = T) {
  for (let one = 0; one < count; one += 1) reserveApexRequest("mainnet", input, at)
}

describe("ApeX Omni's published allowance", () => {
  it("is 600 a minute per address and 300 POST and 600 GET per account", () => {
    expect(APEX_IP_PER_MINUTE).toBe(600)
    expect(APEX_ACCOUNT_POSTS_PER_MINUTE).toBe(300)
    expect(APEX_ACCOUNT_GETS_PER_MINUTE).toBe(600)
  })

  it("gives the website two thirds of the address window and idle reads three fifths of that", () => {
    // 600 x 2/3 = 400 for the website; 400 x 3/5 = 240 for idle reads.
    fill(240, { priority: "background" })
    expect(() => reserveApexRequest("mainnet", { priority: "background" }, T)).toThrow(
      /^EXCHANGE_BUSY:ApeX Omni — spent 240 of 240 requests from this server this minute, room again in 60 seconds$/
    )
    // A chart somebody just opened still gets through, and so does an order.
    expect(() => reserveApexRequest("mainnet", { priority: "watched" }, T)).not.toThrow()
    expect(() => reserveApexRequest("mainnet", { priority: "order" }, T)).not.toThrow()
  })

  it("gives the engine one third, so the pair never breaches ApeX's count", () => {
    ;(globalThis as { __tradeEngine?: boolean }).__tradeEngine = true
    fill(200, { priority: "order" })
    expect(() => reserveApexRequest("mainnet", { priority: "order" }, T)).toThrow(
      /spent 200 of 200 requests from this server/
    )
  })

  it("counts an account's POSTs apart from its GETs, and says so with the figure", () => {
    const post = { priority: "order" as const, account: { key: "k1", method: "POST" as const } }
    // 300 x 2/3 = 200 order changes a minute for the website.
    fill(200, post)
    expect(() => reserveApexRequest("mainnet", post, T + 30_000)).toThrow(
      /^EXCHANGE_BUSY:ApeX Omni — spent 200 of 200 order changes on this account this minute, room again in 30 seconds$/
    )
    // The same account can still read, and another account can still post.
    expect(() =>
      reserveApexRequest("mainnet", { priority: "order", account: { key: "k1", method: "GET" } }, T + 30_000)
    ).not.toThrow()
    expect(() =>
      reserveApexRequest("mainnet", { priority: "order", account: { key: "k2", method: "POST" } }, T + 30_000)
    ).not.toThrow()
  })

  it("spends nothing on a refused request", () => {
    const post = { priority: "order" as const, account: { key: "k1", method: "POST" as const } }
    fill(200, post)
    for (let one = 0; one < 5; one += 1) {
      expect(() => reserveApexRequest("mainnet", post, T)).toThrow()
    }
    // 200 in the address window, not 205: another 200 order-priority
    // requests still fit under its 400.
    expect(() => fill(200, { priority: "order" })).not.toThrow()
  })

  it("has room again once the rolling minute moves past the oldest request", () => {
    fill(240, { priority: "background" })
    expect(() =>
      reserveApexRequest("mainnet", { priority: "background" }, T + 60_001)
    ).not.toThrow()
  })
})

describe("ApeX Omni's rationing hold", () => {
  it("doubles from five seconds to a minute and never beyond", () => {
    const holds = [1, 2, 3, 4, 5, 6, 7].map(() => holdApexLane("mainnet", "public", T))
    expect(holds).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000])
  })

  it("refuses at once while held, with the seconds left", () => {
    holdApexLane("mainnet", "public", T)
    expect(() => assertApexNotHeld("mainnet", "public", T + 1_000)).toThrow(
      /^EXCHANGE_BUSY:ApeX Omni — asked Trade to slow down, asking again in 4 seconds$/
    )
    expect(() => assertApexNotHeld("mainnet", "public", T + 5_000)).not.toThrow()
  })

  it("starts from five seconds again after a normal answer", () => {
    holdApexLane("mainnet", "public", T)
    holdApexLane("mainnet", "public", T)
    releaseApexLane("mainnet", "public")
    expect(holdApexLane("mainnet", "public", T)).toBe(5_000)
  })

  it("holds one account's signed lane without holding the public one", () => {
    holdApexLane("mainnet", "k1", T)
    expect(() => assertApexNotHeld("mainnet", "k1", T)).toThrow()
    expect(() => assertApexNotHeld("mainnet", "public", T)).not.toThrow()
  })
})
