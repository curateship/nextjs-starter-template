import { describe, expect, it } from "vitest"

import type { AutomationConfig } from "./strategy-config"
import { automationInputRows } from "./strategy-config"
import { computeStrategyOutput } from "./config-output"

const candles = [
  { t: 0, o: 9, h: 10, l: 8, c: 9, v: 1 },
  { t: 1, o: 9, h: 11, l: 9, c: 10, v: 1 },
  { t: 2, o: 10, h: 12, l: 10, c: 11, v: 1 },
  { t: 3, o: 11, h: 14, l: 11, c: 13, v: 1 },
]

describe("computeStrategyOutput", () => {
  it("returns merged indicator paint and entry signals for an Automation", () => {
    const config: AutomationConfig = {
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
    expect(automationInputRows(config).map((row) => row.label)).not.toContain(
      "Timeframe"
    )
  })
})
