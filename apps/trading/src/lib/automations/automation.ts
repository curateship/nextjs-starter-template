import { z } from "zod"

import type { IndicatorSelection } from "@/lib/indicators/registry"
import {
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
  action: "buy" | "short" | "close"
  targetEquityPct?: number
  x: number
  y: number
}

export type AutomationNode =
  | AutomationIndicatorNode
  | AutomationLogicNode
  | AutomationActionNode

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

export type AutomationCondition =
  | {
      kind: "trigger"
      nodeId: string
      indicator: IndicatorSelection
      side: "buy" | "sell"
    }
  | {
      kind: "and" | "or"
      nodeId: string
      children: AutomationCondition[]
    }

export type AutomationRule = {
  id: string
  action: "buy" | "short" | "close"
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
    | "logic_input"
    | "action_input"
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
    ? port === "bullish" || port === "bearish"
    : node.kind === "logic"
      ? port === "match"
      : false
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
    action: z.enum(["buy", "short", "close"]),
    targetEquityPct: z.number().finite().optional(),
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
})

const automationConditionSchema: z.ZodType<AutomationCondition> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("trigger"),
      nodeId: idSchema,
      indicator: indicatorSelectionSchema,
      side: z.enum(["buy", "sell"]),
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
    action: z.enum(["buy", "short", "close"]),
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
    if (
      target.kind === "indicator" ||
      source.kind === "action" ||
      source.id === target.id
    ) {
      addError({
        code: "invalid_edge",
        edgeId: edge.id,
        message: "This connection is not allowed.",
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
    if (node.kind === "logic" && count < 2) {
      addError({
        code: "logic_input",
        nodeId: node.id,
        message: "AND and OR need at least two inputs.",
      })
    }
    if (node.kind === "action" && count !== 1) {
      addError({
        code: "action_input",
        nodeId: node.id,
        message: "Action needs exactly one condition.",
      })
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

  const compileEdge = (edge: AutomationEdge): AutomationCondition => {
    const source = nodeById.get(edge.from)
    if (!source || source.kind === "action")
      throw new Error("Invalid compiled graph")
    if (source.kind === "indicator") {
      return {
        kind: "trigger",
        nodeId: source.id,
        indicator: source.indicator,
        side: edge.sourcePort === "bullish" ? "buy" : "sell",
      }
    }
    return {
      kind: source.op,
      nodeId: source.id,
      children: (incoming.get(source.id) ?? []).map(compileEdge),
    }
  }

  const rules = actions.map((node): AutomationRule => {
    const rule: AutomationRule = {
      id: node.id,
      action: node.action,
      condition: compileEdge((incoming.get(node.id) ?? [])[0]),
    }
    if (node.action !== "close") rule.targetEquityPct = node.targetEquityPct
    return rule
  })
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

function conditionMatches(
  condition: AutomationCondition,
  fired: ReadonlySet<string>
): boolean {
  if (condition.kind === "trigger") {
    return fired.has(`${condition.nodeId}:${condition.side}`)
  }
  return condition.kind === "and"
    ? condition.children.every((child) => conditionMatches(child, fired))
    : condition.children.some((child) => conditionMatches(child, fired))
}

export type ResolvedAutomationAction =
  | { action: "buy" | "short"; targetEquityPct: number }
  | { action: "close" }

export function resolveAutomationActions(
  rules: AutomationRule[],
  fired: ReadonlySet<string>
): { action: ResolvedAutomationAction | null; warning: string | null } {
  const matched = rules.filter((rule) =>
    conditionMatches(rule.condition, fired)
  )
  if (matched.some((rule) => rule.action === "close")) {
    return { action: { action: "close" }, warning: null }
  }
  const buys = matched.filter((rule) => rule.action === "buy")
  const shorts = matched.filter((rule) => rule.action === "short")
  if (buys.length > 0 && shorts.length > 0) {
    return {
      action: null,
      warning: "Buy and Short matched on the same candle; no entry was placed.",
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
