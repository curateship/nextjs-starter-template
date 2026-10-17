import type { AutomationListItem } from "@/lib/api/automations/automations"

/** Keeps drafts needing attention together after valid flows in either direction. */
export function compareAutomationSteps(
  left: AutomationListItem,
  right: AutomationListItem,
  direction: "asc" | "desc"
): number {
  if (left.isValid !== right.isValid) return left.isValid ? -1 : 1

  const factor = direction === "asc" ? 1 : -1
  if (left.isValid) return factor * (left.nodeCount - right.nodeCount)

  return left.summary.localeCompare(right.summary)
}
