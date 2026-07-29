import { boundedString, finiteNumber, isRecord, requiredString } from './parse-utils'
import { getNodeDescriptor, isAutomationNodeKind, nodeOutputPorts } from './node-registry'
import type {
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationSourcePort,
  AutomationValidationError,
} from './types'

const MAX_NODES = 100
const MAX_EDGES = 200
// Every output port name except the AI Router's per-route `route:<id>` ports.
const FIXED_SOURCE_PORTS = new Set<string>(['then', 'documents', 'article', 'approved', 'else'])

export function parseAutomationGraph(value: unknown): AutomationGraph {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !isRecord(value.viewport)) {
    throw new Error('Automation graph is invalid')
  }
  if (value.nodes.length > MAX_NODES || value.edges.length > MAX_EDGES) throw new Error('Automation graph is too large')

  const nodes = value.nodes.map(parseNode)
  const edges = value.edges.map(parseEdge)
  const viewport = {
    x: finiteNumber(value.viewport.x, 'Canvas position'),
    y: finiteNumber(value.viewport.y, 'Canvas position'),
    zoom: finiteNumber(value.viewport.zoom, 'Canvas zoom'),
  }
  if (viewport.zoom < 0.25 || viewport.zoom > 2) throw new Error('Canvas zoom is invalid')
  return { nodes, edges, viewport }
}

export function validateAutomationGraph(graph: AutomationGraph): AutomationValidationError[] {
  const errors: AutomationValidationError[] = []
  const nodeById = new Map<string, AutomationNode>()
  const edgeIds = new Set<string>()

  for (const node of graph.nodes) {
    if (nodeById.has(node.id)) errors.push(error('duplicate-node', 'Node IDs must be unique.', node.id))
    nodeById.set(node.id, node)
    validateNode(node, errors)
  }

  const timeNodes = graph.nodes.filter((node) => node.kind === 'time')
  if (timeNodes.length !== 1) errors.push(error('time-count', 'Add exactly one Time node.'))
  if (!graph.nodes.some(isTerminalActionNode)) errors.push(error('post-required', 'Add at least one Post or Listing node.'))

  const incoming = new Map<string, AutomationEdge[]>()
  const outgoing = new Map<string, AutomationEdge[]>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push({ code: 'duplicate-edge', message: 'Connection IDs must be unique.', edgeId: edge.id })
    edgeIds.add(edge.id)
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source || !target) {
      errors.push({ code: 'missing-node', message: 'A connection points to a missing node.', edgeId: edge.id })
      continue
    }
    if (edge.from === edge.to) errors.push({ code: 'self-edge', message: 'A node cannot connect to itself.', edgeId: edge.id })
    if (!nodeOutputPorts(source).some((port) => port.id === edge.sourcePort)) {
      errors.push({ code: 'invalid-port', message: 'A connection uses an invalid output.', edgeId: edge.id })
    }
    if (!isAutomationConnectionAllowed(source, edge.sourcePort, target)) {
      errors.push({ code: 'invalid-connection', message: `${source.name} cannot connect to ${target.name}.`, edgeId: edge.id })
    }
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge])
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }

  for (const node of graph.nodes) {
    const descriptor = getNodeDescriptor(node.kind)
    const nodeIncoming = incoming.get(node.id) ?? []
    const nodeOutgoing = outgoing.get(node.id) ?? []
    if (descriptor.inputs !== 'none' && nodeIncoming.length === 0) errors.push(error('missing-input', `${node.name} needs an input.`, node.id))
    if (descriptor.inputs === 'single' && nodeIncoming.length !== 1) {
      errors.push(error(`${node.kind}-input`, `${descriptor.meta.name} needs exactly one input.`, node.id))
    }
    if (descriptor.terminal && nodeOutgoing.length > 0) errors.push(error('post-terminal', `A ${descriptor.meta.name} node must be the final action.`, node.id))
    if (!descriptor.terminal && nodeOutgoing.length === 0) errors.push(error('missing-output', `${node.name} needs an output.`, node.id))
    descriptor.validateConnections?.(node, { incoming: nodeIncoming, outgoing: nodeOutgoing }, (code, message) => errors.push(error(code, message, node.id)))
  }

  const duplicateConnections = new Set<string>()
  for (const edge of graph.edges) {
    const key = `${edge.from}:${edge.sourcePort}:${edge.to}`
    if (duplicateConnections.has(key)) errors.push({ code: 'duplicate-connection', message: 'Remove the duplicate connection.', edgeId: edge.id })
    duplicateConnections.add(key)
  }

  if (hasCycle(graph)) errors.push(error('cycle', 'Automation connections cannot form a loop.'))
  const start = timeNodes[0]
  if (start) {
    const reachable = walkGraph(start.id, outgoing, (edge) => edge.to)
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) errors.push(error('unreachable', `${node.name} is not connected to Time.`, node.id))
    }
  }

  const reverse = new Map<string, AutomationEdge[]>()
  for (const edge of graph.edges) reverse.set(edge.to, [...(reverse.get(edge.to) ?? []), edge])
  const reachesAction = new Set<string>()
  for (const action of graph.nodes.filter(isTerminalActionNode)) {
    for (const id of walkGraph(action.id, reverse, (edge) => edge.from)) reachesAction.add(id)
  }
  for (const node of graph.nodes) {
    if (!reachesAction.has(node.id)) errors.push(error('no-post-path', `${node.name} does not lead to a Post or Listing node.`, node.id))
  }

  return dedupeErrors(errors)
}

export function topologicalAutomationNodes(graph: AutomationGraph): AutomationNode[] {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]))
  const outgoing = new Map<string, AutomationEdge[]>()
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  }
  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0)
  const result: AutomationNode[] = []
  while (queue.length) {
    const node = queue.shift()!
    result.push(node)
    for (const edge of outgoing.get(node.id) ?? []) {
      const next = (indegree.get(edge.to) ?? 1) - 1
      indegree.set(edge.to, next)
      if (next === 0) queue.push(graph.nodes.find((candidate) => candidate.id === edge.to)!)
    }
  }
  return result
}

/**
 * Every node reachable from `nodeId` by following connections forwards, excluding
 * `nodeId` itself. Used to resume or close the branch after an Approval gate.
 */
export function downstreamAutomationNodeIds(graph: AutomationGraph, nodeId: string): Set<string> {
  const outgoing = new Map<string, AutomationEdge[]>()
  for (const edge of graph.edges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge])
  const reachable = walkGraph(nodeId, outgoing, (edge) => edge.to)
  reachable.delete(nodeId)
  return reachable
}

function isTerminalActionNode(node: AutomationNode) {
  return getNodeDescriptor(node.kind).terminal === true
}

function validateNode(node: AutomationNode, errors: AutomationValidationError[]) {
  if (!node.name.trim()) errors.push(error('node-name', 'Give this node a name.', node.id))
  getNodeDescriptor(node.kind).validate(node, (code, message) => errors.push(error(code, message, node.id)))
}

export function isAutomationConnectionAllowed(source: AutomationNode, port: AutomationSourcePort, target: AutomationNode) {
  return getNodeDescriptor(source.kind).allowedTargets(port).includes(target.kind)
}

function hasCycle(graph: AutomationGraph) {
  return topologicalAutomationNodes(graph).length !== graph.nodes.length
}

function walkGraph(
  startId: string,
  edgesById: Map<string, AutomationEdge[]>,
  nextId: (edge: AutomationEdge) => string
) {
  const visited = new Set([startId])
  const queue = [startId]
  while (queue.length) {
    const id = queue.shift()!
    for (const edge of edgesById.get(id) ?? []) {
      const next = nextId(edge)
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return visited
}

function parseNode(value: unknown): AutomationNode {
  if (!isRecord(value) || !isAutomationNodeKind(value.kind) || !isRecord(value.config)) {
    throw new Error('Automation node is invalid')
  }
  const common = {
    id: requiredString(value.id, 'Node ID', 64),
    name: boundedString(value.name, 'Node name', 100),
    x: finiteNumber(value.x, 'Node position'),
    y: finiteNumber(value.y, 'Node position'),
  }
  const config = getNodeDescriptor(value.kind).parseConfig(value.config, common)
  return { ...common, kind: value.kind, config } as AutomationNode
}

function parseEdge(value: unknown): AutomationEdge {
  if (!isRecord(value)) throw new Error('Automation connection is invalid')
  const sourcePort = requiredString(value.sourcePort, 'Connection output', 80)
  if (!FIXED_SOURCE_PORTS.has(sourcePort) && !sourcePort.startsWith('route:')) {
    throw new Error('Automation connection output is invalid')
  }
  return {
    id: requiredString(value.id, 'Connection ID', 64),
    from: requiredString(value.from, 'Connection source', 64),
    sourcePort: sourcePort as AutomationSourcePort,
    to: requiredString(value.to, 'Connection target', 64),
  }
}

function error(code: string, message: string, nodeId?: string): AutomationValidationError {
  return { code, message, ...(nodeId ? { nodeId } : {}) }
}

function dedupeErrors(errors: AutomationValidationError[]) {
  const seen = new Set<string>()
  return errors.filter((item) => {
    const key = `${item.code}:${item.nodeId ?? ''}:${item.edgeId ?? ''}:${item.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
