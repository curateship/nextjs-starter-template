import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "@/lib/automations/automation"
import type { BacktestCosts } from "@/lib/backtest/types"
import type { HistoryCandle } from "@/server/backtest/history"

import { runBacktest } from "../backtest/runner"
import { resolveStrategy } from "../strategies/registry"

const STEP = 900_000
const costs: BacktestCosts = { takerFeeBps: 0, makerFeeBps: 0, slippageBps: 0 }

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

// A shelf held at low 100, then a panic crack below it (bar 6).
const setup = [
  bar(0, 101, 100, 102),
  bar(1, 101, 100, 102),
  bar(2, 101, 100, 102),
  bar(3, 101, 100, 102),
  bar(4, 92, 90, 93),
  bar(5, 95, 91, 96),
  bar(6, 87, 86, 96, 30, 95),
]

function dcaConfig(overrides: Partial<AutomationConfig["dca"]> = {}): AutomationConfig {
  return {
    v: 2,
    kind: "automation",
    interval: "15m",
    rules: [],
    protection: { long: { takeProfitPct: 3 } },
    dca: {
      nodeId: "dca",
      rungs: [
        { deviation: 5, size: 100 },
        { deviation: 8, size: 100 },
      ],
      maxPositionPct: 10,
      basePeriods: 4,
      pumpPeriods: 1,
      crackPct: 2.5,
      maxCrackBars: 4,
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
      ...overrides,
    },
  }
}

function run(config: AutomationConfig, candles: HistoryCandle[]) {
  const strategy = resolveStrategy(config)
  if (!strategy) throw new Error("DCA strategy did not resolve")
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

describe("DCA through the real backtest runner", () => {
  it("rests a base-anchored ladder, caps the pot, and takes profit off the average", () => {
    // bar 7 dips deep enough to fill both rungs; bar 8 rips up to trigger TP.
    const result = run(dcaConfig(), [
      ...setup,
      bar(7, 80, 70, 88, 10, 87),
      bar(8, 200, 79, 210, 10, 82),
    ])

    const buys = result.fills.filter((fill) => fill.purpose.startsWith("dca:b:"))
    const exit = result.fills.find((fill) => fill.purpose === "dca:exit")

    // Both rungs filled.
    expect(buys.length).toBe(2)
    // The whole ladder deployed exactly the 10% cap (each rung 5% of $10k).
    expect(
      buys.reduce((sum, fill) => sum + fill.px * fill.sz, 0)
    ).toBeCloseTo(1_000)
    // Take profit closed the averaged position; nothing left open.
    expect(exit).toBeTruthy()
    expect(result.openPosition).toBeNull()
  })

  it("skips the crack when Past base quality has no history to judge", () => {
    // The filter is on but the data is only a few bars — no months of history
    // to score, so the crack does not qualify and no ladder is placed.
    const result = run(dcaConfig({ respectFilterEnabled: true }), [
      ...setup,
      bar(7, 80, 70, 88, 10, 87),
      bar(8, 200, 79, 210, 10, 82),
    ])
    expect(result.fills.length).toBe(0)
    expect(result.openPosition).toBeNull()
  })

  it("does nothing without a crack", () => {
    // The shelf holds — no close ever cracks below it, so no ladder is placed.
    const result = run(dcaConfig(), [
      ...setup.slice(0, 4),
      bar(4, 101, 100, 102),
      bar(5, 101, 100, 102),
      bar(6, 101, 100, 102),
    ])
    expect(result.fills.length).toBe(0)
    expect(result.openPosition).toBeNull()
  })
})
