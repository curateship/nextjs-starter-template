import { z } from "zod"

import {
  AUTOMATION_NODE_SETTINGS_SCHEMAS,
  BRANCH_FIELDS,
  BRANCH_OPS,
  compiledConfigSchema,
  DELAY_UNITS,
  type BranchField,
  type BranchOp,
  type CompiledConfig,
  type DelayUnit,
} from "@/lib/automations/compiled-config"
import {
  automationNodeConnectionError,
  automationNodeSourcePortIsValid,
} from "./node-registry"

export const TAG_MODES = ["add", "remove"] as const
export type TagMode = (typeof TAG_MODES)[number]

/** Entry point: fires when a contact is added (optionally filtered). */
export type AutomationTriggerNode = {
  id: string
  kind: "trigger"
  x: number
  y: number
  source: string
  tags: string[]
}

export type AutomationSendEmailNode = {
  id: string
  kind: "sendEmail"
  x: number
  y: number
  subject: string
  body: string
  preheader: string
}

export type AutomationDelayNode = {
  id: string
  kind: "delay"
  x: number
  y: number
  amount: number
  unit: DelayUnit
}

export type AutomationBranchNode = {
  id: string
  kind: "branch"
  x: number
  y: number
  field: BranchField
  op: BranchOp
  value: string
}

export type AutomationTagNode = {
  id: string
  kind: "tag"
  x: number
  y: number
  mode: TagMode
  tags: string[]
}

export type AutomationWebhookNode = {
  id: string
  kind: "webhook"
  x: number
  y: number
  url: string
  note: string
}

export type AutomationNode =
  | AutomationTriggerNode
  | AutomationSendEmailNode
  | AutomationDelayNode
  | AutomationBranchNode
  | AutomationTagNode
  | AutomationWebhookNode

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

export type AutomationValidationError = {
  code:
    | "duplicate_id"
    | "missing_node"
    | "invalid_port"
    | "invalid_edge"
    | "invalid_settings"
    | "cycle"
    | "dangling"
    | "missing_trigger"
    | "multiple_triggers"
    | "trigger_input"
    | "fan_out"
    | "empty"
    | "limit"
  nodeId?: string
  edgeId?: string
  message: string
}

export type AutomationCompileResult = {
  config: CompiledConfig | null
  errors: AutomationValidationError[]
}

const idSchema = z.string().min(1).max(64)

// The DRAFT node schema is deliberately lenient: only length caps on strings
// and finiteness on numbers, so half-filled nodes always save as drafts.
// Strict per-kind validation happens at compile time via the settings schemas
// in compiled-config.ts.
const draftTagsSchema = z.array(z.string().max(100)).max(50)

const automationNodeSchema = z.discriminatedUnion("kind", [
  z.object({
    id: idSchema,
    kind: z.literal("trigger"),
    x: z.number().finite(),
    y: z.number().finite(),
    source: z.string().max(100),
    tags: draftTagsSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("sendEmail"),
    x: z.number().finite(),
    y: z.number().finite(),
    subject: z.string().max(500),
    body: z.string().max(100_000),
    preheader: z.string().max(500),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("delay"),
    x: z.number().finite(),
    y: z.number().finite(),
    amount: z.number().finite(),
    unit: z.enum(DELAY_UNITS),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("branch"),
    x: z.number().finite(),
    y: z.number().finite(),
    field: z.enum(BRANCH_FIELDS),
    op: z.enum(BRANCH_OPS),
    value: z.string().max(255),
  }),
  z.object({
    id: idSchema,
    kind: z.literal("tag"),
    x: z.number().finite(),
    y: z.number().finite(),
    mode: z.enum(TAG_MODES),
    tags: draftTagsSchema,
  }),
  z.object({
    id: idSchema,
    kind: z.literal("webhook"),
    x: z.number().finite(),
    y: z.number().finite(),
    url: z.string().max(2000),
    note: z.string().max(500),
  }),
])

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

export const EMPTY_AUTOMATION_GRAPH: AutomationGraph = {
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

const CANVAS_BOOKKEEPING_KEYS = new Set(["id", "kind", "x", "y"])

/** The node's draft fields without canvas bookkeeping (id/kind/x/y). */
function nodeDraftSettings(node: AutomationNode): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(node).filter(([key]) => !CANVAS_BOOKKEEPING_KEYS.has(key))
  )
}

export function compileAutomationGraph(
  graph: AutomationGraph
): AutomationCompileResult {
  const { nodes, edges } = graph
  const errors: AutomationValidationError[] = []
  const addError = (error: AutomationValidationError) => errors.push(error)

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
  }

  // Strict per-kind settings validation. The draft schema lets half-filled
  // nodes save; nothing compiles until every node passes its strict schema.
  const parsedSettings = new Map<string, unknown>()
  for (const node of nodes) {
    const schema = AUTOMATION_NODE_SETTINGS_SCHEMAS[node.kind]
    const parsed = schema.safeParse(nodeDraftSettings(node))
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const field = issue?.path.join(".")
      addError({
        code: "invalid_settings",
        nodeId: node.id,
        message: field
          ? `${field}: ${issue.message}`
          : (issue?.message ?? "Invalid settings."),
      })
    } else {
      parsedSettings.set(node.id, parsed.data)
    }
  }

  const incoming = new Map<string, AutomationEdge[]>()
  const outgoing = new Map<string, AutomationEdge[]>()
  const outgoingByPort = new Map<string, AutomationEdge[]>()
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
    const sourcePortIsValid = automationNodeSourcePortIsValid(
      source,
      edge.sourcePort
    )
    if (!sourcePortIsValid) {
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
    } else if (sourcePortIsValid) {
      const message = automationNodeConnectionError(
        source,
        edge.sourcePort,
        target
      )
      if (message) {
        addError({ code: "invalid_edge", edgeId: edge.id, message })
      }
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
    if (sourcePortIsValid) {
      const portKey = `${edge.from}:${edge.sourcePort}`
      outgoingByPort.set(portKey, [
        ...(outgoingByPort.get(portKey) ?? []),
        edge,
      ])
    }
  }

  // Fan-out guard: the run engine walks one path, so each output may feed at
  // most one next step. Branch is the only node that splits (via yes/no).
  for (const portEdges of outgoingByPort.values()) {
    if (portEdges.length <= 1) continue
    addError({
      code: "fan_out",
      nodeId: portEdges[0].from,
      edgeId: portEdges[1].id,
      message:
        "Only one connection can leave each output. Use a Branch to split the flow.",
    })
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

  const triggers = nodes.filter(
    (node): node is AutomationTriggerNode => node.kind === "trigger"
  )
  if (triggers.length === 0) {
    addError({
      code: "missing_trigger",
      message: 'Add a "Contact added" trigger to start the automation.',
    })
  }
  for (const extra of triggers.slice(1)) {
    addError({
      code: "multiple_triggers",
      nodeId: extra.id,
      message: "An automation can contain only one trigger.",
    })
  }

  const trigger = triggers[0]
  if (trigger) {
    if ((incoming.get(trigger.id) ?? []).length > 0) {
      addError({
        code: "trigger_input",
        nodeId: trigger.id,
        message: "Nothing can connect into the trigger.",
      })
    }
    if ((outgoing.get(trigger.id) ?? []).length === 0) {
      addError({
        code: "empty",
        nodeId: trigger.id,
        message: "Connect the trigger to at least one step.",
      })
    }

    // Forward reachability from the trigger — anything the run can never
    // reach is a mistake, not a silent no-op.
    const reachable = new Set<string>([trigger.id])
    const queue = [trigger.id]
    while (queue.length > 0) {
      const id = queue.shift()!
      for (const edge of outgoing.get(id) ?? []) {
        if (reachable.has(edge.to)) continue
        reachable.add(edge.to)
        queue.push(edge.to)
      }
    }
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        addError({
          code: "dangling",
          nodeId: node.id,
          message: "Node is not connected to the trigger.",
        })
      }
    }
  }

  if (errors.length > 0) return { config: null, errors }

  // Emit only strict-parsed settings (id/x/y stripped) and prove the result
  // against the canonical contract before handing it to the run engine.
  const config = compiledConfigSchema.parse({
    v: 1,
    kind: "newsletterAutomation",
    entryNodeId: trigger!.id,
    nodes: Object.fromEntries(
      nodes.map((node) => [
        node.id,
        { kind: node.kind, settings: parsedSettings.get(node.id) },
      ])
    ),
    edges: edges.map((edge) => ({
      from: edge.from,
      sourcePort: edge.sourcePort,
      to: edge.to,
    })),
  })

  return { config, errors: [] }
}
