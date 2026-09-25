import { lazy, type ComponentType } from "react"
import { CircleHelpIcon } from "lucide-react"

import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/graph"
import type {
  AutomationNodeDescriptor,
  AutomationNodeFieldsProps,
  AutomationNodeIcon,
  AutomationNodePort,
  AutomationPaletteGroup,
} from "@/lib/automations/node-descriptor"
import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeGridNode } from "@/lib/recipes/trade-grid"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeSignalsNode } from "@/lib/recipes/trade-signals"
import {
  TRADE_PALETTE_GROUP,
  tradeWalletNode,
} from "@/lib/recipes/trade-wallet"

export type {
  AutomationNodeIcon,
  AutomationNodePort,
  AutomationPaletteGroup,
} from "@/lib/automations/node-descriptor"

/**
 * Recipes deliberately have a private registry. The shell automation registry
 * cannot know about trade steps once Automations returns to stock.
 */
export const RECIPE_NODE_DESCRIPTORS: readonly AutomationNodeDescriptor[] = [
  tradeWalletNode,
  tradeMarketsNode,
  tradeDcaNode,
  tradeSignalsNode,
  tradeGridNode,
]

export const RECIPE_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  TRADE_PALETTE_GROUP,
]

const descriptorByKind = new Map(
  RECIPE_NODE_DESCRIPTORS.map((descriptor) => [descriptor.kind, descriptor])
)
const descriptorByPaletteKey = new Map(
  RECIPE_NODE_DESCRIPTORS.flatMap((descriptor) =>
    descriptor.palette ? [[descriptor.palette.key, descriptor] as const] : []
  )
)

export type RecipePaletteItem = {
  key: string
  group: AutomationPaletteGroup
  description: string
  name: string
  icon: AutomationNodeIcon
}

export const RECIPE_PALETTE_ITEMS: readonly RecipePaletteItem[] =
  RECIPE_NODE_DESCRIPTORS.flatMap((descriptor) =>
    descriptor.palette
      ? [
          {
            ...descriptor.palette,
            name: descriptor.name(descriptor.createSettings()),
            icon: descriptor.icon,
          },
        ]
      : []
  )

export function recipeDescriptorForNode(
  node: AutomationNode
): AutomationNodeDescriptor | null {
  return descriptorByKind.get(node.kind) ?? null
}

export function recipeKindIsSupported(kind: string): boolean {
  return descriptorByKind.has(kind)
}

export function recipeNodeIsSupported(node: AutomationNode): boolean {
  return recipeKindIsSupported(node.kind)
}

export function isRecipePaletteKey(value: unknown): value is string {
  return typeof value === "string" && descriptorByPaletteKey.has(value)
}

export function createRecipeNode(
  key: string,
  position: { id: string; x: number; y: number }
): AutomationNode {
  const descriptor = descriptorByPaletteKey.get(key)
  if (!descriptor) throw new Error(`Unknown recipe node key: ${key}`)
  return {
    id: position.id,
    kind: descriptor.kind,
    x: position.x,
    y: position.y,
    settings: descriptor.createSettings(),
  }
}

export function recipePaletteKeyForNode(node: AutomationNode): string | null {
  return recipeDescriptorForNode(node)?.palette?.key ?? null
}

export function recipeNodeName(node: AutomationNode): string {
  return (
    recipeDescriptorForNode(node)?.name(node.settings) ?? "Unsupported step"
  )
}

export function recipeNodeDescription(node: AutomationNode): string {
  const descriptor = recipeDescriptorForNode(node)
  if (!descriptor) {
    return `"${node.kind}" steps aren't available in Recipes. Delete the step or update the app.`
  }
  return descriptor.description(node.settings)
}

export function recipeNodeIcon(node: AutomationNode): AutomationNodeIcon {
  return recipeDescriptorForNode(node)?.icon ?? CircleHelpIcon
}

const lazyFields = new Map<string, ComponentType<AutomationNodeFieldsProps>>()

export function recipeNodeFields(
  node: AutomationNode
): ComponentType<AutomationNodeFieldsProps> | null {
  const descriptor = recipeDescriptorForNode(node)
  if (!descriptor?.fields) return null
  const cached = lazyFields.get(descriptor.kind)
  if (cached) return cached
  const component = lazy(descriptor.fields)
  lazyFields.set(descriptor.kind, component)
  return component
}

export function recipeNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return recipeDescriptorForNode(node)?.outputPorts ?? []
}

export function recipeNodeHasInput(node: AutomationNode): boolean {
  return recipeDescriptorForNode(node)?.hasInput ?? true
}

export function recipeNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  return recipeNodeOutputPorts(node).some((port) => port.id === sourcePort)
}

export function recipeNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  const descriptor = recipeDescriptorForNode(source)
  if (!descriptor) {
    return "This step isn't available in Recipes, so it can't be connected."
  }
  if (!recipeNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  if (!recipeNodeHasInput(target)) {
    return `"${recipeNodeName(target)}" starts a recipe, so nothing can connect into it.`
  }
  return descriptor.connectionError(sourcePort, target)
}

export function canConnectRecipeNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return (
    source.id !== target.id &&
    recipeNodeConnectionError(source, sourcePort, target) === null
  )
}
