import { nodeTuneUpdate } from "@/lib/automations/node-registry"
import type { AutomationNode } from "@/lib/automations/automation"
import type { BacktestTuneDrag } from "@/components/backtest/backtest-run-chart"

/**
 * The node update a dropped backtest tune-line maps to (dragging the recorded
 * Stop/TP/first-ladder line on the replay chart), or null when it changes
 * nothing. Decodes the drag into a target + reference price and lets the owning
 * node's `applyTuneDrag` do the clamp/rounding; side-aware, since the anchor is
 * the replayed position's real entry. First matching node in the graph wins.
 */
export function nodeAfterTuneDrag(
  nodes: AutomationNode[],
  change: BacktestTuneDrag
): AutomationNode | null {
  const [target, ref, side] =
    change.kind === "crack"
      ? (["crack", change.base, "long"] as const)
      : ([change.kind, change.anchor, change.side] as const)
  for (const node of nodes) {
    const updated = nodeTuneUpdate(node, target, change.price, ref, side)
    if (updated) return updated
  }
  return null
}
