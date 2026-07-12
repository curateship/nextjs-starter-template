import type { AutomationNode } from "@/lib/automations/automation"
import { INDICATORS } from "@/lib/indicators/registry"

export function automationNodeName(node: AutomationNode) {
  if (node.kind === "indicator") return INDICATORS[node.indicator.type].label
  if (node.kind === "logic") return node.op.toUpperCase()
  if (node.kind === "lookback") return "Look Back"
  if (node.action === "buy") return "Long"
  if (node.action === "short") return "Short"
  return "Close Position"
}

export function automationNodeDescription(node: AutomationNode) {
  if (node.kind === "indicator") {
    return INDICATORS[node.indicator.type].description
  }
  if (node.kind === "logic") {
    return "No longer supported — delete this node and connect indicators directly."
  }
  if (node.kind === "lookback") {
    return `The incoming signal only counts for ${node.bars} candles after it fires.`
  }
  if (node.action === "close") return "Closes the current market position."
  return `Targets ${node.targetEquityPct ?? 10}% of account equity.`
}
