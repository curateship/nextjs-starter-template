import { describe, expect, it } from "vitest"

import {
  alertRuleInputSchema,
  alertTradeTarget,
  alertWithPriceLevel,
  evaluateWindowAlert,
  nextPriceLevelState,
  nextThresholdState,
  type AlertRuleItem,
  type MarketBar,
} from "@/lib/alerts"

const MINUTE = 60_000

function priceMoveRule(
  overrides: Partial<AlertRuleItem> = {}
): AlertRuleItem {
  return {
    id: "rule-1",
    userId: "user-1",
    name: "Fast move",
    coin: "BTC",
    kind: "price_move",
    direction: "up",
    percent: 5,
    window: "5m",
    triggerMode: "repeat",
    cooldown: "5m",
    status: "active",
    lastEvaluatedAt: null,
    lastTriggeredAt: null,
    createdAt: "2026-07-14T12:00:00.000Z",
    updatedAt: "2026-07-14T12:00:00.000Z",
    ...overrides,
  } as AlertRuleItem
}

function bars(prices: number[]): MarketBar[] {
  return prices.map((price, index) => ({
    ts: index * MINUTE,
    close: price,
    quoteVolume: 100,
  }))
}

describe("alertRuleInputSchema", () => {
  it("accepts every alert variant", () => {
    expect(
      alertRuleInputSchema.parse({
        name: "BTC breakout",
        message: "Price crossed the level",
        coin: "BTC",
        kind: "price_level",
        level: 69_500,
        operator: "crossing_up",
        triggerMode: "once",
      }).kind
    ).toBe("price_level")

    expect(
      alertRuleInputSchema.parse({
        name: "ETH move",
        coin: "ETH",
        kind: "price_move",
        direction: "down",
        percent: 4,
        window: "15m",
        triggerMode: "repeat",
        cooldown: "5m",
      }).kind
    ).toBe("price_move")

    expect(
      alertRuleInputSchema.parse({
        name: "SOL volume",
        coin: "SOL",
        kind: "volume_spike",
        multiplier: 3,
        window: "5m",
        triggerMode: "once",
      }).kind
    ).toBe("volume_spike")
  })

  it("allows cooldown only for repeating alerts", () => {
    expect(() =>
      alertRuleInputSchema.parse({
        name: "Invalid once alert",
        coin: "BTC",
        kind: "price_level",
        level: 100,
        operator: "crossing",
        triggerMode: "once",
        cooldown: "5m",
      })
    ).toThrow()

    expect(() =>
      alertRuleInputSchema.parse({
        name: "Invalid repeat alert",
        coin: "BTC",
        kind: "price_level",
        level: 100,
        operator: "crossing",
        triggerMode: "repeat",
      })
    ).toThrow()
  })

  it("rejects fields from another condition variant", () => {
    expect(() =>
      alertRuleInputSchema.parse({
        name: "Mixed alert",
        coin: "BTC",
        kind: "price_level",
        level: 100,
        operator: "crossing",
        percent: 5,
        triggerMode: "once",
      })
    ).toThrow()
  })
})

describe("nextPriceLevelState", () => {
  const repeat = {
    level: 100,
    operator: "crossing_up" as const,
    triggerMode: "repeat" as const,
    cooldownMs: 5_000,
  }

  it("arms on the first valid price without firing", () => {
    expect(nextPriceLevelState(undefined, 99, 1_000, repeat)).toEqual({
      previousPrice: 99,
      lastTriggeredAt: null,
      stopped: false,
      shouldAlert: false,
    })
  })

  it("fires upward and downward crossings at the exact boundary", () => {
    const upward = nextPriceLevelState(
      nextPriceLevelState(undefined, 99, 0, repeat),
      100,
      1_000,
      repeat
    )
    const downwardConfig = {
      ...repeat,
      operator: "crossing_down" as const,
    }
    const downward = nextPriceLevelState(
      nextPriceLevelState(undefined, 101, 0, downwardConfig),
      100,
      1_000,
      downwardConfig
    )

    expect(upward.shouldAlert).toBe(true)
    expect(downward.shouldAlert).toBe(true)
  })

  it("fires crossing in either direction but not when moving away from the boundary", () => {
    const either = { ...repeat, operator: "crossing" as const }
    const fromBelow = nextPriceLevelState(
      nextPriceLevelState(undefined, 99, 0, either),
      100,
      1_000,
      either
    )
    const fromAbove = nextPriceLevelState(
      nextPriceLevelState(undefined, 101, 0, either),
      100,
      1_000,
      either
    )
    const away = nextPriceLevelState(
      nextPriceLevelState(undefined, 100, 0, either),
      101,
      1_000,
      either
    )

    expect(fromBelow.shouldAlert).toBe(true)
    expect(fromAbove.shouldAlert).toBe(true)
    expect(away.shouldAlert).toBe(false)
  })

  it("stops a one-time alert after its first crossing", () => {
    const once = { ...repeat, triggerMode: "once" as const }
    const armed = nextPriceLevelState(undefined, 99, 0, once)
    const fired = nextPriceLevelState(armed, 100, 1_000, once)
    const reset = nextPriceLevelState(fired, 99, 2_000, once)
    const crossedAgain = nextPriceLevelState(reset, 100, 7_000, once)

    expect(fired).toMatchObject({ shouldAlert: true, stopped: true })
    expect(crossedAgain.shouldAlert).toBe(false)
  })

  it("requires a reset and an expired cooldown before repeating", () => {
    const armed = nextPriceLevelState(undefined, 99, 0, repeat)
    const fired = nextPriceLevelState(armed, 100, 1_000, repeat)
    const stayedAbove = nextPriceLevelState(fired, 101, 7_000, repeat)
    const reset = nextPriceLevelState(stayedAbove, 99, 8_000, repeat)
    const firedAgain = nextPriceLevelState(reset, 100, 9_000, repeat)

    expect(stayedAbove.shouldAlert).toBe(false)
    expect(firedAgain.shouldAlert).toBe(true)

    const earlyReset = nextPriceLevelState(fired, 99, 2_000, repeat)
    expect(
      nextPriceLevelState(earlyReset, 100, 3_000, repeat).shouldAlert
    ).toBe(false)
  })
})

describe("window alerts", () => {
  it("keeps the existing upward and downward price-move math", () => {
    expect(
      evaluateWindowAlert(
        priceMoveRule(),
        bars([100, 100, 100, 100, 100, 105]),
        5 * MINUTE
      )
    ).toMatchObject({ matched: true, observed: 5 })

    expect(
      evaluateWindowAlert(
        priceMoveRule({ direction: "down", percent: 4 }),
        bars([100, 100, 100, 100, 100, 96]),
        5 * MINUTE
      )
    ).toMatchObject({ matched: true, observed: -4 })
  })

  it("keeps relative volume based on the previous twenty equal windows", () => {
    const history = Array.from({ length: 21 }, (_, index) => ({
      ts: index * MINUTE,
      close: 100,
      quoteVolume: index === 20 ? 300 : 100,
    }))
    const rule = priceMoveRule({
      kind: "volume_spike",
      multiplier: 3,
      window: "1m",
    })

    expect(evaluateWindowAlert(rule, history, 20 * MINUTE)).toMatchObject({
      matched: true,
      observed: 3,
    })
  })

  it("arms threshold alerts and stops one-time rules", () => {
    const armed = nextThresholdState(undefined, false, 0, 5_000, "once")
    const fired = nextThresholdState(armed, true, 1_000, 5_000, "once")
    const reset = nextThresholdState(fired, false, 2_000, 5_000, "once")

    expect(fired).toMatchObject({ shouldAlert: true, stopped: true })
    expect(
      nextThresholdState(reset, true, 8_000, 5_000, "once").shouldAlert
    ).toBe(false)
  })
})

describe("alertTradeTarget", () => {
  it("opens the matching Trade market", () => {
    expect(alertTradeTarget("BTC")).toEqual({
      to: "/trade",
      search: { market: "BTC" },
    })
  })
})

describe("alertWithPriceLevel", () => {
  it("creates a strict update that changes only the dragged price", () => {
    const rule: AlertRuleItem = {
      id: "rule-1",
      userId: "user-1",
      name: "BTC crossing",
      message: "Watch this level",
      coin: "BTC",
      kind: "price_level",
      level: 64_000,
      operator: "crossing_up",
      triggerMode: "repeat",
      cooldown: "5m",
      status: "active",
      lastEvaluatedAt: null,
      lastTriggeredAt: null,
      createdAt: "2026-07-14T12:00:00.000Z",
      updatedAt: "2026-07-14T12:00:00.000Z",
    }

    expect(alertWithPriceLevel(rule, 63_500)).toEqual({
      name: "BTC crossing",
      message: "Watch this level",
      coin: "BTC",
      kind: "price_level",
      level: 63_500,
      operator: "crossing_up",
      triggerMode: "repeat",
      cooldown: "5m",
    })
  })
})
