import { describe, expect, it } from "vitest"

import { watchedLevelLine } from "@/components/trade/watched-orders-list"
import type { TradeOrder } from "@/lib/trade/paper"

/**
 * The line under a waiting price in the Watched tab.
 *
 * The part worth pinning down is which way "reached" runs. A buy waits for the
 * price to come DOWN to it and a sell waits for it to come up, so the same
 * distance means opposite things on the two sides — and a list that told Tyler
 * a level had been reached when it had not would have him looking for a
 * position that does not exist.
 */

function order(over: Partial<TradeOrder>): TradeOrder {
  return {
    id: "o1",
    walletId: "w1",
    marketKey: "hyperliquid:mainnet:BTC",
    side: "buy",
    px: 100,
    sz: 1,
    leverage: 3,
    maxLeverage: 40,
    reduceOnly: false,
    tpPx: null,
    slPx: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    watched: true,
    ...over,
  }
}

describe("watchedLevelLine", () => {
  it("leaves the distance empty when no price has been quoted", () => {
    expect(watchedLevelLine(order({}), null)).toEqual({ at: "at $100", away: "" })
  })

  it("measures how far today's price is from the level", () => {
    expect(watchedLevelLine(order({}), 105).away).toBe("5.00% away")
    expect(watchedLevelLine(order({ side: "sell" }), 95).away).toBe("5.00% away")
  })

  it("calls a buy reached once the price has come down to it", () => {
    expect(watchedLevelLine(order({}), 100).away).toBe("reached")
    expect(watchedLevelLine(order({}), 99).away).toBe("reached")
  })

  it("calls a sell reached once the price has come up to it", () => {
    expect(watchedLevelLine(order({ side: "sell" }), 101).away).toBe("reached")
    // A sell below its level is still waiting, where a buy there would be done.
    expect(watchedLevelLine(order({ side: "sell" }), 99).away).toBe("1.00% away")
  })
})
