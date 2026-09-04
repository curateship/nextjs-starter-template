import { floorSize } from "@/lib/trade/dca"
import { minimumOrderUsd } from "@/lib/trade/market-info"
import { judgeOrder } from "@/lib/trade/order-presence"
import { liveOrderIds } from "@/server/trade/paper"
import {
  CHASE_EVERY_MS,
  CHASE_PATIENCE_MS,
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
 * chase a signal trade uses. New Long and Short watches record which side of
 * the level price started on, so a breakout or breakdown waits for the touch.
 * Rows saved before that direction existed keep their former behavior.
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
    getProtocol(book.wallet.protocol).markets.roundPx(
      px,
      plan.sizeDecimals,
      plan.priceTick
    )

  const mark = input.marks.get(row.marketKey)
  // No price this pass. Not an error and not a reason to act: anything already
  // resting stays exactly where it is.
  if (mark === undefined || !(mark > 0)) return

  let changed = false
  // The row as this pass found it. The market-take below hands these back to
  // the live lane as its `undo`, for the one case where the exchange says
  // plainly that it took nothing.
  const enteredPhase = plan.phase
  const enteredSent = plan.sent
  const enteredHeld = plan.heldWhenPlaced
  const live = liveOrderIds(book)
  const position = book.positions.get(row.marketKey) ?? null
  const positionSize = Math.abs(position?.szi ?? 0)
  const partCloseRemaining =
    plan.sz - Math.max(0, plan.heldAtStart - positionSize)

  // ----- Is the order we placed still out there? -------------------------
  //
  // Never decided by one absent read. `judgeOrder` holds the whole rule and
  // the reason it exists; all this does is act on its answer, and "wait" is
  // one of the answers. Being called off is the exception below: a person
  // asking for it back outranks the wait.
  if (plan.orderId) {
    const seen = judgeOrder({
      seenOnTheBook: live.has(plan.orderId),
      // For an ordinary watch, an amount change proves the order affected the
      // account. A part close is stricter: a partial fill may leave the rest
      // of the same order live, so only the whole requested piece proves the
      // order has finished.
      accountShowsItDone: plan.maker
        ? partCloseRemaining <= 1e-9
        : Math.abs((position?.szi ?? 0) - plan.heldWhenPlaced) > 1e-9,
      missingSince: plan.missingSince,
      now,
      // A part close is allowed to let go only after the whole requested piece
      // has left. Two reduce-only orders can otherwise fill together and sell
      // more than the person asked for.
      absenceCanProveGone: !plan.maker,
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
  // Not for a close. A close's position is the thing being SOLD, so its being
  // there proves nothing about the order — and this branch would mark the
  // close finished on its very first pass, before anything had been placed.
  // What is left to sell is worked out below instead, off the same position.
  if (!plan.maker && plan.phase === "taking" && position) {
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
    ceiling !== null && (plan.side === "buy" ? mark > ceiling : mark < ceiling)
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
  //
  // A part close never reaches this guard. Its missing order number stays
  // attached until the whole requested piece has left the position, because
  // a partial fill does not prove the order's unfilled remainder is gone.
  if (plan.orderId === null && plan.sent && !plan.maker) {
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  // Rows written before directional watches keep their old market-take rule.
  // New Long and Short rows always carry `triggerDirection`, so after their
  // level is reached they continue into the post-only chase below. A part
  // close has no direction either, but `maker` keeps it out of this branch.
  const legacyThroughAlready =
    plan.triggerDirection === undefined &&
    !plan.maker &&
    (plan.side === "buy" ? mark < plan.triggerPx : mark > plan.triggerPx)
  if (legacyThroughAlready && plan.orderId === null && !plan.sent) {
    const takeSz = floorSize(plan.sz, plan.sizeDecimals)
    const smallestSize =
      plan.minOrderSize ??
      (plan.sizeDecimals === null ? null : 10 ** -plan.sizeDecimals)
    const floor =
      minimumOrderUsd(
        {
          minOrderValueUsd: plan.minOrderValueUsd,
          minOrderSize: smallestSize,
        },
        mark
      ) ?? 0
    const tooSmall =
      takeSz <= 0 ||
      (smallestSize !== null && takeSz + 1e-12 < smallestSize) ||
      mark * takeSz + 1e-9 < floor
    // Live orders go through `placeLiveOrder`, which checks the current
    // protocol rules and records the refusal for the browser. Ending the watch
    // here bypassed that shared path and made the order disappear silently.
    if (tooSmall && book.wallet.kind !== "live") {
      await deps.saveLadder(row, "done", now)
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
      // **A refusal puts the level back to waiting.** `sent` is raised before
      // the order goes out because from that moment money may be on the
      // exchange — but when the exchange answers that it took nothing, none
      // did, and a watch left holding `sent` with no order to point at waits
      // for a fill that is never coming. Nothing clears it but that fill or a
      // person, so the wait is forever: on 21 Aug 2026 a Phemex watch on
      // NFLX was refused at 17:40 and stood still for seventy-seven minutes
      // while the price sat a dollar under the level it was told to buy at.
      // The live lane calls this only for the answers that promise nothing
      // stood — see `nothingStood` there.
      undo: () => {
        plan.phase = enteredPhase
        plan.sent = enteredSent
        plan.heldWhenPlaced = enteredHeld
      },
    })
    await deps.saveLadder(row, "active", now)
    return
  }

  /**
   * How much is still to be sold.
   *
   * For a close, the position is the count: what was asked for, less how far
   * the holding has come down since — see `heldAtStart` on `WatchPlan`. A
   * position that has gone entirely leaves nothing to reduce, and the close is
   * over rather than resting an order against something that is not there.
   *
   * "Nothing left" is judged on the size the exchange would be sent, not the
   * raw subtraction. Two decimals held the same way a computer holds them can
   * leave a few quadrillionths of a coin behind: on 2 Sep 2026 a 25.95 SOL
   * close filled in full, 51.91 less 25.96 came out to 25.949999999999996,
   * and the leftover 0.0000000000000036 SOL went to Hyperliquid as an order
   * for $0.00 five times over until the safety paused the close.
   */
  const stillToDo = plan.maker ? partCloseRemaining : plan.sz
  if (
    plan.maker &&
    (position === null || floorSize(stillToDo, plan.sizeDecimals) <= 0)
  ) {
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

  const sz = floorSize(stillToDo, plan.sizeDecimals)
  const smallestSize =
    plan.minOrderSize ??
    (plan.sizeDecimals === null ? null : 10 ** -plan.sizeDecimals)
  const floor =
    minimumOrderUsd(
      {
        minOrderValueUsd: plan.minOrderValueUsd,
        minOrderSize: smallestSize,
      },
      wanted
    ) ?? 0
  const tooSmall =
    sz <= 0 ||
    (smallestSize !== null && sz + 1e-12 < smallestSize) ||
    wanted * sz + 1e-9 < floor
  if (tooSmall && book.wallet.kind !== "live") {
    await deps.saveLadder(row, "done", now)
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

  changed =
    (await moveOrder(input, deps, plan, row.marketKey, wanted, sz)) || changed
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
  // An order that has been resting a whole minute follows the price on any
  // difference. The drift rule is there to stop two exchange calls being spent
  // on a fourth-decimal wobble, and it does that job — but on a market walking
  // slowly away it also leaves the order permanently just out of reach. See
  // `CHASE_PATIENCE_MS`.
  const waitedLongEnough =
    plan.orderId !== null && now - plan.chasedAt >= CHASE_PATIENCE_MS
  if (!waitedLongEnough && !chaseWorthMoving(plan.orderPx, wanted)) return false

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
