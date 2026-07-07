import { typeDef, type FlowEdge, type FlowNode } from "@/components/automation/catalog"

export const NODE_W = 224
export const NODE_H = 58

export type Point = { x: number; y: number }

export function outputCountOf(node: FlowNode) {
  return typeDef(node.type).outputs ?? 1
}

export function portOut(node: FlowNode, index: number): Point {
  const count = outputCountOf(node)
  const y = count === 1 ? node.y + 29 : node.y + (index === 0 ? 16 : 42)
  return { x: node.x + NODE_W, y }
}

export function portIn(node: FlowNode): Point {
  return { x: node.x, y: node.y + 29 }
}

export function edgePath(a: Point, b: Point) {
  const dx = Math.max(46, Math.abs(b.x - a.x) * 0.5)
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
}

export function topoOrder(nodes: FlowNode[], edges: FlowEdge[]) {
  const incoming = (id: string) => edges.filter((edge) => edge.to === id).length
  const seen = new Set<string>()
  const order: FlowNode[] = []
  const queue = nodes.filter(
    (node) => incoming(node.id) === 0 && edges.some((edge) => edge.from === node.id)
  )

  while (queue.length) {
    const node = queue.shift()
    if (!node || seen.has(node.id)) {
      continue
    }
    seen.add(node.id)
    order.push(node)
    for (const edge of edges) {
      if (edge.from !== node.id) {
        continue
      }
      const target = nodes.find((candidate) => candidate.id === edge.to)
      if (target && !seen.has(target.id)) {
        queue.push(target)
      }
    }
  }

  return order
}

export function flowBounds(nodes: FlowNode[]) {
  if (!nodes.length) {
    return null
  }
  return {
    minX: Math.min(...nodes.map((node) => node.x)),
    minY: Math.min(...nodes.map((node) => node.y)),
    maxX: Math.max(...nodes.map((node) => node.x + NODE_W)),
    maxY: Math.max(...nodes.map((node) => node.y + NODE_H)),
  }
}
