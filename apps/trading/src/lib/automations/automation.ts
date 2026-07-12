import { z } from "zod"

import type { IndicatorSelection } from "@/lib/indicators/registry"
import {
  INDICATORS,
  indicatorIdSchema,
  indicatorSelectionSchema,
} from "@/lib/indicators/registry"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

export type AutomationIndicatorNode = {
  id: string
  kind: "indicator"
  x: number
  y: number
  indicator: IndicatorSelection
}

export type AutomationLogicNode = {
  id: string
  kind: "logic"
  op: "and" | "or"
  x: number
  y: number
}

export type AutomationActionNode = {
  id: string
  kind: "action"
  action: "buy" | "short" | "close" | "reverse"
  targetEquityPct?: number
  x: number
  y: number
}

/**
 * Puts an expiry on the signal flowing through it: whatever latches upstream
 * only counts for `bars` candles after it fires (the signal candle is bar 1).
 */
export type AutomationLookbackNode = {
  id: string
  kind: "lookback"
  bars: number
  x: number
  y: number
}

export type AutomationNode =
  | AutomationIndicatorNode
  | AutomationLogicNode
  | AutomationActionNode
  | AutomationLookbackNode

/**
 * Ceiling on the engine's per-candle evaluation window (candles). A Look Back
 * plus its indicator's warmup must fit inside it, or the capped signal could
 * never be seen — compile rejects such configs instead of silently blocking.
 */
export const AUTOMATION_MAX_WINDOW_BARS = 1400

export type AutomationSourcePort = string

export type AutomationEdge = {
  id: string
  from: string
  sourcePort: AutomationSourcePort
  to: string
}

export type AutomationGraph = {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  viewport: { x: number; y: number; zoom: number }
}

export type AutomationProtection = {
  takeProfitPct?: number
  stopLossPct?: number
}

/**
 * Backtest inputs saved on the automation itself so every run of it uses the
 * same money and cost assumptions. Never part of the compiled config — the
 * live worker must not see fees.
 */
export type AutomationBacktestSettings = {
  startingEquity: number
  takerFeeBps: number
  makerFeeBps: number
  slippageBps: number
}

export type AutomationFilter = {
  nodeId: string
  indicator: IndicatorSelection
  /** Look Back cap: the latched signal only counts for this many candles. */
  maxAgeBars?: number
}

export type AutomationCondition =
  | {
      kind: "trigger"
      nodeId: string
      indicator: IndicatorSelection
      side: "buy" | "sell"
      /** Upstream trend filters whose latched side must equal `side`. */
      filters?: AutomationFilter[]
    }
  | {
      // "and" survives only in configs compiled before chaining replaced
      // logic nodes; new compiles emit "or" solely for multi-input actions.
      kind: "and" | "or"
      nodeId: string
      children: AutomationCondition[]
    }

export type AutomationRule = {
  id: string
  action: "buy" | "short" | "close" | "reverse"
  targetEquityPct?: number
  condition: AutomationCondition
}

export type AutomationStrategyConfig = {
  v: 2
  kind: "automation"
  interval: StrategyInterval
  rules: AutomationRule[]
  protection: AutomationProtection
}

export type AutomationValidationError = {
  code:
    | "duplicate_id"
    | "missing_node"
    | "invalid_port"
    | "invalid_indicator"
    | "invalid_target"
    | "invalid_protection"
    | "invalid_edge"
    | "cycle"
    | "dangling"
    | "legacy_logic"
    | "action_input"
    | "invalid_lookback"
    | "lookback_input"
    | "empty"
    | "limit"
  nodeId?: string
  edgeId?: string
  message: string
}

export type AutomationCompileResult = {
  config: AutomationStrategyConfig | null
  errors: AutomationValidationError[]
}

function sourcePortIsValid(node: AutomationNode, port: AutomationSourcePort) {
  return node.kind === "indicator"
    ? port === "bullish" || port === "bearish" || port === "trend"
    : node.kind === "logic"
      ? port === "match"
      : node.kind === "lookback"
        ? port === "trend"
        : port === "then"
}

const idSchema = z.string().min(1).max(64)
const intervalSchema = z.enum(["1m", "5m", "15m", "1h", "4h", "1d"])
const indicatorParamSchema = z.union([
  z.string().max(80),
  z.number().finite(),
  z.boolean(),
])
const draftIndicatorSelectionSchema = z.object({
  type: indicatorIdSchema,
  params: z
    .record(z.string().min(1).max(64), indicatorParamSchema)
    .refine(
      (params) => Object.keys(params).length <= 32,
      "Too many parameters"
    ),
})

const automationNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: idSchema,
    kind: z.literal("indicator"),
    x: z.number().finite(),
    y: z.number().finite(),
    indicator: draftIndicatorSelectionSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("logic"),
    op: z.enum(["and", "or"]),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("action"),
    action: z.enum(["buy", "short", "close", "reverse"]),
    targetEquityPct: z.number().finite().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("lookback"),
    bars: z.number().finite(),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
])

export const automationProtectionSchema = z.object({
  takeProfitPct: z.number().positive().max(1000).optional(),
  stopLossPct: z.number().positive().max(100).optional(),
})

export const automationDraftProtectionSchema = z.object({
  takeProfitPct: z.number().finite().min(-10_000).max(10_000).optional(),
  stopLossPct: z.number().finite().min(-10_000).max(10_000).optional(),
})

export const DEFAULT_AUTOMATION_BACKTEST_SETTINGS: AutomationBacktestSettings =
  {
    startingEquity: 10_000,
    takerFeeBps: 4.5,
    makerFeeBps: 1.5,
    slippageBps: 0,
  }

export const automationBacktestSettingsSchema = z.object({
  startingEquity: z.number().positive().max(100_000_000),
  takerFeeBps: z.number().min(0).max(50),
  makerFeeBps: z.number().min(0).max(50),
  slippageBps: z.number().min(0).max(100),
})

export const automationGraphSchema = z.object({
  nodes: z.array(automationNodeSchema).max(100),
  edges: z
    .array(
      z.object({
        id: idSchema,
        from: idSchema,
        sourcePort: z.string().min(1).max(32),
        to: idSchema,
      })
    )
    .max(200),
  viewport: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().finite().min(0.25).max(2),
  }),
})

export const automationDraftSchema = z.object({
  interval: intervalSchema,
  graph: automationGraphSchema,
  protection: automationDraftProtectionSchema,
  backtest: automationBacktestSettingsSchema.default(
    DEFAULT_AUTOMATION_BACKTEST_SETTINGS
  ),
})

const automationConditionSchema: z.ZodType<AutomationCondition> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("trigger"),
      nodeId: idSchema,
      indicator: indicatorSelectionSchema,
      side: z.enum(["buy", "sell"]),
      filters: z
        .array(
          z.object({
            nodeId: idSchema,
            indicator: indicatorSelectionSchema,
            maxAgeBars: z
              .number()
              .int()
              .min(1)
              .max(AUTOMATION_MAX_WINDOW_BARS)
              .optional(),
          })
        )
        .max(100)
        .optional(),
    }),
    z.object({
      kind: z.enum(["and", "or"]),
      nodeId: idSchema,
      children: z.array(automationConditionSchema).min(2).max(100),
    }),
  ])
)

const automationRuleSchema = z
  .object({
    id: idSchema,
    action: z.enum(["buy", "short", "close", "reverse"]),
    targetEquityPct: z.number().min(1).max(100).optional(),
    condition: automationConditionSchema,
  })
  .superRefine((rule, ctx) => {
    if (rule.action !== "close" && rule.targetEquityPct === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetEquityPct"],
        message: "Target is required",
      })
    }
    if (rule.action === "close" && rule.targetEquityPct !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["targetEquityPct"],
        message: "Close has no target",
      })
    }
  })

export const automationStrategyConfigSchema: z.ZodType<AutomationStrategyConfig> =
  z.object({
    v: z.literal(2),
    kind: z.literal("automation"),
    interval: intervalSchema,
    rules: z.array(automationRuleSchema).min(1).max(100),
    protection: automationProtectionSchema,
  }) as z.ZodType<AutomationStrategyConfig>

export function compileAutomationGraph(input: {
  interval: StrategyInterval
  protection: AutomationProtection
  graph: AutomationGraph
}): AutomationCompileResult {
  const { nodes, edges } = input.graph
  const errors: AutomationValidationError[] = []
  const addError = (error: AutomationValidationError) => errors.push(error)
  if (!automationProtectionSchema.safeParse(input.protection).success) {
    addError({
      code: "invalid_protection",
      message: "Take profit and stop loss must be valid positive percentages.",
    })
  }
  if (nodes.length > 100 || edges.length > 200) {
    addError({
      code: "limit",
      message: "Automation is limited to 100 nodes and 200 connections.",
    })
  }
  const nodeById = new Map<string, AutomationNode>()
  for (const node of nodes) {
    if (nodeById.has(node.id)) {
      addError({
        code: "duplicate_id",
        nodeId: node.id,
        message: "Duplicate node id.",
      })
    } else {
      nodeById.set(node.id, node)
    }
    if (
      node.kind === "indicator" &&
      !indicatorSelectionSchema.safeParse(node.indicator).success
    ) {
      addError({
        code: "invalid_indicator",
        nodeId: node.id,
        message: "Invalid indicator settings.",
      })
    }
    if (
      node.kind === "action" &&
      ((node.action !== "close" &&
        (!(node.targetEquityPct && node.targetEquityPct >= 1) ||
          node.targetEquityPct > 100)) ||
        (node.action === "close" && node.targetEquityPct !== undefined))
    ) {
      addError({
        code: "invalid_target",
        nodeId: node.id,
        message:
          node.action === "close"
            ? "Close Position does not use a target percentage."
            : "Target must be from 1% to 100%.",
      })
    }
  }

  const incoming = new Map<string, AutomationEdge[]>()
  const outgoing = new Map<string, AutomationEdge[]>()
  const edgeKeys = new Set<string>()
  const edgeIds = new Set<string>()
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) {
      addError({
        code: "duplicate_id",
        edgeId: edge.id,
        message: "Duplicate connection id.",
      })
    }
    edgeIds.add(edge.id)
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source || !target) {
      addError({
        code: "missing_node",
        edgeId: edge.id,
        message: "Connection references a missing node.",
      })
      continue
    }
    if (!sourcePortIsValid(source, edge.sourcePort)) {
      addError({
        code: "invalid_port",
        edgeId: edge.id,
        message: "Connection uses an invalid output.",
      })
    }
    if (source.id === target.id) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "This connection is not allowed.",
      })
    } else if (
      edge.sourcePort === "trend" &&
      source.kind === "lookback" &&
      target.kind !== "indicator"
    ) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "A Look Back node can only connect to an indicator.",
      })
    } else if (
      edge.sourcePort === "trend" &&
      source.kind !== "lookback" &&
      target.kind !== "indicator" &&
      target.kind !== "lookback"
    ) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message:
          "The Trend output can only connect to an indicator or a Look Back node.",
      })
    } else if (edge.sourcePort === "then" && target.kind !== "indicator") {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "The Then output can only connect to an indicator.",
      })
    } else if (
      edge.sourcePort !== "trend" &&
      edge.sourcePort !== "then" &&
      target.kind !== "action"
    ) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "Bullish and Bearish outputs can only connect to an action.",
      })
    }
    const key = `${edge.from}:${edge.sourcePort}:${edge.to}`
    if (edgeKeys.has(key)) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "Duplicate connection.",
      })
    }
    edgeKeys.add(key)
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  let cycleFound = false
  const visit = (id: string) => {
    if (visiting.has(id)) {
      cycleFound = true
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const edge of outgoing.get(id) ?? []) visit(edge.to)
    visiting.delete(id)
    visited.add(id)
  }
  for (const node of nodes) visit(node.id)
  if (cycleFound)
    addError({ code: "cycle", message: "Automation cannot contain a cycle." })

  const actions = nodes.filter(
    (node): node is AutomationActionNode => node.kind === "action"
  )
  if (actions.length === 0)
    addError({ code: "empty", message: "Add at least one action." })
  for (const node of nodes) {
    const count = incoming.get(node.id)?.length ?? 0
    if (node.kind === "logic") {
      addError({
        code: "legacy_logic",
        nodeId: node.id,
        message:
          "AND/OR nodes are no longer supported. Delete this node and connect indicators directly — multiple connections into an action mean any of them fires it.",
      })
    }
    if (node.kind === "action" && count < 1) {
      addError({
        code: "action_input",
        nodeId: node.id,
        message: "Action needs at least one condition.",
      })
    }
    if (node.kind === "lookback") {
      if (
        !(
          Number.isInteger(node.bars) &&
          node.bars >= 1 &&
          node.bars <= AUTOMATION_MAX_WINDOW_BARS
        )
      ) {
        addError({
          code: "invalid_lookback",
          nodeId: node.id,
          message: `Look Back must be a whole number from 1 to ${AUTOMATION_MAX_WINDOW_BARS} candles.`,
        })
      }
      if (count < 1) {
        addError({
          code: "lookback_input",
          nodeId: node.id,
          message: "Look Back needs a Trend input from an indicator.",
        })
      }
    }
  }

  const connected = new Set<string>(actions.map((node) => node.id))
  const markAncestors = (id: string) => {
    for (const edge of incoming.get(id) ?? []) {
      if (connected.has(edge.from)) continue
      connected.add(edge.from)
      markAncestors(edge.from)
    }
  }
  for (const action of actions) markAncestors(action.id)
  for (const node of nodes) {
    if (!connected.has(node.id)) {
      addError({
        code: "dangling",
        nodeId: node.id,
        message: "Node is not connected to an action.",
      })
    }
  }

  if (errors.length > 0) return { config: null, errors }

  // A Look Back node caps every filter upstream of it: the whole branch that
  // feeds through it must have signalled within `bars` candles. When the same
  // ancestor reaches the trigger over several paths (diamonds, nested caps),
  // the strictest (smallest) cap wins — a capped path AND an uncapped one
  // still means capped. Nodes re-walk only when their cap improves, so shared
  // subgraphs stay linear instead of exploding per path.
  const collectFilters = (triggerId: string): AutomationFilter[] => {
    const INF = Number.POSITIVE_INFINITY
    const bestCap = new Map<string, number>()
    const walk = (nodeId: string, cap: number) => {
      for (const edge of incoming.get(nodeId) ?? []) {
        const upstream = nodeById.get(edge.from)
        if (!upstream || upstream.id === triggerId) continue
        const nextCap =
          upstream.kind === "lookback"
            ? Math.min(cap, upstream.bars)
            : cap
        if (upstream.kind !== "lookback" && upstream.kind !== "indicator") {
          continue
        }
        // Absent means unvisited — an uncapped visit still has to be
        // recorded, so "already at least as strict" only applies once seen.
        const seenCap = bestCap.get(upstream.id)
        if (seenCap !== undefined && seenCap <= nextCap) continue
        bestCap.set(upstream.id, nextCap)
        walk(upstream.id, nextCap)
      }
    }
    walk(triggerId, INF)
    const filters: AutomationFilter[] = []
    for (const [nodeId, cap] of bestCap) {
      const node = nodeById.get(nodeId)
      if (!node || node.kind !== "indicator") continue
      filters.push({
        nodeId,
        indicator: node.indicator,
        ...(cap < INF ? { maxAgeBars: cap } : {}),
      })
    }
    return filters
  }

  const compileEdge = (edge: AutomationEdge): AutomationCondition => {
    const source = nodeById.get(edge.from)
    if (!source || source.kind !== "indicator")
      throw new Error("Invalid compiled graph")
    const filters = collectFilters(source.id)
    return {
      kind: "trigger",
      nodeId: source.id,
      indicator: source.indicator,
      side: edge.sourcePort === "bullish" ? "buy" : "sell",
      ...(filters.length > 0 ? { filters } : {}),
    }
  }

  const rules = actions.map((node): AutomationRule => {
    const inputs = (incoming.get(node.id) ?? []).map(compileEdge)
    const rule: AutomationRule = {
      id: node.id,
      action: node.action,
      condition:
        inputs.length === 1
          ? inputs[0]
          : { kind: "or", nodeId: node.id, children: inputs },
    }
    if (node.action !== "close") rule.targetEquityPct = node.targetEquityPct
    return rule
  })

  // A capped filter must be able to SEE a signal maxAgeBars old inside the
  // engine window: the indicator's own warmup plus the cap has to fit, or
  // the automation would silently never trade.
  const checkedCaps = new Set<string>()
  const triggersOf = (condition: AutomationCondition): void => {
    if (condition.kind !== "trigger") {
      condition.children.forEach(triggersOf)
      return
    }
    for (const filter of condition.filters ?? []) {
      if (filter.maxAgeBars === undefined) continue
      const key = `${filter.nodeId}:${filter.maxAgeBars}`
      if (checkedCaps.has(key)) continue
      checkedCaps.add(key)
      const module = INDICATORS[filter.indicator.type]
      const parsed = module.paramsSchema.safeParse(filter.indicator.params)
      if (!parsed.success) continue
      const warmup = module.warmupBars(parsed.data as never)
      const maxCap = AUTOMATION_MAX_WINDOW_BARS - warmup - 5
      if (filter.maxAgeBars > maxCap) {
        addError({
          code: "invalid_lookback",
          nodeId: filter.nodeId,
          message: `Look Back ${filter.maxAgeBars} candles is more than the engine can check back for ${module.label} (it needs ${warmup} warm-up candles — the Look Back here can be at most ${Math.max(1, maxCap)}).`,
        })
      }
    }
  }
  for (const rule of rules) triggersOf(rule.condition)
  if (errors.length > 0) return { config: null, errors }

  return {
    config: {
      v: 2,
      kind: "automation",
      interval: input.interval,
      rules,
      protection: input.protection,
    },
    errors: [],
  }
}

/**
 * Latched trend per filter node id: the side of its most recent signal and
 * how many candles ago it fired (0 = this candle).
 */
export type AutomationFilterLatch = { side: "buy" | "sell"; age: number }
export type AutomationFilterState = ReadonlyMap<string, AutomationFilterLatch>

const NO_FILTER_STATE: AutomationFilterState = new Map()

function conditionMatches(
  condition: AutomationCondition,
  fired: ReadonlySet<string>,
  filterState: AutomationFilterState
): boolean {
  if (condition.kind === "trigger") {
    return (
      fired.has(`${condition.nodeId}:${condition.side}`) &&
      (condition.filters ?? []).every((filter) => {
        const latch = filterState.get(filter.nodeId)
        return (
          latch !== undefined &&
          latch.side === condition.side &&
          (filter.maxAgeBars === undefined || latch.age < filter.maxAgeBars)
        )
      })
    )
  }
  return condition.kind === "and"
    ? condition.children.every((child) =>
        conditionMatches(child, fired, filterState)
      )
    : condition.children.some((child) =>
        conditionMatches(child, fired, filterState)
      )
}

export type ResolvedAutomationAction =
  | { action: "buy" | "short"; targetEquityPct: number }
  | { action: "reverse"; targetEquityPct: number }
  | { action: "close" }

export function resolveAutomationActions(
  rules: AutomationRule[],
  fired: ReadonlySet<string>,
  filterState: AutomationFilterState = NO_FILTER_STATE
): { action: ResolvedAutomationAction | null; warning: string | null } {
  const matched = rules.filter((rule) =>
    conditionMatches(rule.condition, fired, filterState)
  )
  // Precedence: close > reverse > entries. Close always flattens; a reverse
  // (flip whatever is held) outranks a plain entry so a trend flip wins over a
  // same-candle entry signal.
  if (matched.some((rule) => rule.action === "close")) {
    return { action: { action: "close" }, warning: null }
  }
  const reverses = matched.filter((rule) => rule.action === "reverse")
  if (reverses.length > 0) {
    return {
      action: {
        action: "reverse",
        targetEquityPct: Math.max(
          ...reverses.map((rule) => rule.targetEquityPct ?? 0)
        ),
      },
      warning: null,
    }
  }
  const buys = matched.filter((rule) => rule.action === "buy")
  const shorts = matched.filter((rule) => rule.action === "short")
  if (buys.length > 0 && shorts.length > 0) {
    return {
      action: null,
      warning: "Long and Short matched on the same candle; no entry was placed.",
    }
  }
  const candidates = buys.length > 0 ? buys : shorts
  if (candidates.length === 0) return { action: null, warning: null }
  const targetEquityPct = Math.max(
    ...candidates.map((rule) => rule.targetEquityPct ?? 0)
  )
  return {
    action: { action: buys.length > 0 ? "buy" : "short", targetEquityPct },
    warning: null,
  }
}
