import { ladderPlanSchema, type LadderPlan } from "@/lib/trade/dca"
import { readGridPlan, type GridPlan } from "@/lib/trade/grid"
import { readSignalPlan, type SignalPlan } from "@/lib/trade/signal-order"
import { readWatchPlan, type WatchPlan } from "@/lib/trade/watch-order"

/**
 * The three kinds of smart order, and the one door every stored plan is read
 * through.
 *
 * Ladders, grids and signal trades share a table. That is not tidiness: there
 * is exactly ONE position per coin per wallet and each kind writes to it, so
 * two of them on the same coin would fight over it. Sharing the table means the
 * existing "one live smart order per coin per wallet" check blocks that on its
 * own — including a flow's signal trade landing on a coin somebody has already
 * put a ladder on by hand.
 *
 * The price of sharing is that a row is only as good as the parse, and a parse
 * that fails returns null — which every caller turns into "skip this row". A
 * skipped row is a smart order with real orders resting on a real exchange that
 * nothing will ever advance again. So there is deliberately no way to read a
 * plan without naming its kind: `readSmartPlan(kind, value)` is the only door,
 * and adding a kind makes the compiler walk you round every caller.
 */

export const SMART_ORDER_KINDS = ["dca", "grid", "signal", "watch"] as const
export type SmartOrderKind = (typeof SMART_ORDER_KINDS)[number]

export type SmartPlan = LadderPlan | GridPlan | SignalPlan | WatchPlan

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
  /**
   * The switched-on flow that placed it, or null when a person did.
   *
   * What separates the two lists on screen: a flow's orders belong to that
   * run's dashboard, where the whole strategy can be read at once, and this
   * one is what somebody placed themselves. Rows written before this was
   * recorded read as placed by hand, which is what they look like anyway.
   */
  flowRunId: string | null
  createdAt: number
  updatedAt: number
}

/** One placed DCA ladder, as the screens see it. */
export type SmartLadder = SmartOrderShared & { kind: "dca"; plan: LadderPlan }

/** One placed grid, as the screens see it. */
export type SmartGrid = SmartOrderShared & { kind: "grid"; plan: GridPlan }

/** One coin being traded on an indicator's say-so, as the screens see it. */
export type SmartSignal = SmartOrderShared & {
  kind: "signal"
  plan: SignalPlan
}

/** One price being watched, and the trade taken when it is reached. */
export type SmartWatch = SmartOrderShared & { kind: "watch"; plan: WatchPlan }

export type SmartOrder = SmartLadder | SmartGrid | SmartSignal | SmartWatch

/**
 * The ladders and grids somebody placed themselves — what one press stands
 * down, and what the confirm before it counts.
 *
 * **A flow's orders are left alone.** A switched-on flow places them again on
 * its next pass, so cancelling them here would be a press that undid itself
 * with real money in the middle. Standing a flow down is done on that run's
 * own dashboard, where the whole strategy is in front of you.
 *
 * **A watched price is left alone too.** It is a plain order that has not
 * fired yet, it already has its own line on the chart and its own row under
 * Open orders, and it is cancelled from either of those.
 *
 * One list, used by the button that does it and the confirm that counts it,
 * so the two can never disagree about what is about to happen.
 */
export function laddersAndGridsYouPlaced(
  orders: readonly SmartOrder[]
): (SmartLadder | SmartGrid)[] {
  return orders.filter(
    (order): order is SmartLadder | SmartGrid =>
      order.flowRunId === null &&
      (order.kind === "dca" || order.kind === "grid")
  )
}

/**
 * The smart orders the Smart orders panel lists — ladders, grids and signals
 * somebody placed themselves.
 *
 * **The same list decides which positions the Positions tab leaves out.** A
 * coin one of these is running is already on screen in the right-hand panel,
 * with the strategy that owns it, so listing its position again in the bottom
 * panel put the same holding on screen twice. One function so the two lists
 * can never disagree about which coins those are.
 *
 * A flow's working orders are not here: the flow has its own run dashboard,
 * and its position stays in the Positions tab because nothing else on this
 * screen shows it. A paused flow order is the exception. It needs the reason
 * and Resume button this panel owns, then disappears back to its run after it
 * resumes. A watched price is not here either unless it paused.
 */
export function smartOrdersYouPlaced(
  orders: readonly SmartOrder[]
): SmartOrder[] {
  return orders.filter(
    (order) =>
      order.plan.paused === true ||
      (order.flowRunId === null && order.kind !== "watch")
  )
}

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
  if (kind === "signal") return readSignalPlan(value)
  if (kind === "watch") return readWatchPlan(value)
  const parsed = ladderPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * A stored plan together with the kind that says how to read it.
 *
 * **Not a second door** — it goes through `readSmartPlan` like everything else.
 * What it adds is that the two travel as one value, so checking the kind
 * narrows the plan: reading `aimedSlPx` off something that has no stop becomes
 * a compile error rather than `undefined` at four in the morning. The live
 * reconciler carried these as a loose `{ kind, plan }` pair and had to cast at
 * every use, which is the same thing with the safety taken out.
 */
export type SmartEntry =
  | { kind: "dca"; plan: LadderPlan }
  | { kind: "grid"; plan: GridPlan }
  | { kind: "signal"; plan: SignalPlan }
  | { kind: "watch"; plan: WatchPlan }

export function readSmartEntry(
  kind: SmartOrderKind,
  value: unknown
): SmartEntry | null {
  const plan = readSmartPlan(kind, value)
  if (!plan) return null
  if (kind === "grid") return { kind, plan: plan as GridPlan }
  if (kind === "signal") return { kind, plan: plan as SignalPlan }
  if (kind === "watch") return { kind, plan: plan as WatchPlan }
  return { kind: "dca", plan: plan as LadderPlan }
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
  // A signal trade rests exactly one — the order it is chasing — and it is
  // load-bearing that it gets walked. Miss it and the temporary id stays in the
  // saved plan; the next pass sees an id the exchange does not know, decides
  // the order vanished, and places another. Every ten seconds. Forever.
  if (kind === "signal") {
    const signal = plan as SignalPlan
    if (signal.orderId) {
      visit(signal.orderId, (next) => {
        signal.orderId = next
      })
    }
    return
  }
  // A watch rests nothing until its price is touched, and exactly one order
  // after that — and it has to be walked for the same reason a signal trade's
  // does: a temporary id left in the saved plan makes the next pass believe
  // the order vanished and place another.
  if (kind === "watch") {
    const watch = plan as WatchPlan
    if (watch.orderId) {
      visit(watch.orderId, (next) => {
        watch.orderId = next
      })
    }
    return
  }
  const ladder = plan as LadderPlan
  for (const rung of ladder.rungs) {
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
  for (const rung of ladder.exitRungs) {
    if (!rung.orderId) continue
    visit(rung.orderId, (next) => {
      rung.orderId = next
    })
  }
}
