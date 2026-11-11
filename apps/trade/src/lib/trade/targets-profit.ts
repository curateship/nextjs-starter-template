import { projectedProfit, type TradePosition } from "@/lib/trade/paper"

/**
 * What a position makes if every target it carries is reached, from its
 * entry, or null with no target set. The Positions table's "At target" figure
 * and the details panel's "If it hits: the target".
 */
export function targetsProfit(position: TradePosition): number | null {
  if (position.targets.length === 0) return null
  return position.targets.reduce((sum, target) => {
    const sz = target.sz ?? Math.abs(position.szi)
    return (
      sum +
      projectedProfit(
        { szi: Math.sign(position.szi) * sz, entryPx: position.entryPx },
        target.px
      )
    )
  }, 0)
}
