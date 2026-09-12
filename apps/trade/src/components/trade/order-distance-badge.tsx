import { orderDistanceLabel } from "@/lib/trade/order-distance"
import { MADE_MONEY_SURFACE } from "@/lib/trade/money-tone"

/** The shared distance pill used by Watched and Open orders. */
export function OrderDistanceBadge({ distance }: { distance: number | null }) {
  const label = orderDistanceLabel(distance)
  if (!label) return null
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${MADE_MONEY_SURFACE}`}>
      {label}
    </span>
  )
}
