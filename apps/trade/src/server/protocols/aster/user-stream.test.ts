import { describe, expect, it } from "vitest"

import { asterReconnectDelay } from "@/lib/protocols/aster/translate"
import { asterStreamFill } from "@/server/protocols/aster/user-stream"

describe("the Aster account stream", () => {
  it("turns a trade push into the same fill shape recovery stores", () => {
    expect(
      asterStreamFill({
        e: "ORDER_TRADE_UPDATE",
        o: {
          s: "BTCUSDT",
          S: "SELL",
          x: "TRADE",
          X: "FILLED",
          i: 42,
          l: "0.25",
          L: "101",
          n: "0.01",
          T: 1234,
          t: 88,
          rp: "2.5",
          ot: "STOP_MARKET",
        },
      })
    ).toMatchObject({
      fillId: "88",
      orderId: "42",
      marketId: "BTCUSDT",
      side: "sell",
      px: 101,
      sz: 0.25,
      closedPnl: 2.5,
    })
  })

  it("caps reconnect backoff at thirty seconds", () => {
    expect(asterReconnectDelay(0)).toBe(1_000)
    expect(asterReconnectDelay(99)).toBe(30_000)
  })
})
