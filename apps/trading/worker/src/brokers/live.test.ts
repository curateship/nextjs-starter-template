import type { OrderUpdatesWsEvent } from "@nktkas/hyperliquid"
import { describe, expect, it } from "vitest"

import { liveOrderStatus, remainingOrderSize } from "./live"
import { livePositionSnapshot } from "./types"

function update(
  status: OrderUpdatesWsEvent[number]["status"],
  sz: string,
  origSz = "1"
): OrderUpdatesWsEvent[number] {
  return {
    status,
    statusTimestamp: 1,
    order: {
      coin: "TEST",
      side: "B",
      limitPx: "100",
      sz,
      origSz,
      oid: 7,
      timestamp: 1,
      cloid: "0x11111111000000000000000000000000",
    },
  }
}

describe("live order updates", () => {
  it("distinguishes resting, partial, and terminal states", () => {
    expect(liveOrderStatus(update("open", "1"))).toBe("resting")
    expect(liveOrderStatus(update("open", "0.6"))).toBe("partially_filled")
    expect(liveOrderStatus(update("filled", "0"))).toBe("filled")
    expect(liveOrderStatus(update("canceled", "0.6"))).toBe("cancelled")
    expect(liveOrderStatus(update("scheduledCancel", "0.6"))).toBe("cancelled")
    expect(liveOrderStatus(update("badAloPxRejected", "1"))).toBe("rejected")
  })

  it("does not count the same partial fill twice when updates arrive first", () => {
    expect(remainingOrderSize(10, 0, 6)).toBe(6)
    expect(remainingOrderSize(10, 4, 6)).toBe(6)
    expect(remainingOrderSize(10, 6, 6)).toBe(4)
  })
})

describe("livePositionSnapshot", () => {
  it("normalizes exchange strings to the persisted number shape", () => {
    expect(
      livePositionSnapshot({ szi: "0.42", entryPx: "61240.5" })
    ).toEqual({ szi: 0.42, entryPx: 61240.5 })
    expect(livePositionSnapshot({ szi: "-1.5", entryPx: "3000" })).toEqual({
      szi: -1.5,
      entryPx: 3000,
    })
  })

  it("stores null for flat, missing, or unreadable positions", () => {
    expect(livePositionSnapshot(null)).toBeNull()
    expect(livePositionSnapshot({ szi: "0", entryPx: "100" })).toBeNull()
    expect(livePositionSnapshot({ szi: "not-a-number", entryPx: "1" })).toBeNull()
  })
})
