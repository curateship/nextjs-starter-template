import { z } from "zod"

import { automationSettingValueSchema } from "./graph"
import type {
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationValidationError,
} from "./graph"
import type { AutomationNodeSettings } from "./node-descriptor"
import {
  automationNodeConnectionError,
  automationNodeSourcePortIsValid,
  descriptorForNode,
} from "./node-registry"

/**
 * The runtime's view of a valid graph: strict-parsed settings only, no canvas
 * bookkeeping. The engine task gives this real execution semantics (entry
 * points, executors); until then it is the proof that a draft is structurally
 * sound, stored beside the draft in the `compiled_config` column.
 */
export const automationCompiledConfigSchema = z.object({
  v: z.literal(1),
  kind: z.literal("automation"),
  nodes: z.record(
    z.string(),
    z.object({
      kind: z.string(),
      settings: z.record(z.string(), automationSettingValueSchema),
    })
  ),
  edges: z.array(
    z.object({
      from: z.string(),
      sourcePort: z.string(),
      to: z.string(),
    })
  ),
})

export type AutomationCompiledConfig = z.infer<
  typeof automationCompiledConfigSchema
>

export type AutomationCompileResult = {
  config: AutomationCompiledConfig | null
  errors: AutomationValidationError[]
}

/**
 * Validates a draft graph and, when it is clean, emits the compiled config.
 * Structural rules only for now — trigger/entry semantics arrive with the
 * trigger node tasks, and the engine task consumes the result.
 */
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

  if (nodes.length === 0) {
    addError({
      code: "empty",
      message: "Add a step from the palette to start the automation.",
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

  // Strict per-kind settings validation via each node's descriptor. The draft
  // schema lets half-filled nodes save; nothing compiles until every node
  // passes. Unknown kinds are reported, never thrown — the draft stays
  // readable and editable around them.
  const parsedSettings = new Map<string, AutomationNodeSettings>()
  for (const node of nodes) {
    const descriptor = descriptorForNode(node)
    if (!descriptor) {
      addError({
        code: "unknown_node",
        nodeId: node.id,
        message: `"${node.kind}" steps aren't available in this app. Delete the node or update the app.`,
      })
      continue
    }
    const parsed = descriptor.settingsSchema.safeParse(node.settings)
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
    const sourceSupported = descriptorForNode(source) !== null
    const sourcePortIsValid =
      sourceSupported && automationNodeSourcePortIsValid(source, edge.sourcePort)
    if (sourceSupported && !sourcePortIsValid) {
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
        message: "A node cannot connect to itself.",
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
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
    if (sourcePortIsValid) {
      const portKey = `${edge.from}:${edge.sourcePort}`
      outgoingByPort.set(portKey, [...(outgoingByPort.get(portKey) ?? []), edge])
    }
  }

  // Fan-out guard: the run engine walks one path per output, so each output
  // may feed at most one next step. Splitting is a branch-style node's job.
  for (const portEdges of outgoingByPort.values()) {
    if (portEdges.length <= 1) continue
    addError({
      code: "fan_out",
      nodeId: portEdges[0].from,
      edgeId: portEdges[1].id,
      message: "Only one connection can leave each output.",
    })
  }

  // Cycle detection: white/grey/black DFS over the outgoing adjacency.
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
  if (cycleFound) {
    addError({ code: "cycle", message: "Automation cannot contain a cycle." })
  }

  if (errors.length > 0) return { config: null, errors }

  // Emit only strict-parsed settings and prove the result against the
  // canonical contract before it is stored for the run engine.
  const config = automationCompiledConfigSchema.parse({
    v: 1,
    kind: "automation",
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
