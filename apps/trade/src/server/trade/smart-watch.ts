import { floorSize } from "@/lib/trade/dca"
import { minimumOrderUsd } from "@/lib/trade/market-info"
import { handStopStandsAlone } from "@/lib/trade/pairing"
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
import { rememberEngineTimestamp } from "./engine-memory"
import { formatPrice } from "@/lib/trade/format"
import { writeCopyNote } from "@/server/trade/copy-ledger"
import type {
  LadderAdvanceInput,
  LadderEngineDeps,
} from "@/server/trade/smart-engine"

/**
 * A watched price, pushed along one pass.
 *
 * Nothing is sent until the level is reached. Ordinary watches then submit
 * a fixed limit at the chosen price, allowing immediate fills within that
 * limit. The separate maker-close workflow follows the market post-only.
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

export type WatchRow = {
  id: string
  marketKey: string
  plan: WatchPlan
  /**
   * A ladder or a grid is working this coin too.
   *
   * Handed in by the live pass, which is the only place that knows what else
   * this wallet is running. Undefined on the practice engine, where a
   * position carries one stop and nothing can hold a second.
   */
  paired?: boolean
}

function clientOrderId(tempId: string): string | null {
  const uuid = /^pending:([0-9a-f-]{36})$/i.exec(tempId)?.[1]
  return uuid ? `0x${uuid.replaceAll("-", "")}` : null
}

/**
 * Whether this order's stop stays its own instead of becoming the position's.
 *
 * Every condition has to hold. There has to BE a stop. It has to belong to
 * coins this order bought, so a sale is left alone. A strategy has to be
 * working the same coin, or there is nothing to share the position with and
 * the ordinary stop is the right one. And the wallet and the exchange have to
 * be able to hold two stops at once — see `handStopStandsAlone`.
 */
export function watchKeepsItsOwnStop(
  plan: Pick<WatchPlan, "slPx" | "side" | "reduceOnly">,
  row: Pick<WatchRow, "paired">,
  wallet: { kind: string; protocol: string }
): boolean {
  return (
    plan.slPx !== null &&
    // Coins this order BOUGHT are the only ones it can hold a stop over. A
    // sale holds nothing afterwards, and a strategy sharing the coin is a
    // buying plan, so a sale's stop stays what it has always been.
    plan.side === "buy" &&
    !plan.reduceOnly &&
    row.paired === true &&
    handStopStandsAlone(wallet)
  )
}

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
  const live = liveOrderIds(book)
  const position = book.positions.get(row.marketKey) ?? null
  const positionSize = Math.abs(position?.szi ?? 0)
  // What a maker order still has to trade, with the position as the count: a
  // close counts how far the holding has come down, and a copy's opening
  // order how far it has come up. See `heldAtStart`.
  const makerRemaining =
    plan.sz -
    Math.max(
      0,
      plan.reduceOnly
        ? plan.heldAtStart - positionSize
        : positionSize - plan.heldAtStart
    )

  // **A copy's opening order only ever watches its position grow.** If the
  // position shrinks instead, something else decided about this coin: the
  // copier's own stop fired, or they sold by hand. Counting the position from
  // `heldAtStart` would then read the sale as coins still to buy and buy them
  // back, more than the copy asked for. So it stops, keeping what it bought.
  // A position read that lags a fill can only look smaller, which stops the
  // copy early: it buys less, never more.
  if (plan.maker && !plan.reduceOnly && plan.phase === "taking") {
    const peak = Math.max(plan.peakHeld ?? plan.heldAtStart, positionSize)
    if (positionSize + 1e-9 < peak) {
      if (plan.orderId) deps.dropOrder(book, plan.orderId)
      plan.orderId = null
      plan.orderPx = null
      await deps.saveLadder(row, "done", now)
      return
    }
    if (peak !== plan.peakHeld) {
      plan.peakHeld = peak
      changed = true
    }
  }

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
        ? makerRemaining <= 1e-9
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
    // A stop of its own is a real order on the exchange, and this row is the
    // only thing that knows it is there. The row stays alive until the live
    // pass has taken that stop off; finishing here would leave a stop nobody
    // owns, which nothing spares and nothing cancels.
    if (plan.ownStop) {
      await deps.saveLadder(row, "active", now)
      return
    }
    await deps.saveLadder(row, "done", now)
    return
  }

  // Filled, and holding nothing but its own stop. The live pass keeps that
  // stop in step with the coins and ends this row once they have gone. There
  // is nothing to place here ever again, and falling through to the placing
  // code below would buy the same thing a second time.
  if (plan.phase === "holding") {
    if (changed) await deps.saveLadder(row, "active", now)
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
    /**
     * **The stop stays this order's own when a strategy is working the coin.**
     *
     * The exchange holds one position for the coin and its one stop sells all
     * of it. Writing this order's stop there would sell the ladder's coins on
     * a price that was only ever about this trade, and the ladder — holding
     * nothing afterwards — would cancel every rung still waiting below it.
     * So the price is not handed to the position at all. This row stays
     * alive instead and the live pass gives it a stop of its own, sized to
     * the coins this order bought. See `ownStop`.
     */
    const ownsItsStop = watchKeepsItsOwnStop(plan, row, book.wallet)
    if (plan.tpPx !== null) position.tpPx = plan.tpPx
    if (plan.slPx !== null && !ownsItsStop) position.slPx = plan.slPx
    if (plan.tpPx !== null || (plan.slPx !== null && !ownsItsStop)) {
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
    if (ownsItsStop) {
      plan.phase = "holding"
      // What this order really bought, never more than it asked for. See
      // `ownSz`. A rung the ladder bought in the same few seconds makes the
      // measured difference the larger of the two, and the ask wins.
      plan.ownSz = Math.min(
        plan.sz,
        Math.max(0, position.szi - plan.heldWhenPlaced)
      )
      await deps.saveLadder(row, "active", now)
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

  // ----- Taking: submit the limit, or follow for a maker close -----------

  const ceiling = watchCeilingPx(plan)
  const ranAway =
    ceiling !== null && (plan.side === "buy" ? mark > ceiling : mark < ceiling)
  if (ranAway) {
    // Price left before it could be filled. Nothing was bought — a part fill
    // still leaves the rest of this order chasing, which is what the size
    // below reads — so the watch is over rather than following it forever.
    // A copy says so in its copier's Journal, since nobody pressed anything.
    if (plan.copyId) {
      void writeCopyNote({
        copyId: plan.copyId,
        marketKey: row.marketKey,
        note: `The price ran past ${formatPrice(ceiling ?? plan.triggerPx)} before the copy could fill, so it stopped following. Anything it had already bought is kept.`,
      })
    }
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
  // A part close can also lose the placement response before receiving an
  // order number. Wait for the whole requested piece before considering it
  // done; a partial fill may still have an unfilled remainder on the book.
  if (
    plan.orderId === null &&
    plan.sent &&
    (!plan.maker || floorSize(makerRemaining, plan.sizeDecimals) > 0)
  ) {
    if (changed) await deps.saveLadder(row, "active", now)
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
  const stillToDo = plan.maker ? makerRemaining : plan.sz
  if (
    plan.maker &&
    ((plan.reduceOnly && position === null) ||
      floorSize(stillToDo, plan.sizeDecimals) <= 0)
  ) {
    if (plan.orderId) deps.dropOrder(book, plan.orderId)
    plan.orderId = null
    plan.orderPx = null
    await deps.saveLadder(row, "done", now)
    return
  }

  // The refusal streak widens the price this asks for. A close refused for
  // being takeable is refused because the price the order path reads is not
  // the price this pass priced against, so asking again at the same distance
  // is asking for the same refusal. See `restingChasePx`.
  const wanted = plan.maker
    ? restingChasePx(plan.side, mark, roundPx, plan.refusalStreak ?? 0)
    : roundPx(plan.triggerPx)
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
  if (!plan.maker && plan.orderId !== null) return false

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
    rememberEngineTimestamp(walletChasedAt, book.wallet.id, now)
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
  plan.clientOrderId = clientOrderId(plan.orderId)
  // From this moment money may be on the exchange, and only a proven cancel
  // may say otherwise. The live lane clears it when a cancel really
  // cancelled; a place that provably failed is rolled back to the plan as it
  // was before this pass, which puts the flag back with everything else.
  plan.sent = true
  plan.orderPx = wanted
  plan.chasedAt = now
  return true
}
