import { describe, expect, it } from "vitest"

import { initialMarketRuleState, mergeTradeIntoBars } from "./alert-engine"

describe("market alert live bars", () => {
  it("combines trades in one interval and rolls into the next", () => {
    const bars = new Map()

    mergeTradeIntoBars(bars, { coin: "BTC", px: 100, notional: 20, ts: 1_000 }, 60_000)
    mergeTradeIntoBars(bars, { coin: "BTC", px: 102, notional: 30, ts: 20_000 }, 60_000)
    mergeTradeIntoBars(bars, { coin: "BTC", px: 105, notional: 40, ts: 61_000 }, 60_000)

    expect([...bars.values()]).toEqual([
      { ts: 20_000, close: 102, quoteVolume: 50 },
      { ts: 61_000, close: 105, quoteVolume: 40 },
    ])
  })

  it("re-arms without alerting after a worker restart", () => {
    expect(initialMarketRuleState(true, 5_000)).toEqual({
      matched: true,
      lastTriggeredAt: 5_000,
    })
  })
})
