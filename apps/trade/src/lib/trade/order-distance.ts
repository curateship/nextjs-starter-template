import { formatAway } from "@/lib/trade/format"
import type { TradeOrder } from "@/lib/trade/paper"
import { watchReached } from "@/lib/trade/watch-order"

export type WaitingPrice = Pick<TradeOrder, "px" | "side" | "watched" | "triggerDirection">

/** Relative distance uses the waiting price, matching the Watched panel. */
export function orderDistance(order: WaitingPrice, mark: number | null): number | null {
  if (mark === null || !Number.isFinite(mark) || mark <= 0 ||
      !Number.isFinite(order.px) || order.px <= 0) return null
  if (order.watched && watchReached({
    side: order.side,
    triggerPx: order.px,
    triggerDirection: order.triggerDirection,
  }, mark)) return 0
  return Math.abs(mark - order.px) / order.px
}

export function orderDistanceLabel(distance: number | null): string {
  if (distance === null) return ""
  return distance === 0 ? "reached" : `${formatAway(distance)} away`
}
