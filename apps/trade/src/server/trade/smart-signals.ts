import { MIN_ORDER_USD, floorSize } from "@/lib/trade/dca"
import { liveOrderIds } from "@/server/trade/paper"
import {
  CHASE_EVERY_MS,
  chaseCeilingPx,
  chaseWorthMoving,
  restingChasePx,
  type SignalPlan,
} from "@/lib/trade/signal-order"
import { getProtocol } from "@/server/protocols/registry"
import type {
  LadderAdvanceInput,
  LadderEngineDeps,
} from "@/server/trade/smart-engine"

/**
 * One coin being traded on an indicator's say-so, pushed along one pass.
 *
 * **This is the chase, and the chase is the whole file.** An arrow said buy, so
 * this rests a limit order just under today's price and moves it as price
 * moves, until it fills or price has run further than the flow said it would
 * follow. An arrow said sell, and it does the same on the other side and never
 * gives up.
 *
 * ## Nothing here sends a market order
 *
 * Every order goes out through `deps.insertOrder`, which is the resting lane:
 * a practice wallet writes a row that its own settle fills at the maker rate
 * when price reaches it, and a real wallet asks the exchange for an
 * add-liquidity-only order that it refuses outright rather than crossing. So
 * "it did not fill" is a real outcome here, on purpose, and the give-up setting
 * is what stops that being an unbounded wait.
 *
 * ## Where the position count comes from
 *
 * The book, never the plan. A practice book knows what it holds from its own
 * arithmetic and a live one is rebuilt from the exchange every pass; a second
 * count kept here could disagree with the position it claims to describe, and a
 * partial fill is exactly the moment it would. So the phases are decided by
 * looking at what is actually held.
 */

export type SignalRow = { id: string; marketKey: string; plan: SignalPlan }

/**
 * When each wallet last moved an order, so a chase cannot outrun the exchange.
 *
 * **In memory on purpose, and losing it costs nothing.** It is a rate limiter,
 * not a fact about a trade: a restart lets one extra order move a few seconds
 * early and then the gate is back. Written down it would be a row rewritten
 * every ten seconds forever to say something no screen ever reads.
 *
 * Keyed by wallet rather than by coin because the allowance is the wallet's.
 * Twenty coins all chasing at once is still six order moves a minute between
 * them, which is the point — see `CHASE_EVERY_MS` for the arithmetic.
 */
const walletChasedAt = new Map<string, number>()

/** Test support: forgets every wallet's gate. */
export function resetChaseGate(): void {
  walletChasedAt.clear()
}

export async function advanceSignal(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  row: SignalRow
): Promise<void> {
  const { book, now } = input
  const plan = row.plan
  const roundPx = (px: number) =>
    getProtocol(book.wallet.protocol).markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  const mark = input.marks.get(row.marketKey)
  // No price this pass. Not an error and not a reason to do anything: the order
  // already on the book stays exactly where it is.
  if (mark === undefined || !(mark > 0)) return

  let changed = false
  const live = liveOrderIds(book)

  // ----- Did the order we were chasing go? -------------------------------
  //
  // Filled, or dropped — by a cancel from here last pass, by a hand, or by a
  // wallet that could no longer afford it. Which of those it was does not
  // matter: the position below is the truth either way, and reading it is how
  // a partial fill is handled without counting anything.
  if (plan.orderId && !live.has(plan.orderId)) {
    plan.orderId = null
    plan.orderPx = null
    changed = true
  }

  const position = book.positions.get(row.marketKey) ?? null

  // ----- Called off ------------------------------------------------------
  //
  // The flow that started this was switched off. Anything it had asked for and
  // not got is taken back; a position it already holds is left exactly where it
  // is, which is the same rule a stopped ladder follows — **and it is left with
  // no automatic way out, because its only exit was the next arrow.**
  if (plan.phase === "stopping") {
    if (plan.orderId) {
      deps.dropOrder(book, plan.orderId)
      plan.orderId = null
      plan.orderPx = null
    }
    await deps.saveLadder(row, "done", now)
    return
  }

  // ----- A short on this coin is not ours --------------------------------
  //
  // Somebody sold it themselves. Buying into that would shrink their short
  // rather than open the position the arrow asked for, and selling would grow
  // it. Neither is what anybody meant, so this stands down and leaves the coin
  // to whoever is actually trading it.
  if (position && position.szi < 0) {
    if (plan.orderId) {
      deps.dropOrder(book, plan.orderId)
      plan.orderId = null
      plan.orderPx = null
    }
    await deps.saveLadder(row, "done", now)
    return
  }

  // ----- Phases follow what is actually held -----------------------------

  if (plan.phase === "buying" && position) {
    // It bought — all of it, or some of it and then the price left. Either way
    // there is a position now, and the next thing that happens to it is a sell
    // arrow.
    plan.phase = "holding"
    changed = true
  }

  if ((plan.phase === "holding" || plan.phase === "selling") && !position) {
    // Out. Sold on the arrow, or taken by something else entirely — a hand, a
    // liquidation. There is nothing left for this plan to do about a coin it no
    // longer holds.
    if (plan.orderId) {
      deps.dropOrder(book, plan.orderId)
      plan.orderId = null
      plan.orderPx = null
    }
    await deps.saveLadder(row, "done", now)
    return
  }

  if (plan.phase === "holding") {
    // Nothing to do but wait for an arrow, and the pass that reads the candles
    // is what sees one. Saved only if the lines above changed something.
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  // ----- Buying: follow the price, but only so far -----------------------

  if (plan.phase === "buying") {
    const ceiling = chaseCeilingPx(plan)
    if (mark > ceiling) {
      // It ran. Nothing was bought — a partial fill would have made a position
      // and been read as "holding" above — so this coin simply gets nothing out
      // of this arrow, and the flow is free to act on the next one.
      if (plan.orderId) {
        deps.dropOrder(book, plan.orderId)
        plan.orderId = null
        plan.orderPx = null
      }
      await deps.saveLadder(row, "done", now)
      return
    }

    // A price that will genuinely rest on this coin's own price grid, which
    // is not the same thing as a price a whisker under the market — see
    // `restingChasePx`. Always under the market, and the market is never above
    // the ceiling by the time we are here, so it can never pay more than the
    // limit either.
    const wanted = restingChasePx("buy", mark, roundPx)
    if (wanted === null) {
      // This coin's prices are too coarse to sit just off the market. Saying
      // nothing beats sending an order the exchange will refuse every pass.
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }

    const sz = floorSize(plan.stakeUsd / wanted, plan.sizeDecimals)
    // Under the exchange's own minimum the order is refused before it exists,
    // and sending it anyway spends a request to be told no. The same rule the
    // ladder's rungs follow.
    if (sz <= 0 || wanted * sz < MIN_ORDER_USD) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }
    if (wanted * sz > deps.freeCash(book) + 1e-9) {
      if (changed) await deps.saveLadder(row, "active", now)
      return
    }

    changed = (await moveOrder(input, deps, plan, row.marketKey, "buy", wanted, sz)) || changed
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  // ----- Selling: follow it out, and never give up -----------------------

  const wanted = restingChasePx("sell", mark, roundPx)
  const held = Math.abs(position?.szi ?? 0)
  const sz = floorSize(held, plan.sizeDecimals)
  if (wanted === null || sz <= 0) {
    if (changed) await deps.saveLadder(row, "active", now)
    return
  }

  changed = (await moveOrder(input, deps, plan, row.marketKey, "sell", wanted, sz)) || changed
  if (changed) await deps.saveLadder(row, "active", now)
}

/**
 * Puts the order where it should be, if it is not there and it is allowed to
 * move yet.
 *
 * Two gates, and both are about the exchange rather than the strategy. The
 * first is the drift: a price wobbling in its fourth decimal is not a reason to
 * spend two calls. The second is the clock, and it belongs to the whole wallet
 * — see `CHASE_EVERY_MS`.
 *
 * Answers whether anything about the plan changed.
 */
async function moveOrder(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  plan: SignalPlan,
  marketKey: string,
  side: "buy" | "sell",
  wanted: number,
  sz: number
): Promise<boolean> {
  const { book, now } = input
  if (!chaseWorthMoving(plan.orderPx, wanted)) return false

  // The first order is not a chase and does not wait for the gate — an arrow
  // that had to queue behind a rate limit before it could ask for a price at
  // all would be a strategy that acts a random number of seconds late.
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
    side,
    px: wanted,
    sz,
    leverage: 1,
    maxLeverage: plan.maxLeverage,
    // A sell here is getting out of something already held. Without this, a
    // sell that races a position which has already gone does not sell nothing
    // — it opens a short.
    reduceOnly: side === "sell",
    now,
  })
  plan.orderPx = wanted
  plan.chasedAt = now
  return true
}
