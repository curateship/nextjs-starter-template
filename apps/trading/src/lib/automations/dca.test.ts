import { describe, expect, it } from "vitest"

import {
  compileAutomationGraph,
  automationConfigSchema,
  type AutomationEdge,
  type AutomationNode,
  type AutomationTakeProfitNode,
} from "./automation"
import {
  DEFAULT_DCA_RUNGS,
  DEFAULT_DCA_SIZE_MULTIPLIER,
  dcaAllocationPcts,
  dcaLevels,
} from "./dca"

const baseIndicator = (id: string): AutomationNode => ({
  id,
  kind: "indicator",
  x: 0,
  y: 0,
  indicator: {
    type: "base",
    params: { basePeriods: 36, pumpPeriods: 8, crackPct: 2.5 },
  },
})

const dca = (id: string, maxPositionPct = 25): AutomationNode => ({
  id,
  kind: "dca",
  rungs: DEFAULT_DCA_RUNGS.map((rung) => ({ ...rung })),
  maxPositionPct,
  sizeMultiplier: DEFAULT_DCA_SIZE_MULTIPLIER,
  x: 0,
  y: 0,
})

const takeProfit = (
  id: string,
  pct = 3,
  mode?: AutomationTakeProfitNode["mode"]
): AutomationNode => ({
  id,
  kind: "takeProfit",
  pct,
  ...(mode ? { mode } : {}),
  x: 0,
  y: 0,
})

const stopLoss = (id: string, pct = 8): AutomationNode => ({
  id,
  kind: "stopLoss",
  pct,
  x: 0,
  y: 0,
})

const edge = (
  id: string,
  from: string,
  sourcePort: "bullish" | "tp" | "sl",
  to: string
): AutomationEdge => ({ id, from, sourcePort, to })

describe("dca ladder math", () => {
  it("compounds each rung's deviation off the previous buy, not the base", () => {
    const levels = dcaLevels(100, [{ deviation: 5 }, { deviation: 8 }])
    // First rung: 5% under the base (95). Second: a further 8% under the FIRST
    // buy (95 × 0.92 = 87.4), not 8% under the base (which would be 92).
    expect(levels[0]).toBeCloseTo(95)
    expect(levels[1]).toBeCloseTo(87.4)
  })

  it("splits the max position exponentially by the size ramp", () => {
    // Ramp of 1 = every buy equal.
    expect(dcaAllocationPcts(5, 25, 1)).toEqual([5, 5, 5, 5, 5])
    // Ramp of 2 = each buy doubles the last: weights 1, 2, 4 (sum 7) of 21%.
    const doubling = dcaAllocationPcts(3, 21, 2)
    expect(doubling[0]).toBeCloseTo(3)
    expect(doubling[1]).toBeCloseTo(6)
    expect(doubling[2]).toBeCloseTo(12)
    // The shares always sum back to the cap.
    expect(doubling.reduce((sum, pct) => sum + pct, 0)).toBeCloseTo(21)
  })
})

describe("compileAutomationGraph — DCA", () => {
  it("compiles Base → DCA → TP/SL into a runnable config", () => {
    const result = compileAutomationGraph({
      interval: "1h",
      graph: {
        nodes: [
          baseIndicator("base"),
          dca("dca", 25),
          takeProfit("tp", 3),
          stopLoss("sl", 8),
        ],
        edges: [
          edge("e1", "base", "bullish", "dca"),
          edge("e2", "dca", "tp", "tp"),
          edge("e3", "dca", "sl", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.dca).toEqual({
      nodeId: "dca",
      rungs: DEFAULT_DCA_RUNGS,
      maxPositionPct: 25,
      sizeMultiplier: DEFAULT_DCA_SIZE_MULTIPLIER,
      basePeriods: 36,
      pumpPeriods: 8,
      crackPct: 2.5,
      maxCrackBars: 4,
      // Past base quality defaults flow from the Base indicator.
      respectFilterEnabled: false,
      respectLookbackMonths: 6,
      minRespectPct: 80,
      recoveryTargetPct: -2,
    })
    // The exits fold into the long side, measured from the blended average.
    expect(result.config?.protection.long).toEqual({
      takeProfitPct: 3,
      stopLossPct: 8,
    })
    // The compiled config survives the schema the worker parses it through.
    expect(automationConfigSchema.safeParse(result.config).success).toBe(true)
  })

  it("folds a DCA-fed take-profit's 'previous rung' mode onto the long side", () => {
    const result = compileAutomationGraph({
      interval: "1h",
      graph: {
        nodes: [
          baseIndicator("base"),
          dca("dca", 25),
          takeProfit("tp", 3, "previousRungHoldFirst"),
        ],
        edges: [
          edge("e1", "base", "bullish", "dca"),
          edge("e2", "dca", "tp", "tp"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.errors).toEqual([])
    expect(result.config?.protection.long).toEqual({
      takeProfitPct: 3,
      takeProfitMode: "previousRungHoldFirst",
    })
  })

  it("rejects a DCA node with no Base indicator feeding it", () => {
    const result = compileAutomationGraph({
      interval: "1h",
      graph: {
        nodes: [dca("dca")],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
    expect(
      result.errors.some((error) =>
        error.message.includes("Connect a Base indicator")
      )
    ).toBe(true)
  })

  it("rejects mixing a DCA node with an owned entry action", () => {
    const result = compileAutomationGraph({
      interval: "1h",
      graph: {
        nodes: [
          baseIndicator("base"),
          dca("dca"),
          {
            id: "long",
            kind: "action",
            action: "buy",
            targetEquityPct: 10,
            x: 0,
            y: 0,
          },
          baseIndicator("base2"),
        ],
        edges: [
          edge("e1", "base", "bullish", "dca"),
          edge("e2", "base2", "bullish", "long"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
    expect(result.errors.some((error) => error.code === "action_input")).toBe(
      true
    )
  })
})
