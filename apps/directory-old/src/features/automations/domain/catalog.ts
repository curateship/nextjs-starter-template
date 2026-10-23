import { getNodeDescriptor } from './node-registry'
import type { AutomationGraph, AutomationNode, AutomationNodeKind } from './types'

export const AUTOMATION_NODE_WIDTH = 260
export const AUTOMATION_NODE_HEIGHT = 88

// Re-exported from the node registry so existing call sites keep working.
export { AUTOMATION_NODE_CATALOG, nodeOutputPorts } from './node-registry'

export function createInitialAutomationGraph(): AutomationGraph {
  return {
    nodes: [createAutomationNode('time', 80, 180)],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }
}

export function createAutomationNode(kind: AutomationNodeKind, x: number, y: number): AutomationNode {
  const descriptor = getNodeDescriptor(kind)
  return {
    id: crypto.randomUUID(),
    kind,
    name: descriptor.defaultName ?? descriptor.meta.name,
    x,
    y,
    config: descriptor.createConfig(),
  } as AutomationNode
}
