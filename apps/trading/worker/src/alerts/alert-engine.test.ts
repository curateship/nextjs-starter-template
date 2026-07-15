import { describe, expect, it } from "vitest"

import { nextPriceLevelState } from "@/lib/alerts"
import { mergeTradeIntoBars } from "./alert-engine"

describe("price alert live bars", () => {
  it("combines trades in one interval and rolls into the next", () => {
    const bars = new Map()

    mergeTradeIntoBars(
      bars,
      { tid: 1, coin: "BTC", px: 100, notional: 20, ts: 1_000 },
      60_000
    )
    mergeTradeIntoBars(
      bars,
      { tid: 2, coin: "BTC", px: 102, notional: 30, ts: 20_000 },
      60_000
    )
    mergeTradeIntoBars(
      bars,
      { tid: 3, coin: "BTC", px: 105, notional: 40, ts: 61_000 },
      60_000
    )

    expect([...bars.values()]).toEqual([
      { ts: 20_000, close: 102, quoteVolume: 50 },
      { ts: 61_000, close: 105, quoteVolume: 40 },
    ])
  })

  it("re-arms without alerting after a worker restart", () => {
    expect(
      nextPriceLevelState(
        undefined,
        101,
        6_000,
        {
          level: 100,
          operator: "crossing_up",
          triggerMode: "repeat",
          cooldownMs: 5_000,
        },
        5_000
      )
    ).toEqual({
      previousPrice: 101,
      lastTriggeredAt: 5_000,
      stopped: false,
      shouldAlert: false,
    })
  })
})
