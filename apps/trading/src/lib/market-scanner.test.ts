import { describe, expect, it } from "vitest"

import {
  evaluateMarketRule,
  marketScannerTradeTarget,
  marketScannerRuleInputSchema,
  nextMarketRuleState,
  type MarketBar,
  type MarketScannerRule,
} from "@/lib/market-scanner"

const MINUTE = 60_000

describe("marketScannerTradeTarget", () => {
  it("routes alert clicks to the matching trade market", () => {
    expect(marketScannerTradeTarget("BTC")).toEqual({
      to: "/trade",
      search: { market: "BTC" },
    })
  })
})

function priceRule(
  overrides: Partial<MarketScannerRule> = {}
): MarketScannerRule {
  return {
    id: "rule-1",
    userId: "user-1",
    name: "Fast move",
    kind: "price_move",
    direction: "up",
    threshold: 5,
    marketScope: "all",
    markets: [],
    window: "5m",
    cooldown: "15m",
    enabled: true,
    ...overrides,
  }
}

function bars(prices: number[]): MarketBar[] {
  return prices.map((price, index) => ({
    ts: index * MINUTE,
    close: price,
    quoteVolume: 100,
  }))
}

describe("marketScannerRuleInputSchema", () => {
  it("accepts price and volume rules with their own fields", () => {
    expect(
      marketScannerRuleInputSchema.parse({
        name: "BTC move",
        kind: "price_move",
        direction: "down",
        threshold: 4,
        marketScope: "selected",
        markets: ["BTC"],
        window: "15m",
        cooldown: "1h",
        enabled: true,
      }).kind
    ).toBe("price_move")

    expect(
      marketScannerRuleInputSchema.parse({
        name: "Volume",
        kind: "volume_spike",
        threshold: 3,
        marketScope: "all",
        markets: [],
        window: "5m",
        cooldown: "15m",
        enabled: true,
      }).kind
    ).toBe("volume_spike")
  })

  it("requires markets only for selected-market rules", () => {
    expect(() =>
      marketScannerRuleInputSchema.parse({
        name: "Broken",
        kind: "price_move",
        direction: "up",
        threshold: 5,
        marketScope: "selected",
        markets: [],
        window: "5m",
        cooldown: "15m",
        enabled: true,
      })
    ).toThrow()
  })
})

describe("evaluateMarketRule", () => {
  it("matches an upward move at the configured threshold", () => {
    const result = evaluateMarketRule(priceRule(), bars([100, 100, 100, 100, 100, 105]), 5 * MINUTE)

    expect(result).toMatchObject({ matched: true, observed: 5 })
  })

  it("matches downward moves independently", () => {
    const result = evaluateMarketRule(
      priceRule({ direction: "down", threshold: 4 }),
      bars([100, 100, 100, 100, 100, 96]),
      5 * MINUTE
    )

    expect(result).toMatchObject({ matched: true, observed: -4 })
  })

  it("returns null until the price window has enough history", () => {
    expect(evaluateMarketRule(priceRule(), bars([100, 106]), MINUTE)).toBeNull()
  })

  it("compares volume with the previous twenty equal windows", () => {
    const history = Array.from({ length: 21 }, (_, index) => ({
      ts: index * MINUTE,
      close: 100,
      quoteVolume: index === 20 ? 300 : 100,
    }))
    const rule = priceRule({
      kind: "volume_spike",
      direction: undefined,
      threshold: 3,
      window: "1m",
    })

    expect(evaluateMarketRule(rule, history, 20 * MINUTE)).toMatchObject({
      matched: true,
      observed: 3,
    })
  })

  it("returns null when a volume baseline window is missing", () => {
    const rule = priceRule({
      kind: "volume_spike",
      direction: undefined,
      threshold: 2,
      window: "1m",
    })

    expect(evaluateMarketRule(rule, bars([100, 100]), MINUTE)).toBeNull()
  })
})

describe("nextMarketRuleState", () => {
  it("arms without firing on the first evaluation", () => {
    expect(nextMarketRuleState(undefined, true, 1_000, 5_000)).toEqual({
      matched: true,
      lastTriggeredAt: null,
      shouldAlert: false,
    })
  })

  it("fires only on a new crossing after reset and cooldown", () => {
    const armed = nextMarketRuleState(undefined, false, 0, 5_000)
    const fired = nextMarketRuleState(armed, true, 1_000, 5_000)
    const stayedTrue = nextMarketRuleState(fired, true, 7_000, 5_000)
    const reset = nextMarketRuleState(stayedTrue, false, 8_000, 5_000)
    const firedAgain = nextMarketRuleState(reset, true, 9_000, 5_000)

    expect(fired.shouldAlert).toBe(true)
    expect(stayedTrue.shouldAlert).toBe(false)
    expect(firedAgain.shouldAlert).toBe(true)
  })

  it("blocks a new crossing until the cooldown expires", () => {
    const prior = {
      matched: false,
      lastTriggeredAt: 8_000,
      shouldAlert: false,
    }

    expect(nextMarketRuleState(prior, true, 10_000, 5_000).shouldAlert).toBe(false)
  })
})
