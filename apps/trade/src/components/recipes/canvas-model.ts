/**
 * Deliberate Trade-owned fork of the shell canvas geometry. Recipe connection
 * rules come from the private recipe registry.
 */
import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/graph"
import {
  recipeNodeOutputPorts,
  canConnectRecipeNodes,
  type AutomationNodePort,
} from "@/lib/recipes/registry"

export const NODE_WIDTH = 280
export const NODE_HEIGHT = 88
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2

export type CanvasPoint = { x: number; y: number }
export type CanvasSize = { width: number; height: number }
export type NodePort = AutomationNodePort

/** Places newly added nodes in the visible viewport without stacking them. */
export function nextNodePosition(
  nodeCount: number,
  viewport: { x: number; y: number; zoom: number },
  canvasWidth: number
): CanvasPoint {
  const gap = 32 / viewport.zoom
  const padding = 32 / viewport.zoom
  const visibleWidth = canvasWidth / viewport.zoom
  const columns = Math.max(
    1,
    Math.floor((visibleWidth - padding * 2 + gap) / (NODE_WIDTH + gap))
  )
  const column = nodeCount % columns
  const row = Math.floor(nodeCount / columns)
  return {
    x: -viewport.x / viewport.zoom + padding + column * (NODE_WIDTH + gap),
    y: -viewport.y / viewport.zoom + padding + row * (NODE_HEIGHT + gap),
  }
}

/** How close, in screen pixels, a dragged node gets before it lines itself up. */
export const SNAP_DISTANCE = 8

export type SnapResult = {
  x: number
  y: number
  /** The world coordinate the node lined up on, or null when it did not. */
  guideX: number | null
  guideY: number | null
}

/** The nearest candidate within `threshold`, or null. Ties keep the first one. */
function nearestWithin(
  value: number,
  candidates: number[],
  threshold: number
): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value)
    if (distance > threshold || distance >= bestDistance) continue
    best = candidate
    bestDistance = distance
  }
  return best
}

/**
 * Lines a dragged node up with any other node it is nearly level with, one axis
 * at a time. Every node is the same size, so matching the left edges also
 * matches the centres and the right edges — one number per axis is enough.
 */
export function snapNodePosition(
  position: CanvasPoint,
  others: AutomationNode[],
  zoom: number
): SnapResult {
  // Measured on screen, so the pull feels identical at every zoom level.
  const threshold = SNAP_DISTANCE / clampZoom(zoom)
  const guideX = nearestWithin(
    position.x,
    others.map((node) => node.x),
    threshold
  )
  const guideY = nearestWithin(
    position.y,
    others.map((node) => node.y),
    threshold
  )
  return {
    x: guideX ?? position.x,
    y: guideY ?? position.y,
    guideX,
    guideY,
  }
}

export function nodeOutputPorts(node: AutomationNode): NodePort[] {
  return [...recipeNodeOutputPorts(node)]
}

export function canConnectNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return canConnectRecipeNodes(source, sourcePort, target)
}

export function portOut(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): CanvasPoint {
  const ports = nodeOutputPorts(node)
  const index = Math.max(
    0,
    ports.findIndex((port) => port.id === sourcePort)
  )
  const y =
    ports.length <= 1
      ? node.y + NODE_HEIGHT / 2
      : node.y + 24 + (index * (NODE_HEIGHT - 48)) / (ports.length - 1)
  return { x: node.x + NODE_WIDTH, y }
}

export function portIn(node: AutomationNode): CanvasPoint {
  return { x: node.x, y: node.y + NODE_HEIGHT / 2 }
}

export function edgePath(from: CanvasPoint, to: CanvasPoint) {
  const offset = Math.max(46, Math.abs(to.x - from.x) * 0.5)
  return `M ${from.x} ${from.y} C ${from.x + offset} ${from.y}, ${to.x - offset} ${to.y}, ${to.x} ${to.y}`
}

export function flowBounds(nodes: AutomationNode[]) {
  if (nodes.length === 0) return null
  return {
    minX: Math.min(...nodes.map((node) => node.x)),
    minY: Math.min(...nodes.map((node) => node.y)),
    maxX: Math.max(...nodes.map((node) => node.x + NODE_WIDTH)),
    maxY: Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)),
  }
}

export function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/** The padding kept between the flow and the canvas edges when fitting. */
const FIT_PADDING = 48

/**
 * The viewport that puts the whole flow on screen: the zoom is whichever of the
 * two axes runs out of room first, and the flow is then centred in what is left.
 *
 * Never zooms past 100% — a flow of one box would otherwise be blown up to the
 * maximum, which is not what "fit to view" means to anyone pressing it.
 */
export function fitViewport(
  nodes: AutomationNode[],
  width: number,
  height: number
) {
  const bounds = flowBounds(nodes)
  if (!bounds || width <= 0 || height <= 0) {
    return { x: FIT_PADDING, y: FIT_PADDING, zoom: 1 }
  }

  const spanX = Math.max(1, bounds.maxX - bounds.minX)
  const spanY = Math.max(1, bounds.maxY - bounds.minY)
  const zoom = clampZoom(
    Math.min(
      1,
      (width - FIT_PADDING * 2) / spanX,
      (height - FIT_PADDING * 2) / spanY
    )
  )

  return {
    x: (width - spanX * zoom) / 2 - bounds.minX * zoom,
    y: (height - spanY * zoom) / 2 - bounds.minY * zoom,
    zoom,
  }
}
