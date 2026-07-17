import { describe, expect, it } from "vitest"

import {
  clampLiquidationAlertThreshold,
  DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT,
  evaluateLiquidationAlerts,
  LIQUIDATION_ALERT_COOLDOWN_MS,
  liquidationAlertThresholdFromSettings,
  liquidationDistancePct,
  liquidationTone,
  positionMarkPx,
} from "./liquidation-risk"

describe("liquidationDistancePct", () => {
  it("measures the gap from mark to liquidation for longs and shorts", () => {
    // Long at mark 100, liquidation at 80 → 20% away.
    expect(
      liquidationDistancePct({ szi: 1, markPx: 100, liquidationPx: 80 })
    ).toBe(20)
    // Short at mark 100, liquidation at 125 → 25% away.
    expect(
      liquidationDistancePct({ szi: -1, markPx: 100, liquidationPx: 125 })
    ).toBe(25)
  })

  it("is null without a position, mark, or liquidation price", () => {
    expect(
      liquidationDistancePct({ szi: 0, markPx: 100, liquidationPx: 80 })
    ).toBeNull()
    expect(
      liquidationDistancePct({ szi: 1, markPx: 0, liquidationPx: 80 })
    ).toBeNull()
    expect(
      liquidationDistancePct({ szi: 1, markPx: 100, liquidationPx: null })
    ).toBeNull()
    // The exchange reports 0 for positions with no liquidation risk.
    expect(
      liquidationDistancePct({ szi: 1, markPx: 100, liquidationPx: 0 })
    ).toBeNull()
  })

  it("floors at zero when the mark is at or past the liquidation price", () => {
    expect(
      liquidationDistancePct({ szi: 1, markPx: 80, liquidationPx: 80 })
    ).toBe(0)
    expect(
      liquidationDistancePct({ szi: 1, markPx: 79, liquidationPx: 80 })
    ).toBe(0)
  })
})

describe("positionMarkPx", () => {
  it("derives mark from notional and size", () => {
    expect(positionMarkPx("2500", "0.5")).toBe(5000)
    expect(positionMarkPx("2500", "-0.5")).toBe(5000)
  })

  it("is null for flat or valueless rows", () => {
    expect(positionMarkPx("0", "1")).toBeNull()
    expect(positionMarkPx("100", "0")).toBeNull()
  })
})

describe("liquidationTone", () => {
  it("grades critical ≤10, warning ≤25, safe above", () => {
    expect(liquidationTone(5)).toBe("critical")
    expect(liquidationTone(10)).toBe("critical")
    expect(liquidationTone(15)).toBe("warning")
    expect(liquidationTone(25)).toBe("warning")
    expect(liquidationTone(40)).toBe("safe")
  })
})

describe("threshold settings parsing", () => {
  it("falls back to the default on rows saved before the setting existed", () => {
    expect(liquidationAlertThresholdFromSettings(undefined)).toBe(
      DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
    )
    expect(liquidationAlertThresholdFromSettings({})).toBe(
      DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
    )
    expect(liquidationAlertThresholdFromSettings("junk")).toBe(
      DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
    )
  })

  it("reads and clamps a saved threshold, keeping 0 as off", () => {
    expect(
      liquidationAlertThresholdFromSettings({
        liquidationAlertThresholdPct: 15,
      })
    ).toBe(15)
    expect(
      liquidationAlertThresholdFromSettings({ liquidationAlertThresholdPct: 0 })
    ).toBe(0)
    expect(clampLiquidationAlertThreshold(500)).toBe(90)
    expect(clampLiquidationAlertThreshold(-5)).toBe(0)
    expect(clampLiquidationAlertThreshold("10")).toBe(
      DEFAULT_LIQUIDATION_ALERT_THRESHOLD_PCT
    )
  })
})

describe("evaluateLiquidationAlerts", () => {
  const position = (coin: string, distanceSetup: { mark: number; liq: number }) => ({
    coin,
    szi: 1,
    markPx: distanceSetup.mark,
    liquidationPx: distanceSetup.liq,
  })

  it("alerts once per cooldown window while inside the threshold", () => {
    const lastAlertAt = new Map<string, number>()
    const first = evaluateLiquidationAlerts({
      walletId: "w1",
      positions: [position("ETH", { mark: 100, liq: 95 })],
      thresholdPct: 10,
      now: 1_000,
      lastAlertAt,
    })
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ coin: "ETH", side: "long", size: 1 })
    expect(first[0].distancePct).toBeCloseTo(5, 10)

    // One minute later, still hovering: suppressed by the cooldown.
    const second = evaluateLiquidationAlerts({
      walletId: "w1",
      positions: [position("ETH", { mark: 100, liq: 95 })],
      thresholdPct: 10,
      now: 61_000,
      lastAlertAt,
    })
    expect(second).toHaveLength(0)

    // After the cooldown window it alerts again.
    const third = evaluateLiquidationAlerts({
      walletId: "w1",
      positions: [position("ETH", { mark: 100, liq: 95 })],
      thresholdPct: 10,
      now: 1_000 + LIQUIDATION_ALERT_COOLDOWN_MS,
      lastAlertAt,
    })
    expect(third).toHaveLength(1)
  })

  it("ignores safe positions, missing marks, and a 0 threshold", () => {
    const lastAlertAt = new Map<string, number>()
    expect(
      evaluateLiquidationAlerts({
        walletId: "w1",
        positions: [position("ETH", { mark: 100, liq: 50 })],
        thresholdPct: 10,
        now: 1_000,
        lastAlertAt,
      })
    ).toHaveLength(0)
    expect(
      evaluateLiquidationAlerts({
        walletId: "w1",
        positions: [{ coin: "ETH", szi: 1, liquidationPx: 95, markPx: null }],
        thresholdPct: 10,
        now: 1_000,
        lastAlertAt,
      })
    ).toHaveLength(0)
    expect(
      evaluateLiquidationAlerts({
        walletId: "w1",
        positions: [position("ETH", { mark: 100, liq: 95 })],
        thresholdPct: 0,
        now: 1_000,
        lastAlertAt,
      })
    ).toHaveLength(0)
  })

  it("tracks positions independently per wallet and coin", () => {
    const lastAlertAt = new Map<string, number>()
    const drafts = evaluateLiquidationAlerts({
      walletId: "w1",
      positions: [
        position("ETH", { mark: 100, liq: 95 }),
        { coin: "BTC", szi: -2, markPx: 100, liquidationPx: 104 },
      ],
      thresholdPct: 10,
      now: 1_000,
      lastAlertAt,
    })
    expect(drafts).toHaveLength(2)
    expect(drafts[1]).toMatchObject({ coin: "BTC", side: "short", size: 2 })
    // A different wallet's identical position is rate-limited separately.
    const other = evaluateLiquidationAlerts({
      walletId: "w2",
      positions: [position("ETH", { mark: 100, liq: 95 })],
      thresholdPct: 10,
      now: 2_000,
      lastAlertAt,
    })
    expect(other).toHaveLength(1)
  })
})
