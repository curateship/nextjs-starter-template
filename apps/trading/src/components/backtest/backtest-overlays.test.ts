import { describe, expect, it } from "vitest"

import type { BacktestResult } from "@/lib/backtest/types"
import type { StrategyParams } from "@/lib/strategies/params"
import type { HistoryCandle } from "@/server/backtest/history"

import { buildRunMarkers, buildStrategyOverlays } from "./backtest-overlays"

function emptyResult(partial: Partial<BacktestResult> = {}): BacktestResult {
  return {
    equityCurve: [],
    trades: [],
    fills: [],
    openPosition: null,
    stats: {} as BacktestResult["stats"],
    ...partial,
  }
}

const candle = (t: number, c: number): HistoryCandle => ({
  t,
  T: t + 999,
  o: c,
  h: c + 1,
  l: c - 1,
  c,
  v: 1,
  n: 1,
})

describe("buildStrategyOverlays", () => {
  it("maps momentum ema_cross onto the shared indicator system", () => {
    const params = {
      strategyType: "momentum",
      signal: "ema_cross",
      interval: "1h",
      emaFast: 12,
      emaSlow: 26,
      orderSizeUsd: 100,
      direction: "both",
    } as StrategyParams
    const { indicators, overlayLines } = buildStrategyOverlays(params, [], null)
    expect(indicators).toEqual([
      { id: "ema-fast", type: "ema", enabled: true, params: { period: 12 } },
      { id: "ema-slow", type: "ema", enabled: true, params: { period: 26 } },
    ])
    expect(overlayLines).toHaveLength(0)
  })

  it("maps momentum rsi onto the shared RSI sub-pane", () => {
    const params = {
      strategyType: "momentum",
      signal: "rsi",
      interval: "1h",
      rsiPeriod: 14,
      rsiBuyBelow: 30,
      rsiSellAbove: 70,
      orderSizeUsd: 100,
      direction: "both",
    } as StrategyParams
    const { indicators } = buildStrategyOverlays(params, [], null)
    expect(indicators).toEqual([
      { id: "rsi", type: "rsi", enabled: true, params: { period: 14 } },
    ])
  })

  it("builds a breakout channel from candle extremes", () => {
    const candles = [100, 102, 101, 104, 103].map((c, i) => candle(i * 1000, c))
    const params = {
      strategyType: "momentum",
      signal: "breakout",
      interval: "1h",
      breakoutLookback: 2,
      orderSizeUsd: 100,
      direction: "both",
    } as StrategyParams
    const { overlayLines } = buildStrategyOverlays(params, candles, null)
    const upper = overlayLines.find((l) => l.id === "breakout-high")
    expect(upper?.points).toHaveLength(3) // indices 2..4
    // Window for index 2 is candles 0-1: highs 101, 103.
    expect(upper?.points[0]).toEqual({ time: 2000, value: 103 })
  })

  it("draws draggable grid bounds, interior levels, and draggable TP/SL", () => {
    const params = {
      strategyType: "grid",
      lowerPx: "96",
      upperPx: "104",
      levels: 5,
      sizePerLevelUsd: 100,
      side: "both",
      takeProfitPx: "110",
      stopLossPx: "90",
    } as StrategyParams
    const { priceLines } = buildStrategyOverlays(params, [], null)

    const lowerLine = priceLines.find((l) => l.id === "grid-lower")
    const upperLine = priceLines.find((l) => l.id === "grid-upper")
    expect(lowerLine).toMatchObject({ price: 96, draggable: true })
    expect(upperLine).toMatchObject({ price: 104, draggable: true })

    const interior = priceLines.filter((l) => l.lineStyle === "dashed")
    expect(interior.map((l) => l.price)).toEqual([98, 100, 102])
    expect(interior.every((l) => !l.draggable)).toBe(true)

    expect(priceLines.find((l) => l.id === "grid-tp")).toMatchObject({
      price: 110,
      draggable: true,
    })
    expect(priceLines.find((l) => l.id === "grid-sl")).toMatchObject({
      price: 90,
      draggable: true,
    })
  })

  it("anchors the DCA ladder on the base fill, or last close for preview", () => {
    const params = {
      strategyType: "dca",
      direction: "long",
      baseOrderUsd: 100,
      safetyOrderUsd: 100,
      maxSafetyOrders: 2,
      priceStepPct: 1,
      stepMultiplier: 2,
      sizeMultiplier: 1.5,
      takeProfitPct: 1.5,
    } as StrategyParams

    const withRun = buildStrategyOverlays(params, [candle(0, 200)], emptyResult({
      fills: [
        { t: 0, side: "buy", px: 100, sz: 1, fee: 0, closedPnl: 0, purpose: "dca:base" },
      ],
    }))
    // deviations: 1% then 1% + 1%·2 = 3% → 99 and 97 off the 100 base fill.
    expect(withRun.priceLines.find((l) => l.id === "dca-safety-1")?.price).toBeCloseTo(99, 6)
    expect(withRun.priceLines.find((l) => l.id === "dca-safety-2")?.price).toBeCloseTo(97, 6)

    const preview = buildStrategyOverlays(params, [candle(0, 200)], null)
    expect(preview.priceLines.find((l) => l.id === "dca-safety-1")?.price).toBeCloseTo(198, 6)
  })
})

describe("buildRunMarkers", () => {
  it("emits entry and exit markers per round trip plus the open position", () => {
    const result = emptyResult({
      trades: [
        {
          n: 1,
          side: "long",
          entryTime: 10,
          entryPx: 100,
          exitTime: 20,
          exitPx: 110,
          qty: 1,
          pnl: 10,
          returnPct: 10,
          cumPnl: 10,
        },
      ],
      openPosition: { side: "short", szi: -1, entryPx: 105, entryTime: 30 },
    })
    expect(buildRunMarkers(result)).toEqual([
      { time: 10, side: "buy" },
      { time: 20, side: "sell" },
      { time: 30, side: "sell" },
    ])
  })
})
