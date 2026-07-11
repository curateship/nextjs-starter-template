import { describe, expect, it, vi } from "vitest"

import {
  STRATEGY_EDITOR_TYPE_IDS,
  STRATEGY_TYPE_IDS,
  strategyConfigSchema,
  strategyTypeOf,
} from "@/lib/strategies/strategy-config"
import { INDICATORS } from "@/lib/indicators/registry"

import {
  automationDraftSchema,
  automationStrategyConfigSchema,
  compileAutomationGraph,
  resolveAutomationActions,
  type AutomationEdge,
  type AutomationNode,
} from "./automation"
import { evaluateAutomation } from "./evaluate"

const indicator = (
  id: string,
  type: "ema_cross" | "rsi_levels" = "ema_cross"
): AutomationNode => ({
  id,
  kind: "indicator",
  x: 0,
  y: 0,
  indicator:
    type === "ema_cross"
      ? { type, params: { fast: 20, slow: 50 } }
      : { type, params: { period: 14, buyBelow: 30, sellAbove: 70 } },
})

const logic = (id: string, op: "and" | "or"): AutomationNode => ({
  id,
  kind: "logic",
  op,
  x: 0,
  y: 0,
})

const action = (
  id: string,
  actionType: "buy" | "short" | "close",
  targetEquityPct = 10
): AutomationNode => ({
  id,
  kind: "action",
  action: actionType,
  targetEquityPct: actionType === "close" ? undefined : targetEquityPct,
  x: 0,
  y: 0,
})

const edge = (
  id: string,
  from: string,
  sourcePort: "bullish" | "bearish" | "match",
  to: string
): AutomationEdge => ({ id, from, sourcePort, to })

describe("compileAutomationGraph", () => {
  it("compiles a direct indicator output into an action rule", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [indicator("ema"), action("buy", "buy", 25)],
        edges: [edge("e1", "ema", "bullish", "buy")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    expect(result.config?.rules).toEqual([
      {
        id: "buy",
        action: "buy",
        targetEquityPct: 25,
        condition: {
          kind: "trigger",
          nodeId: "ema",
          indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
          side: "buy",
        },
      },
    ])
  })

  it("requires every AND input to fire on the same evaluation", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          logic("both", "and"),
          action("buy", "buy", 20),
        ],
        edges: [
          edge("e1", "ema", "bullish", "both"),
          edge("e2", "rsi", "bullish", "both"),
          edge("e3", "both", "match", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    const rules = result.config?.rules ?? []
    expect(resolveAutomationActions(rules, new Set(["ema:buy"]))).toEqual({
      action: null,
      warning: null,
    })
    expect(resolveAutomationActions(rules, new Set(["rsi:buy"]))).toEqual({
      action: null,
      warning: null,
    })
    expect(
      resolveAutomationActions(rules, new Set(["ema:buy", "rsi:buy"]))
    ).toEqual({ action: { action: "buy", targetEquityPct: 20 }, warning: null })
  })

  it("lets OR match any connected signal", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          logic("either", "or"),
          action("short", "short", 15),
        ],
        edges: [
          edge("e1", "ema", "bearish", "either"),
          edge("e2", "rsi", "bearish", "either"),
          edge("e3", "either", "match", "short"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    const rules = result.config?.rules ?? []
    expect(resolveAutomationActions(rules, new Set(["rsi:sell"]))).toEqual({
      action: { action: "short", targetEquityPct: 15 },
      warning: null,
    })
  })

  it("compiles nested AND and OR conditions", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          indicator("confirm"),
          logic("either", "or"),
          logic("both", "and"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "bullish", "either"),
          edge("e2", "rsi", "bullish", "either"),
          edge("e3", "either", "match", "both"),
          edge("e4", "confirm", "bullish", "both"),
          edge("e5", "both", "match", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    expect(
      resolveAutomationActions(
        result.config?.rules ?? [],
        new Set(["rsi:buy", "confirm:buy"])
      ).action
    ).toEqual({ action: "buy", targetEquityPct: 30 })
    expect(
      resolveAutomationActions(result.config?.rules ?? [], new Set(["ema:buy"]))
        .action
    ).toBeNull()
  })

  it("rejects cycles, dangling nodes, and actions without one condition", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("unused"),
          logic("a", "and"),
          logic("b", "or"),
          action("buy", "buy", 10),
        ],
        edges: [edge("e1", "a", "match", "b"), edge("e2", "b", "match", "a")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["cycle", "dangling", "action_input"])
    )
  })

  it("rejects duplicate connection ids and targets on Close actions", () => {
    const closeWithTarget: Extract<AutomationNode, { kind: "action" }> = {
      id: "close",
      kind: "action",
      action: "close",
      targetEquityPct: 25,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [indicator("ema"), closeWithTarget],
        edges: [
          edge("duplicate", "ema", "bullish", "close"),
          edge("duplicate", "ema", "bearish", "close"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["duplicate_id", "invalid_target"])
    )
  })

  it("rejects graphs over the node and edge limits", () => {
    const nodes = Array.from({ length: 101 }, (_, index) =>
      indicator(`indicator-${index}`)
    )
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: { nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("limit")
  })
})

describe("Automation schemas", () => {
  it("allows a structurally safe but incomplete draft to be saved", () => {
    const draft = automationDraftSchema.safeParse({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [indicator("ema")],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(draft.success).toBe(true)
  })

  it("accepts compiled output as a runnable strategy config", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [indicator("ema"), action("buy", "buy", 25)],
        edges: [edge("e1", "ema", "bullish", "buy")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(
      automationStrategyConfigSchema.safeParse(compiled.config).success
    ).toBe(true)
    expect(strategyConfigSchema.safeParse(compiled.config).success).toBe(true)
    expect(strategyTypeOf(compiled.config!)).toBe("automation")
    expect(STRATEGY_TYPE_IDS).toContain("automation")
    expect(STRATEGY_EDITOR_TYPE_IDS).not.toContain("automation")
  })

  it("rejects oversized draft graphs at the API boundary", () => {
    const nodes = Array.from({ length: 101 }, (_, index) =>
      indicator(`indicator-${index}`)
    )
    expect(
      automationDraftSchema.safeParse({
        interval: "15m",
        protection: {},
        graph: { nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      }).success
    ).toBe(false)
  })

  it("saves invalid protection as a draft but will not compile it", () => {
    const graph = {
      nodes: [indicator("ema"), action("buy", "buy", 25)],
      edges: [edge("e1", "ema", "bullish", "buy")],
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    expect(
      automationDraftSchema.safeParse({
        interval: "15m",
        graph,
        protection: { takeProfitPct: -1 },
      }).success
    ).toBe(true)
    const result = compileAutomationGraph({
      interval: "15m",
      graph,
      protection: { takeProfitPct: -1 },
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })
})

describe("resolveAutomationActions", () => {
  it("uses the largest target when same-side rules match together", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          action("small", "buy", 20),
          action("large", "buy", 40),
        ],
        edges: [
          edge("e1", "ema", "bullish", "small"),
          edge("e2", "ema", "bullish", "large"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(
      resolveAutomationActions(
        compiled.config?.rules ?? [],
        new Set(["ema:buy"])
      )
    ).toEqual({ action: { action: "buy", targetEquityPct: 40 }, warning: null })
  })

  it("gives Close priority over matching entries", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          action("buy", "buy", 20),
          action("close", "close"),
        ],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "ema", "bullish", "close"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(
      resolveAutomationActions(
        compiled.config?.rules ?? [],
        new Set(["ema:buy"])
      )
    ).toEqual({ action: { action: "close" }, warning: null })
  })

  it("blocks simultaneous Buy and Short actions", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          action("buy", "buy", 20),
          action("short", "short", 30),
        ],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "ema", "bullish", "short"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(
      resolveAutomationActions(
        compiled.config?.rules ?? [],
        new Set(["ema:buy"])
      )
    ).toEqual({
      action: null,
      warning: "Buy and Short matched on the same candle; no entry was placed.",
    })
  })
})

describe("evaluateAutomation", () => {
  it("runs registered indicators and prefixes merged paint ids by node", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          {
            id: "breakout",
            kind: "indicator",
            x: 0,
            y: 0,
            indicator: { type: "breakout", params: { lookback: 3 } },
          },
          action("buy", "buy", 25),
        ],
        edges: [edge("e1", "breakout", "bullish", "buy")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const candles = [
      { t: 0, o: 9, h: 10, l: 8, c: 9, v: 1 },
      { t: 1, o: 9, h: 11, l: 9, c: 10, v: 1 },
      { t: 2, o: 10, h: 12, l: 10, c: 11, v: 1 },
      { t: 3, o: 11, h: 14, l: 11, c: 13, v: 1 },
    ]

    const evaluated = evaluateAutomation(candles, compiled.config!)

    expect(evaluated.actions).toEqual([
      { time: 3, action: "buy", targetEquityPct: 25 },
    ])
    expect(evaluated.paint.lines.map((line) => line.id)).toEqual([
      "breakout:breakout-high",
      "breakout:breakout-low",
    ])
  })

  it("computes duplicate indicator selections once", () => {
    const compute = vi.spyOn(INDICATORS.breakout, "compute")
    const compiled = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          {
            id: "first",
            kind: "indicator",
            x: 0,
            y: 0,
            indicator: { type: "breakout", params: { lookback: 3 } },
          },
          {
            id: "second",
            kind: "indicator",
            x: 0,
            y: 0,
            indicator: { type: "breakout", params: { lookback: 3 } },
          },
          logic("either", "or"),
          action("buy", "buy", 25),
        ],
        edges: [
          edge("e1", "first", "bullish", "either"),
          edge("e2", "second", "bullish", "either"),
          edge("e3", "either", "match", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const candles = [
      { t: 0, o: 9, h: 10, l: 8, c: 9, v: 1 },
      { t: 1, o: 9, h: 11, l: 9, c: 10, v: 1 },
      { t: 2, o: 10, h: 12, l: 10, c: 11, v: 1 },
      { t: 3, o: 11, h: 14, l: 11, c: 13, v: 1 },
    ]

    try {
      evaluateAutomation(candles, compiled.config!)
      expect(compute).toHaveBeenCalledTimes(1)
    } finally {
      compute.mockRestore()
    }
  })
})
