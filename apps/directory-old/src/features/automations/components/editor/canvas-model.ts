import { AUTOMATION_NODE_HEIGHT, AUTOMATION_NODE_WIDTH, nodeOutputPorts } from "@/features/automations/domain/catalog"
import type { AutomationNode, AutomationSourcePort } from "@/features/automations/domain/types"

export type CanvasPoint = { x: number; y: number }
export type CanvasSize = { width: number; height: number }

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2

export function automationNodeHeight(node: AutomationNode) {
  return Math.max(AUTOMATION_NODE_HEIGHT, 48 + nodeOutputPorts(node).length * 24)
}

export function nodeOutputPoint(node: AutomationNode, port: AutomationSourcePort): CanvasPoint {
  const ports = nodeOutputPorts(node)
  const height = automationNodeHeight(node)
  const index = Math.max(0, ports.findIndex((candidate) => candidate.id === port))
  const y = ports.length <= 1
    ? node.y + height / 2
    : node.y + 30 + (index * (height - 60)) / (ports.length - 1)
  return { x: node.x + AUTOMATION_NODE_WIDTH, y }
}

export function nodeInputPoint(node: AutomationNode): CanvasPoint {
  return { x: node.x, y: node.y + automationNodeHeight(node) / 2 }
}

export function edgePath(from: CanvasPoint, to: CanvasPoint) {
  const offset = Math.max(46, Math.abs(to.x - from.x) * 0.5)
  return `M ${from.x} ${from.y} C ${from.x + offset} ${from.y}, ${to.x - offset} ${to.y}, ${to.x} ${to.y}`
}

export function flowBounds(nodes: AutomationNode[]) {
  if (!nodes.length) return null
  return {
    minX: Math.min(...nodes.map((node) => node.x)),
    minY: Math.min(...nodes.map((node) => node.y)),
    maxX: Math.max(...nodes.map((node) => node.x + AUTOMATION_NODE_WIDTH)),
    maxY: Math.max(...nodes.map((node) => node.y + automationNodeHeight(node))),
  }
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function fitViewport(nodes: AutomationNode[], width: number, height: number) {
  const bounds = flowBounds(nodes)
  const padding = 48
  if (!bounds || width <= 0 || height <= 0) return { x: padding, y: padding, zoom: 0.9 }
  const contentWidth = Math.max(1, bounds.maxX - bounds.minX)
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY)
  const zoom = clampZoom(Math.min(1, (width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight))
  return {
    x: (width - contentWidth * zoom) / 2 - bounds.minX * zoom,
    y: (height - contentHeight * zoom) / 2 - bounds.minY * zoom,
    zoom,
  }
}

export function nextNodePosition(nodeCount: number, viewport: { x: number; y: number; zoom: number }, canvasWidth: number) {
  const gap = 32 / viewport.zoom
  const padding = 32 / viewport.zoom
  const visibleWidth = canvasWidth / viewport.zoom
  const columns = Math.max(1, Math.floor((visibleWidth - padding * 2 + gap) / (AUTOMATION_NODE_WIDTH + gap)))
  return {
    x: -viewport.x / viewport.zoom + padding + (nodeCount % columns) * (AUTOMATION_NODE_WIDTH + gap),
    y: -viewport.y / viewport.zoom + padding + Math.floor(nodeCount / columns) * (AUTOMATION_NODE_HEIGHT + gap),
  }
}
