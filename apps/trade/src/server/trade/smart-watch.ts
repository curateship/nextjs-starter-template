import { MIN_ORDER_USD, floorSize } from "@/lib/trade/dca"
import { judgeOrder } from "@/lib/trade/order-presence"
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
  const position = book.positions.get(row.marketKey) ?? null

  // ----- Is the order we placed still out there? -------------------------
  //
  // Never decided by one absent read. `judgeOrder` holds the whole rule and
  // the reason it exists; all this does is act on its answer, and "wait" is
  // one of the answers. Being called off is the exception below: a person
  // asking for it back outranks the wait.
  if (plan.orderId) {
    const seen = judgeOrder({
      seenOnTheBook: live.has(plan.orderId),
      // The amount held CHANGED, which no lagging list can fake. Reading it
      // this way covers every case with one number: a buy that opened a
      // position, a sell that closed one, a part fill, and a watch adding to
      // a coin the wallet already held — where "is there a position" would
      // have said yes from the very first pass and protected nothing.
      accountShowsItDone:
        Math.abs((position?.szi ?? 0) - plan.heldWhenPlaced) > 1e-9,
      missingSince: plan.missingSince,
      now,
    })
    if (seen.missingSince !== plan.missingSince) {
      plan.missingSince = seen.missingSince
      changed = true
    }
    if (seen.presence === "gone") {
      plan.orderId = null
      plan.orderPx = null
      changed = true
    } else if (seen.presence === "unproven" && plan.phase !== "stopping") {
      // Missing, and nothing yet says what became of it. Placing a
      // replacement here is exactly how the same money gets spent twice.
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
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

  // **Placed once, and nothing of it in sight: wait.** The order is not in
  // the open-orders read, but that is absence, not proof — the exchange's
  // list can lag a freshly placed order, and a filled order's position can
  // take a moment to show. The one thing that is certain is that money was
  // sent, so nothing more is sent until the world says what happened: the
  // position appears (handled above), a proven cancel clears `sent` (the
  // live lane does that only when the exchange confirmed the cancel), or a
  // person calls the watch off. Placing here instead is how one $50 watch
  // bought $150 of coin on 20 Aug 2026.
  if (plan.orderId === null && plan.sent) {
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  // ----- Already through the market: take it ------------------------------
  //
  // **A level the price has gone past cannot be waited for.** Draw a buy
  // ABOVE the market and you are saying "get me in, I will pay up to here" —
  // the market is already cheaper than that, so there is nothing to wait for
  // and nothing to rest. A limit at your level would cross the book, and a
  // post-only order that crosses is refused outright, which is why this used
  // to quietly rest just under the market instead and sit there: the line was
  // drawn well above the price and the app bought nothing.
  //
  // Same rule mirrored for a sell drawn below the market, and the same rule a
  // ladder rung already follows — it fires at market the moment price crosses
  // it. This makes a watched price behave like the rest of the app.
  const throughAlready =
    plan.side === "buy" ? mark < plan.triggerPx : mark > plan.triggerPx
  if (throughAlready && plan.orderId === null && !plan.sent) {
    const takeSz = floorSize(plan.sz, plan.sizeDecimals)
    if (takeSz <= 0 || mark * takeSz < MIN_ORDER_USD) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
    if (
      plan.side === "buy" &&
      !plan.reduceOnly &&
      (mark * takeSz) / Math.max(1, plan.leverage) > deps.freeCash(book) + 1e-9
    ) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
    // Marked as sent BEFORE the fill, for the same reason the resting path
    // does it: from here money may be on the exchange, and a watch that
    // forgets that buys twice.
    plan.sent = true
    plan.heldWhenPlaced = book.positions.get(row.marketKey)?.szi ?? 0
    deps.fill(book, {
      marketKey: row.marketKey,
      side: plan.side,
      px: mark,
      sz: takeSz,
      feeRate: book.costs.takerFeeRate,
      leverage: plan.leverage,
      maxLeverage: plan.maxLeverage,
      reduceOnly: plan.reduceOnly,
      reason: "order",
      at: now,
    })
    await deps.saveLadder(row, "active", now)
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

  // Read BEFORE the order goes out, because the whole point of the number is
  // to be the "before" that a fill can be measured against.
  plan.heldWhenPlaced = book.positions.get(marketKey)?.szi ?? 0
  plan.missingSince = 0
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
  // From this moment money may be on the exchange, and only a proven cancel
  // may say otherwise. The live lane clears it when a cancel really
  // cancelled; a place that provably failed is rolled back to the plan as it
  // was before this pass, which puts the flag back with everything else.
  plan.sent = true
  plan.orderPx = wanted
  plan.chasedAt = now
  return true
}
