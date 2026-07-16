import { isAIProvider } from '@/lib/utils/ai-models'
import { nodeOutputPorts } from './catalog'
import { parseAutomationSchedule, validateAutomationSchedule } from './schedule'
import type {
  AgentAutomationNode,
  AutomationEdge,
  AutomationGraph,
  AutomationNode,
  AutomationNodeKind,
  AutomationRouterRoute,
  AutomationSourcePort,
  AutomationValidationError,
  PostAutomationNode,
  RouterAutomationNode,
  ScraperAutomationNode,
  TimeAutomationNode,
} from './types'

const NODE_KINDS = new Set<AutomationNodeKind>(['time', 'scraper', 'router', 'agent', 'post'])
const MAX_NODES = 100
const MAX_EDGES = 200

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
  if (!graph.nodes.some((node) => node.kind === 'post')) errors.push(error('post-required', 'Add at least one Post node.'))

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
    const nodeIncoming = incoming.get(node.id) ?? []
    const nodeOutgoing = outgoing.get(node.id) ?? []
    if (node.kind !== 'time' && nodeIncoming.length === 0) errors.push(error('missing-input', `${node.name} needs an input.`, node.id))
    if (node.kind === 'post' && nodeIncoming.length !== 1) errors.push(error('post-input', 'A Post node needs exactly one AI Agent input.', node.id))
    if (node.kind === 'post' && nodeOutgoing.length > 0) errors.push(error('post-terminal', 'A Post node must be the final action.', node.id))
    if (node.kind !== 'post' && node.kind !== 'router' && nodeOutgoing.length === 0) {
      errors.push(error('missing-output', `${node.name} needs an output.`, node.id))
    }
    if (node.kind === 'router') {
      for (const route of node.config.routes) {
        if (!nodeOutgoing.some((edge) => edge.sourcePort === `route:${route.id}`)) {
          errors.push(error('route-output', `Connect the ${route.name} route.`, node.id))
        }
      }
      if (!nodeOutgoing.some((edge) => edge.sourcePort === 'else')) {
        errors.push(error('route-output', 'Connect the Else route.', node.id))
      }
      if (nodeOutgoing.length === 0) errors.push(error('missing-output', `${node.name} needs an output.`, node.id))
    }
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
  const reachesPost = new Set<string>()
  for (const post of graph.nodes.filter((node) => node.kind === 'post')) {
    for (const id of walkGraph(post.id, reverse, (edge) => edge.from)) reachesPost.add(id)
  }
  for (const node of graph.nodes) {
    if (!reachesPost.has(node.id)) errors.push(error('no-post-path', `${node.name} does not lead to a Post node.`, node.id))
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

function validateNode(node: AutomationNode, errors: AutomationValidationError[]) {
  if (!node.name.trim()) errors.push(error('node-name', 'Give this node a name.', node.id))
  if (node.kind === 'time') {
    const scheduleError = validateAutomationSchedule(node.config.schedule)
    if (scheduleError) errors.push(error('schedule', scheduleError, node.id))
  }
  if (node.kind === 'scraper') {
    const urls = node.config.urls.map((url) => url.trim()).filter(Boolean)
    if (urls.length === 0) errors.push(error('scraper-url', 'Add at least one website URL.', node.id))
    if (new Set(urls).size !== urls.length) errors.push(error('scraper-duplicate-url', 'Remove duplicate website URLs.', node.id))
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) throw new Error()
      } catch {
        errors.push(error('scraper-url', 'Scraper URLs must be public HTTPS addresses.', node.id))
        break
      }
    }
  }
  if (node.kind === 'router') {
    if (!node.config.model.trim()) errors.push(error('router-model', 'Choose an AI Router model.', node.id))
    if (node.config.routes.length === 0) errors.push(error('router-routes', 'Add at least one AI Router route.', node.id))
    const names = node.config.routes.map((route) => route.name.trim().toLowerCase())
    const ids = node.config.routes.map((route) => route.id)
    if (new Set(ids).size !== ids.length) errors.push(error('router-routes', 'AI Router route IDs must be unique.', node.id))
    if (new Set(names).size !== names.length) errors.push(error('router-routes', 'AI Router route names must be unique.', node.id))
    for (const route of node.config.routes) {
      if (!route.name.trim() || !route.description.trim()) errors.push(error('router-route', 'Each AI Router route needs a name and description.', node.id))
    }
  }
  if (node.kind === 'agent') {
    if (!node.config.model.trim()) errors.push(error('agent-model', 'Choose an AI Agent model.', node.id))
    if (!node.config.instructions.trim()) errors.push(error('agent-prompt', 'Add instructions for this AI Agent.', node.id))
  }
  if (node.kind === 'post') {
    if (!node.config.templateId) errors.push(error('post-template', 'Choose a Post template.', node.id))
    if (node.config.primaryCategoryId && !node.config.categoryIds.includes(node.config.primaryCategoryId)) {
      errors.push(error('post-category', 'The primary category must be selected.', node.id))
    }
  }
}

export function isAutomationConnectionAllowed(source: AutomationNode, port: AutomationSourcePort, target: AutomationNode) {
  if (source.kind === 'time') return port === 'then' && (target.kind === 'scraper' || target.kind === 'agent')
  if (source.kind === 'scraper') return port === 'documents' && (target.kind === 'router' || target.kind === 'agent')
  if (source.kind === 'router') return (port === 'else' || port.startsWith('route:')) && target.kind === 'agent'
  if (source.kind === 'agent') return port === 'article' && target.kind === 'post'
  return false
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
  if (!isRecord(value) || !NODE_KINDS.has(value.kind as AutomationNodeKind) || !isRecord(value.config)) {
    throw new Error('Automation node is invalid')
  }
  const common = {
    id: requiredString(value.id, 'Node ID', 64),
    name: boundedString(value.name, 'Node name', 100),
    x: finiteNumber(value.x, 'Node position'),
    y: finiteNumber(value.y, 'Node position'),
  }
  if (value.kind === 'time') {
    return { ...common, kind: 'time', config: { schedule: parseAutomationSchedule(value.config.schedule) } } satisfies TimeAutomationNode
  }
  if (value.kind === 'scraper') {
    if (!Array.isArray(value.config.urls) || value.config.urls.length > 20) throw new Error('Scraper URLs are invalid')
    return {
      ...common,
      kind: 'scraper',
      config: { urls: value.config.urls.map((url) => boundedString(url, 'Scraper URL', 2048)) },
    } satisfies ScraperAutomationNode
  }
  if (value.kind === 'router') {
    if (!isAIProvider(value.config.provider) || !Array.isArray(value.config.routes) || value.config.routes.length > 8) {
      throw new Error('AI Router configuration is invalid')
    }
    return {
      ...common,
      kind: 'router',
      config: {
        provider: value.config.provider,
        model: boundedString(value.config.model, 'AI Router model', 120),
        routes: value.config.routes.map(parseRoute),
      },
    } satisfies RouterAutomationNode
  }
  if (value.kind === 'agent') {
    if (!isAIProvider(value.config.provider)) throw new Error('AI Agent provider is invalid')
    return {
      ...common,
      kind: 'agent',
      config: {
        provider: value.config.provider,
        model: boundedString(value.config.model, 'AI Agent model', 120),
        instructions: boundedString(value.config.instructions, 'AI Agent instructions', 12_000),
      },
    } satisfies AgentAutomationNode
  }
  if (!Array.isArray(value.config.categoryIds) || value.config.categoryIds.length > 50) throw new Error('Post categories are invalid')
  return {
    ...common,
    kind: 'post',
    config: {
      templateId: boundedString(value.config.templateId, 'Post template', 64),
      publish: value.config.publish === true,
      categoryIds: value.config.categoryIds.map((id) => requiredString(id, 'Post category', 64)),
      primaryCategoryId: value.config.primaryCategoryId === null || value.config.primaryCategoryId === undefined
        ? null
        : requiredString(value.config.primaryCategoryId, 'Post primary category', 64),
    },
  } satisfies PostAutomationNode
}

function parseRoute(value: unknown): AutomationRouterRoute {
  if (!isRecord(value)) throw new Error('AI Router route is invalid')
  return {
    id: requiredString(value.id, 'AI Router route ID', 64),
    name: boundedString(value.name, 'AI Router route name', 80),
    description: boundedString(value.description, 'AI Router route description', 500),
  }
}

function parseEdge(value: unknown): AutomationEdge {
  if (!isRecord(value)) throw new Error('Automation connection is invalid')
  const sourcePort = requiredString(value.sourcePort, 'Connection output', 80)
  if (sourcePort !== 'then' && sourcePort !== 'documents' && sourcePort !== 'article' && sourcePort !== 'else' && !sourcePort.startsWith('route:')) {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string, max: number) {
  const result = boundedString(value, label, max).trim()
  if (!result) throw new Error(`${label} is required`)
  return result
}

function boundedString(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} is invalid`)
  return value
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${label} is invalid`)
  return value
}
