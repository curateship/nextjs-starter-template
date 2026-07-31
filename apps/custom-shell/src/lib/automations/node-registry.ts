import type { AutomationNode, AutomationSourcePort } from "./graph"
import type {
  AutomationNodeDescriptor,
  AutomationNodeIconName,
  AutomationNodePort,
  AutomationPaletteGroup,
} from "./node-descriptor"
import { placeholderNode } from "./nodes/placeholder"

export type {
  AutomationNodeIconName,
  AutomationNodePort,
  AutomationPaletteGroup,
} from "./node-descriptor"

/** Every node kind this app ships, one descriptor module each under `nodes/`. */
const AUTOMATION_NODE_DESCRIPTORS: readonly AutomationNodeDescriptor[] = [
  placeholderNode,
]

const descriptorsByKind = new Map(
  AUTOMATION_NODE_DESCRIPTORS.map((descriptor) => [descriptor.kind, descriptor])
)

export const AUTOMATION_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  "Triggers",
  "Actions",
  "Flow",
  "Steps",
]

export type AutomationPaletteItem = {
  key: string
  group: AutomationPaletteGroup
  description: string
  name: string
  icon: AutomationNodeIconName
}

export const AUTOMATION_PALETTE_ITEMS: readonly AutomationPaletteItem[] =
  AUTOMATION_NODE_DESCRIPTORS.flatMap((descriptor) => {
    if (!descriptor.palette) return []
    return [
      {
        ...descriptor.palette,
        name: descriptor.name(descriptor.createSettings()),
        icon: descriptor.icon,
      },
    ]
  }).sort(
    (left, right) =>
      AUTOMATION_PALETTE_GROUPS.indexOf(left.group) -
      AUTOMATION_PALETTE_GROUPS.indexOf(right.group)
  )

export const AUTOMATION_PALETTE_KEYS: readonly string[] =
  AUTOMATION_PALETTE_ITEMS.map((item) => item.key)

const paletteKeySet = new Set(AUTOMATION_PALETTE_KEYS)

export function isAutomationPaletteKey(value: unknown): value is string {
  return typeof value === "string" && paletteKeySet.has(value)
}

/** Drops stale keys (removed node kinds) from a stored favorites list. */
export function cleanAutomationPaletteKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isAutomationPaletteKey))]
}

/**
 * Never throws on an unknown kind. A saved graph can outlive the registry that
 * wrote it (a node kind removed, or a graph imported from a newer app), and one
 * unreadable node must not take down the list page or the editor — the node
 * renders as an inert "unsupported" card and the compiler reports it instead.
 */
export function descriptorForNode(
  node: AutomationNode
): AutomationNodeDescriptor | null {
  return descriptorsByKind.get(node.kind) ?? null
}

export function isSupportedNode(node: AutomationNode): boolean {
  return descriptorsByKind.has(node.kind)
}

function descriptorForPaletteKey(key: string): AutomationNodeDescriptor {
  const descriptor = AUTOMATION_NODE_DESCRIPTORS.find(
    (item) => item.palette?.key === key
  )
  if (!descriptor) throw new Error(`Unknown automation node key: ${key}`)
  return descriptor
}

export function createAutomationNode(
  key: string,
  position: { id: string; x: number; y: number }
): AutomationNode {
  const descriptor = descriptorForPaletteKey(key)
  return {
    id: position.id,
    kind: descriptor.kind,
    x: position.x,
    y: position.y,
    settings: descriptor.createSettings(),
  }
}

export function automationPaletteKeyForNode(
  node: AutomationNode
): string | null {
  return descriptorForNode(node)?.palette?.key ?? null
}

export function automationNodeName(node: AutomationNode): string {
  return descriptorForNode(node)?.name(node.settings) ?? "Unsupported step"
}

export function automationNodeDescription(node: AutomationNode): string {
  const descriptor = descriptorForNode(node)
  if (!descriptor) {
    return `"${node.kind}" steps aren't available in this app. The rest of the flow still loads.`
  }
  return descriptor.description(node.settings)
}

export function automationNodeIcon(
  node: AutomationNode
): AutomationNodeIconName {
  return descriptorForNode(node)?.icon ?? "circleHelp"
}

export function automationNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return descriptorForNode(node)?.outputPorts ?? []
}

export function automationNodeHasInput(node: AutomationNode): boolean {
  // Unsupported nodes keep their input so saved edges into them still render.
  return descriptorForNode(node)?.hasInput ?? true
}

export function automationNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  return automationNodeOutputPorts(node).some((port) => port.id === sourcePort)
}

export function automationNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  const descriptor = descriptorForNode(source)
  if (!descriptor) {
    return "This step isn't available in this app, so it can't be connected."
  }
  if (!automationNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  return descriptor.connectionError(sourcePort, target)
}

export function canConnectAutomationNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return (
    source.id !== target.id &&
    automationNodeConnectionError(source, sourcePort, target) === null
  )
}
