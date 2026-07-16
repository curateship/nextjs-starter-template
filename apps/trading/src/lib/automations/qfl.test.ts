import { describe, expect, it } from "vitest"

import type { IndicatorCandle } from "@/lib/indicators/contract"
import { totalRunBars } from "@/lib/backtest/types"

import {
  advanceQflBaseTracker,
  createQflBaseTracker,
  DEFAULT_MARKET_SCANNER_SETTINGS,
  DEFAULT_QFL_SETTINGS,
  findQflCandidate,
  hasMinimumMarketHistory,
  qflAllocationPcts,
  qflBaseRespectScore,
  qflHistoryBars,
  qflLevels,
  qflProfitTarget,
  qflRequiredHistoryMonths,
  qflSettingsSchema,
} from "./qfl"
import { compileAutomationGraph, type AutomationNode } from "./automation"
import { qflBase } from "../strategies/indicators"

const settings = qflSettingsSchema.parse({
  ...DEFAULT_QFL_SETTINGS,
  basePeriods: 4,
  pumpPeriods: 1,
  maxCrackBars: 2,
  volumeLookback: 2,
  totalOrders: 3,
  respectLookbackMonths: 1,
})

function candle(
  t: number,
  close: number,
  low: number,
  high = close,
  volume = 10
): IndicatorCandle {
  return { t, o: close, h: high, l: low, c: close, v: volume }
}

describe("QFL calculations", () => {
  it("anchors every level to the base and caps total allocation", () => {
    expect(qflLevels(100, settings)).toEqual([97.5, 96, 94.5])
    const allocations = qflAllocationPcts(settings)
    expect(allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(25)
    expect(allocations[2]).toBeCloseTo(allocations[1] * 1.5)
    expect(qflProfitTarget(97.5, 100, settings)).toBeCloseTo(98.9625)
  })

  it("requires a fresh, fast, high-volume crack", () => {
    const candles = [
      candle(0, 101, 100),
      candle(1, 101, 100),
      candle(2, 101, 100),
      candle(3, 101, 100),
      candle(4, 92, 90),
      candle(5, 95, 91),
      candle(6, 87, 86, 88, 30),
    ]
    const found = findQflCandidate(candles, settings)
    expect(found).toMatchObject({ base: 90, triggerPrice: 87 })
    expect(found?.volumeMultiple).toBe(3)
    expect(
      findQflCandidate([...candles, candle(7, 86, 85, 87, 30)], settings)
    ).toBeNull()
    expect(
      findQflCandidate(
        [...candles.slice(0, -1), candle(6, 87, 86, 88, 5)],
        settings
      )
    ).toBeNull()
  })

  it("tracks the same base one candle at a time", () => {
    const candles = [20, 18, 16, 14, 12, 10, 12, 13, 9, 11, 12, 13].map(
      (low, index) => candle(index, low + 1, low)
    )
    const batch = qflBase(candles, 4, 2).raw
    let tracker = createQflBaseTracker(4, 2)

    candles.forEach((item, index) => {
      tracker = advanceQflBaseTracker(tracker, item)
      const expected = batch[index]
      expect(tracker.currentBase).toBe(
        Number.isFinite(expected) ? expected : null
      )
      const previous = batch[index - 1]
      expect(tracker.previousBase).toBe(
        Number.isFinite(previous) ? previous : null
      )
    })
  })

  it("keeps lower bases inside the first broken-base recovery test", () => {
    const day = 86_400_000
    const candles = Array.from({ length: 40 }, (_, index) =>
      candle(index * day, 101, 100, 102)
    )
    candles[25] = candle(25 * day, 92, 90, 93)
    candles[26] = candle(26 * day, 95, 91, 96)
    candles[27] = candle(27 * day, 87, 86, 88)
    candles[28] = candle(28 * day, 82, 80, 83)
    candles[29] = candle(29 * day, 85, 81, 86)
    candles[30] = candle(30 * day, 77, 76, 78)
    candles[31] = candle(31 * day, 88, 77, 89)

    expect(qflBaseRespectScore(candles.slice(0, 32), settings)).toMatchObject({
      respected: 1,
      total: 1,
      rate: 100,
      hasFullHistory: true,
    })

    candles[31] = candle(31 * day, 84, 77, 87)
    expect(qflBaseRespectScore(candles.slice(0, 32), settings)).toMatchObject({
      respected: 0,
      total: 1,
      rate: 0,
    })
  })

  it("never lets candles after the scoring time improve base respect", () => {
    const day = 86_400_000
    const candles = Array.from({ length: 32 }, (_, index) =>
      candle(index * day, 101, 100, 102)
    )
    candles[25] = candle(25 * day, 92, 90, 93)
    candles[26] = candle(26 * day, 95, 91, 96)
    candles[27] = candle(27 * day, 87, 86, 88)
    const scoredAt = candles[27].t
    candles.push(candle(32 * day, 101, 85, 102))

    expect(qflBaseRespectScore(candles, settings, scoredAt)).toMatchObject({
      respected: 0,
      total: 1,
      rate: 0,
    })
  })

  it("checks whether a selected market has enough history", () => {
    const month = 30 * 86_400_000
    const candles = [candle(0, 100, 99), candle(6 * month, 100, 99)]

    expect(hasMinimumMarketHistory(candles, 6)).toBe(true)
    expect(hasMinimumMarketHistory(candles, 7)).toBe(false)
  })

  it("counts required QFL history in a grouped backtest's candle cost", () => {
    const config = {
      v: 2,
      kind: "automation",
      interval: "1m",
      rules: [],
      protection: {},
      qfl: {
        nodeId: "qfl",
        ...DEFAULT_QFL_SETTINGS,
        respectFilterEnabled: true,
        respectLookbackMonths: 6,
      },
    } as const

    expect(totalRunBars(config, "1m", 1, 4)).toBeGreaterThan(1_000_000)
  })

  it("keeps a complete day for daily-volume ranking", () => {
    expect(qflHistoryBars(settings, "1m", 0)).toBeGreaterThanOrEqual(1_441)
  })

  it("loads respect history for ranking even when strict filtering is off", () => {
    expect(
      qflRequiredHistoryMonths(
        { ...settings, respectFilterEnabled: false, respectLookbackMonths: 6 },
        undefined
      )
    ).toBe(6)
  })

  it("compiles QFL alone and rejects another entry owner", () => {
    const qfl: AutomationNode = {
      id: "qfl",
      kind: "qfl",
      ...DEFAULT_QFL_SETTINGS,
      x: 300,
      y: 0,
    }
    const compiled = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [qfl],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(compiled.errors).toEqual([])
    expect(compiled.config?.qfl?.totalOrders).toBe(5)
    expect(compiled.config?.rules).toEqual([])

    const long: AutomationNode = {
      id: "long",
      kind: "action",
      action: "buy",
      targetEquityPct: 10,
      x: 600,
      y: 0,
    }
    const invalid = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [qfl, long],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(invalid.config).toBeNull()
    expect(
      invalid.errors.some((error) => error.message.includes("QFL owns entries"))
    ).toBe(true)
  })

  it("compiles Market Scanner eligibility into QFL without choosing markets", () => {
    const scanner: AutomationNode = {
      id: "scanner",
      kind: "marketScanner",
      ...DEFAULT_MARKET_SCANNER_SETTINGS,
      historyFilterEnabled: true,
      x: 0,
      y: 0,
    }
    const qfl: AutomationNode = {
      id: "qfl",
      kind: "qfl",
      ...DEFAULT_QFL_SETTINGS,
      x: 300,
      y: 0,
    }
    const compiled = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [scanner, qfl],
        edges: [
          {
            id: "scanner-qfl",
            from: scanner.id,
            to: qfl.id,
            sourcePort: "markets",
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(compiled.errors).toEqual([])
    expect(compiled.config?.marketScanner).toEqual({
      nodeId: "scanner",
      ...DEFAULT_MARKET_SCANNER_SETTINGS,
      historyFilterEnabled: true,
    })
    expect(compiled.config?.marketScanner).not.toHaveProperty("markets")
    expect(compiled.config?.marketScanner).not.toHaveProperty("marketScope")
  })
})
