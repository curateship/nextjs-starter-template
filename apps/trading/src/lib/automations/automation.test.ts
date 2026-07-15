import { describe, expect, it, vi } from "vitest"

import {
  AUTOMATION_TYPE_IDS,
  automationTypeOf,
} from "@/lib/strategies/strategy-config"
import { INDICATORS } from "@/lib/indicators/registry"
import { automationWarmupBars } from "@/lib/strategies/kinds/automation"

import {
  automationDraftSchema,
  automationCapabilities,
  automationConfigSchema,
  compileAutomationGraph,
  DEFAULT_AUTOMATION_BACKTEST_SETTINGS,
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
  actionType: "buy" | "short" | "close" | "reverse",
  targetEquityPct = 10
): AutomationNode => ({
  id,
  kind: "action",
  action: actionType,
  targetEquityPct: actionType === "close" ? undefined : targetEquityPct,
  x: 0,
  y: 0,
})

const takeProfit = (id: string, pct = 2): AutomationNode => ({
  id,
  kind: "takeProfit",
  pct,
  x: 0,
  y: 0,
})

const stopLoss = (id: string, pct = 1): AutomationNode => ({
  id,
  kind: "stopLoss",
  pct,
  x: 0,
  y: 0,
})

const whaleWall = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "whaleWall" }>> = {}
): AutomationNode => ({
  id,
  kind: "whaleWall",
  minUsd: 500_000,
  relativeSize: 5,
  maxDistancePct: 0.5,
  confirmationMs: 2_000,
  x: 0,
  y: 0,
  ...overrides,
})

const edge = (
  id: string,
  from: string,
  sourcePort:
    | "bullish"
    | "bearish"
    | "trend"
    | "then"
    | "match"
    | "tp"
    | "sl"
    | "bidWall"
    | "askWall",
  to: string
): AutomationEdge => ({ id, from, sourcePort, to })

describe("compileAutomationGraph", () => {
  it("compiles Whale Wall bid and ask outputs into live wall conditions", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          whaleWall("wall"),
          action("long", "buy", 20),
          action("short", "short", 15),
        ],
        edges: [
          edge("bid", "wall", "bidWall", "long"),
          edge("ask", "wall", "askWall", "short"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    expect(result.config?.rules).toEqual([
      {
        id: "long",
        action: "buy",
        targetEquityPct: 20,
        condition: {
          kind: "liveWall",
          nodeId: "wall",
          side: "bid",
          minUsd: 500_000,
          relativeSize: 5,
          maxDistancePct: 0.5,
          confirmationMs: 2_000,
        },
      },
      {
        id: "short",
        action: "short",
        targetEquityPct: 15,
        condition: {
          kind: "liveWall",
          nodeId: "wall",
          side: "ask",
          minUsd: 500_000,
          relativeSize: 5,
          maxDistancePct: 0.5,
          confirmationMs: 2_000,
        },
      },
    ])
    expect(automationCapabilities(result.config!)).toEqual({
      requiresLiveBook: true,
      supportsHistoricalBacktest: false,
    })
  })

  it("rejects a stored config that mixes live and candle entries", () => {
    const live = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [whaleWall("wall"), action("long", "buy")],
        edges: [edge("bid", "wall", "bidWall", "long")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    }).config!
    const mixed = {
      ...live,
      rules: [
        ...live.rules,
        {
          id: "short",
          action: "short" as const,
          targetEquityPct: 10,
          condition: {
            kind: "trigger" as const,
            nodeId: "ema",
            indicator: {
              type: "ema_cross" as const,
              params: { fast: 9, slow: 21 },
            },
            side: "sell" as const,
          },
        },
      ],
    }

    expect(automationConfigSchema.safeParse(mixed).success).toBe(false)
  })

  it("rejects invalid Whale Wall targets, settings, and mixed entry sources", () => {
    const invalidTarget = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [whaleWall("wall"), action("short", "short")],
        edges: [edge("bid", "wall", "bidWall", "short")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const invalidSettings = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          whaleWall("wall", { minUsd: 0, confirmationMs: 0 }),
          action("long", "buy"),
        ],
        edges: [edge("bid", "wall", "bidWall", "long")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const mixed = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [whaleWall("wall"), indicator("ema"), action("long", "buy")],
        edges: [
          edge("bid", "wall", "bidWall", "long"),
          edge("candle", "ema", "bullish", "long"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    const separateEntries = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          whaleWall("wall"),
          indicator("ema"),
          action("long", "buy"),
          action("reverse", "reverse"),
        ],
        edges: [
          edge("bid", "wall", "bidWall", "long"),
          edge("candle", "ema", "bullish", "reverse"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(invalidTarget.errors.map((error) => error.code)).toContain(
      "invalid_edge"
    )
    expect(invalidSettings.errors.map((error) => error.code)).toContain(
      "invalid_scanner"
    )
    expect(mixed.errors.map((error) => error.code)).toContain("action_input")
    expect(separateEntries.errors.map((error) => error.code)).toContain(
      "action_input"
    )
  })

  it("compiles a direct indicator output into an action rule", () => {
    const result = compileAutomationGraph({
      interval: "15m",
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
      resolveAutomationActions(
        rules,
        fired,
        new Map([["ema", { side: "buy" as const, age: 3 }]])
      ).action
    ).toEqual({ action: "buy", targetEquityPct: 30 })
    expect(
      resolveAutomationActions(
        rules,
        fired,
        new Map([["ema", { side: "sell" as const, age: 0 }]])
      ).action
    ).toBeNull()
    expect(resolveAutomationActions(rules, fired).action).toBeNull()
  })

  it("compiles Look Back nodes into a filter age cap and enforces it", () => {
    const lookback: AutomationNode = {
      id: "lb",
      kind: "lookback",
      bars: 48,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          lookback,
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "trend", "lb"),
          edge("e2", "lb", "trend", "rsi"),
          edge("e3", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    const condition = result.config?.rules[0].condition
    expect(condition?.kind === "trigger" ? condition.filters : []).toEqual([
      {
        nodeId: "ema",
        indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
        maxAgeBars: 48,
      },
    ])

    const rules = result.config?.rules ?? []
    const fired = new Set(["rsi:buy"])
    expect(
      resolveAutomationActions(
        rules,
        fired,
        new Map([["ema", { side: "buy" as const, age: 47 }]])
      ).action
    ).toEqual({ action: "buy", targetEquityPct: 30 })
    // Age 48 with a 48-bar cap is stale: the signal candle counts as bar 1.
    expect(
      resolveAutomationActions(
        rules,
        fired,
        new Map([["ema", { side: "buy" as const, age: 48 }]])
      ).action
    ).toBeNull()
  })

  it("keeps the strictest cap when a filter reaches the trigger twice", () => {
    // Diamond: ema wires to the trigger directly AND through a Look Back.
    // The capped path must win — a capped AND an uncapped path means capped.
    const lookback: AutomationNode = {
      id: "lb",
      kind: "lookback",
      bars: 10,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          lookback,
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "trend", "rsi"),
          edge("e2", "ema", "trend", "lb"),
          edge("e3", "lb", "trend", "rsi"),
          edge("e4", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    const condition = result.config?.rules[0].condition
    const filters = condition?.kind === "trigger" ? condition.filters : []
    expect(filters).toHaveLength(1)
    expect(filters?.[0]).toMatchObject({ nodeId: "ema", maxAgeBars: 10 })
  })

  it("rejects a Look Back too large for its indicator's warm-up window", () => {
    // ema_cross 20/50 needs 150 warm-up candles; 1300 + 150 + 5 > 1400.
    const lookback: AutomationNode = {
      id: "lb",
      kind: "lookback",
      bars: 1300,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          lookback,
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 30),
        ],
        edges: [
          edge("e1", "ema", "trend", "lb"),
          edge("e2", "lb", "trend", "rsi"),
          edge("e3", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_lookback"
    )
  })

  it("rejects a Look Back without input and bad bars values", () => {
    const lookback: AutomationNode = {
      id: "lb",
      kind: "lookback",
      bars: 0.5,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          lookback,
          indicator("rsi", "rsi_levels"),
          action("buy", "buy", 10),
        ],
        edges: [
          edge("e1", "lb", "trend", "rsi"),
          edge("e2", "rsi", "bullish", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["invalid_lookback", "lookback_input"])
    )
  })

  it("refuses wiring a Look Back into an action", () => {
    const lookback: AutomationNode = {
      id: "lb",
      kind: "lookback",
      bars: 10,
      x: 0,
      y: 0,
    }
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [indicator("ema"), lookback, action("buy", "buy", 10)],
        edges: [
          edge("e1", "ema", "trend", "lb"),
          edge("e2", "lb", "trend", "buy"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("invalid_edge")
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

    expect(
      resolveAutomationActions(rules, new Set(["ema:buy"])).action
    ).toBeNull()
    expect(
      resolveAutomationActions(rules, new Set(["ema:buy", "rsi:buy"])).action
    ).toEqual({ action: "buy", targetEquityPct: 20 })
  })

  it("rejects invalid ports, cycles, dangling nodes, and empty actions", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("unused"),
          indicator("a"),
          indicator("b", "rsi_levels"),
          action("buy", "buy", 10),
        ],
        edges: [edge("e1", "a", "trend", "b"), edge("e2", "b", "trend", "a")],
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
      graph: {
        nodes: [indicator("ema")],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(draft.success).toBe(true)
  })

  it("round-trips backtest settings and defaults them on old drafts", () => {
    const graph = {
      nodes: [indicator("ema")],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }
    const withSettings = automationDraftSchema.safeParse({
      interval: "15m",
      graph,
      backtest: {
        startingEquity: 25_000,
        takerFeeBps: 10,
        makerFeeBps: 2,
        slippageBps: 3,
      },
    })
    expect(withSettings.success).toBe(true)
    expect(withSettings.data?.backtest.startingEquity).toBe(25_000)

    // Drafts saved before backtest settings existed carry no key at all.
    const oldDraft = automationDraftSchema.safeParse({
      interval: "15m",
      graph,
    })
    expect(oldDraft.success).toBe(true)
    expect(oldDraft.data?.backtest).toEqual(
      DEFAULT_AUTOMATION_BACKTEST_SETTINGS
    )

    // Out-of-range fees are rejected, not silently clamped.
    expect(
      automationDraftSchema.safeParse({
        interval: "15m",
        graph,
        backtest: {
          startingEquity: 25_000,
          takerFeeBps: 51,
          makerFeeBps: 2,
          slippageBps: 3,
        },
      }).success
    ).toBe(false)
  })

  it("accepts compiled output as a runnable strategy config", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [indicator("ema"), action("buy", "buy", 25)],
        edges: [edge("e1", "ema", "bullish", "buy")],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(automationConfigSchema.safeParse(compiled.config).success).toBe(true)
    expect(automationConfigSchema.safeParse(compiled.config).success).toBe(true)
    expect(automationTypeOf(compiled.config!)).toBe("automation")
    expect(AUTOMATION_TYPE_IDS).toContain("automation")
  })

  it("rejects oversized draft graphs at the API boundary", () => {
    const nodes = Array.from({ length: 101 }, (_, index) =>
      indicator(`indicator-${index}`)
    )
    expect(
      automationDraftSchema.safeParse({
        interval: "15m",
        graph: { nodes, edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      }).success
    ).toBe(false)
  })

  it("compiles Take Profit / Stop Loss nodes into per-side protection", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          action("buy", "buy", 25),
          action("short", "short", 25),
          takeProfit("long-tp", 2),
          stopLoss("long-sl", 1),
          takeProfit("short-tp", 1.2),
          stopLoss("short-sl", 0.8),
        ],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "ema", "bearish", "short"),
          edge("e3", "buy", "tp", "long-tp"),
          edge("e4", "buy", "sl", "long-sl"),
          edge("e5", "short", "tp", "short-tp"),
          edge("e6", "short", "sl", "short-sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(result.errors).toEqual([])
    expect(result.config?.protection).toEqual({
      long: { takeProfitPct: 2, stopLossPct: 1 },
      short: { takeProfitPct: 1.2, stopLossPct: 0.8 },
    })
  })

  it("rejects a Take Profit connected to the wrong (stop-loss) hook", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [indicator("ema"), action("buy", "buy", 25), takeProfit("tp")],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "buy", "sl", "tp"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
  })

  it("flags conflicting Take Profit values on one side", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          action("buy", "buy", 25),
          takeProfit("tp-a", 2),
          takeProfit("tp-b", 3),
        ],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "buy", "tp", "tp-a"),
          edge("e3", "buy", "tp", "tp-b"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })

  it("rejects a Stop Loss with a non-positive percent", () => {
    const result = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [indicator("ema"), action("buy", "buy", 25), stopLoss("sl", -1)],
        edges: [
          edge("e1", "ema", "bullish", "buy"),
          edge("e2", "buy", "sl", "sl"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_protection"
    )
  })

  it("reads a legacy flat protection pair as both sides", () => {
    const parsed = automationConfigSchema.safeParse({
      v: 2,
      kind: "automation",
      interval: "15m",
      rules: [
        {
          id: "buy",
          action: "buy",
          targetEquityPct: 10,
          condition: {
            kind: "trigger",
            nodeId: "ema",
            indicator: { type: "ema_cross", params: { fast: 20, slow: 50 } },
            side: "buy",
          },
        },
      ],
      protection: { takeProfitPct: 2, stopLossPct: 1 },
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.protection).toEqual({
      long: { takeProfitPct: 2, stopLossPct: 1 },
      short: { takeProfitPct: 2, stopLossPct: 1 },
    })
  })
})

describe("resolveAutomationActions", () => {
  it("uses the largest target when same-side rules match together", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
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
    ).toEqual({
      action: { action: "buy", targetEquityPct: 40 },
      warning: null,
    })
  })

  it("gives Close priority over matching entries", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
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

  it("gives Reverse priority over a matching entry but not Close", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
      graph: {
        nodes: [
          indicator("ema"),
          action("short", "short", 20),
          action("reverse", "reverse", 30),
        ],
        edges: [
          edge("e1", "ema", "bearish", "short"),
          edge("e2", "ema", "bearish", "reverse"),
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    })

    expect(
      resolveAutomationActions(
        compiled.config?.rules ?? [],
        new Set(["ema:sell"])
      )
    ).toEqual({
      action: { action: "reverse", targetEquityPct: 30 },
      warning: null,
    })
  })

  it("blocks simultaneous Buy and Short actions", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
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
      warning:
        "Long and Short matched on the same candle; no entry was placed.",
    })
  })
})

describe("evaluateAutomation", () => {
  it("runs registered indicators and prefixes merged paint ids by node", () => {
    const compiled = compileAutomationGraph({
      interval: "15m",
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
      protection: {},
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

  it("expires a Look Back-capped filter after maxAgeBars candles", () => {
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
              signals: [{ time: 1, side: "buy" }],
            }
          : {
              paint: emptyPaint,
              signals: [
                { time: 1, side: "buy" },
                { time: 3, side: "buy" },
              ],
            }
      )
    const config = {
      v: 2 as const,
      kind: "automation" as const,
      interval: "15m" as const,
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
                maxAgeBars: 2,
              },
            ],
          },
        },
      ],
      protection: {},
    }
    const candles = Array.from({ length: 5 }, (_, t) => ({
      t,
      o: 10,
      h: 11,
      l: 9,
      c: 10,
      v: 1,
    }))

    try {
      const evaluated = evaluateAutomation(candles, config)
      // Filter latches at t1. Cap 2: fresh at t1 (age 0) and t2 (age 1),
      // stale from t3 — so the t3 trigger is blocked.
      expect(evaluated.actions).toEqual([
        { time: 1, action: "buy", targetEquityPct: 10 },
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
      protection: {},
    }

    expect(automationWarmupBars(config)).toBe(
      INDICATORS.ema_cross.warmupBars({ fast: 20, slow: 100 } as never) + 5
    )
  })
})
