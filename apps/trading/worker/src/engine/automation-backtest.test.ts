import { describe, expect, it } from "vitest"

import type { AutomationStrategyConfig } from "@/lib/automations/automation"
import { DEFAULT_BACKTEST_COSTS } from "@/lib/backtest/types"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest } from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"

const config: AutomationStrategyConfig = {
  v: 2,
  kind: "automation",
  interval: "15m",
  protection: { takeProfitPct: 5, stopLossPct: 2 },
  rules: [
    {
      id: "buy",
      action: "buy",
      targetEquityPct: 25,
      condition: {
        kind: "trigger",
        nodeId: "breakout",
        indicator: { type: "breakout", params: { lookback: 3 } },
        side: "buy",
      },
    },
  ],
}

const STEP = 900_000
const candles: HistoryCandle[] = [
  { t: 0, T: STEP - 1, o: 9, h: 10, l: 8, c: 9, v: 1, n: 1 },
  { t: STEP, T: STEP * 2 - 1, o: 9, h: 11, l: 9, c: 10, v: 1, n: 1 },
  { t: STEP * 2, T: STEP * 3 - 1, o: 10, h: 12, l: 10, c: 11, v: 1, n: 1 },
  { t: STEP * 3, T: STEP * 4 - 1, o: 11, h: 14, l: 11, c: 13, v: 1, n: 1 },
  { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 14.5, l: 12.9, c: 14, v: 1, n: 1 },
]

function run(configToRun: AutomationStrategyConfig, history: HistoryCandle[]) {
  const strategy = resolveStrategy(configToRun)
  if (!strategy) throw new Error("Automation strategy did not resolve")
  return runBacktest({
    strategy,
    params: configToRun,
    candles: history,
    simStartMs: 0,
    startingEquity: 10_000,
    market: "TEST",
    interval: "15m",
    costs: DEFAULT_BACKTEST_COSTS,
  })
}

describe("Automation through the real backtest runner", () => {
  it("enters at the portfolio target and exits at the exact take-profit", () => {
    const result = run(config, candles)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")

    expect(entry).toBeDefined()
    expect(entry!.px * entry!.sz).toBeCloseTo(2_500, 6)
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(entry!.px * 1.05, 8)
    expect(result.stats.fees).toBeGreaterThan(0)
  })

  it("exits at the exact stop-loss trigger", () => {
    const stopHistory = [
      ...candles.slice(0, 4),
      {
        t: STEP * 4,
        T: STEP * 5 - 1,
        o: 13,
        h: 13.1,
        l: 12,
        c: 12.5,
        v: 1,
        n: 1,
      },
    ]
    const result = run(config, stopHistory)
    const entry = result.fills.find(
      (fill) => fill.purpose === "auto:target-entry"
    )
    const exit = result.fills.find((fill) => fill.purpose === "auto:close")

    expect(entry).toBeDefined()
    expect(exit).toBeDefined()
    expect(exit!.px).toBeCloseTo(entry!.px * 0.98, 8)
  })

  it("flips from its long target into a larger short target", () => {
    const flipConfig: AutomationStrategyConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "short",
          action: "short",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(flipConfig, history)

    expect(result.fills.map((fill) => fill.purpose)).toEqual([
      "auto:target-entry",
      "auto:flip-close",
      "auto:target-entry",
    ])
    expect(result.openPosition?.side).toBe("short")
    expect(
      Math.abs(result.openPosition!.szi * result.openPosition!.entryPx)
    ).toBeCloseTo((10_000 + result.stats.netPnl) * 0.4, -1)
  })

  it("reverses a long into a short in one step when a Reverse rule matches", () => {
    const reverseConfig: AutomationStrategyConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "reverse",
          action: "reverse",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(reverseConfig, history)

    expect(result.fills.map((fill) => fill.purpose)).toEqual([
      "auto:target-entry",
      "auto:flip-close",
      "auto:target-entry",
    ])
    expect(result.openPosition?.side).toBe("short")
    expect(
      Math.abs(result.openPosition!.szi * result.openPosition!.entryPx)
    ).toBeCloseTo((10_000 + result.stats.netPnl) * 0.4, -1)
  })

  it("does not reverse when flat — the first entry still needs its own signal", () => {
    const reverseOnlyConfig: AutomationStrategyConfig = {
      ...config,
      protection: {},
      rules: [
        {
          id: "reverse",
          action: "reverse",
          targetEquityPct: 40,
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "buy",
          },
        },
      ],
    }
    // Breakout buys fire on the rising candles, but with no open position a
    // Reverse has nothing to flip, so no orders are ever placed.
    expect(run(reverseOnlyConfig, candles).fills).toEqual([])
  })

  it("closes a position when a Close rule matches", () => {
    const closeConfig: AutomationStrategyConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "close",
          action: "close",
          condition: {
            kind: "trigger",
            nodeId: "breakout",
            indicator: { type: "breakout", params: { lookback: 3 } },
            side: "sell",
          },
        },
      ],
    }
    const history = [
      ...candles.slice(0, 4),
      { t: STEP * 4, T: STEP * 5 - 1, o: 13, h: 13.5, l: 7, c: 8, v: 1, n: 1 },
    ]
    const result = run(closeConfig, history)

    expect(result.fills.at(-1)?.purpose).toBe("auto:close")
    expect(result.openPosition).toBeNull()
  })

  it("rebalances a repeated signal instead of stacking another target entry", () => {
    const rebalanceConfig = { ...config, protection: {} }
    const history = [
      ...candles.slice(0, 4),
      {
        t: STEP * 4,
        T: STEP * 5 - 1,
        o: 13,
        h: 16,
        l: 12.9,
        c: 15,
        v: 1,
        n: 1,
      },
    ]
    const result = run(rebalanceConfig, history)

    expect(
      result.fills.filter((fill) => fill.purpose === "auto:target-entry")
    ).toHaveLength(1)
    expect(
      result.fills.some((fill) => fill.purpose === "auto:target-reduce")
    ).toBe(true)
  })

  it("places no order when Buy and Short conflict on one candle", () => {
    const conflictConfig: AutomationStrategyConfig = {
      ...config,
      protection: {},
      rules: [
        config.rules[0],
        {
          id: "short",
          action: "short",
          targetEquityPct: 40,
          condition: { ...config.rules[0].condition },
        },
      ],
    }

    expect(run(conflictConfig, candles.slice(0, 4)).fills).toEqual([])
  })
})
