import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/automation"

export const NODE_WIDTH = 280
export const NODE_HEIGHT = 88
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 2

export type CanvasPoint = { x: number; y: number }
export type CanvasSize = { width: number; height: number }
export type NodePort = { id: AutomationSourcePort; label: string }

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
    x:
      -viewport.x / viewport.zoom +
      padding +
      column * (NODE_WIDTH + gap),
    y:
      -viewport.y / viewport.zoom +
      padding +
      row * (NODE_HEIGHT + gap),
  }
}

export function nodeOutputPorts(node: AutomationNode): NodePort[] {
  if (node.kind === "indicator") {
    return [
      { id: "bullish", label: "Bullish" },
      { id: "trend", label: "Trend" },
      { id: "bearish", label: "Bearish" },
    ]
  }
  if (node.kind === "logic") return [{ id: "match", label: "Match" }]
  // Look Back forwards the (time-limited) trend to the next indicator.
  if (node.kind === "lookback") return [{ id: "trend", label: "Trend" }]
  // Take Profit / Stop Loss are leaf targets — they emit nothing.
  if (node.kind === "takeProfit" || node.kind === "stopLoss") return []
  // Actions chain onward to their exit watchers (e.g. Long → EMA → Close).
  return [{ id: "then", label: "Then" }]
}

/** A Take Profit / Stop Loss hook drawn on the top or bottom edge of an entry. */
export type NodeAttachmentPort = {
  id: "tp" | "sl"
  edge: "top" | "bottom"
}

/**
 * Which edge a hook sits on. Long: Take Profit above, Stop Loss below (matching
 * where those price lines sit relative to entry on a chart). Short mirrors it.
 */
export function attachmentPortEdge(
  node: AutomationNode,
  port: "tp" | "sl"
): "top" | "bottom" {
  const isLong = node.kind === "action" && node.action === "buy"
  if (port === "tp") return isLong ? "top" : "bottom"
  return isLong ? "bottom" : "top"
}

/** The two protective hooks a Long/Short entry exposes (none for other nodes). */
export function nodeAttachmentPorts(node: AutomationNode): NodeAttachmentPort[] {
  if (
    node.kind !== "action" ||
    (node.action !== "buy" && node.action !== "short")
  ) {
    return []
  }
  return [
    { id: "tp", edge: attachmentPortEdge(node, "tp") },
    { id: "sl", edge: attachmentPortEdge(node, "sl") },
  ]
}

export function portOut(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): CanvasPoint {
  if (sourcePort === "tp" || sourcePort === "sl") {
    const onTop = attachmentPortEdge(node, sourcePort) === "top"
    return {
      x: node.x + NODE_WIDTH / 2,
      y: node.y + (onTop ? 0 : NODE_HEIGHT),
    }
  }
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

/** True for the entry hooks that drive protective exits (drawn vertically). */
export function isProtectionPort(sourcePort: AutomationSourcePort): boolean {
  return sourcePort === "tp" || sourcePort === "sl"
}

/**
 * Where a protective-exit edge lands on a Take Profit / Stop Loss node: the top
 * or bottom edge center nearest the entry hook, so the link runs vertically
 * (the node's hooks sit above and below, never on its sides).
 */
export function protectionPortIn(
  from: CanvasPoint,
  target: AutomationNode
): CanvasPoint {
  const topCenter = { x: target.x + NODE_WIDTH / 2, y: target.y }
  const bottomCenter = { x: target.x + NODE_WIDTH / 2, y: target.y + NODE_HEIGHT }
  return Math.abs(topCenter.y - from.y) <= Math.abs(bottomCenter.y - from.y)
    ? topCenter
    : bottomCenter
}

export function edgePath(
  from: CanvasPoint,
  to: CanvasPoint,
  vertical = false
) {
  if (vertical) {
    const dir = Math.sign(to.y - from.y) || 1
    const offset = Math.max(40, Math.abs(to.y - from.y) * 0.5)
    return `M ${from.x} ${from.y} C ${from.x} ${from.y + dir * offset}, ${to.x} ${to.y - dir * offset}, ${to.x} ${to.y}`
  }
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

export function fitViewport(
  nodes: AutomationNode[],
  width: number,
  height: number
) {
  const bounds = flowBounds(nodes)
  const padding = 48
  const zoom = 0.9
  if (!bounds || width <= 0 || height <= 0) {
    return { x: padding, y: padding, zoom }
  }

  return {
    x: padding - bounds.minX * zoom,
    y: padding - bounds.minY * zoom,
    zoom,
  }
}
