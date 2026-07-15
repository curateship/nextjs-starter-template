import type { AutomationNode } from "@/lib/automations/automation"
import { INDICATOR_IDS, type IndicatorId } from "@/lib/indicators/registry"

export type AutomationPaletteKey =
  | `indicator-${IndicatorId}`
  | "scanner-whale-wall"
  | "filter-lookback"
  | "action-buy"
  | "action-short"
  | "action-reverse"
  | "action-close"
  | "exit-take-profit"
  | "exit-stop-loss"

const fixedPaletteKeys = [
  "scanner-whale-wall",
  "filter-lookback",
  "action-buy",
  "action-short",
  "action-reverse",
  "action-close",
  "exit-take-profit",
  "exit-stop-loss",
] as const satisfies readonly AutomationPaletteKey[]

export const AUTOMATION_PALETTE_KEYS: readonly AutomationPaletteKey[] = [
  ...INDICATOR_IDS.map(
    (indicatorId): AutomationPaletteKey => `indicator-${indicatorId}`
  ),
  ...fixedPaletteKeys,
]

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
  if (node.kind === "indicator") return `indicator-${node.indicator.type}`
  if (node.kind === "whaleWall") return "scanner-whale-wall"
  if (node.kind === "lookback") return "filter-lookback"
  if (node.kind === "takeProfit") return "exit-take-profit"
  if (node.kind === "stopLoss") return "exit-stop-loss"
  if (node.kind === "action") return `action-${node.action}`
  return null
}
