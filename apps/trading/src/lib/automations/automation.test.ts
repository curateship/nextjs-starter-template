import { describe, expect, it, vi } from "vitest"

import {
  STRATEGY_EDITOR_TYPE_IDS,
  STRATEGY_TYPE_IDS,
  strategyConfigSchema,
  strategyTypeOf,
} from "@/lib/strategies/strategy-config"
import { INDICATORS } from "@/lib/indicators/registry"
import { automationWarmupBars } from "@/lib/strategies/kinds/automation"

import {
  automationDraftSchema,
  automationStrategyConfigSchema,
  compileAutomationGraph,
  resolveAutomationActions,
  type AutomationEdge,
  type AutomationNode,
  type AutomationRule,
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
  sourcePort: "bullish" | "bearish" | "trend" | "then" | "match",
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

  it("rejects legacy AND/OR nodes with a delete instruction", () => {
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

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("legacy_logic")
  })

  it("fires an action when any of its multiple inputs matches", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          action("short", "short", 15),
        ],
        edges: [
          edge("e1", "ema", "bearish", "short"),
          edge("e2", "rsi", "bearish", "short"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    const rules = result.config?.rules ?? []
    expect(rules[0].condition.kind).toBe("or")
    expect(resolveAutomationActions(rules, new Set(["rsi:sell"]))).toEqual({
      action: { action: "short", targetEquityPct: 15 },
      warning: null,
    })
    expect(resolveAutomationActions(rules, new Set())).toEqual({
      action: null,
      warning: null,
    })
  })

  it("compiles trend chains into trigger filters", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "trend", "rsi"),
          edge("e2", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    expect(result.config?.rules[0].condition).toEqual({
      kind: "trigger",
      nodeId: "rsi",
      indicator: {
        type: "rsi_levels",
        params: { period: 14, buyBelow: 30, sellAbove: 70 },
      },
      side: "buy",
      filters: [
        {
          nodeId: "ema",
          indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
        },
      ],
    })
  })

  it("collects every ancestor in a multi-link chain as a filter", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("a"),
          indicator("b", "rsi_levels"),
          indicator("c"),
          action("buy", "buy", 10),
        ],
        edges: [
          edge("e1", "a", "trend", "b"),
          edge("e2", "b", "trend", "c"),
          edge("e3", "c", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    const condition = result.config?.rules[0].condition
    expect(condition?.kind).toBe("trigger")
    expect(
      condition?.kind === "trigger"
        ? condition.filters?.map((filter) => filter.nodeId).sort()
        : []
    ).toEqual(["a", "b"])
  })

  it("blocks triggers whose filters disagree or have no state yet", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("ema"),
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "trend", "rsi"),
          edge("e2", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const rules = result.config?.rules ?? []
    const fired = new Set(["rsi:buy"])

    expect(
      resolveAutomationActions(rules, fired, new Map([["ema", "buy"]])).action
    ).toEqual({ action: "buy", targetEquityPct: 30 })
    expect(
      resolveAutomationActions(rules, fired, new Map([["ema", "sell"]])).action
    ).toBeNull()
    expect(resolveAutomationActions(rules, fired).action).toBeNull()
  })

  it("still resolves legacy AND/OR condition snapshots", () => {
    const rules: AutomationRule[] = [
      {
        id: "buy",
        action: "buy" as const,
        targetEquityPct: 20,
        condition: {
          kind: "and" as const,
          nodeId: "both",
          children: [
            {
              kind: "trigger" as const,
              nodeId: "ema",
              indicator: {
                type: "ema_cross" as const,
                params: { fast: 20, slow: 50 },
              },
              side: "buy" as const,
            },
            {
              kind: "trigger" as const,
              nodeId: "rsi",
              indicator: {
                type: "rsi_levels" as const,
                params: { period: 14, buyBelow: 30, sellAbove: 70 },
              },
              side: "buy" as const,
            },
          ],
        },
      },
    ]

    expect(resolveAutomationActions(rules, new Set(["ema:buy"])).action)
      .toBeNull()
    expect(
      resolveAutomationActions(rules, new Set(["ema:buy", "rsi:buy"])).action
    ).toEqual({ action: "buy", targetEquityPct: 20 })
  })

  it("rejects invalid ports, cycles, dangling nodes, and empty actions", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("unused"),
          indicator("a"),
          indicator("b", "rsi_levels"),
          action("buy", "buy", 10),
        ],
        edges: [
          edge("e1", "a", "trend", "b"),
          edge("e2", "b", "trend", "a"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["cycle", "dangling", "action_input"])
    )
  })

  it("lets an action chain onward to its exit watcher without changing rules", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("entry"),
          indicator("exit", "rsi_levels"),
          action("long", "buy", 10),
          action("close", "close"),
        ],
        edges: [
          edge("e1", "entry", "bullish", "long"),
          edge("e2", "long", "then", "exit"),
          edge("e3", "exit", "bearish", "close"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    // The Then link is visual flow only: the exit trigger has no filters and
    // the entry rule is untouched.
    expect(result.config?.rules).toEqual([
      expect.objectContaining({
        id: "long",
        condition: expect.objectContaining({ nodeId: "entry", side: "buy" }),
      }),
      expect.objectContaining({
        id: "close",
        condition: expect.objectContaining({ nodeId: "exit", side: "sell" }),
      }),
    ])
    const closeCondition = result.config?.rules[1].condition
    expect(
      closeCondition?.kind === "trigger" ? closeCondition.filters : "set"
    ).toBeUndefined()
  })

  it("rejects Then wires into actions", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("entry"),
          action("long", "buy", 10),
          action("close", "close"),
        ],
        edges: [
          edge("e1", "entry", "bullish", "long"),
          edge("e2", "long", "then", "close"),
          edge("e3", "entry", "bearish", "close"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("invalid_edge")
  })

  it("rejects trend wires into actions and signal wires into indicators", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      protection: {},
      graph: {
        nodes: [
          indicator("a"),
          indicator("b", "rsi_levels"),
          action("buy", "buy", 10),
        ],
        edges: [
          edge("e1", "a", "trend", "buy"),
          edge("e2", "a", "bullish", "b"),
          edge("e3", "b", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(
      result.errors.filter((error) => error.code === "invalid_edge")
    ).toHaveLength(2)
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
      warning: "Long and Short matched on the same candle; no entry was placed.",
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
          action("buy", "buy", 25),
        ],
        edges: [
          edge("e1", "first", "bullish", "buy"),
          edge("e2", "second", "bullish", "buy"),
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

  it("latches trend filters from their most recent signal", () => {
    const emptyPaint = {
      indicators: [],
      lines: [],
      zones: [],
      barColors: [],
    }
    const compute = vi
      .spyOn(INDICATORS.breakout, "compute")
      .mockImplementation((_candles, params) =>
        (params as { lookback: number }).lookback === 4
          ? {
              paint: emptyPaint,
              signals: [
                { time: 1, side: "buy" },
                { time: 5, side: "sell" },
              ],
            }
          : {
              paint: emptyPaint,
              signals: [
                { time: 0, side: "buy" },
                { time: 1, side: "buy" },
                { time: 3, side: "buy" },
                { time: 4, side: "sell" },
                { time: 6, side: "buy" },
              ],
            }
      )
    const config = {
      v: 2 as const,
      kind: "automation" as const,
      interval: "15m" as const,
      protection: {},
      rules: [
        {
          id: "buy",
          action: "buy" as const,
          targetEquityPct: 10,
          condition: {
            kind: "trigger" as const,
            nodeId: "trigger",
            indicator: { type: "breakout" as const, params: { lookback: 3 } },
            side: "buy" as const,
            filters: [
              {
                nodeId: "filter",
                indicator: {
                  type: "breakout" as const,
                  params: { lookback: 4 },
                },
              },
            ],
          },
        },
      ],
    }
    const candles = Array.from({ length: 7 }, (_, t) => ({
      t,
      o: 10,
      h: 11,
      l: 9,
      c: 10,
      v: 1,
    }))

    try {
      const evaluated = evaluateAutomation(candles, config)
      // t0: filter has no state yet; t1: latches bullish on the same candle;
      // t3: still latched; t4: trigger is bearish; t6: filter flipped at t5.
      expect(evaluated.actions).toEqual([
        { time: 1, action: "buy", targetEquityPct: 10 },
        { time: 3, action: "buy", targetEquityPct: 10 },
      ])
    } finally {
      compute.mockRestore()
    }
  })

  it("includes filter indicators in warmup", () => {
    const config = {
      v: 2 as const,
      kind: "automation" as const,
      interval: "15m" as const,
      protection: {},
      rules: [
        {
          id: "buy",
          action: "buy" as const,
          targetEquityPct: 10,
          condition: {
            kind: "trigger" as const,
            nodeId: "trigger",
            indicator: {
              type: "ema_cross" as const,
              params: { fast: 20, slow: 50 },
            },
            side: "buy" as const,
            filters: [
              {
                nodeId: "filter",
                indicator: {
                  type: "ema_cross" as const,
                  params: { fast: 20, slow: 100 },
                },
              },
            ],
          },
        },
      ],
    }

    expect(automationWarmupBars(config)).toBe(
      INDICATORS.ema_cross.warmupBars({ fast: 20, slow: 100 } as never) + 5
    )
  })
})
