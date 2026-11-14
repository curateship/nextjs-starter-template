import type { AutomationGraph } from "@/lib/automations/graph"

import type { FlowStepStatus } from "./run-shape"

/**
 * The order a run's steps are listed and made in: a node comes after every
 * node with a line into it, and nodes that could go either way are taken
 * left to right, then top to bottom, as the canvas shows them. A graph with
 * a loop never reaches a run (`validate.ts`); here the nodes in a loop are
 * left out of the order rather than listed twice.
 */
export function flowStepOrder(graph: Pick<AutomationGraph, "nodes" | "edges">): string[] {
  const ids = new Set(graph.nodes.map((node) => node.id))
  const feeding = new Map<string, Set<string>>()
  for (const node of graph.nodes) feeding.set(node.id, new Set())
  for (const edge of graph.edges) {
    if (ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to) feeding.get(edge.to)?.add(edge.from)
  }
  const byPlace = [...graph.nodes].sort((a, b) => a.x - b.x || a.y - b.y || a.id.localeCompare(b.id))
  const order: string[] = []
  const placed = new Set<string>()
  let progress = true
  while (progress) {
    progress = false
    for (const node of byPlace) {
      if (placed.has(node.id)) continue
      const feeders = feeding.get(node.id) ?? new Set()
      if ([...feeders].every((id) => placed.has(id))) {
        order.push(node.id)
        placed.add(node.id)
        progress = true
        // Back to the left: a node just freed may be further left than the rest.
        break
      }
    }
  }
  return order
}

/** The nodes with a line into this one, in step order. */
export function flowFeeders(graph: Pick<AutomationGraph, "edges">, nodeId: string, order: readonly string[]): string[] {
  const from = new Set(graph.edges.filter((edge) => edge.to === nodeId && edge.from !== nodeId).map((edge) => edge.from))
  return order.filter((id) => from.has(id))
}

/**
 * The steps that may start now: still waiting, and every node with a line
 * into them is done. A step with nothing feeding it is ready at once.
 */
export function readyFlowSteps(
  graph: Pick<AutomationGraph, "edges">,
  steps: readonly { nodeId: string; status: FlowStepStatus }[]
): string[] {
  const statusOf = new Map(steps.map((step) => [step.nodeId, step.status]))
  const order = steps.map((step) => step.nodeId)
  return steps
    .filter((step) => step.status === "waiting")
    .filter((step) => flowFeeders(graph, step.nodeId, order).every((id) => statusOf.get(id) === "done"))
    .map((step) => step.nodeId)
}

/** Every step a node's result reaches, so Make it again can send them back to waiting. */
export function flowStepsAfter(graph: Pick<AutomationGraph, "edges">, nodeId: string): Set<string> {
  const after = new Set<string>()
  const queue = [nodeId]
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of graph.edges) {
      if (edge.from === current && !after.has(edge.to) && edge.to !== nodeId) {
        after.add(edge.to)
        queue.push(edge.to)
      }
    }
  }
  return after
}
