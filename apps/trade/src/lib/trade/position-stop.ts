import { gridStopPx, type GridPlan } from "@/lib/trade/grid"
import type { SmartOrderKind } from "@/lib/trade/smart-plan"
import type { TradePosition } from "@/lib/trade/paper"

type PositionStopSource =
  | {
      kind: "grid"
      status: "active" | "done"
      walletId: string
      marketKey: string
      plan: Pick<
        GridPlan,
        "direction" | "topPx" | "bottomPx" | "stopLoss" | "baseWatch"
      >
    }
  | {
      kind: Exclude<SmartOrderKind, "grid">
      status: "active" | "done"
      walletId: string
      marketKey: string
    }

/**
 * Whether the latest settled read shows a stop protecting this position.
 *
 * An ordinary stop comes back on the position itself. A running grid is the
 * exception: Lighter keeps its stop inside Trade as a watched price, and a
 * paired grid keeps its own part-size stop on the grid plan. In both cases the
 * stop belongs to the matching active grid rather than the position's ordinary
 * stop slot.
 */
export function positionHasStop(
  position: Pick<TradePosition, "walletId" | "marketKey" | "slPx">,
  smartOrders: readonly PositionStopSource[]
): boolean {
  if (position.slPx !== null) return true

  return smartOrders.some(
    (order) =>
      order.kind === "grid" &&
      order.status === "active" &&
      order.walletId === position.walletId &&
      order.marketKey === position.marketKey &&
      gridStopPx(order.plan) !== null
  )
}
