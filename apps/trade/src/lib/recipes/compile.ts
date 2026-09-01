import { z } from "zod"

import { automationSettingValueSchema } from "@/lib/automations/graph"
import type {
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationValidationError,
} from "@/lib/automations/graph"
import type { AutomationNodeSettings } from "@/lib/automations/node-descriptor"
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeGridNode } from "@/lib/recipes/trade-grid"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeSignalsNode } from "@/lib/recipes/trade-signals"
import { tradeWalletNode } from "@/lib/recipes/trade-wallet"
import {
  recipeKindIsSupported,
  recipeNodeConnectionError,
  recipeNodeSourcePortIsValid,
  recipeDescriptorForNode,
} from "./registry"

/**
 * The run path's view of a valid graph: strict-parsed settings only, with no
 * canvas positions or other editor bookkeeping. The server stores this beside
 * the drawing and re-reads it for every Backtest or Switch on press.
 */
export const recipeCompiledConfigSchema = z.object({
  v: z.literal(1),
  kind: z.literal("automation"),
  nodes: z.record(
    z.string(),
    z.object({
      kind: z
        .string()
        .refine(recipeKindIsSupported, "Unsupported recipe step."),
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

export type RecipeCompiledConfig = z.infer<typeof recipeCompiledConfigSchema>

export type RecipeCompileResult = {
  config: RecipeCompiledConfig | null
  errors: AutomationValidationError[]
}

/**
 * Validates a draft graph and emits the compiled copy used by the run path.
 */
export function compileRecipeGraph(
  graph: AutomationGraph
): RecipeCompileResult {
  const { nodes, edges } = graph
  const errors: AutomationValidationError[] = []
  const addError = (error: AutomationValidationError) => errors.push(error)

  if (nodes.length > 100 || edges.length > 200) {
    addError({
      code: "limit",
      message: "Recipe is limited to 100 nodes and 200 connections.",
    })
  }

  if (nodes.length === 0) {
    addError({
      code: "empty",
      message: "Add a step from the palette to start the recipe.",
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

  const wallets = nodes.filter((node) => node.kind === tradeWalletNode.kind)
  const markets = nodes.filter((node) => node.kind === tradeMarketsNode.kind)
  const strategies = nodes.filter((node) =>
    [tradeDcaNode.kind, tradeSignalsNode.kind, tradeGridNode.kind].includes(
      node.kind
    )
  )
  requireOneRecipeStep(
    wallets,
    "Wallet",
    "A recipe needs one Wallet step.",
    addError
  )
  requireOneRecipeStep(
    markets,
    "Markets",
    "A recipe needs one Markets step.",
    addError
  )
  requireOneRecipeStep(
    strategies,
    "strategy",
    "A recipe needs one strategy step: DCA, Signals or Grid.",
    addError
  )

  // Strict per-kind settings validation via each node's descriptor. The draft
  // schema lets half-filled nodes save; nothing compiles until every node
  // passes. Unknown kinds are reported, never thrown — the draft stays
  // readable and editable around them.
  const parsedSettings = new Map<string, AutomationNodeSettings>()
  for (const node of nodes) {
    const descriptor = recipeDescriptorForNode(node)
    if (!descriptor) {
      addError({
        code: "unknown_node",
        nodeId: node.id,
        message: `"${node.kind}" steps aren't available in Recipes. Delete the step or update the app.`,
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
    const sourceSupported = recipeDescriptorForNode(source) !== null
    const sourcePortIsValid =
      sourceSupported && recipeNodeSourcePortIsValid(source, edge.sourcePort)
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
      const message = recipeNodeConnectionError(source, edge.sourcePort, target)
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
      outgoingByPort.set(portKey, [
        ...(outgoingByPort.get(portKey) ?? []),
        edge,
      ])
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
    addError({ code: "cycle", message: "Recipe cannot contain a cycle." })
  }

  if (wallets.length === 1 && markets.length === 1 && strategies.length === 1) {
    const connected = (from: string, to: string) =>
      edges.some(
        (edge) =>
          edge.from === from && edge.sourcePort === "then" && edge.to === to
      )
    if (!connected(wallets[0].id, markets[0].id)) {
      addError({
        code: "invalid_edge",
        nodeId: markets[0].id,
        message: "Connect Wallet to Markets.",
      })
    }
    if (!connected(markets[0].id, strategies[0].id)) {
      addError({
        code: "invalid_edge",
        nodeId: strategies[0].id,
        message: "Connect Markets to the strategy step.",
      })
    }
  }

  if (errors.length > 0) return { config: null, errors }

  // Emit only strict-parsed settings and prove the result against the
  // canonical contract before it is stored for the run engine.
  const config = recipeCompiledConfigSchema.parse({
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

function requireOneRecipeStep(
  nodes: readonly AutomationNode[],
  label: string,
  missingMessage: string,
  addError: (error: AutomationValidationError) => void
): void {
  if (nodes.length === 0) {
    addError({ code: "invalid_settings", message: missingMessage })
    return
  }
  for (const extra of nodes.slice(1)) {
    addError({
      code: "invalid_settings",
      nodeId: extra.id,
      message: `A recipe can only have one ${label} step. Delete the extra step.`,
    })
  }
}
