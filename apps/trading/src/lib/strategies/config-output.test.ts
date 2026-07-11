import { describe, expect, it } from "vitest"

import type { StrategyConfig } from "./strategy-config"
import { strategyInputRows } from "./strategy-config"
import { computeStrategyOutput } from "./config-output"

const candles = [
  { t: 0, o: 9, h: 10, l: 8, c: 9, v: 1 },
  { t: 1, o: 9, h: 11, l: 9, c: 10, v: 1 },
  { t: 2, o: 10, h: 12, l: 10, c: 11, v: 1 },
  { t: 3, o: 11, h: 14, l: 11, c: 13, v: 1 },
]

describe("computeStrategyOutput", () => {
  it("returns merged indicator paint and entry signals for an Automation", () => {
    const config: StrategyConfig = {
      v: 2,
      kind: "automation",
      interval: "15m",
      protection: {},
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

    const output = computeStrategyOutput(candles, config)

    expect(output.signals).toEqual([{ time: 3, side: "buy" }])
    expect(output.paint.lines[0].id).toBe("breakout:breakout-high")
    expect(strategyInputRows(config).map((row) => row.label)).not.toContain(
      "Timeframe"
    )
  })

  it("returns empty paint for a non-indicator DCA strategy", () => {
    const config: StrategyConfig = {
      v: 2,
      kind: "dca",
      interval: "15m",
      dca: {
        baseOrderUsd: 49,
        priceStepPct: 0.5,
        stepMultiplier: 1,
        sizeMultiplier: 1.75,
        safetyOrders: 8,
        takeProfitPct: 0.5,
      },
    }

    expect(computeStrategyOutput(candles, config)).toEqual({
      paint: { indicators: [], lines: [], zones: [], barColors: [] },
      signals: [],
    })
  })
})
