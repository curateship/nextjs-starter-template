import { floorSize } from "@/lib/trade/dca"
import {
  gridFollowDownShift,
  gridFollowShift,
  gridLevels,
  gridLevelSize,
  gridShares,
  gridStepPct,
  gridStopPx,
  gridTakeProfitPx,
  GRID_STEP_FEE_MULTIPLE,
  type GridPlan,
} from "@/lib/trade/grid"
import { slippedPx } from "@/lib/trade/paper"
import { getProtocol } from "@/server/protocols/registry"
import type { WalletBook } from "@/server/trade/paper"
import {
  aimStop,
  ladderBarsKey,
  readBaseWatch,
  type LadderAdvanceInput,
  type LadderEngineDeps,
} from "./smart-engine"

/**
 * What a placed grid does as price moves.
 *
 * **A grid's levels are triggers, not orders.** Nothing rests on the book and
 * no cash is set aside: a level is a price the grid is watching, and when price
 * reaches it the grid buys, there and then. When price climbs back to that
 * level's sell price it sells, and the level goes back to watching for the same
 * buy. That loop is the whole feature.
 *
 * Triggers rather than resting orders for three reasons, and all three were
 * problems the first version had:
 *
 * - **No money is tied up.** A grid with twelve resting buys reserves the whole
 *   pot the moment it is placed, so the rest of the account cannot use it —
 *   even though eleven of those levels may never trade all week.
 * - **No order slots are used.** Twelve resting orders is most of a wallet's
 *   cap, for a plan that is mostly waiting.
 * - **Nothing is drawn twice.** A resting order is a row, and the chart draws
 *   every row; the grid then drew its own line on top of it. With triggers
 *   there are no rows, so the only thing on the chart is the grid.
 *
 * `advanceGrid` is driven through the same injected `deps` as the ladder, so
 * one piece of code serves the practice wallet, real money and a replay.
 *
 * **The order of the pass below is load-bearing.** Each step says what breaks
 * if it moves.
 */

export type GridRow = {
  id: string
  marketKey: string
  plan: GridPlan
}

export async function advanceGrid(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  row: GridRow
): Promise<void> {
  const { book, now } = input
  const plan = row.plan
  if (plan.paused) return
  const roundPx = (px: number) =>
    getProtocol(book.wallet.protocol).markets.roundPx(
      px,
      plan.sizeDecimals,
      plan.priceTick
    )
  const mark = input.marks.get(row.marketKey) ?? null
  let changed = false

  // ----- 1. The 4h base the stop rides ------------------------------------

  if (plan.stopLoss?.base) {
    const read = readBaseWatch(
      input.ladderBars.get(ladderBarsKey("base", row.marketKey)),
      plan.baseDetection,
      now,
      plan.baseWatch?.levelPx ?? null
    )
    if (read) {
      plan.baseWatch = read.watch
      changed = true
    }
  }

  // ----- 2. The take profit ends a winning grid ---------------------------
  //
  // Not the top of the range. Price above the TOP just means the grid has sold
  // everything it had up there and is waiting for price to come back down into
  // its range, which is an ordinary thing for a grid to be doing. The take
  // profit is where you have made enough and want out.

  const held = book.positions.get(row.marketKey) ?? null
  const target = gridTakeProfitPx(plan)
  let closedAbove = false
  if (mark !== null && target !== null && mark >= target) {
    sellEverything(plan, book, deps, row.marketKey, held, mark, now)
    plan.closedReason = "takeProfit"
    closedAbove = true
    changed = true
  }

  // ----- 3. Is the grid over? ---------------------------------------------

  const position = book.positions.get(row.marketKey) ?? null
  const anyHolding = [...plan.levels, ...plan.carriedLevels].some(
    (level) => level.status === "holding"
  )
  const anyWaiting = plan.levels.some((level) => level.status === "waiting")

  const over =
    closedAbove ||
    // Turned into a short by hand: a buy grid has no business adding to it.
    (position !== null && position.szi < 0) ||
    // It believed it was holding and the position has gone — stopped out,
    // closed by hand, or liquidated.
    (anyHolding && !position) ||
    // Every level called off and nothing held: there is no grid left.
    (!anyWaiting && !position)

  // Note what is NOT here: being flat with levels still waiting. For a ladder
  // that means the trade is finished; for a grid it is the ordinary state
  // between one cycle and the next.

  if (over) {
    for (const level of plan.levels) {
      if (level.status === "waiting") level.status = "cancelled"
    }
    if (!plan.closedReason) plan.closedReason = anyHolding ? "stop" : "flat"
    await deps.saveLadder(row, "done", now)
    return
  }

  // ----- 4. Sell triggers, BEFORE buy triggers ----------------------------
  //
  // No price means nothing has been reached, so no trigger can fire — but the
  // pass carries on. Returning here instead skipped the stop below it, and a
  // coin the exchange would not price is exactly when you want the stop
  // written: the position is real whether or not there is a quote for it.
  //
  // Selling frees the cash a buy on the same pass might need. The other way
  // round, a grid that crossed several levels at once would run out of money
  // holding coins it was about to sell.

  const soldCarried = new Set<GridPlan["carriedLevels"][number]>()
  const sellLevels = [
    ...plan.levels.map((level) => ({ level, carried: false })),
    ...plan.carriedLevels.map((level) => ({ level, carried: true })),
  ]
  for (const { level, carried } of sellLevels) {
    if (level.status !== "holding" || level.heldSz <= 0) continue
    if (mark === null || mark < level.sellPx) continue
    // Price has reached this level's sell. Sell exactly what it holds — never
    // the whole position, which other levels are still holding their share of.
    const sz = Math.min(
      floorSize(level.heldSz, plan.sizeDecimals),
      position ? floorSize(position.szi, plan.sizeDecimals) : 0
    )
    if (sz <= 0) {
      level.status = carried ? "cancelled" : "waiting"
      level.heldSz = 0
      changed = true
      if (carried) soldCarried.add(level)
      continue
    }
    deps.fill(book, {
      marketKey: row.marketKey,
      side: "sell",
      px: slippedPx(mark, "sell", book.costs.slippageRate),
      sz,
      feeRate: book.costs.takerFeeRate,
      leverage: position?.leverage ?? 1,
      maxLeverage: plan.maxLeverage,
      // Only ever shrinks what is held. On a real exchange a sell without this,
      // into a position that has already gone, opens a short.
      reduceOnly: true,
      reason: "order",
      at: now,
    })
    // ----- THE RECYCLE ----------------------------------------------------
    // Back to watching, holding nothing. Step 6 buys again the moment price
    // comes back down to this level. There is no queue and no re-arm flag: the
    // loop is this one status change.
    level.status = carried ? "cancelled" : "waiting"
    level.heldSz = 0
    // Still armed, and by definition: price just climbed to this level's sell,
    // which is above its buy. It can buy again the moment price comes back.
    level.armed = !carried
    level.cycles += 1
    plan.cycles += 1
    changed = true
    if (carried) soldCarried.add(level)
  }
  if (soldCarried.size > 0) {
    plan.carriedLevels = plan.carriedLevels.filter(
      (level) => !soldCarried.has(level)
    )
  }

  // ----- 4b. Follow price up ----------------------------------------------
  //
  // AFTER the sells, so a level that just sold recycles at the price it sold
  // at rather than at a price it never traded. BEFORE the buys, so the moved
  // levels are watched on this same pass instead of a second late.
  //
  // Only while it holds nothing. That is what makes an upward move free: no
  //   position to settle means not one order is placed. It is also the ordinary
  //   state up here, because a grid above its top has already sold every level.

  // The range comes into play the first time price is at or under its top.
  // Recorded here, on the plan, because follow below reads it: a range that
  // has never been in play is one somebody hung below the price to catch a
  // fall, and follow dragging it up to the market on the first pass — which
  // it did — is the opposite of what was placed.
  if (!plan.entered && mark !== null && mark <= plan.topPx) {
    plan.entered = true
    changed = true
  }

  if (plan.follow && plan.entered && mark !== null) {
    const stillHeld = book.positions.get(row.marketKey) ?? null
    const anyHeldLevel = [...plan.levels, ...plan.carriedLevels].some(
      (level) => level.status === "holding"
    )
    if (!anyHeldLevel && (!stillHeld || stillHeld.szi <= 0)) {
      const moved = gridFollowShift({
        topPx: plan.topPx,
        bottomPx: plan.bottomPx,
        levels: plan.levels.length,
        spacing: plan.spacing,
        mark,
      })
      if (
        moved &&
        followTheRangeUp(plan, moved, mark, roundPx, book.costs.takerFeeRate)
      ) {
        changed = true
      }
    }
  }

  // ----- 5. Buy triggers ---------------------------------------------------
  //
  // **A level buys at its own price, or it does not buy.** `armed` is what
  // enforces that: price has to have been ABOVE a level before that level may
  // buy when price comes down to it.
  //
  // Without it, every level above the price bought the instant a grid was
  // placed, because "price is at or under my buy price" was already true of all
  // of them. They were filled in one lump at whatever the market happened to
  // be, so the top level's round trip ran from a price it had never paid, and
  // the account sat at its most long at the exact moment a grid should be
  // waiting. One big lump is not a grid.

  for (const level of plan.levels) {
    if (level.status !== "waiting" || level.dead) continue
    if (mark === null) continue
    // Price is above this level, so from here on it is allowed to buy when
    // price comes back down to it.
    if (mark > level.buyPx) {
      if (!level.armed) {
        level.armed = true
        changed = true
      }
      // Not reached yet. This is also the whole of "below the bottom stops
      // buying": there is no level under the bottom to reach.
      continue
    }
    // At or under its price, but price has never been above it — this level is
    // waiting to be reached from above, and buying here would be that lump.
    if (!level.armed) continue

    // From the FROZEN budget, every single cycle. A level that bought back
    // cheaper does not get to spend more next time — a ladder rung buys back
    // once, but a grid level buys back forever, so leftover carried forward
    // would compound on every round trip.
    const sz = gridLevelSize(level, plan.sizeDecimals)
    if (sz <= 0 || sz * level.buyPx < plan.minOrderValueUsd) {
      // Too small to be a trade at this price, and it will not grow.
      level.status = "cancelled"
      changed = true
      continue
    }
    // Not affordable this minute. Left watching rather than thrown away: cash
    // frees up when another level sells. Nothing was reserved, so this costs
    // the grid nothing but a turn.
    if (level.budget > deps.freeCash(book) + 1e-9) continue

    level.sz = sz
    deps.fill(book, {
      marketKey: row.marketKey,
      side: "buy",
      // What it actually pays: price is at or under the level, so a limit buy
      // at the level fills here.
      px: slippedPx(mark, "buy", book.costs.slippageRate),
      sz,
      feeRate: book.costs.takerFeeRate,
      leverage: 1,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      reason: "order",
      at: now,
    })
    level.status = "holding"
    level.heldSz = sz
    changed = true
  }

  // ----- 5b. Follow price down --------------------------------------------
  //
  // AFTER existing buys, so a level crossed during this pass buys at the
  // price it was already watching. One level is then introduced below the
  // range for the next pass. A crash cannot turn one range move into a second
  // burst of buys.

  if (plan.followDown && plan.entered && mark !== null) {
    const moved = gridFollowDownShift({
      topPx: plan.topPx,
      bottomPx: plan.bottomPx,
      levels: plan.levels.length,
      spacing: plan.spacing,
      mark,
    })
    if (mark < plan.bottomPx && !moved) {
      plan.paused = true
      plan.pauseReason =
        "The next lower grid level does not fit this market's price step. The grid paused before placing it."
      await deps.saveLadder(row, "active", now)
      return
    }
    if (moved) {
      const followed = followTheRangeDown(plan, moved, roundPx)
      if (followed.reason) {
        plan.paused = true
        plan.pauseReason = followed.reason
        await deps.saveLadder(row, "active", now)
        return
      }
      if (followed.moved) changed = true
    }
  }

  // ----- 6. Aim the stop, and only the stop -------------------------------
  //
  // AFTER the triggers, deliberately. A level that bought on this pass has to
  // have its stop written on the same pass — aiming first left a fresh position
  // sitting unprotected until the next one came round, which on a quiet market
  // is seconds and on a falling one is exactly the wrong seconds.
  //
  // A grid never writes a take-profit onto the position. Its exits are its own
  // sell triggers, one per level; a single target would sell the lot at one
  // price and defeat the whole order. `GridPlan` has no `aimedTpPx` for that
  // reason.

  const after = book.positions.get(row.marketKey) ?? null
  if (!after || after.szi <= 0) {
    // Nothing held, so there is nothing to remember aiming at.
    //
    // This reset is load-bearing here in a way it never was for a ladder. The
    // hand-moved test below reads "the position's stop is not the one I last
    // wrote" as somebody having dragged it, and then leaves it alone forever. A
    // position that closed and reopened looks exactly like that — and for a
    // grid, closing and reopening is what happens every week.
    if (plan.aimedSlPx !== null) {
      plan.aimedSlPx = null
      changed = true
    }
  } else {
    const wanted = gridStopPx(plan)
    if (
      aimStop(plan, after, wanted === null ? null : roundPx(wanted), (px) => {
        if (plan.stopLoss) {
          plan.stopLoss.mode = "fixed"
          plan.stopLoss.px = px !== null && px > 0 ? px : null
        }
      })
    ) {
      after.updatedAt = now
      book.touchedMarkets.add(row.marketKey)
      changed = true
    }
  }

  // ----- 7. Levels under the stop --------------------------------------
  //
  // Against where the stop WOULD be, not only where it has been written. A
  // grid holding nothing has no position to carry a stop, and its levels under
  // one still cannot buy.

  if (
    reconcileDeadLevels(
      plan,
      book.positions.get(row.marketKey)?.slPx ?? gridStopPx(plan)
    )
  ) {
    changed = true
  }

  // ----- 8. Write it down if any of that changed anything ------------------

  if (changed) await deps.saveLadder(row, "active", now)
}

/**
 * Re-prices every level onto a range that has moved up, or leaves the grid
 * exactly where it was and reports false.
 *
 * Drawn fully and checked fully BEFORE a single field is written, so a refused
 * move leaves a working grid rather than half a moved one.
 *
 * Three things can refuse it, and each is a real way a moved grid would be
 * worse than a parked one:
 *
 * - **The step stops clearing the fee.** On evenly spread levels the step is a
 *   fixed number of dollars, so the higher the range climbs the smaller a
 *   percentage each round trip earns, until two fees eat it. Without this the
 *   grid would eventually follow price forever, trading all day to lose money
 *   slowly. Levels spread by percent never thin, so this never bites them.
 * - **A level stops being an order.** The budgets do not change, but the coins
 *   they buy do, and a market with coarse size steps can round one to nothing.
 * - **Rounding collapses a level**, leaving a sell at or under its own buy, or
 *   a buy that has been nudged up over the price and would fire on this pass.
 *   Both are the promise of a free move being quietly broken by a price tick.
 */
function followTheRangeUp(
  plan: GridPlan,
  moved: { topPx: number; bottomPx: number },
  mark: number,
  roundPx: (px: number) => number,
  takerFeeRate: number
): boolean {
  const drawn = gridLevels({
    topPx: moved.topPx,
    bottomPx: moved.bottomPx,
    levels: plan.levels.length,
    spacing: plan.spacing,
  }).map((level) => ({
    buyPx: roundPx(level.buyPx),
    sellPx: roundPx(level.sellPx),
  }))
  if (drawn.length !== plan.levels.length) return false

  if (gridStepPct(drawn) <= takerFeeRate * GRID_STEP_FEE_MULTIPLE) return false

  const sized = drawn.map((level, index) => ({
    ...level,
    sz: floorSize(plan.levels[index].budget / level.buyPx, plan.sizeDecimals),
  }))
  for (const level of sized) {
    if (!(level.buyPx > 0) || !(level.sellPx > level.buyPx)) return false
    // A buy at or above the price is one the next step would fill at market,
    // which is exactly the cost this whole feature exists to avoid.
    if (level.buyPx >= mark) return false
    if (level.sz <= 0 || level.sz * level.buyPx < plan.minOrderValueUsd)
      return false
  }

  const top = roundPx(moved.topPx)
  const bottom = roundPx(moved.bottomPx)
  if (!(top > bottom) || !(bottom > 0)) return false

  plan.topPx = top
  plan.bottomPx = bottom
  for (const [index, level] of plan.levels.entries()) {
    level.buyPx = sized[index].buyPx
    level.sellPx = sized[index].sellPx
    level.sz = sized[index].sz
  }
  plan.shifts += 1
  return true
}

/**
 * Introduce one new bottom buy and leave the old top holding at its old sale.
 * Every candidate number is checked before the plan changes.
 */
function followTheRangeDown(
  plan: GridPlan,
  moved: { topPx: number; bottomPx: number },
  roundPx: (px: number) => number
): { moved: boolean; reason: string | null } {
  const prices = gridLevels({
    topPx: moved.topPx,
    bottomPx: moved.bottomPx,
    levels: plan.levels.length,
    spacing: plan.spacing,
  }).map((level) => ({
    buyPx: roundPx(level.buyPx),
    sellPx: roundPx(level.sellPx),
  }))
  const topPx = roundPx(moved.topPx)
  const bottomPx = roundPx(moved.bottomPx)
  if (
    prices.length !== plan.levels.length ||
    !(topPx > bottomPx) ||
    !(bottomPx > 0) ||
    prices.some((level) => !(level.buyPx > 0) || !(level.sellPx > level.buyPx))
  ) {
    return {
      moved: false,
      reason:
        "The next lower grid level does not fit this market's price step. The grid paused before placing it.",
    }
  }

  // Old level 0 becomes new level 1, and so on. If the exchange's price tick
  // prevents that exact overlap, moving would rewrite the prices old coins
  // bought at. Pause instead.
  for (let index = 0; index < plan.levels.length - 1; index += 1) {
    const old = plan.levels[index]
    const next = prices[index + 1]
    if (old.buyPx !== next.buyPx || old.sellPx !== next.sellPx) {
      return {
        moved: false,
        reason:
          "The next lower grid level does not fit this market's price step. The grid paused before placing it.",
      }
    }
  }

  const pot = plan.levels.reduce((sum, level) => sum + level.budget, 0)
  const shares = gridShares(plan.levels.length, plan.sizing)
  const sized = prices.map((level, index) => {
    const sz = floorSize((pot * shares[index]) / level.buyPx, plan.sizeDecimals)
    return { ...level, sz, budget: sz * level.buyPx }
  })
  if (
    sized.some(
      (level) => level.sz <= 0 || level.budget + 1e-9 < plan.minOrderValueUsd
    )
  ) {
    return {
      moved: false,
      reason:
        "The next lower grid buy is smaller than this market accepts. The grid paused before placing it.",
    }
  }

  const oldTop = plan.levels.at(-1)
  const stopPx = gridStopPx(plan)
  const nextLevels = [
    {
      buyPx: sized[0].buyPx,
      sellPx: sized[0].sellPx,
      sz: sized[0].sz,
      budget: sized[0].budget,
      heldSz: 0,
      status: "waiting" as const,
      armed: true,
      dead: stopPx !== null && sized[0].buyPx <= stopPx,
      cycles: 0,
    },
    ...plan.levels.slice(0, -1).map((level, index) => ({
      ...level,
      // The money split follows the level's new place in the active range.
      // Coins already held keep `heldSz`; this changes only the next cycle.
      sz: sized[index + 1].sz,
      budget: sized[index + 1].budget,
    })),
  ]

  if (oldTop?.status === "holding" && oldTop.heldSz > 0) {
    plan.carriedLevels.push(oldTop)
  }
  plan.levels = nextLevels
  plan.topPx = topPx
  plan.bottomPx = bottomPx
  plan.downShifts += 1
  return { moved: true, reason: null }
}

/**
 * Sells the whole position and stops every level — the one exit that closes a
 * grid rather than cycling it.
 *
 * The POSITION's size, never the sum of what the levels think they hold: the
 * position is the truth, and a hand-trade may have changed it.
 */
function sellEverything(
  plan: GridPlan,
  book: WalletBook,
  deps: LadderEngineDeps,
  marketKey: string,
  held: { szi: number; leverage: number } | null,
  mark: number,
  now: number
): void {
  for (const level of [...plan.levels, ...plan.carriedLevels]) {
    level.heldSz = 0
  }
  const sz = held ? floorSize(held.szi, plan.sizeDecimals) : 0
  if (!held || sz <= 0) return
  deps.fill(book, {
    marketKey,
    side: "sell",
    px: slippedPx(mark, "sell", book.costs.slippageRate),
    sz,
    feeRate: book.costs.takerFeeRate,
    leverage: held.leverage,
    maxLeverage: plan.maxLeverage,
    reduceOnly: true,
    reason: "order",
    at: now,
  })
}

/**
 * A level at or below the position's stop can never buy: price has to pass the
 * stop to reach it, and the stop ends the grid. It is drawn faded and comes
 * back the moment the stop sits below it again.
 */
function reconcileDeadLevels(plan: GridPlan, stopPx: number | null): boolean {
  let changed = false
  for (const level of plan.levels) {
    // Only a watching level can be dead. One that is holding has already
    // bought, and the stop will close it with everything else.
    const dead =
      level.status === "waiting" && stopPx !== null && level.buyPx <= stopPx
    if (dead === level.dead) continue
    level.dead = dead
    changed = true
  }
  return changed
}
