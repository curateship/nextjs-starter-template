import type { AnyNodeDescriptor, NodeGroup, NodeOutputPort } from './node-descriptor'
import { agentNode } from './nodes/agent'
import { approvalNode } from './nodes/approval'
import { eventNode } from './nodes/event'
import { feedNode } from './nodes/feed'
import { imageNode } from './nodes/image'
import { listingNode } from './nodes/listing'
import { newsletterNode } from './nodes/newsletter'
import { postNode } from './nodes/post'
import { routerNode } from './nodes/router'
import { scraperNode } from './nodes/scraper'
import { timeNode } from './nodes/time'
import type { AutomationNode, AutomationNodeKind } from './types'

// Canonical order — drives the palette and the "add a node" catalog. To add a
// node kind, write its descriptor module and add it to this list.
export const AUTOMATION_NODES: AnyNodeDescriptor[] = [
  timeNode,
  scraperNode,
  feedNode,
  routerNode,
  agentNode,
  imageNode,
  approvalNode,
  postNode,
  listingNode,
  eventNode,
  newsletterNode,
]

const NODE_BY_KIND = new Map<AutomationNodeKind, AnyNodeDescriptor>(
  AUTOMATION_NODES.map((node) => [node.kind, node])
)

export function getNodeDescriptor(kind: AutomationNodeKind): AnyNodeDescriptor {
  const descriptor = NODE_BY_KIND.get(kind)
  if (!descriptor) throw new Error(`Unknown automation node kind: ${kind}`)
  return descriptor
}

export function isAutomationNodeKind(value: unknown): value is AutomationNodeKind {
  return typeof value === 'string' && NODE_BY_KIND.has(value as AutomationNodeKind)
}

export const AUTOMATION_NODE_CATALOG: Array<{
  kind: AutomationNodeKind
  name: string
  description: string
  group: NodeGroup
}> = AUTOMATION_NODES.map((node) => ({ kind: node.kind, ...node.meta }))

export function nodeOutputPorts(node: AutomationNode): NodeOutputPort[] {
  return getNodeDescriptor(node.kind).ports(node)
}

/**
 * The terminal actions a graph may end in, named for a validation message —
 * "Post, Listing, Event, or Newsletter". Read from the registry so adding a
 * terminal node kind cannot leave the message behind.
 */
export function terminalActionNodeNames(): string {
  const names = AUTOMATION_NODES.filter((node) => node.terminal).map((node) => node.meta.name)
  if (names.length < 2) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
}
