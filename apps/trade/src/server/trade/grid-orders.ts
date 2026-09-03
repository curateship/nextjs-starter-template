import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { MIN_ORDER_USD } from "@/lib/trade/dca"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridEndAfterRangeMove,
  gridEndPx,
  gridLevelSize,
  gridLevels,
  gridLevelPctsFromRows,
  gridLiquidationPx,
  gridOrderPlan,
  gridRangeAfterMove,
  gridRangeEndMovable,
  gridRangeReshapable,
  gridRowPctsFromLevels,
  gridRungNumber,
  gridStepPct,
  gridStopBeyond,
  gridStopPx,
  heldWrongWay,
  holdsEntry,
  reachedEntry,
  reachedExit,
  readyWhen,
  winEdge,
  GRID_STEP_FEE_MULTIPLE,
  type GridLevelState,
  type GridParams,
  type GridPlan,
  type GridRangeMove,
  type GridStop,
} from "@/lib/trade/grid"
import { paperAccountFigures } from "@/lib/trade/paper"
import { readSmartPlan, type SmartGrid } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
import {
  cancelGridLevelPlan,
  cancelGridRestPlan,
  moveGridExitPlan,
  setGridFollowPlan,
  updateGridEndPlan,
  updateGridStopPlan,
} from "@/server/trade/smart-order-actions"
import {
  exposedMarketKeys,
  marksForKeys,
  settleWallet,
} from "@/server/trade/paper"
import {
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import { assertSmartOrderPlacable } from "./smart-pairing"
import { assertFlowRunAcceptingPlacements } from "@/server/trade/flow-run-orders"

/**
 * Placing and steering grid orders — the actions behind the right-click
 * window. The engine half, what a grid does as price moves, lives in
 * `smart-grids.ts` and runs inside every settle.
 *
 * Placement is all-or-nothing: every level big enough to be an order, the step
 * wide enough to clear the fee, the whole cost within the free cash, the order
 * cap. A grid that is refused places nothing. The browser never sends a size or
 * a level price — the server derives every number from the same arithmetic the
 * window used — so a wrong one cannot be sent.
 */

export type PlaceGridInput = {
  marketKey: string
  /** The top of the range, and the bottom. Both come from the window. */
  topPx: number
  bottomPx: number
  params: GridParams
  /** The switched-on flow placing this grid, or absent for a hand placement. */
  flowRunId?: string
}

export type PlacedGrid = {
  /** How many levels the grid has. */
  levels: number
  /** Dollars of coin the whole grid controls if every level buys. */
  totalCost: number
  /**
   * The grid exactly as it was written down, so the chart can draw it in the
   * same frame the window closes.
   *
   * Without it there is a gap: the window clears its preview lines as it goes,
   * and the real grid only arrives on the next read, which waits on an exchange
   * round trip. The grid vanished off the chart and came back a second later.
   */
  grid: SmartGrid
}

/**
 * Everything a grid needs to be worked out, with nothing that reaches a
 * database, a clock or the exchange. Handed in so the same arithmetic can serve
 * the right-click window and, one day, a replay of last March.
 */
export type GridDraftInput = {
  marketKey: string
  params: GridParams
  topPx: number
  bottomPx: number
  /** Today's price for this market. */
  mark: number
  rules: {
    sizeDecimals: number | null
    priceTick: number | null
    minOrderValueUsd?: number | null
    maxLeverage: number | null
    volume24hUsd: number | null
  }
  roundPx: (px: number) => number
  /** What the whole account is worth, which is what the pot is a share of. */
  equity: number
  /** What one side of a round trip costs, for the step-versus-fee check. */
  takerFeeRate: number
  /** When this grid is being created, in epoch ms. */
  startedAt?: number
  /** What is already held in this market, or null when nothing is. */
  held: { szi: number; leverage: number } | null
}

export type GridDraft = {
  plan: GridPlan
  levels: GridLevelState[]
  /** Dollars of coin the whole grid controls if every level buys. */
  totalCost: number
}

/**
 * The grid a set of settings describes, and every reason it might be refused.
 *
 * Its own function for the same reason `draftDcaLadder` is: the window and the
 * server must never disagree about what was drawn. Throws the refusal codes;
 * the API layer owns the sentences.
 */
export function draftGridOrder(input: GridDraftInput): GridDraft {
  const { params, rules, roundPx, mark } = input
  const direction = params.direction

  const topPx = roundPx(input.topPx)
  const bottomPx = roundPx(input.bottomPx)
  if (!(topPx > 0) || !(bottomPx > 0) || !(topPx > bottomPx)) {
    throw new Error("SMART_GRID_RANGE")
  }
  const range = { topPx, bottomPx }

  // A hand-set grid: one typed weight per level, each its own share of
  // the pot. A list whose length drifted from the level count would guess
  // order sizes. The weights can total anything positive; the shared plan
  // scales them to the complete pot.
  if (params.manualSizing) {
    if (
      params.manualRungPcts === null ||
      params.manualRungPcts.length !== params.levels
    ) {
      throw new Error("SMART_GRID_RUNG_COUNT")
    }
  }

  // A grid STRADDLES the price. That is the whole shape of it: the levels on
  // one side close what it holds, the ones on the other wait for a move, and
  // it earns from price crossing back and forth between them.
  //
  // This used to refuse a range with the price inside it, which is a DCA
  // ladder's rule — a ladder hangs below a level and buys a fall. Applied to a
  // grid it forced the whole range under the price, where the top half could
  // never do anything until price fell into it, and it made every grid you
  // placed sit off the bottom of the chart.
  //
  // A grid the wrong way round on top of a hand-held position is refused: a
  // buying grid on a short would only shrink the short, and a selling grid on
  // a long would only shrink the long. Either way the levels would trade
  // against the position instead of building one.
  if (input.held !== null && heldWrongWay(direction, input.held.szi)) {
    throw new Error(
      direction === "long" ? "SMART_SHORT_HELD" : "SMART_LONG_HELD"
    )
  }

  const maxLeverage = rules.maxLeverage ?? 1
  // One exchange position has one borrowing setting. A grid added beside a
  // hand-held position on the same side must size and report itself with the
  // number already fixed on that position, because later trades cannot change
  // it.
  const leverage =
    input.held !== null && holdsEntry(direction, input.held.szi)
      ? input.held.leverage
      : rules.maxLeverage === null
        ? params.leverage
        : Math.min(params.leverage, rules.maxLeverage)
  const drawn = gridOrderPlan({
    topPx,
    bottomPx,
    equity: input.equity,
    params: { ...params, leverage },
    sizeDecimals: rules.sizeDecimals,
    volume24hUsd: rules.volume24hUsd,
  })
  if (drawn.levels.length === 0) throw new Error("SMART_GRID_RANGE")

  // The step has to be worth more than the round trip costs.
  //
  // No ladder needs this check: a ladder's exit is a whole percent or more. A
  // grid's exit is a range divided by a dozen, and it lands under the fee
  // without looking wrong at all — twenty levels across a 4% range is a 0.2%
  // step, and two fees eat it. Left out, the grid trades all day to lose money
  // slowly, which is the most expensive kind of bug this file could have.
  if (drawn.stepPct <= input.takerFeeRate * GRID_STEP_FEE_MULTIPLE) {
    throw new Error("SMART_GRID_STEP_TOO_THIN")
  }

  let totalCost = 0
  const orderFloor = rules.minOrderValueUsd ?? MIN_ORDER_USD
  const priced = drawn.levels.map((level, index) => {
    const buyPx = roundPx(level.buyPx)
    const sellPx = roundPx(level.sellPx)
    const sz = level.sz
    if (
      !(buyPx > 0) ||
      !(sellPx > 0) ||
      !readyWhen(direction, sellPx, buyPx) ||
      sz <= 0 ||
      buyPx * sz < orderFloor
    ) {
      // A hand-set grid names the RUNG that was typed, not the level. Rung 1
      // is the first trade the grid makes — the top of the range on a buying
      // grid, the bottom on a selling one — so the wrong number sends somebody
      // to fix a box that was never the problem.
      throw new Error(
        params.manualSizing
          ? `SMART_GRID_RUNG_TOO_SMALL:${gridRungNumber(index, drawn.levels.length, direction)}`
          : `SMART_GRID_LEVEL_TOO_SMALL:${index + 1}`
      )
    }
    totalCost += buyPx * sz
    return { buyPx, sellPx, sz }
  })

  // End Grid starts past both the market and the range, on the winning side. A
  // range can sit on the far side of today's price, so measuring from its own
  // edge alone would put the ending behind the market and close the grid on
  // the pass that placed it.
  const targetPx =
    params.takeProfitPct === null
      ? null
      : roundPx(gridEndPx(direction, range, mark, params.takeProfitPct))
  if (targetPx !== null && reachedExit(direction, mark, targetPx)) {
    throw new Error("SMART_GRID_TARGET_PASSED")
  }

  // **The refusal a selling grid turns on.**
  //
  // A coin bought at $100 can only fall to zero, so a buying grid's worst case
  // is bounded and its stop can always be reached. A coin sold at $100 has no
  // ceiling — at $300 you owe $200 for every $100 you sold — and with
  // borrowing the exchange closes the position out before the stop ever fires.
  // A stop the exchange gets to first is not a stop.
  //
  // Worked out on the worst case: every level filled. Refused before anything
  // is placed, never warned about.
  const plannedStopPx =
    params.stopLoss === null
      ? null
      : roundPx(gridStopBeyond(direction, range, params.stopLoss.underPct))
  // Which of the two switches walks this grid towards its loss. Named here
  // because the frozen stop below and the engine both turn on it.
  const followsIntoLoss =
    direction === "long" ? params.followDown : params.follow
  if (direction === "short" && plannedStopPx !== null) {
    const liq = gridLiquidationPx({
      direction,
      levels: priced,
      leverage,
      maxLeverage,
    })
    // The stop sitting at or past the close-out price, read the same way a
    // level being reached is read: price arriving from the winning side.
    if (liq !== null && reachedEntry(direction, plannedStopPx, liq)) {
      throw new Error("SMART_GRID_STOP_PAST_LIQUIDATION")
    }
  }

  // **Placing a grid trades nothing.** Every level waits its turn, wherever the
  // price is and whatever the range straddles.
  //
  // A level on the far side of the price used to start out holding, with every
  // one of them opened in a single market order at whatever the price happened
  // to be. That gave the furthest level a round trip out of a price it had
  // never traded, and left the account at its biggest at the exact moment a
  // grid is supposed to be sitting on its hands. One big lump is not a grid,
  // the same way one big lump is not a ladder.
  //
  // `armed` is what replaces it: a level price has already passed may open the
  // moment price reaches it, and a level price has not passed waits for price
  // to go by and come back. Then it opens at ITS OWN price, like every other
  // one.
  const levels: GridLevelState[] = priced.map((level) => ({
    buyPx: level.buyPx,
    sellPx: level.sellPx,
    sz: level.sz,
    // Frozen here and never recalculated. This is the ceiling every future
    // cycle is held to — a grid level recycles forever, so a level allowed
    // to carry a cheap round's leftover would compound on every round trip.
    budget: level.buyPx * level.sz,
    heldSz: 0,
    status: "waiting" as const,
    armed: readyWhen(direction, mark, level.buyPx),
    dead: false,
    cycles: 0,
  }))

  // Nothing is checked against the free cash here. Nothing is reserved and
  // nothing is spent: every level is a trigger that pays for itself at the
  // moment price reaches it. A grid that plans more than the account holds
  // today is not wrong, it is a plan for a market that has not happened, and a
  // level that cannot be afforded when its turn comes waits for the next pass.

  const plan: GridPlan = {
    direction,
    reverseWhenStopped: params.reverseWhenStopped,
    reversedFrom: null,
    reverseFailReason: null,
    topPx,
    bottomPx,
    takeProfitPx: targetPx,
    takeProfitPct: params.takeProfitPct,
    spacing: params.spacing,
    sizing: params.sizing,
    manualSizing: params.manualSizing,
    // The settings speak in the card's rows, top of the range first; the plan
    // and the engine speak in level order. Turned round exactly once, here.
    manualRungPcts:
      params.manualSizing && params.manualRungPcts
        ? gridLevelPctsFromRows(params.manualRungPcts)
        : null,
    potPct: params.potPct,
    startedAt: input.startedAt ?? 0,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    minOrderValueUsd: orderFloor,
    leverage,
    maxLeverage,
    levels,
    carriedLevels: [],
    stopLoss: params.stopLoss
      ? {
          // A grid that follows price INTO its loss must not move its loss
          // limit along with it. Freeze the stop where placement put it. That
          // is the "follow down" switch on a buying grid and the "follow up"
          // switch on a selling one.
          mode: followsIntoLoss ? "fixed" : "percent",
          underPct: params.stopLoss.underPct,
          px: followsIntoLoss ? plannedStopPx : null,
          base: params.stopLoss.base,
        }
      : null,
    maxOrderVolPct: params.maxOrderVolPct,
    baseDetection: params.baseDetection,
    baseWatch: null,
    aimedSlPx: null,
    pairedStop: null,
    seenFillsTo: 0,
    cycles: 0,
    follow: params.follow,
    followDown: params.followDown,
    // Whether the range is in play from the start. A straddling grid is; one
    // hung entirely clear of the price is waiting for a move, and follow must
    // not touch it until price actually comes to it — see the schema.
    entered: reachedEntry(direction, mark, winEdge(direction, range)),
    shifts: 0,
    downShifts: 0,
    closedReason: null,
  }

  return { plan, levels, totalCost }
}

export async function placeGridOrder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("PAPER_MARKET")
  }
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  // Any kind of smart order, not just another grid — with one exception. A
  // live grid may sit above a DCA ladder when its stop clears the ladder's
  // first buy; everything else fights over the one position's stop, and a
  // practice wallet cannot hold two stops at all.
  await assertSmartOrderPlacable(userId, wallet, input.marketKey, {
    kind: "grid",
  })

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)

  const keys = await exposedMarketKeys(userId, [wallet.id])
  const marks = await marksForKeys([...new Set([...keys, input.marketKey])])
  const mark = marks.get(input.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  const book = await settleWallet(userId, wallet, { marks })

  const figures = paperAccountFigures({
    startingBalance: wallet.startingBalance,
    realized: book.cash - wallet.startingBalance,
    positions: [...book.positions.values()],
    marks,
  })

  const now = Date.now()
  const id = randomUUID()
  const { plan, levels } = draftGridOrder({
    marketKey: input.marketKey,
    params: input.params,
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    mark,
    rules,
    roundPx,
    equity: input.params.compound ? figures.equity : wallet.startingBalance,
    takerFeeRate: book.costs.takerFeeRate,
    startedAt: now,
    held: book.positions.get(input.marketKey) ?? null,
  })

  await db.transaction(async (tx) => {
    // The same lock every settle takes, so a poll mid-placement waits its turn.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    // Re-checked under the lock: two tabs placing at once must not both win.
    // This is also where the pairing rules see the drawn grid's own stop.
    await assertSmartOrderPlacable(
      userId,
      wallet,
      input.marketKey,
      { kind: "grid", plan },
      tx
    )
    if (input.flowRunId) {
      await assertFlowRunAcceptingPlacements(
        tx,
        userId,
        input.flowRunId,
        input.marketKey
      )
    }

    // Nothing is bought here, on purpose. Placing a grid spends nothing at all:
    // every level waits for price to reach it and pays its own way then.
    //
    // This used to buy the coins for every level above the price, in one market
    // order, and the whole comment here was about the races that created. There
    // are no races left, because there is no order.

    await tx.insert(tradeSmartLadders).values({
      userId,
      id,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "grid",
      status: "active",
      plan,
      flowRunId: input.flowRunId ?? null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
  })

  // One more settle puts the new grid in front of the engine straight away, so
  // a level the price is already sitting on is acted on now rather than on the
  // next poll.
  await settleWallet(userId, wallet, { marks })

  return {
    levels: levels.length,
    totalCost: levels.reduce((sum, level) => sum + level.budget, 0),
    grid: {
      id,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "grid",
      status: "active",
      flowRunId: input.flowRunId ?? null,
      createdAt: now,
      updatedAt: now,
      plan,
    },
  }
}

// ----- Steering a live grid -----------------------------------------------

export type GridRowRecord = {
  id: string
  marketKey: string
  status: "active" | "done"
  plan: GridPlan
  /** Carried so a move can hand the whole row back — see `MovedGrid`. */
  flowRunId: string | null
  createdAt: number
}

/**
 * A move or re-shape's answer: the grid exactly as it was just saved.
 *
 * Handing the row back is what lets the chart show the saved grid the moment
 * the drag ends, without re-reading the whole portfolio — the browser holds
 * this copy on screen until the next ordinary poll carries the same thing.
 */
export type MovedGrid = {
  moved: true
  grid: SmartGrid
}

export async function gridById(
  userId: string,
  walletId: string,
  gridId: string
): Promise<GridRowRecord> {
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, gridId)
      )
    )
    .limit(1)
  const row = rows[0]
  const plan =
    row && row.status === "active" && row.kind === "grid"
      ? (readSmartPlan("grid", row.plan) as GridPlan | null)
      : null
  if (!row || !plan) throw new Error("SMART_GRID_NOT_FOUND")
  return {
    id: row.id,
    marketKey: row.marketKey,
    status: row.status,
    plan,
    flowRunId: row.flowRunId ?? null,
    createdAt: row.createdAt.getTime(),
  }
}

/** The moved grid as one row the chart can draw — see `MovedGrid`. */
export function movedGrid(
  walletId: string,
  grid: GridRowRecord,
  plan: GridPlan,
  updatedAt: number
): MovedGrid {
  return {
    moved: true,
    grid: {
      id: grid.id,
      walletId,
      marketKey: grid.marketKey,
      kind: "grid",
      status: "active",
      flowRunId: grid.flowRunId,
      createdAt: grid.createdAt,
      updatedAt,
      plan,
    },
  }
}

export async function saveGridPlan(
  userId: string,
  gridId: string,
  plan: GridPlan,
  status: "active" | "done",
  /**
   * The save's moment, when the caller also hands the row back to the
   * browser. The row in the database and the copy the browser holds must
   * carry the SAME stamp, or the browser reads the poll's copy as older than
   * its own and keeps the hold long after the two agree.
   */
  at?: number
): Promise<void> {
  const saved = await db
    .update(tradeSmartLadders)
    .set({
      plan,
      status,
      updatedAt: at === undefined ? new Date() : new Date(at),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, gridId),
        // A close may land while an edit is saving a copy read one pass ago.
        // Once the close marks the row done, that older copy must stay old.
        eq(tradeSmartLadders.status, "active")
      )
    )
    .returning({ id: tradeSmartLadders.id })
  if (saved.length === 0) throw new Error("SMART_GRID_FINISHED")
}

/** Calling off one waiting level — its × on the chart. It never comes back. */
export async function cancelGridLevel(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; levelIndex: number }
): Promise<void> {
  await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  cancelGridLevelPlan(grid.plan, input.levelIndex)
  await saveGridPlan(userId, grid.id, grid.plan, "active")
  await settleWallet(userId, wallet)
}

/** Stop the grid buying: every waiting level is called off, holdings stay. */
export async function cancelGridRest(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string }
): Promise<{ cancelled: number }> {
  await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)

  const cancelled = cancelGridRestPlan(grid.plan)
  await saveGridPlan(userId, grid.id, grid.plan, "active")
  await settleWallet(userId, wallet)
  return { cancelled }
}

/**
 * Changing a live grid's stop — the one edit that is always safe, because the
 * stop only ever ends the grid early.
 *
 * The range itself is deliberately not editable. Every level's price and budget
 * was frozen at placement, exactly as a ladder's rungs are, and re-pricing them
 * under a position already open would leave a grid whose levels no longer
 * relate to what it paid.
 */
export async function updateGridStop(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; stopLoss: GridStop; reverseWhenStopped?: boolean }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  updateGridStopPlan(plan, input.stopLoss, input.reverseWhenStopped)

  // Write the new stop onto the position right now, and remember exactly what
  // was written — anything else there later means a hand moved it.
  const position = book.positions.get(grid.marketKey) ?? null
  let slPx: number | null = null
  if (position && holdsEntry(plan.direction, position.szi)) {
    const wanted = gridStopPx(plan)
    slPx = wanted === null ? null : roundPx(wanted)
    await db
      .update(tradePaperPositions)
      .set({ slPx, updatedAt: new Date() })
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          eq(tradePaperPositions.walletId, wallet.id),
          eq(tradePaperPositions.marketKey, grid.marketKey)
        )
      )
  }
  plan.aimedSlPx = slPx

  await saveGridPlan(userId, grid.id, plan, "active")
  // The next settle wakes levels from under a raised stop, and fades the ones
  // under a lowered one.
  await settleWallet(userId, wallet)
}

/**
 * Switching following on or off for a grid that is already running.
 *
 * Its own action rather than a shape of `reshapeGrid`, because it changes
 * nothing about where the grid sits: a re-shape redraws every level and settles
 * the position to match, which is a great deal of work and a real market order
 * to flip one flag.
 *
 * The End Grid line stays at its fixed price while the range follows. The
 * engine checks the line before it moves the range, so reaching the line ends
 * the grid instead of carrying the range past it.
 */
export async function setGridFollow(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; follow: boolean; followDown?: boolean }
): Promise<void> {
  // Settled first, like every other action here. A pass already running holds
  // the wallet lock and writes the whole plan when it finishes, so reading
  // around one means writing this flag onto a plan that is about to be
  // replaced — and the switch silently springs back.
  await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  // Switching on the follow that walks INTO the loss freezes the stop where it
  // stands. On a buying grid that is following down; on a selling grid it is
  // following up.
  setGridFollowPlan(grid.plan, input)
  await saveGridPlan(userId, grid.id, grid.plan, "active")
  // And again on the way out, so a range already past its top starts following
  // now rather than on the next poll.
  await settleWallet(userId, wallet)
}

/** Switch End Grid on or off, or change how far above price it waits. */
export async function updateGridEnd(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; abovePct: number | null }
): Promise<MovedGrid> {
  await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan

  const mark =
    input.abovePct === null
      ? null
      : ((await marksForKeys([grid.marketKey])).get(grid.marketKey) ?? null)
  const protocol = getProtocol(wallet.protocol)
  updateGridEndPlan(plan, input.abovePct, mark, (px) =>
    protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)
  )

  const at = Date.now()
  await saveGridPlan(userId, grid.id, plan, "active", at)
  return movedGrid(wallet.id, grid, plan, at)
}

/** What a window may change about how a running grid is sliced. */
export type ReshapeGridShape = {
  levels?: number
  potPct?: number
  leverage?: number
  manualSizing?: boolean
  manualRungPcts?: number[]
}

export type MoveGridRangeInput = GridRangeMove & {
  gridId: string
}

/**
 * Which split a re-shaped grid is redrawn on, from what the window sent and
 * what the grid already had.
 *
 * **The fallback to the grid's own weights is what makes a hand-set grid
 * survive a range drag.** Dragging the range on the chart sends one edge and
 * nothing about sizing through this same door, so without the fallback it would
 * come back split evenly and the shape somebody typed would be gone with no
 * warning. Shared by the practice and the live path so the two cannot drift.
 *
 * A window that asks for hand-set rungs and sends none is refused by
 * `draftGridOrder`, out loud, rather than quietly falling back to even.
 */
export function reshapedGridSplit(
  plan: Pick<
    GridPlan,
    "manualSizing" | "manualRungPcts" | "levels" | "direction"
  >,
  input: ReshapeGridShape
): { manualSizing: boolean; manualRungPcts: number[] | null; levels: number } {
  const manualSizing = input.manualSizing ?? plan.manualSizing
  if (!manualSizing) {
    return {
      manualSizing: false,
      manualRungPcts: null,
      levels: input.levels ?? plan.levels.length,
    }
  }
  // What the window sends is the card's rows. What the grid has stored is
  // level order, so a drag that sends no shares turns them back round.
  const manualRungPcts =
    input.manualRungPcts ??
    (plan.manualRungPcts ? gridRowPctsFromLevels(plan.manualRungPcts) : null)
  return {
    manualSizing: true,
    manualRungPcts,
    // The rows ARE the level count on a hand-set grid.
    levels: manualRungPcts?.length ?? input.levels ?? plan.levels.length,
  }
}

/**
 * Compress or expand a grid around its one open entry.
 *
 * The entry price and the money assigned to every level stay fixed. Waiting
 * levels take their new prices and re-size from those same budgets. The open
 * level keeps its actual coins and entry, while its exit moves with the new
 * spacing. This is deliberately separate from re-slicing, which changes the
 * level count or money and still requires a flat grid.
 */
export function gridPlanAfterRangeMove(input: {
  plan: GridPlan
  move: Omit<MoveGridRangeInput, "gridId">
  mark: number
  roundPx: (px: number) => number
  takerFeeRate: number
}): GridPlan {
  const { plan, move, mark, roundPx } = input
  if (move.end === "whole") {
    throw new Error("SMART_GRID_WHOLE_FIXED")
  }
  if (!gridRangeEndMovable(plan, move.end)) {
    throw new Error("SMART_GRID_RANGE_FIXED")
  }

  const moved = gridRangeAfterMove(plan, {
    end: move.end,
    px: roundPx(move.px),
  })
  if (!moved) throw new Error("SMART_GRID_RANGE")
  const topPx = roundPx(moved.topPx)
  const bottomPx = roundPx(moved.bottomPx)
  if (!(topPx > bottomPx) || !(bottomPx > 0)) {
    throw new Error("SMART_GRID_RANGE")
  }

  const prices = gridLevels({
    topPx,
    bottomPx,
    levels: plan.levels.length,
    spacing: plan.spacing,
    direction: plan.direction,
  }).map((level, index) => ({
    // An open level is the fixed point. Rounding the two outer prices can
    // otherwise move the derived middle price by one market tick.
    buyPx:
      plan.levels[index].status === "holding"
        ? plan.levels[index].buyPx
        : roundPx(level.buyPx),
    sellPx: roundPx(level.sellPx),
  }))
  if (
    prices.length !== plan.levels.length ||
    prices.some(
      (level) =>
        !(level.buyPx > 0) ||
        !readyWhen(plan.direction, level.sellPx, level.buyPx)
    )
  ) {
    throw new Error("SMART_GRID_RANGE")
  }
  if (gridStepPct(prices) <= input.takerFeeRate * GRID_STEP_FEE_MULTIPLE) {
    throw new Error("SMART_GRID_STEP_TOO_THIN")
  }

  const levels = plan.levels.map((level, index): GridLevelState => {
    const price = prices[index]
    if (level.status === "holding") {
      return { ...level, sellPx: price.sellPx }
    }
    if (level.status === "cancelled") {
      return { ...level, buyPx: price.buyPx, sellPx: price.sellPx }
    }

    const { rebuyAbove: _rebuyAbove, ...waiting } = level
    const repriced = { ...waiting, buyPx: price.buyPx, sellPx: price.sellPx }
    const sz = gridLevelSize(repriced, plan.sizeDecimals)
    if (sz <= 0 || price.buyPx * sz + 1e-9 < plan.minOrderValueUsd) {
      throw new Error(
        plan.manualSizing
          ? `SMART_GRID_RUNG_TOO_SMALL:${gridRungNumber(index, plan.levels.length, plan.direction)}`
          : `SMART_GRID_LEVEL_TOO_SMALL:${index + 1}`
      )
    }
    return {
      ...repriced,
      sz,
      armed: readyWhen(plan.direction, mark, price.buyPx),
    }
  })

  const next: GridPlan = {
    ...plan,
    topPx,
    bottomPx,
    levels,
    takeProfitPx: (() => {
      const px = gridEndAfterRangeMove(plan, { topPx, bottomPx }, mark)
      return px === null ? null : roundPx(px)
    })(),
  }
  const stopPx = gridStopPx(next)
  if (next.direction === "short" && stopPx !== null) {
    const liquidationPx = gridLiquidationPx({
      direction: next.direction,
      levels: next.levels,
      leverage: next.leverage,
      maxLeverage: next.maxLeverage,
    })
    if (
      liquidationPx !== null &&
      reachedEntry(next.direction, stopPx, liquidationPx)
    ) {
      throw new Error("SMART_GRID_STOP_PAST_LIQUIDATION")
    }
  }
  next.levels = next.levels.map((level) => ({
    ...level,
    dead:
      level.status === "waiting" &&
      stopPx !== null &&
      reachedEntry(plan.direction, level.buyPx, stopPx),
  }))
  return next
}

/**
 * Re-shaping a grid: a new range, a new level count, a new share of the
 * account, or any mix of them.
 *
 * One function for all of it because they are one operation. Every one of them
 * redraws the levels from scratch through the same planner that drew the first
 * ones — so a re-shaped grid is exactly the grid you would have placed with
 * those settings, including every refusal — and then settles the position to
 * whatever the new levels need. Nothing is left describing a price or a size it
 * did not pay.
 *
 * Anything not given keeps what the grid already had.
 *
 * Re-slicing remains limited to a flat grid. A price-only move may compress or
 * expand around one open entry through `gridPlanAfterRangeMove`.
 *
 * The new levels are drawn by the SAME planner that drew the first ones, with
 * the settings the grid was placed with, so a moved grid is exactly the grid
 * you would have placed there — including every refusal.
 */
export async function reshapeGrid(
  userId: string,
  wallet: TradeWallet,
  input: ReshapeGridShape & {
    gridId: string
    rangeMove?: Omit<MoveGridRangeInput, "gridId">
  }
): Promise<MovedGrid> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan
  const canReshape = gridRangeReshapable(plan)
  const changesSlices =
    input.levels !== undefined ||
    input.potPct !== undefined ||
    input.leverage !== undefined ||
    input.manualSizing !== undefined ||
    input.manualRungPcts !== undefined
  if (!canReshape && (!input.rangeMove || changesSlices)) {
    throw new Error("SMART_GRID_STARTED")
  }

  const ref = parseMarketKey(grid.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")
  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)

  const marks = await marksForKeys([grid.marketKey])
  const mark = marks.get(grid.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  const figures = paperAccountFigures({
    startingBalance: wallet.startingBalance,
    realized: book.cash - wallet.startingBalance,
    positions: [...book.positions.values()],
    marks,
  })

  let next: GridPlan
  if (!canReshape && input.rangeMove) {
    next = gridPlanAfterRangeMove({
      plan,
      move: input.rangeMove,
      mark,
      roundPx,
      takerFeeRate: book.costs.takerFeeRate,
    })
  } else {
    const movedRange = input.rangeMove
      ? gridRangeAfterMove(plan, input.rangeMove)
      : null
    if (input.rangeMove && !movedRange) throw new Error("SMART_GRID_RANGE")
    const split = reshapedGridSplit(plan, input)
    const draft = draftGridOrder({
      marketKey: grid.marketKey,
      params: {
        // Frozen at placement. A re-shape redraws the prices; it never turns
        // the grid round, because the levels belong to one side.
        direction: plan.direction,
        levels: split.levels,
        // A re-shape keeps the plan's prices; the window's gap is not part of it.
        rungGapPct: null,
        potPct: input.potPct ?? plan.potPct,
        compound: true,
        leverage: input.leverage ?? plan.leverage,
        maxOrderVolPct: plan.maxOrderVolPct,
        spacing: plan.spacing,
        sizing: plan.sizing,
        manualSizing: split.manualSizing,
        manualRungPcts: split.manualRungPcts,
        follow: plan.follow,
        followDown: plan.followDown,
        // Only read when the window pre-fills; a re-shape has its own prices.
        anchor: "price",
        abovePct: DEFAULT_GRID_ABOVE_PCT,
        rangePct: DEFAULT_GRID_BELOW_PCT,
        baseDetection: plan.baseDetection,
        stopLoss: plan.stopLoss
          ? { underPct: plan.stopLoss.underPct, base: plan.stopLoss.base }
          : null,
        takeProfitPct: null,
        reverseWhenStopped: plan.reverseWhenStopped,
      },
      topPx: movedRange?.topPx ?? plan.topPx,
      bottomPx: movedRange?.bottomPx ?? plan.bottomPx,
      mark,
      rules,
      roundPx,
      equity: figures.equity,
      takerFeeRate: book.costs.takerFeeRate,
      startedAt: plan.startedAt,
      held: book.positions.get(grid.marketKey) ?? null,
    })

    // Everything about the grid except where it sits is carried over: the stop
    // it was given, what it has seen, and when it started.
    next = {
      ...draft.plan,
      stopLoss: plan.stopLoss,
      // Keep the chosen distance past whichever is already further into a win:
      // the moved range or today's price.
      takeProfitPx: (() => {
        const px = gridEndAfterRangeMove(plan, draft.plan, mark)
        return px === null ? null : roundPx(px)
      })(),
      takeProfitPct: plan.takeProfitPct,
      baseWatch: plan.baseWatch,
      aimedSlPx: plan.aimedSlPx,
      seenFillsTo: plan.seenFillsTo,
      // A move re-prices the levels; it does not reset the grid's history.
      cycles: plan.cycles,
      shifts: plan.shifts,
      downShifts: plan.downShifts,
      carriedLevels: plan.carriedLevels,
      // A move re-prices levels; it does not forget which grid this one
      // continues, nor a refusal already written on it.
      reversedFrom: plan.reversedFrom,
      reverseFailReason: plan.reverseFailReason,
    }
  }

  // No orders are sent by a range move. The one held level keeps its entry and
  // coins; a flat grid redraws only waiting levels.
  const now = Date.now()
  await db.transaction(async (tx) => {
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    await tx
      .update(tradeSmartLadders)
      .set({ plan: next, status: "active", updatedAt: new Date(now) })
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.id, grid.id)
        )
      )
  })

  // Deliberately no settle on the way out. Dragging a line should answer at
  // once, and a settle is the expensive half of this call — it replays candles
  // and takes the wallet lock. The worker settles every second anyway, so the
  // only thing a settle here would buy is one second, at the cost of making
  // every drag feel slow.
  return movedGrid(wallet.id, grid, next, now)
}

/**
 * Dragging the take profit or the stop loss to a new price.
 *
 * Both stay draggable for the grid's whole life, unlike the range: they only
 * decide where it ends, so moving one can never leave a level out of step with
 * what it paid. Dragging writes an absolute price and stops the rule that was
 * following the range — putting a line by hand means you want it there.
 */
export async function moveGridExit(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; which: "takeProfit" | "stopLoss"; px: number }
): Promise<MovedGrid> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan
  const protocol = getProtocol(wallet.protocol)
  // Today's price decides whether a dragged stop may sit inside the range or
  // would fire at once — see `moveGridExitPlan`. Null lets only the
  // always-safe move through rather than blocking the drag altogether.
  const mark =
    input.which === "stopLoss"
      ? ((await marksForKeys([grid.marketKey])).get(grid.marketKey) ?? null)
      : null
  const { px, movedStop } = moveGridExitPlan(
    plan,
    input,
    mark,
    (value) =>
      protocol.markets.roundPx(value, plan.sizeDecimals, plan.priceTick),
    "PAPER_PRICE"
  )

  if (movedStop) {
    const position = book.positions.get(grid.marketKey) ?? null
    if (position && holdsEntry(plan.direction, position.szi)) {
      await db
        .update(tradePaperPositions)
        .set({ slPx: px, updatedAt: new Date() })
        .where(
          and(
            eq(tradePaperPositions.userId, userId),
            eq(tradePaperPositions.walletId, wallet.id),
            eq(tradePaperPositions.marketKey, grid.marketKey)
          )
        )
      plan.aimedSlPx = px
    }
  }

  const at = Date.now()
  await saveGridPlan(userId, grid.id, plan, "active", at)
  // No settle: see `moveGridRange`. The next pass, a second away, picks it up.
  return movedGrid(wallet.id, grid, plan, at)
}

/** Dragging an end of the range — one shape of `reshapeGrid`. */
export function moveGridRange(
  userId: string,
  wallet: TradeWallet,
  input: MoveGridRangeInput
): Promise<MovedGrid> {
  return reshapeGrid(userId, wallet, {
    gridId: input.gridId,
    rangeMove: { end: input.end, px: input.px },
  })
}
