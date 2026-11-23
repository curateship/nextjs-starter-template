import type { AutomationNode } from "@/lib/automations/automation"
import {
  AUTOMATION_PALETTE_KEYS,
  automationPaletteKeyForRegisteredNode,
  type AutomationPaletteKey,
} from "@/lib/automations/node-registry"

export { AUTOMATION_PALETTE_KEYS, type AutomationPaletteKey }

const automationPaletteKeySet = new Set<string>(AUTOMATION_PALETTE_KEYS)

export function isAutomationPaletteKey(
  value: unknown
): value is AutomationPaletteKey {
  return typeof value === "string" && automationPaletteKeySet.has(value)
}

export function cleanAutomationPaletteKeys(
  value: unknown
): AutomationPaletteKey[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isAutomationPaletteKey))]
}

export function automationPaletteKeyForNode(
  node: AutomationNode
): AutomationPaletteKey | null {
  return automationPaletteKeyForRegisteredNode(node)
}
