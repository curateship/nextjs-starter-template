import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import { DEFAULT_QFL_SETTINGS } from "@/lib/automations/qfl"
import type { BacktestCosts } from "@/lib/backtest/types"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest, runQflPortfolioBacktests } from "../backtest/runner"
import { createQflAutomationStrategy } from "./qfl-automation"
import { QflPortfolio } from "../qfl-portfolio"
import { resolveStrategy } from "../strategies/registry"

const STEP = 900_000
const costs: BacktestCosts = {
  takerFeeBps: 0,
  makerFeeBps: 0,
  slippageBps: 0,
}

function bar(
  index: number,
  close: number,
  low: number,
  high = close,
  volume = 10,
  open = close
): HistoryCandle {
  return {
    t: index * STEP,
    T: (index + 1) * STEP - 1,
    o: open,
    h: high,
    l: low,
    c: close,
    v: volume,
    n: 1,
  }
}

const setup = [
  bar(0, 101, 100, 102),
  bar(1, 101, 100, 102),
  bar(2, 101, 100, 102),
  bar(3, 101, 100, 102),
  bar(4, 92, 90, 93),
  bar(5, 95, 91, 96),
  bar(6, 87, 86, 96, 30, 95),
]

function qflConfig(
  overrides: Partial<typeof DEFAULT_QFL_SETTINGS> = {}
): AutomationConfig {
  return {
    v: 2,
    kind: "automation",
    interval: "15m",
    rules: [],
    protection: {},
    qfl: {
      nodeId: "qfl",
      ...DEFAULT_QFL_SETTINGS,
      basePeriods: 4,
      pumpPeriods: 1,
      maxCrackBars: 2,
      volumeLookback: 2,
      totalOrders: 2,
      priceStepPct: 5,
      ...overrides,
    },
  }
}

function run(config: AutomationConfig, candles: HistoryCandle[]) {
  const strategy = resolveStrategy(config)
  if (!strategy) throw new Error("QFL strategy did not resolve")
  return runBacktest({
    strategy,
    params: config,
    candles,
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "15m",
    costs,
  })
}

function portfolioConfig(
  market: string,
  config: AutomationConfig,
  candles: HistoryCandle[]
) {
  const strategy = resolveStrategy(config)
  if (!strategy) throw new Error("QFL strategy did not resolve")
  return {
    strategy,
    params: config,
    candles,
    simStartMs: 0,
    startingEquity: 10_000,
    market,
    interval: "15m" as const,
    costs,
  }
}

describe("QFL through the real backtest runner", () => {
  it("fills crossed and deeper levels once, then exits every level separately", () => {
    const result = run(qflConfig(), [...setup, bar(7, 89, 82, 90, 10, 87)])
    const first = result.fills.find((fill) => fill.purpose === "qfl:b:0")
    const second = result.fills.find((fill) => fill.purpose === "qfl:b:1")
    const firstProfit = result.fills.find((fill) => fill.purpose === "qfl:tp:0")
    const secondProfit = result.fills.find(
      (fill) => fill.purpose === "qfl:tp:1"
    )

    expect(first?.px).toBe(87)
    expect(second?.px).toBeCloseTo(83.25)
    expect(firstProfit?.px).toBeCloseTo(87 * 1.015)
    expect(secondProfit?.px).toBeCloseTo(83.25 * 1.015)
    expect(
      result.fills
        .filter((fill) => fill.purpose.startsWith("qfl:b:"))
        .reduce((sum, fill) => sum + fill.px * fill.sz, 0)
    ).toBeCloseTo(2_500)
    expect(result.openPosition).toBeNull()
  })

  it("fills the optional stop at its exact trigger", () => {
    const config = qflConfig({
      totalOrders: 1,
      stopEnabled: true,
      stopBelowFinalPct: 2,
    })
    const result = run(config, [...setup, bar(7, 82, 80, 87, 10, 87)])
    const exit = result.fills.find((fill) => fill.purpose === "qfl:exit")
    expect(exit?.px).toBeCloseTo(90 * (1 - 0.025) * (1 - 0.02))
    expect(result.openPosition).toBeNull()
  })

  it("uses Market Scanner only to reject an ineligible selected market", () => {
    const config = {
      ...qflConfig(),
      marketScanner: {
        nodeId: "scanner",
        minDailyVolumeUsd: 1_000_000_000_000,
        historyFilterEnabled: false,
        minHistoryMonths: 6,
      },
    } satisfies AutomationConfig

    expect(run(config, [...setup, bar(7, 89, 82, 90, 10, 87)]).fills).toEqual(
      []
    )
  })

  it("closes the remaining ladder after the optional hold limit", () => {
    const result = run(
      qflConfig({
        totalOrders: 1,
        timeExitEnabled: true,
        maxHoldHours: 0.1,
      }),
      [...setup, bar(7, 87, 86, 87)]
    )

    expect(result.fills.some((fill) => fill.purpose === "qfl:exit")).toBe(true)
    expect(result.openPosition).toBeNull()
  })

  it("ranks simultaneous markets before reserving shared exposure", () => {
    const config = qflConfig()
    const low = [...setup, bar(7, 87, 86, 88)]
    const high = setup.map((candle, index) =>
      index === 6 ? { ...candle, v: 40 } : candle
    )
    high.push(bar(7, 87, 86, 88))

    const results = runQflPortfolioBacktests([
      portfolioConfig("LOW", config, low),
      portfolioConfig("HIGH", config, high),
    ])

    expect(results.get("LOW")?.fills).toEqual([])
    expect(
      results.get("HIGH")?.fills.some((fill) => fill.purpose === "qfl:b:0")
    ).toBe(true)
  })

  it("uses realized profit from one market when sizing the next market", () => {
    const config = qflConfig()
    const first = [
      ...setup,
      bar(7, 89, 87, 90, 10, 87),
      ...Array.from({ length: 6 }, (_, index) => bar(8 + index, 101, 100, 102)),
    ]
    const second = [
      ...Array.from({ length: 10 }, (_, index) => bar(index, 101, 100, 102)),
      bar(10, 92, 90, 93),
      bar(11, 95, 91, 96),
      bar(12, 87, 86, 88, 30, 95),
      bar(13, 87, 86, 88),
    ]

    const results = runQflPortfolioBacktests([
      portfolioConfig("FIRST", config, first),
      portfolioConfig("SECOND", config, second),
    ])
    const secondEntry = results
      .get("SECOND")
      ?.fills.find((fill) => fill.purpose === "qfl:b:0")

    expect(secondEntry).toBeDefined()
    expect((secondEntry?.px ?? 0) * (secondEntry?.sz ?? 0)).toBeGreaterThan(
      1_000
    )
  })

  it("expires a candidate when another selected market misses its candle", () => {
    const config = qflConfig()
    const strategy = createQflAutomationStrategy(config)
    const portfolio = new QflPortfolio(25, ["TEST", "MISSING"])
    let candles = setup.map((candle) => ({
      t: candle.t,
      T: candle.T,
      s: "TEST",
      i: "15m" as const,
      o: String(candle.o),
      h: String(candle.h),
      l: String(candle.l),
      c: String(candle.c),
      v: String(candle.v),
      n: candle.n,
    }))
    let state = strategy.init(config as never)
    const context = () => ({
      market: "TEST",
      mid: candles.at(-1)?.c ?? "0",
      candles: () => candles,
      position: null,
      equity: "10000",
      startingEquity: "10000",
      qflPortfolio: portfolio,
      state,
      setState: (next: typeof state) => {
        state = next
      },
      emit: () => {},
      now: candles.at(-1)?.T ?? 0,
    })

    strategy.onCandleClose?.(context(), config as never, candles.at(-1)!)
    expect(state.candidate).not.toBeNull()
    strategy.desiredOrders(context(), config as never)

    const next = bar(7, 101, 100, 102)
    candles = [
      ...candles,
      {
        t: next.t,
        T: next.T,
        s: "TEST",
        i: "15m",
        o: String(next.o),
        h: String(next.h),
        l: String(next.l),
        c: String(next.c),
        v: String(next.v),
        n: next.n,
      },
    ]
    strategy.onCandleClose?.(context(), config as never, candles.at(-1)!)

    expect(state.candidate).toBeNull()
    expect(state.active).toBeNull()
  })
})
