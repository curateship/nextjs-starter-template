import { orderDistanceLabel } from "@/lib/trade/order-distance"

/** The shared distance pill used by Watched and Open orders. */
export function OrderDistanceBadge({ distance }: { distance: number | null }) {
  const label = orderDistanceLabel(distance)
  if (!label) return null
  return (
    <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 tabular-nums dark:bg-emerald-500/15 dark:text-emerald-400">
      {label}
    </span>
  )
}
