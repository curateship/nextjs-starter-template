import { describe, expect, it } from "vitest"

import { orderCancelKind } from "@/lib/trade/cancel-order"

describe("choosing where an order is cancelled", () => {
  it("sends a watched row through the watched-order door", () => {
    expect(orderCancelKind({ watched: true })).toBe("watch")
  })

  it("sends an exchange row to the exchange and an ordinary row to practice", () => {
    expect(orderCancelKind({ live: true })).toBe("live")
    expect(orderCancelKind({})).toBe("paper")
    expect(orderCancelKind(null)).toBe("paper")
  })
})
