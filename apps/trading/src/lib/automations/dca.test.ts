import { describe, expect, it } from "vitest"

import {
  compileAutomationGraph,
  automationConfigSchema,
  type AutomationEdge,
  type AutomationNode,
} from "./automation"
import {
  DEFAULT_DCA_RUNGS,
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
  x: 0,
  y: 0,
})

const takeProfit = (id: string, pct = 3): AutomationNode => ({
  id,
  kind: "takeProfit",
  pct,
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
  it("places each rung its deviation percent below the base", () => {
    const levels = dcaLevels(100, [
      { deviation: 5, size: 100 },
      { deviation: 8, size: 100 },
    ])
    expect(levels).toEqual([95, 92])
  })

  it("splits the max position across rungs by their size weight", () => {
    // Equal weights → equal shares that sum to the cap.
    expect(dcaAllocationPcts(DEFAULT_DCA_RUNGS, 25)).toEqual([5, 5, 5, 5, 5])
    // A heavier last rung takes a bigger share; the shares still sum to 20.
    const weighted = dcaAllocationPcts(
      [
        { deviation: 5, size: 100 },
        { deviation: 8, size: 300 },
      ],
      20
    )
    expect(weighted[0] + weighted[1]).toBeCloseTo(20)
    expect(weighted[1]).toBeCloseTo(15)
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
