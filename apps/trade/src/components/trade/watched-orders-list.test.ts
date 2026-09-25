import { describe, expect, it } from "vitest"

import { orderDistance, orderDistanceLabel } from "@/lib/trade/order-distance"
import type { TradeOrder } from "@/lib/trade/paper"

/**
 * The distance pill on a waiting price in Manual orders.
 *
 * The part worth pinning down is which way "reached" runs. A buy waits for the
 * price to come DOWN to it and a sell waits for it to come up, so the same
 * distance means opposite things on the two sides — and a list that told Tyler
 * a level had been reached when it had not would have him looking for a
 * position that does not exist.
 */

/** What the pill reads for this level against today's price. */
function away(one: TradeOrder, mark: number | null): string {
  return orderDistanceLabel(orderDistance(one, mark))
}

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

describe("waiting level distance", () => {
  it("leaves the distance empty when no price has been quoted", () => {
    expect(away(order({}), null)).toBe("")
  })

  it("measures how far today's price is from the level", () => {
    expect(away(order({}), 105)).toBe("5.00% away")
    expect(away(order({ side: "sell" }), 95)).toBe("5.00% away")
  })

  it("calls a buy reached once the price has come down to it", () => {
    expect(away(order({}), 100)).toBe("reached")
    expect(away(order({}), 99)).toBe("reached")
  })

  it("calls a sell reached once the price has come up to it", () => {
    expect(away(order({ side: "sell" }), 101)).toBe("reached")
    // A sell below its level is still waiting, where a buy there would be done.
    expect(away(order({ side: "sell" }), 99)).toBe("1.00% away")
  })

  it("keeps a breakout Long and breakdown Short waiting from the stored side", () => {
    expect(away(order({ triggerDirection: "up" }), 99)).toBe("1.00% away")
    expect(away(order({ side: "sell", triggerDirection: "down" }), 101)).toBe(
      "1.00% away"
    )

    expect(away(order({ triggerDirection: "up" }), 101)).toBe("reached")
    expect(away(order({ side: "sell", triggerDirection: "down" }), 99)).toBe(
      "reached"
    )
  })
})
