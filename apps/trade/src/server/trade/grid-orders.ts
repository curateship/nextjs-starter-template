import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { MIN_ORDER_USD } from "@/lib/trade/dca"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridEndAfterRangeMove,
  gridEndPx,
  gridOrderPlan,
  gridRangeMovable,
  gridStopPx,
  gridStopUnder,
  GRID_STEP_FEE_MULTIPLE,
  type GridLevelState,
  type GridParams,
  type GridPlan,
  type GridStop,
} from "@/lib/trade/grid"
import { paperAccountFigures } from "@/lib/trade/paper"
import { readSmartPlan, type SmartGrid } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
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
}

export type PlacedGrid = {
  /** How many levels the grid has. */
  levels: number
  /** What the whole grid costs if every level buys at once. */
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
  /** What is already held in this market, signed, or null when nothing is. */
  heldSzi: number | null
}

export type GridDraft = {
  plan: GridPlan
  levels: GridLevelState[]
  /** What the whole grid costs if every level buys at once. */
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

  const topPx = roundPx(input.topPx)
  const bottomPx = roundPx(input.bottomPx)
  if (!(topPx > 0) || !(bottomPx > 0) || !(topPx > bottomPx)) {
    throw new Error("SMART_GRID_RANGE")
  }

  // A grid STRADDLES the price. That is the whole shape of it: the levels above
  // are sells of what it holds, the ones below are buys waiting for a dip, and
  // it earns from price crossing back and forth between them.
  //
  // This used to refuse a range with the price inside it, which is a DCA
  // ladder's rule — a ladder hangs below a level and buys a fall. Applied to a
  // grid it forced the whole range under the price, where the top half could
  // never do anything until price fell into it, and it made every grid you
  // placed sit off the bottom of the chart.
  if (input.heldSzi !== null && input.heldSzi < 0) {
    throw new Error("SMART_SHORT_HELD")
  }

  const drawn = gridOrderPlan({
    topPx,
    bottomPx,
    equity: input.equity,
    params,
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
      !(sellPx > buyPx) ||
      sz <= 0 ||
      buyPx * sz < orderFloor
    ) {
      throw new Error(`SMART_GRID_LEVEL_TOO_SMALL:${index + 1}`)
    }
    totalCost += buyPx * sz
    return { buyPx, sellPx, sz }
  })

  // End Grid starts above both the market and the range. A range can sit below
  // today's price, so measuring from its top alone would put the ending behind
  // the market and close the grid on the pass that placed it.
  const targetPx =
    params.takeProfitPct === null
      ? null
      : roundPx(gridEndPx(topPx, mark, params.takeProfitPct))
  if (targetPx !== null && mark >= targetPx) {
    throw new Error("SMART_GRID_TARGET_PASSED")
  }

  const maxLeverage = rules.maxLeverage ?? 1

  // **Placing a grid buys nothing.** Every level waits its turn, wherever the
  // price is and whatever the range straddles.
  //
  // A level above the price used to start out holding, with the coins for every
  // one of them bought in a single market order at whatever the price happened
  // to be. That gave the top level a round trip out of a price it had never
  // paid, and left the account at its most long at the exact moment a grid is
  // supposed to be sitting on its hands. One big lump is not a grid, the same
  // way one big lump is not a ladder.
  //
  // `armed` is what replaces it: a level under the price may buy the moment
  // price reaches it, and a level above the price waits for price to climb past
  // it and come back down. Then it buys at ITS OWN price, like every other one.
  const levels: GridLevelState[] = priced.map((level) => ({
    buyPx: level.buyPx,
    sellPx: level.sellPx,
    sz: level.sz,
    // Frozen here and never recalculated. This is the ceiling every future
    // cycle is held to — a grid level buys back forever, so a level allowed
    // to carry a cheap round's leftover would compound on every round trip.
    budget: level.buyPx * level.sz,
    heldSz: 0,
    status: "waiting" as const,
    armed: level.buyPx < mark,
    dead: false,
    cycles: 0,
  }))

  // Nothing is checked against the free cash here. Nothing is reserved and
  // nothing is spent: every level is a trigger that pays for itself at the
  // moment price reaches it. A grid that plans more than the account holds
  // today is not wrong, it is a plan for a market that has not happened, and a
  // level that cannot be afforded when its turn comes waits for the next pass.

  const plan: GridPlan = {
    topPx,
    bottomPx,
    takeProfitPx: targetPx,
    takeProfitPct: params.takeProfitPct,
    spacing: params.spacing,
    sizing: params.sizing,
    potPct: params.potPct,
    startedAt: input.startedAt ?? 0,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    minOrderValueUsd: orderFloor,
    maxLeverage,
    levels,
    carriedLevels: [],
    stopLoss: params.stopLoss
      ? {
          // A downward-following grid must not lower its loss limit as the
          // range moves. Freeze the stop where placement put it.
          mode: params.followDown ? "fixed" : "percent",
          underPct: params.stopLoss.underPct,
          px: params.followDown
            ? gridStopUnder(bottomPx, params.stopLoss.underPct)
            : null,
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
    // hung entirely below the price is waiting for a fall, and follow must
    // not touch it until price actually comes down to it — see the schema.
    entered: mark <= topPx,
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
    heldSzi: book.positions.get(input.marketKey)?.szi ?? null,
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
      flowRunId: null,
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
  await db
    .update(tradeSmartLadders)
    .set({
      plan,
      status,
      updatedAt: at === undefined ? new Date() : new Date(at),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, gridId)
      )
    )
}

/** Calling off one waiting level — its × on the chart. It never comes back. */
export async function cancelGridLevel(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; levelIndex: number }
): Promise<void> {
  await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const level = grid.plan.levels[input.levelIndex]
  if (!level) throw new Error("SMART_GRID_LEVEL_DONE")
  if (level.status !== "waiting") throw new Error("SMART_GRID_LEVEL_DONE")

  // Written explicitly, and this is the only thing that ever writes it. Every
  // other way a level stops watching leaves it `waiting` so the engine picks it
  // up again — being called off by hand is the one exit from the recycle.
  level.status = "cancelled"
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

  let cancelled = 0
  for (const level of grid.plan.levels) {
    if (level.status !== "waiting") continue
    level.status = "cancelled"
    cancelled += 1
  }
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
  input: { gridId: string; stopLoss: GridStop }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  plan.stopLoss = {
    mode: plan.followDown ? "fixed" : "percent",
    underPct: input.stopLoss.underPct,
    px: plan.followDown
      ? gridStopUnder(plan.bottomPx, input.stopLoss.underPct)
      : null,
    base: input.stopLoss.base,
  }

  // Write the new stop onto the position right now, and remember exactly what
  // was written — anything else there later means a hand moved it.
  const position = book.positions.get(grid.marketKey) ?? null
  let slPx: number | null = null
  if (position && position.szi > 0) {
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
  const turnDownOn = input.followDown === true && !grid.plan.followDown
  if (turnDownOn && grid.plan.stopLoss?.mode === "percent") {
    grid.plan.stopLoss = {
      ...grid.plan.stopLoss,
      mode: "fixed",
      px: gridStopPx(grid.plan),
    }
  }
  grid.plan.follow = input.follow
  if (input.followDown !== undefined) grid.plan.followDown = input.followDown
  if (input.follow) {
    // Switching following on BY HAND is a direct instruction, so the range
    // counts as in play from this moment — a range already past its top
    // catches up straight away. Only a follow choice remembered onto a NEW
    // grid placed below the price waits for price to reach it first.
    grid.plan.entered = true
  }
  await saveGridPlan(userId, grid.id, grid.plan, "active")
  // And again on the way out, so a range already past its top starts following
  // now rather than on the next poll.
  await settleWallet(userId, wallet)
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
 * Allowed only while nothing is held. See `gridRangeMovable` for why: a level
 * that is holding bought at its own price and sells one step above it, so
 * sliding the range under it would leave that level selling coins it never paid
 * that price for. Nothing is held for most of a grid's life, so most of the
 * time the range moves freely.
 *
 * The new levels are drawn by the SAME planner that drew the first ones, with
 * the settings the grid was placed with, so a moved grid is exactly the grid
 * you would have placed there — including every refusal.
 */
export async function reshapeGrid(
  userId: string,
  wallet: TradeWallet,
  input: {
    gridId: string
    topPx?: number
    bottomPx?: number
    levels?: number
    potPct?: number
  }
): Promise<MovedGrid> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan
  if (!gridRangeMovable(plan)) throw new Error("SMART_GRID_STARTED")

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

  const draft = draftGridOrder({
    marketKey: grid.marketKey,
    params: {
      levels: input.levels ?? plan.levels.length,
      potPct: input.potPct ?? plan.potPct,
      compound: true,
      maxOrderVolPct: plan.maxOrderVolPct,
      spacing: plan.spacing,
      sizing: plan.sizing,
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
    },
    topPx: input.topPx ?? plan.topPx,
    bottomPx: input.bottomPx ?? plan.bottomPx,
    mark,
    rules,
    roundPx,
    equity: figures.equity,
    takerFeeRate: book.costs.takerFeeRate,
    startedAt: plan.startedAt,
    heldSzi: book.positions.get(grid.marketKey)?.szi ?? null,
  })

  // Everything about the grid except where it sits is carried over — the stop
  // it was given, what it has seen, and when it started.
  const next: GridPlan = {
    ...draft.plan,
    stopLoss: plan.stopLoss,
    // Keep the chosen distance above whichever is higher now: the moved range
    // or today's price.
    takeProfitPx: (() => {
      const px = gridEndAfterRangeMove(plan, draft.plan.topPx, mark)
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
  }

  // No orders to cancel, none to place, and no position to settle. Every
  // redrawn level starts waiting and owns nothing, and `gridRangeMovable`
  // already refused this while anything was held — so there is nothing here
  // that could be left describing a price it did not pay.
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
  const px = protocol.markets.roundPx(
    input.px,
    plan.sizeDecimals,
    plan.priceTick
  )
  if (!(px > 0)) throw new Error("PAPER_PRICE")

  if (input.which === "takeProfit") {
    // Above the range, always. Inside it is where the grid is working, so a
    // target in there would close the grid on an ordinary swing.
    if (px <= plan.topPx) throw new Error("SMART_GRID_TARGET_IN_RANGE")
    plan.takeProfitPx = px
    // A hand-set line replaces the placement percentage. A later range move
    // carries its distance from the range instead of restoring the old setting.
    plan.takeProfitPct = undefined
  } else {
    // Below the range, for the mirror of the same reason.
    if (px >= plan.bottomPx) throw new Error("SMART_GRID_STOP_IN_RANGE")
    plan.stopLoss = {
      mode: "fixed",
      underPct: plan.stopLoss?.underPct ?? 0,
      px,
      base: null,
    }
    const position = book.positions.get(grid.marketKey) ?? null
    if (position && position.szi > 0) {
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
  input: { gridId: string; topPx: number; bottomPx: number }
): Promise<MovedGrid> {
  return reshapeGrid(userId, wallet, input)
}
