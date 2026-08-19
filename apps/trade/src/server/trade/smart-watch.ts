import { MIN_ORDER_USD, floorSize } from "@/lib/trade/dca"
import { liveOrderIds } from "@/server/trade/paper"
import {
  CHASE_EVERY_MS,
  chaseWorthMoving,
  restingChasePx,
} from "@/lib/trade/signal-order"
import {
  watchCeilingPx,
  watchReached,
  type WatchPlan,
} from "@/lib/trade/watch-order"
import { getProtocol } from "@/server/protocols/registry"
import type {
  LadderAdvanceInput,
  LadderEngineDeps,
} from "@/server/trade/smart-engine"

/**
 * A watched price, pushed along one pass.
 *
 * **It sends nothing until the level is touched.** Every pass it asks one
 * question — has the market reached the price? — and only then does it start
 * asking for an order, which it rests just off the touch and follows, the same
 * chase a signal trade uses. Nothing here ever takes the market.
 *
 * The pass runs inside the engine that already works ladders and grids, so a
 * watch survives the browser being closed exactly as they do — and, like them,
 * it does nothing at all while the engine is switched off.
 */

/** When each wallet last moved an order, so a chase cannot outrun the exchange. */
const walletChasedAt = new Map<string, number>()

/** Test support: forgets every wallet's gate. */
export function resetWatchChaseGate(): void {
  walletChasedAt.clear()
}

export type WatchRow = { id: string; marketKey: string; plan: WatchPlan }

export async function advanceWatch(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  row: WatchRow
): Promise<void> {
  const { book, now } = input
  const plan = row.plan
  const roundPx = (px: number) =>
    getProtocol(book.wallet.protocol).markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  const mark = input.marks.get(row.marketKey)
  // No price this pass. Not an error and not a reason to act: anything already
  // resting stays exactly where it is.
  if (mark === undefined || !(mark > 0)) return

  let changed = false
  const live = liveOrderIds(book)

  // The order we were chasing has gone — filled, cancelled by a hand, or
  // dropped by a wallet that could no longer afford it. What is held below is
  // the truth either way.
  if (plan.orderId && !live.has(plan.orderId)) {
    plan.orderId = null
    plan.orderPx = null
    changed = true
  }

  // Called off. Anything asked for and not got is taken back; a position it
  // already opened is left alone, with its stop and target where they are.
  if (plan.phase === "stopping") {
    if (plan.orderId) deps.dropOrder(book, plan.orderId)
    plan.orderId = null
    plan.orderPx = null
    await deps.saveLadder(row, "done", now)
    return
  }

  // ----- Filled: hand the position its protection and finish -------------
  //
  // **The stop and the target were set when the level was, and they have to
  // survive the wait.** Nothing else is going to apply them: the order that
  // filled carried no brackets, and this row is the only thing that still
  // remembers what was asked for. Written onto the position here, which is
  // also what the live lane reads when it sets them on the exchange.
  const position = book.positions.get(row.marketKey) ?? null
  if (plan.phase === "taking" && position) {
    if (plan.tpPx !== null) position.tpPx = plan.tpPx
    if (plan.slPx !== null) position.slPx = plan.slPx
    if (plan.tpPx !== null || plan.slPx !== null) {
      position.updatedAt = now
      book.touchedMarkets.add(row.marketKey)
    }
    // Anything still resting is the remainder of a part fill. It is left
    // exactly where it is — the rest of the order is still wanted — and the
    // watch is over only once nothing of it is left.
    if (plan.orderId) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
    await deps.saveLadder(row, "done", now)
    return
  }

  // ----- Waiting: one question, and no calls to anyone -------------------

  if (plan.phase === "waiting") {
    if (!watchReached(plan, mark)) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
    plan.phase = "taking"
    changed = true
  }

  // ----- Taking: rest just off the touch, and follow ---------------------

  const ceiling = watchCeilingPx(plan)
  const ranAway =
    ceiling !== null &&
    (plan.side === "buy" ? mark > ceiling : mark < ceiling)
  if (ranAway) {
    // Price left before it could be filled. Nothing was bought — a part fill
    // still leaves the rest of this order chasing, which is what the size
    // below reads — so the watch is over rather than following it forever.
    if (plan.orderId) deps.dropOrder(book, plan.orderId)
    plan.orderId = null
    plan.orderPx = null
    await deps.saveLadder(row, "done", now)
    return
  }

  const wanted = restingChasePx(plan.side, mark, roundPx)
  if (wanted === null) {
    // This coin's prices are too coarse to sit just off the market. Saying
    // nothing beats sending an order the exchange refuses every pass.
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  const sz = floorSize(plan.sz, plan.sizeDecimals)
  if (sz <= 0 || wanted * sz < MIN_ORDER_USD) {
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }
  // A buy has to be paid for. A sell that only reduces what is held does not.
  if (
    plan.side === "buy" &&
    !plan.reduceOnly &&
    (wanted * sz) / Math.max(1, plan.leverage) > deps.freeCash(book) + 1e-9
  ) {
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  changed = (await moveOrder(input, deps, plan, row.marketKey, wanted, sz)) || changed
  await deps.saveLadder(row, "active", now)
}

/**
 * Puts the order where it should be, if it is not there and it is allowed to
 * move yet.
 *
 * The same two gates the signal chase uses, and for the same reason: a price
 * wobbling in its fourth decimal is not worth two exchange calls, and the
 * ten-second clock belongs to the whole wallet rather than to this order.
 */
async function moveOrder(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  plan: WatchPlan,
  marketKey: string,
  wanted: number,
  sz: number
): Promise<boolean> {
  const { book, now } = input
  if (!chaseWorthMoving(plan.orderPx, wanted)) return false

  // The first order does not wait for the gate: a level that had to queue
  // behind a rate limit before it could ask for a price at all would fill a
  // random number of seconds late, which is not what was drawn on the chart.
  if (plan.orderId !== null) {
    if (now - plan.chasedAt < CHASE_EVERY_MS) return false
    const walletLast = walletChasedAt.get(book.wallet.id) ?? 0
    if (now - walletLast < CHASE_EVERY_MS) return false
    deps.dropOrder(book, plan.orderId)
    plan.chases += 1
    walletChasedAt.set(book.wallet.id, now)
  }

  plan.orderId = await deps.insertOrder({
    marketKey,
    side: plan.side,
    px: wanted,
    sz,
    leverage: plan.leverage,
    maxLeverage: plan.maxLeverage,
    reduceOnly: plan.reduceOnly,
    now,
  })
  plan.orderPx = wanted
  plan.chasedAt = now
  return true
}
