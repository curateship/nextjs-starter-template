import { floorSize } from "@/lib/trade/dca"
import {
  entrySide,
  exitSide,
  gridHeldSz,
  gridLevels,
  gridLevelSize,
  gridShares,
  gridShiftAway,
  gridShiftInto,
  gridStepPct,
  gridStopPx,
  gridTakeProfitPx,
  heldWrongWay,
  holdsEntry,
  lossEdge,
  reachedEntry,
  reachedExit,
  readyWhen,
  winEdge,
  winningSide,
  GRID_REBUY_CLEARANCE_PCT,
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
 * What a placed grid does as price moves, whichever way round it runs.
 *
 * **One engine, not two.** A selling grid is this same file with every price
 * comparison mirrored, and the mirroring is done by the direction helpers in
 * `grid.ts` — `reachedEntry`, `reachedExit`, `readyWhen`, `entrySide`,
 * `exitSide`, `winningSide`, `lossEdge`, `winEdge`. Nothing here compares two
 * prices by hand. A second copy of this file would mean every future fix
 * landing in one of them and being missed in the other, and the rules here
 * were each learned the hard way.
 *
 * **A grid's levels are triggers, not orders.** Nothing rests on the book and
 * no cash is set aside: a level is a price the grid is watching, and when price
 * reaches it the grid opens there and then. When price comes back to that
 * level's exit price it closes, and the level goes back to watching for the
 * same entry. That loop is the whole feature.
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

/**
 * The one sentence three refusal paths share. Written once so the panel says
 * the same thing whichever of them stopped the move.
 */
const NEXT_LEVEL_OFF_TICK =
  "The next grid level does not fit this market's price step. The grid paused before placing it."

export type GridRow = {
  id: string
  marketKey: string
  plan: GridPlan
  /**
   * A DCA ladder shares this coin. The position's one stop then belongs to
   * the ladder: this grid must not aim it, and its own protection is the
   * fixed-size stop order the live pass reconciles from `plan.pairedStop`.
   * Only the live pass ever sets this — a practice wallet refuses the
   * pairing at placement.
   */
  paired?: boolean
}

/**
 * A closing trade and a nearby waiting level cannot take the same small price
 * wobble. That level must first see price at least one percent past its own
 * line, on the winning side, and then return.
 *
 * Buying grid: a waiting buy near a sale waits for a one percent rise. Selling
 * grid: a waiting sell near a buy-back waits for a one percent fall. Same
 * clearance, mirrored.
 */
function holdNearbyEntriesAfterExit(plan: GridPlan, sellPx: number): void {
  const clearance = GRID_REBUY_CLEARANCE_PCT / 100
  const nearbyDistance = sellPx * clearance

  for (const level of plan.levels) {
    if (level.status !== "waiting") continue
    if (Math.abs(level.buyPx - sellPx) > nearbyDistance) continue

    level.armed = false
    const wanted =
      plan.direction === "long"
        ? level.buyPx * (1 + clearance)
        : level.buyPx * (1 - clearance)
    level.rebuyAbove =
      level.rebuyAbove === undefined
        ? wanted
        : winningSide(plan.direction, level.rebuyAbove, wanted)
  }
}

export async function advanceGrid(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  row: GridRow
): Promise<void> {
  const { book, now } = input
  const plan = row.plan
  if (plan.paused) return
  const protocol = getProtocol(book.wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)
  const mark = input.marks.get(row.marketKey) ?? null
  const direction = plan.direction
  let changed = false
  let shiftedAwayThisPass = false

  // ----- 1. The 4h base the stop rides ------------------------------------

  if (plan.stopLoss?.base) {
    const read = readBaseWatch(
      input.ladderBars.get(ladderBarsKey("base", row.marketKey)),
      plan.baseDetection,
      now,
      plan.baseWatch?.levelPx ?? null,
      // A buying grid rests its stop under a confirmed floor; a selling grid
      // rests it above a confirmed ceiling. Same indicator, same settings,
      // mirrored — and the cache in `baseLevelsInForce` keys on this too.
      direction === "long" ? "up" : "down"
    )
    if (read) {
      plan.baseWatch = read.watch
      changed = true
    }
  }

  // ----- 2. Watched exits close the grid ----------------------------------
  //
  // Lighter carries no grid stop on its book. Trade watches the saved stop
  // price and sends one reduce-only close when price reaches it. The stop sits
  // past the LOSING edge, so the same watch works either way round: below the
  // bottom on a buying grid, above the top on a selling one.
  //
  // Not the winning edge of the range. Price past the winning edge just means
  // the grid has closed everything it had out there and is waiting for price
  // to come back into its range, which is an ordinary thing for a grid to be
  // doing. End Grid is the fixed line where the grid stops following and ends.

  const held = book.positions.get(row.marketKey) ?? null
  const watchedStop =
    protocol.capabilities.gridStop === "watched" ? gridStopPx(plan) : null
  let stopped = false
  if (
    mark !== null &&
    watchedStop !== null &&
    reachedEntry(direction, mark, watchedStop)
  ) {
    closeEverything(plan, book, deps, row.marketKey, held, mark, now)
    plan.closedReason = "stop"
    stopped = true
    changed = true
  }

  const target = gridTakeProfitPx(plan)
  let ended = false
  if (
    !stopped &&
    mark !== null &&
    target !== null &&
    reachedExit(direction, mark, target)
  ) {
    // Paired with a ladder, the position is not all the grid's to close. A
    // jump past the End Grid line closes what the GRID holds and no more — the
    // ladder's coins stay, still covered by the ladder's own stop. Only a
    // buying grid can be paired, so the sign here is always positive.
    const gridOnly = row.paired
      ? Math.min(gridHeldSz(plan), held ? Math.max(held.szi, 0) : 0)
      : null
    closeEverything(
      plan,
      book,
      deps,
      row.marketKey,
      gridOnly !== null && held ? { ...held, szi: gridOnly } : held,
      mark,
      now
    )
    plan.closedReason = "takeProfit"
    ended = true
    changed = true
  }

  // ----- 3. Is the grid over? ---------------------------------------------

  const position = book.positions.get(row.marketKey) ?? null
  const anyHolding = [...plan.levels, ...plan.carriedLevels].some(
    (level) => level.status === "holding"
  )
  const anyWaiting = plan.levels.some((level) => level.status === "waiting")

  const over =
    stopped ||
    ended ||
    // Turned the wrong way round by hand: a buying grid has no business adding
    // to a short, and a selling grid none adding to a long.
    (position !== null && heldWrongWay(direction, position.szi)) ||
    // It believed it was holding and the position has gone — stopped out,
    // closed by hand, or liquidated.
    (anyHolding && !position) ||
    // Every level called off and nothing held: there is no grid left. A
    // paired grid cannot wait for the POSITION to go — the ladder's coins
    // keep it alive forever — so its own emptiness is the test, or a grid
    // whose levels were all called off would sit as a zombie half of the
    // pair and block the coin for good.
    (row.paired ? !anyWaiting && !anyHolding : !anyWaiting && !position)

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

  // ----- 4. Exit triggers, BEFORE entry triggers --------------------------
  //
  // No price means nothing has been reached, so no trigger can fire — but the
  // pass carries on. Returning here instead skipped the stop below it, and a
  // coin the exchange would not price is exactly when you want the stop
  // written: the position is real whether or not there is a quote for it.
  //
  // Closing frees the margin an entry on the same pass might need. The other
  // way round, a grid that crossed several levels at once would run out of
  // money holding a position it was about to close.

  const closedCarried = new Set<GridPlan["carriedLevels"][number]>()
  const exitLevels = [
    ...plan.levels.map((level) => ({ level, carried: false })),
    ...plan.carriedLevels.map((level) => ({ level, carried: true })),
  ]
  for (const { level, carried } of exitLevels) {
    if (level.status !== "holding" || level.heldSz <= 0) continue
    if (mark === null || !reachedExit(direction, mark, level.sellPx)) continue
    // Price has reached this level's way out. Close exactly what it holds —
    // never the whole position, which other levels hold their share of. The
    // position's size is signed, and a selling grid's is negative, so what is
    // available to close is its size either way round.
    const sz = Math.min(
      floorSize(level.heldSz, plan.sizeDecimals),
      position ? floorSize(Math.abs(position.szi), plan.sizeDecimals) : 0
    )
    if (sz <= 0) {
      level.status = carried ? "cancelled" : "waiting"
      level.heldSz = 0
      changed = true
      if (carried) closedCarried.add(level)
      continue
    }
    deps.fill(book, {
      marketKey: row.marketKey,
      side: exitSide(direction),
      px: slippedPx(mark, exitSide(direction), book.costs.slippageRate),
      sz,
      feeRate: book.costs.takerFeeRate,
      leverage: position?.leverage ?? 1,
      maxLeverage: plan.maxLeverage,
      // Only ever shrinks what is held. On a real exchange a close without
      // this, into a position that has already gone, opens the other way.
      reduceOnly: true,
      reason: "order",
      at: now,
    })
    // ----- THE RECYCLE ----------------------------------------------------
    // Back to watching, holding nothing. A nearby waiting level waits for a
    // one percent move past it before a later return may open it. Deeper
    // levels keep cycling.
    level.status = carried ? "cancelled" : "waiting"
    level.heldSz = 0
    level.armed = !carried
    delete level.rebuyAbove
    level.cycles += 1
    plan.cycles += 1
    holdNearbyEntriesAfterExit(plan, level.sellPx)
    changed = true
    if (carried) closedCarried.add(level)
  }
  if (closedCarried.size > 0) {
    plan.carriedLevels = plan.carriedLevels.filter(
      (level) => !closedCarried.has(level)
    )
  }

  // ----- 4b. Follow price AWAY from the loss ------------------------------
  //
  // The free move. Price has left through the winning edge, so the grid has
  // already closed every level and holds nothing: no position to settle means
  // not one order is placed. A buying grid does this going UP, a selling grid
  // going DOWN — the two switches in the window keep their names and swap
  // which one is the safe one.
  //
  // AFTER the exits, so a level that just closed recycles at the price it
  // traded at rather than at a price it never touched. BEFORE the entries, so
  // the moved levels are watched on this same pass instead of a second late.

  // The range comes into play the first time price is at or inside its winning
  // edge. Recorded here, on the plan, because follow below reads it: a range
  // that has never been in play is one somebody hung clear of the price to
  // catch a move, and follow dragging it to the market on the first pass —
  // which it did — is the opposite of what was placed.
  if (
    !plan.entered &&
    mark !== null &&
    reachedEntry(direction, mark, winEdge(direction, plan))
  ) {
    plan.entered = true
    changed = true
  }

  const followsAway = direction === "long" ? plan.follow : plan.followDown
  const followsInto = direction === "long" ? plan.followDown : plan.follow

  if (followsAway && plan.entered && mark !== null) {
    const stillHeld = book.positions.get(row.marketKey) ?? null
    const anyHeldLevel = [...plan.levels, ...plan.carriedLevels].some(
      (level) => level.status === "holding"
    )
    if (
      !anyHeldLevel &&
      (!stillHeld || !holdsEntry(direction, stillHeld.szi))
    ) {
      let moved = gridShiftAway({
        topPx: plan.topPx,
        bottomPx: plan.bottomPx,
        levels: plan.levels.length,
        spacing: plan.spacing,
        direction,
        mark,
      })
      // The last step parks at End Grid instead of putting the range past its
      // own finishing line while price is still just short of it. Preserve the
      // range's shape when shortening that final move.
      const movedWinEdge = moved === null ? null : winEdge(direction, moved)
      if (
        moved &&
        movedWinEdge !== null &&
        target !== null &&
        readyWhen(direction, movedWinEdge, target)
      ) {
        const otherEdge = lossEdge(direction, moved)
        const parked =
          plan.spacing === "compounding"
            ? otherEdge * (target / movedWinEdge)
            : otherEdge + (target - movedWinEdge)
        moved =
          direction === "long"
            ? { ...moved, topPx: target, bottomPx: parked }
            : { ...moved, bottomPx: target, topPx: parked }
      }
      if (
        moved &&
        followTheRangeAway(plan, moved, mark, roundPx, book.costs.takerFeeRate)
      ) {
        // The move that closed the old edge rung cannot also prepare the new
        // edge rung to open. The moved edge must reach its new exit price
        // before a later return may open at the traded price again.
        shiftedAwayThisPass = true
        changed = true
      }
    }
  }

  // ----- 5. Entry triggers -------------------------------------------------
  //
  // **A level trades at its own price, or it does not trade.** `armed` is what
  // enforces that: price has to have been PAST a level, on the winning side,
  // before that level may open when price comes back to it.
  //
  // Without it, every level on the far side of the price traded the instant a
  // grid was placed, because "price has reached me" was already true of all of
  // them. They were filled in one lump at whatever the market happened to be,
  // so the furthest level's round trip ran from a price it had never traded,
  // and the account sat at its biggest at the exact moment a grid should be
  // waiting. One big lump is not a grid.

  for (const level of shiftedAwayThisPass ? [] : plan.levels) {
    if (level.status !== "waiting" || level.dead) continue
    if (mark === null) continue
    if (level.rebuyAbove !== undefined) {
      if (!reachedExit(direction, mark, level.rebuyAbove)) continue
      // A level near a closing trade may only turn on after price reaches the
      // required clearance past it. Time and small wobbles around the traded
      // price do not prepare it. Following the range can require a full rung
      // instead.
      delete level.rebuyAbove
      changed = true
    }
    // Price is past this level on the winning side, so from here on it is
    // allowed to open when price comes back to it.
    if (readyWhen(direction, mark, level.buyPx)) {
      if (!level.armed) {
        level.armed = true
        changed = true
      }
      // Not reached yet. This is also the whole of "past the losing edge stops
      // opening": there is no level out there to reach.
      continue
    }
    // Price has reached it, but has never been past it — this level is waiting
    // to be reached from the winning side, and opening here would be that lump.
    if (!level.armed) continue

    // From the FROZEN budget, every single cycle. A level that closed cheaper
    // does not get to put up more next time — a ladder rung buys back once,
    // but a grid level recycles forever, so leftover carried forward would
    // compound on every round trip.
    const sz = gridLevelSize(level, plan.sizeDecimals)
    if (sz <= 0 || sz * level.buyPx < plan.minOrderValueUsd) {
      // Too small to be a trade at this price, and it will not grow.
      level.status = "cancelled"
      changed = true
      continue
    }
    // Not affordable this minute. Left watching rather than thrown away: margin
    // frees up when another level closes. Nothing was reserved, so this costs
    // the grid nothing but a turn.
    if (level.budget / plan.leverage > deps.freeCash(book) + 1e-9) continue

    const priorSz = level.sz
    const priorStatus = level.status
    const priorHeldSz = level.heldSz
    level.sz = sz
    deps.fill(book, {
      marketKey: row.marketKey,
      side: entrySide(direction),
      // What it actually gets: price has reached the level, so an order at the
      // level fills here.
      px: slippedPx(mark, entrySide(direction), book.costs.slippageRate),
      sz,
      feeRate: book.costs.takerFeeRate,
      leverage: plan.leverage,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      reason: "order",
      at: now,
      triggerPx: level.buyPx,
      undo: () => {
        level.sz = priorSz
        level.status = priorStatus
        level.heldSz = priorHeldSz
      },
    })
    level.status = "holding"
    level.heldSz = sz
    changed = true
  }

  // ----- 5b. Follow price INTO the loss ------------------------------------
  //
  // The dangerous one, and the window says so beside the switch. It walks the
  // range towards the loss without moving the agreed limit away: a buying grid
  // adds a lower buy as price falls, a selling grid adds a higher sell as price
  // climbs.
  //
  // AFTER existing entries, so a level crossed during this pass opens at the
  // price it was already watching. One level is then introduced past the range
  // for the next pass. A crash cannot turn one range move into a second burst
  // of trades.

  if (followsInto && plan.entered && mark !== null) {
    const moved = gridShiftInto({
      topPx: plan.topPx,
      bottomPx: plan.bottomPx,
      levels: plan.levels.length,
      spacing: plan.spacing,
      direction,
      mark,
    })
    if (reachedEntry(direction, mark, lossEdge(direction, plan)) && !moved) {
      plan.paused = true
      plan.pauseReason = NEXT_LEVEL_OFF_TICK
      await deps.saveLadder(row, "active", now)
      return
    }
    if (moved) {
      const followed = followTheRangeInto(plan, moved, roundPx)
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
  if (protocol.capabilities.gridStop === "watched") {
    // The watched price is the plan's `stopLoss`. `aimedSlPx` means a stop was
    // sent to the exchange, so Lighter must always leave it empty. Comparing
    // Lighter's null `slPx` with this field used to rewrite the saved stop to
    // null, which is how ENA lost its protection.
    if (plan.aimedSlPx !== null) {
      plan.aimedSlPx = null
      changed = true
    }
  } else if (row.paired) {
    // The position's one stop belongs to the ladder beneath this grid, so
    // nothing here may aim it — and nothing may be remembered as aimed, or
    // the hand-moved test would read the ladder's stop as a drag. The grid's
    // own protection is its fixed-size stop order, which the live pass
    // places and moves from `plan.pairedStop` after this engine has run.
    if (plan.aimedSlPx !== null) {
      plan.aimedSlPx = null
      changed = true
    }
  } else if (!after || !holdsEntry(direction, after.szi)) {
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

  // ----- 7. Levels past the stop -------------------------------------------
  //
  // Against where the stop WOULD be, not only where it has been written. A
  // grid holding nothing has no position to carry a stop, and its levels past
  // one still cannot trade.

  if (
    reconcileDeadLevels(
      plan,
      // Paired, the position's stop is the ladder's and says nothing about
      // where THIS grid gives up — its own plan does.
      row.paired
        ? gridStopPx(plan)
        : (book.positions.get(row.marketKey)?.slPx ?? gridStopPx(plan))
    )
  ) {
    changed = true
  }

  // ----- 8. Write it down if any of that changed anything ------------------

  if (changed) await deps.saveLadder(row, "active", now)
}

/**
 * Re-prices every level onto a range that has moved away from its loss, or
 * leaves the grid exactly where it was and reports false.
 *
 * Drawn fully and checked fully BEFORE a single field is written, so a refused
 * move leaves a working grid rather than half a moved one.
 *
 * Three things can refuse it, and each is a real way a moved grid would be
 * worse than a parked one:
 *
 * - **The step stops clearing the fee.** On evenly spread levels the step is a
 *   fixed number of dollars, so the higher up the range sits the smaller a
 *   percentage each round trip earns, until two fees eat it. Without this the
 *   grid would eventually follow price forever, trading all day to lose money
 *   slowly. Levels spread by percent never thin, so this never bites them.
 * - **A level stops being an order.** The budgets do not change, but the coins
 *   they trade do, and a market with coarse size steps can round one to
 *   nothing.
 * - **Rounding collapses a level**, leaving an exit at or past its own entry,
 *   or an entry nudged onto the wrong side of the price that would fire on
 *   this pass. Both are the promise of a free move being quietly broken by a
 *   price tick.
 */
function followTheRangeAway(
  plan: GridPlan,
  moved: { topPx: number; bottomPx: number },
  mark: number,
  roundPx: (px: number) => number,
  takerFeeRate: number
): boolean {
  const direction = plan.direction
  const drawn = gridLevels({
    topPx: moved.topPx,
    bottomPx: moved.bottomPx,
    levels: plan.levels.length,
    spacing: plan.spacing,
    direction,
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
    if (!(level.buyPx > 0) || !(level.sellPx > 0)) return false
    // The exit has to stay one step towards the win from the entry.
    if (!readyWhen(direction, level.sellPx, level.buyPx)) return false
    // An entry the price has already passed would fire on this pass. An entry
    // exactly AT the price is the old winning edge becoming the new nearest
    // level when the last rung closes. It moves with the range, but starts
    // unready so the same boundary cannot close and open in one move.
    if (readyWhen(direction, level.buyPx, mark)) return false
    if (level.sz <= 0 || level.sz * level.buyPx < plan.minOrderValueUsd)
      return false
  }

  const top = roundPx(moved.topPx)
  const bottom = roundPx(moved.bottomPx)
  if (!(top > bottom) || !(bottom > 0)) return false

  // A second move must not shake the first traded price's next-rung
  // requirement off. Carry each unfinished requirement by price as that price
  // moves one place in the newly drawn range.
  const rebuyAboveByPx = new Map<number, number>()
  for (const level of plan.levels) {
    if (level.status === "waiting" && level.rebuyAbove !== undefined) {
      rebuyAboveByPx.set(level.buyPx, level.rebuyAbove)
    }
  }
  plan.topPx = top
  plan.bottomPx = bottom
  for (const [index, level] of plan.levels.entries()) {
    level.buyPx = sized[index].buyPx
    level.sellPx = sized[index].sellPx
    level.sz = sized[index].sz
    if (level.status === "waiting") {
      level.armed = false
      const carriedRequirement = rebuyAboveByPx.get(level.buyPx)
      if (carriedRequirement !== undefined) {
        if (reachedExit(direction, mark, carriedRequirement)) {
          level.armed = true
          delete level.rebuyAbove
        } else {
          level.rebuyAbove = carriedRequirement
        }
      } else {
        delete level.rebuyAbove
      }
    }
  }
  const movedEdge = winEdgeLevel(plan)
  if (movedEdge?.status === "waiting") {
    movedEdge.rebuyAbove =
      movedEdge.rebuyAbove === undefined
        ? movedEdge.sellPx
        : winningSide(direction, movedEdge.rebuyAbove, movedEdge.sellPx)
  }
  plan.shifts += 1
  return true
}

/**
 * The level sitting on the winning edge of the range — the highest on a buying
 * grid, the lowest on a selling one.
 *
 * The array is always ordered lowest price first, so which end that is depends
 * on the direction and nothing else.
 */
function winEdgeLevel(plan: GridPlan): GridPlan["levels"][number] | undefined {
  return plan.direction === "long" ? plan.levels.at(-1) : plan.levels.at(0)
}

/**
 * Introduce one new level past the losing edge and leave the old winning-edge
 * level holding at its old exit. Every candidate number is checked before the
 * plan changes.
 *
 * The array stays ordered lowest price first, so which end gains the new level
 * and which end is carried away depends only on the direction:
 *
 * - Buying: the new level is the new bottom buy, at index 0, and every old
 *   level shifts one place up the array. The old top is carried.
 * - Selling: the new level is the new top sell, at the last index, and every
 *   old level shifts one place down. The old bottom is carried.
 */
function followTheRangeInto(
  plan: GridPlan,
  moved: { topPx: number; bottomPx: number },
  roundPx: (px: number) => number
): { moved: boolean; reason: string | null } {
  const direction = plan.direction
  const count = plan.levels.length
  const prices = gridLevels({
    topPx: moved.topPx,
    bottomPx: moved.bottomPx,
    levels: count,
    spacing: plan.spacing,
    direction,
  }).map((level) => ({
    buyPx: roundPx(level.buyPx),
    sellPx: roundPx(level.sellPx),
  }))
  const topPx = roundPx(moved.topPx)
  const bottomPx = roundPx(moved.bottomPx)
  if (
    prices.length !== count ||
    !(topPx > bottomPx) ||
    !(bottomPx > 0) ||
    prices.some(
      (level) =>
        !(level.buyPx > 0) ||
        !readyWhen(direction, level.sellPx, level.buyPx)
    )
  ) {
    return { moved: false, reason: NEXT_LEVEL_OFF_TICK }
  }

  // Where the fresh level lands, and where each old level moves to. A buying
  // grid pushes the array up by one; a selling grid pushes it down by one.
  const freshAt = direction === "long" ? 0 : count - 1
  const carriedAt = direction === "long" ? count - 1 : 0
  const shift = direction === "long" ? 1 : -1

  // Old level i becomes new level i + shift. If the exchange's price tick
  // prevents that exact overlap, moving would rewrite the prices old coins
  // traded at. Pause instead.
  for (let index = 0; index < count; index += 1) {
    if (index === carriedAt) continue
    const old = plan.levels[index]
    const next = prices[index + shift]
    if (old.buyPx !== next.buyPx || old.sellPx !== next.sellPx) {
      return { moved: false, reason: NEXT_LEVEL_OFF_TICK }
    }
  }

  const pot = plan.levels.reduce((sum, level) => sum + level.budget, 0)
  const shares = gridShares(count, plan.sizing)
  const sized = prices.map((level, index) => {
    const sz = floorSize(
      (pot * shares[index]) / level.buyPx,
      plan.sizeDecimals
    )
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
        "The next grid level is smaller than this market accepts. The grid paused before placing it.",
    }
  }

  const carriedLevel = plan.levels[carriedAt]
  const stopPx = gridStopPx(plan)
  const fresh = {
    buyPx: sized[freshAt].buyPx,
    sellPx: sized[freshAt].sellPx,
    sz: sized[freshAt].sz,
    budget: sized[freshAt].budget,
    heldSz: 0,
    status: "waiting" as const,
    armed: true,
    dead:
      stopPx !== null &&
      reachedEntry(direction, sized[freshAt].buyPx, stopPx),
    cycles: 0,
  }
  const nextLevels = [...plan.levels]
  for (let index = 0; index < count; index += 1) {
    if (index === carriedAt) continue
    const level = plan.levels[index]
    // The money split follows the level's new place in the active range.
    // Coins already held keep `heldSz`; this changes only the next cycle.
    nextLevels[index + shift] = {
      ...level,
      sz: sized[index + shift].sz,
      budget: sized[index + shift].budget,
    }
  }
  nextLevels[freshAt] = fresh

  if (carriedLevel.status === "holding" && carriedLevel.heldSz > 0) {
    plan.carriedLevels.push(carriedLevel)
  }
  plan.levels = nextLevels
  plan.topPx = topPx
  plan.bottomPx = bottomPx
  plan.downShifts += 1
  return { moved: true, reason: null }
}

/**
 * Closes the whole position and stops every level — the one exit that ends a
 * grid rather than cycling it. A buying grid sells here; a selling grid buys
 * back.
 *
 * The POSITION's size, never the sum of what the levels think they hold: the
 * position is the truth, and a hand-trade may have changed it. It is signed,
 * and a selling grid's is negative, so the order's size is its size either way
 * round.
 */
function closeEverything(
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
  const sz = held ? floorSize(Math.abs(held.szi), plan.sizeDecimals) : 0
  if (!held || sz <= 0) return
  const side = exitSide(plan.direction)
  deps.fill(book, {
    marketKey,
    side,
    px: slippedPx(mark, side, book.costs.slippageRate),
    sz,
    feeRate: book.costs.takerFeeRate,
    leverage: held.leverage,
    maxLeverage: plan.maxLeverage,
    reduceOnly: true,
    closePosition: true,
    reason: "order",
    at: now,
  })
}

/**
 * A level at or past the position's stop can never trade: price has to pass
 * the stop to reach it, and the stop ends the grid. It is drawn faded and
 * comes back the moment the stop sits clear of it again.
 */
function reconcileDeadLevels(plan: GridPlan, stopPx: number | null): boolean {
  let changed = false
  for (const level of plan.levels) {
    // Only a watching level can be dead. One that is holding has already
    // opened, and the stop will close it with everything else.
    const dead =
      level.status === "waiting" &&
      stopPx !== null &&
      reachedEntry(plan.direction, level.buyPx, stopPx)
    if (dead === level.dead) continue
    level.dead = dead
    changed = true
  }
  return changed
}
