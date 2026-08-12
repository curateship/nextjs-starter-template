import { ladderPlanSchema, type LadderPlan } from "@/lib/trade/dca"
import { readGridPlan, type GridPlan } from "@/lib/trade/grid"

/**
 * The two kinds of smart order, and the one door every stored plan is read
 * through.
 *
 * Ladders and grids share a table. That is not tidiness: there is exactly ONE
 * position per coin per wallet and both kinds write its stop, so two of them on
 * the same coin would fight over it. Sharing the table means the existing "one
 * live smart order per coin per wallet" check blocks that on its own.
 *
 * The price of sharing is that a row is only as good as the parse, and a parse
 * that fails returns null — which every caller turns into "skip this row". A
 * skipped row is a smart order with real orders resting on a real exchange that
 * nothing will ever advance again. So there is deliberately no way to read a
 * plan without naming its kind: `readSmartPlan(kind, value)` is the only door,
 * and adding a kind makes the compiler walk you round every caller.
 */

export const SMART_ORDER_KINDS = ["dca", "grid"] as const
export type SmartOrderKind = (typeof SMART_ORDER_KINDS)[number]

export type SmartPlan = LadderPlan | GridPlan

/**
 * A stored smart order, whichever kind it is, as the screens see it.
 *
 * A discriminated union rather than a `plan: SmartPlan` field, so reading
 * `order.plan.levels` without first checking `order.kind` is a compile error
 * instead of undefined at runtime.
 */
type SmartOrderShared = {
  id: string
  walletId: string
  marketKey: string
  status: "active" | "done"
  createdAt: number
  updatedAt: number
}

/** One placed DCA ladder, as the screens see it. */
export type SmartLadder = SmartOrderShared & { kind: "dca"; plan: LadderPlan }

/** One placed grid, as the screens see it. */
export type SmartGrid = SmartOrderShared & { kind: "grid"; plan: GridPlan }

export type SmartOrder = SmartLadder | SmartGrid

/** The kind a stored row claims to be, or null when it is not one we know. */
export function readSmartOrderKind(value: unknown): SmartOrderKind | null {
  return SMART_ORDER_KINDS.includes(value as SmartOrderKind)
    ? (value as SmartOrderKind)
    : null
}

/**
 * Reads a stored plan back for its kind, or null when it cannot be read.
 *
 * Null is always "ignore this row", never "half-obey it". A row written by a
 * build that meant something else by these fields is left exactly as it is.
 */
export function readSmartPlan(
  kind: SmartOrderKind,
  value: unknown
): SmartPlan | null {
  if (kind === "grid") return readGridPlan(value)
  const parsed = ladderPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Every order id a plan is carrying, whatever kind it is, with a way to rewrite
 * each one in place.
 *
 * One walker because the live path walks a plan for order ids in three separate
 * places — building the list of orders it manages, matching fills back to
 * levels, and rewriting the temporary id an order carries until the exchange
 * answers with a real one. Miss the last of those and every id stays temporary
 * in the saved plan; the next pass sees an id the exchange does not know,
 * decides the order vanished, and places it again. Every second. Forever.
 *
 * `set(null)` clears the slot; `set(id)` replaces it.
 */
export function forEachPlanOrderId(
  kind: SmartOrderKind,
  plan: SmartPlan,
  visit: (orderId: string, set: (next: string | null) => void) => void
): void {
  // A grid rests nothing on the book, so it carries no order ids to walk.
  if (kind === "grid") return
  for (const rung of (plan as LadderPlan).rungs) {
    if (rung.orderId) {
      visit(rung.orderId, (next) => {
        rung.orderId = next
      })
    }
    if (rung.sellOrderId) {
      visit(rung.sellOrderId, (next) => {
        rung.sellOrderId = next
      })
    }
  }
}
