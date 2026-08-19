import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { MIN_ORDER_USD, floorSize } from "@/lib/trade/dca"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridOrderPlan,
  gridRangeMovable,
  gridStopPx,
  GRID_STEP_FEE_MULTIPLE,
  type GridLevelState,
  type GridParams,
  type GridPlan,
} from "@/lib/trade/grid"
import { paperAccountFigures, slippedPx } from "@/lib/trade/paper"
import { readSmartPlan } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketRules } from "@/server/trade/market-rules"
import {
  exposedMarketKeys,
  freeCash,
  marksForKeys,
  fill as fillPaperBook,
  saveBook,
  settleWallet,
} from "@/server/trade/paper"
import {
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"
import { activeSmartOrderId } from "./smart-orders"

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
    maxLeverage: number | null
    volume24hUsd: number | null
  }
  roundPx: (px: number) => number
  /** What the whole account is worth, which is what the pot is a share of. */
  equity: number
  freeCash: number
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
  /**
   * Coins to buy at market the moment it is placed, so the levels above the
   * price have something to sell. Zero when the whole range sits below.
   */
  startingSz: number
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
  const priced = drawn.levels.map((level, index) => {
    const buyPx = roundPx(level.buyPx)
    const sellPx = roundPx(level.sellPx)
    const sz = level.sz
    if (!(buyPx > 0) || !(sellPx > buyPx) || sz <= 0 || buyPx * sz < MIN_ORDER_USD) {
      throw new Error(`SMART_GRID_LEVEL_TOO_SMALL:${index + 1}`)
    }
    totalCost += buyPx * sz
    return { buyPx, sellPx, sz }
  })

  // A target price has to be somewhere price could still reach. One already
  // below the market is a grid that would sell everything and finish on the
  // pass that placed it — which is not what anybody drew.
  const targetPx =
    params.takeProfitPct === null
      ? null
      : roundPx(topPx * (1 + params.takeProfitPct / 100))
  if (targetPx !== null && mark >= targetPx) {
    throw new Error("SMART_GRID_TARGET_PASSED")
  }

  const maxLeverage = rules.maxLeverage ?? 1

  // A level whose buy price is already at or above the market is one the grid
  // is meant to be SELLING at, not waiting to buy at. It starts out holding,
  // and the coins behind it are bought once at market below — so those sells
  // have something behind them from the first second.
  const levels: GridLevelState[] = priced.map((level) => {
    const sellsFromTheStart = level.buyPx >= mark
    return {
      buyPx: level.buyPx,
      sellPx: level.sellPx,
      sz: level.sz,
      // Frozen here and never recalculated. This is the ceiling every future
      // cycle is held to — a grid level buys back forever, so a level allowed
      // to carry a cheap round's leftover would compound on every round trip.
      budget: level.buyPx * level.sz,
      heldSz: sellsFromTheStart ? level.sz : 0,
      status: sellsFromTheStart ? ("holding" as const) : ("waiting" as const),
      dead: false,
      cycles: 0,
    }
  })

  // What has to be bought at market right now to stand behind those sells.
  const startingSz = levels.reduce(
    (sum, level) => sum + (level.status === "holding" ? level.heldSz : 0),
    0
  )

  // Only the starting buy has to be affordable NOW.
  //
  // Nothing else is reserved: the levels below the price are triggers, and each
  // one spends its money at the moment price reaches it. A grid that plans more
  // than the account currently holds is not wrong — it is a plan for a market
  // that has not happened yet, and a level that cannot be afforded when its
  // turn comes simply waits for the next pass.
  if (startingSz * mark > input.freeCash + 1e-9) {
    throw new Error("SMART_GRID_COST")
  }

  const plan: GridPlan = {
    topPx,
    bottomPx,
    takeProfitPx: targetPx,
    spacing: params.spacing,
    potPct: params.potPct,
    startedAt: input.startedAt ?? 0,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    maxLeverage,
    levels,
    stopLoss: params.stopLoss
      ? {
          mode: "percent",
          underPct: params.stopLoss.underPct,
          px: null,
          base: params.stopLoss.base,
        }
      : null,
    maxOrderVolPct: params.maxOrderVolPct,
    baseDetection: params.baseDetection,
    baseWatch: null,
    aimedSlPx: null,
    seenFillsTo: 0,
    cycles: 0,
    closedReason: null,
  }

  return { plan, levels, totalCost, startingSz }
}

export async function placeGridOrder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  const ref = parseMarketKey(input.marketKey)
  if (!ref || ref.protocol !== wallet.protocol || ref.network !== wallet.network) {
    throw new Error("PAPER_MARKET")
  }
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  // Any kind of smart order, not just another grid: there is one position per
  // coin and both kinds write its stop, so two of them would fight over it.
  const existing = await activeSmartOrderId(userId, wallet.id, input.marketKey)
  if (existing) throw new Error("SMART_LADDER_EXISTS")

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) => protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)

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
  const { plan, levels, startingSz } = draftGridOrder({
    marketKey: input.marketKey,
    params: input.params,
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    mark,
    rules,
    roundPx,
    equity: input.params.compound ? figures.equity : wallet.startingBalance,
    freeCash: freeCash(book),
    takerFeeRate: book.costs.takerFeeRate,
    startedAt: now,
    heldSzi: book.positions.get(input.marketKey)?.szi ?? null,
  })

  await db.transaction(async (tx) => {
    // The same lock every settle takes, so a poll mid-placement waits its turn.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id)))
      .for("update")

    // Re-checked under the lock: two tabs placing at once must not both win,
    // and neither may a grid and a ladder.
    const race = await activeSmartOrderId(userId, wallet.id, input.marketKey, tx)
    if (race) throw new Error("SMART_LADDER_EXISTS")

    // The coins standing behind the sells above the price, bought once at
    // market — applied to the book INSIDE this transaction, so the row and the
    // position it describes land together.
    //
    // It used to be a separate order placed afterwards, and that order settles
    // the wallet on its way in: the settle ran while the grid row already said
    // "holding" and the position did not exist yet, so the engine read a grid
    // whose coins had vanished and stopped it on the spot. Every straddling
    // grid closed itself milliseconds after being placed.
    if (startingSz > 0) {
      fillPaperBook(book, {
        marketKey: input.marketKey,
        side: "buy",
        px: slippedPx(mark, "buy", book.costs.slippageRate),
        sz: startingSz,
        feeRate: book.costs.takerFeeRate,
        leverage: 1,
        maxLeverage: plan.maxLeverage,
        reason: "order",
        at: now,
      })
      // `saveBook` only writes the markets it is told were touched, so a fill
      // that does not say so lives in memory and never reaches the database.
      // Left out, the grid's row said "holding" while the coins behind it did
      // not exist, and the very next pass closed it for having lost them.
      book.touchedMarkets.add(input.marketKey)
    }

    await saveBook(tx, userId, book, new Date(now))

    await tx.insert(tradeSmartLadders).values({
      userId,
      id: randomUUID(),
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "grid",
      status: "active",
      plan,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
  })

  // One more settle lets the grid engine finish the job — it rests a sell
  // against every level that is holding.
  await settleWallet(userId, wallet, { marks })

  return {
    levels: levels.length,
    totalCost: levels.reduce((sum, level) => sum + level.budget, 0),
  }
}

// ----- Steering a live grid -----------------------------------------------

export type GridRowRecord = {
  id: string
  marketKey: string
  status: "active" | "done"
  plan: GridPlan
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
  return { id: row.id, marketKey: row.marketKey, status: row.status, plan }
}

export async function saveGridPlan(
  userId: string,
  gridId: string,
  plan: GridPlan,
  status: "active" | "done"
): Promise<void> {
  await db
    .update(tradeSmartLadders)
    .set({ plan, status, updatedAt: new Date() })
    .where(
      and(eq(tradeSmartLadders.userId, userId), eq(tradeSmartLadders.id, gridId))
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
  input: { gridId: string; stopLoss: GridParams["stopLoss"] }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) => protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  plan.stopLoss = input.stopLoss
    ? {
        mode: "percent",
        underPct: input.stopLoss.underPct,
        px: null,
        base: input.stopLoss.base,
      }
    : null

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
 * Re-shaping a live grid: a new range, a new level count, a new share of the
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
 * Allowed only while nothing has bought. See `gridRangeMovable` for why: a
 * level that is holding bought at a price and sells against it, so sliding the
 * range under it would leave a grid whose levels no longer relate to what it
 * paid. Before the first buy nothing is committed and there is nothing to
 * protect.
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
): Promise<{ moved: true }> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan
  if (!gridRangeMovable(plan)) throw new Error("SMART_GRID_STARTED")

  const ref = parseMarketKey(grid.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")
  const protocol = getProtocol(wallet.protocol)

  const marks = await marksForKeys([grid.marketKey])
  const mark = marks.get(grid.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  const figures = paperAccountFigures({
    startingBalance: wallet.startingBalance,
    realized: book.cash - wallet.startingBalance,
    positions: [...book.positions.values()],
    marks,
  })

  // The cash the grid is already holding is its own to spend again: it is
  // about to give every one of those orders back.
  const held = plan.levels.reduce((sum, level) => sum + level.budget, 0)

  const draft = draftGridOrder({
    marketKey: grid.marketKey,
    params: {
      levels: input.levels ?? plan.levels.length,
      potPct: input.potPct ?? plan.potPct,
      compound: true,
      maxOrderVolPct: plan.maxOrderVolPct,
      spacing: plan.spacing,
      // Only read when the window pre-fills; a re-shape has its own prices.
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
    roundPx: (px: number) => protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick),
    equity: figures.equity,
    freeCash: freeCash(book) + held,
    takerFeeRate: book.costs.takerFeeRate,
    startedAt: plan.startedAt,
    heldSzi: book.positions.get(grid.marketKey)?.szi ?? null,
  })

  // Everything about the grid except where it sits is carried over — the stop
  // it was given, what it has seen, and when it started.
  const next: GridPlan = {
    ...draft.plan,
    stopLoss: plan.stopLoss,
    // The target moves with the range it was set against.
    takeProfitPx:
      plan.takeProfitPx === null
        ? null
        : draft.plan.topPx * (plan.takeProfitPx / plan.topPx),
    baseWatch: plan.baseWatch,
    aimedSlPx: plan.aimedSlPx,
    seenFillsTo: plan.seenFillsTo,
    // A move re-prices the levels; it does not reset the grid's history.
    cycles: plan.cycles,
  }

  // No orders to cancel and none to place — the levels are watched prices. But
  // a range dragged up over the price has levels ABOVE it now, and a level
  // above the price is one the grid sells at, so it has to hold the coins for
  // them the same way a fresh grid does.
  //
  // Without this, moving the top up wrote a plan that said "holding" with no
  // position behind it, and the very next pass read that as a grid that had
  // lost its coins and closed it — so dragging the top up made the whole grid
  // vanish off the chart.
  const now = Date.now()
  await db.transaction(async (tx) => {
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id)))
      .for("update")

    // Settle the position to what the NEW levels need: buy the coins the levels
    // above the price now want, or sell the ones they no longer do. This is
    // what makes a range movable at any time — after it, nothing in the plan
    // describes a price it did not pay.
    const heldNow = book.positions.get(grid.marketKey)?.szi ?? 0
    const shortfall = draft.startingSz - heldNow
    if (Math.abs(shortfall) > 1e-9) {
      const sz = floorSize(Math.abs(shortfall), next.sizeDecimals)
      if (sz > 0) {
        const buying = shortfall > 0
        fillPaperBook(book, {
          marketKey: grid.marketKey,
          side: buying ? "buy" : "sell",
          px: slippedPx(mark, buying ? "buy" : "sell", book.costs.slippageRate),
          sz,
          feeRate: book.costs.takerFeeRate,
          leverage: 1,
          maxLeverage: next.maxLeverage,
          reason: "order",
          at: now,
        })
        // `saveBook` only writes the markets it is told were touched.
        book.touchedMarkets.add(grid.marketKey)
      }
    }
    await saveBook(tx, userId, book, new Date(now))

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
  return { moved: true }
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
): Promise<{ moved: true }> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan
  const protocol = getProtocol(wallet.protocol)
  const px = protocol.markets.roundPx(input.px, plan.sizeDecimals, plan.priceTick)
  if (!(px > 0)) throw new Error("PAPER_PRICE")

  if (input.which === "takeProfit") {
    // Above the range, always. Inside it is where the grid is working, so a
    // target in there would close the grid on an ordinary swing.
    if (px <= plan.topPx) throw new Error("SMART_GRID_TARGET_IN_RANGE")
    plan.takeProfitPx = px
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

  await saveGridPlan(userId, grid.id, plan, "active")
  // No settle: see `moveGridRange`. The next pass, a second away, picks it up.
  return { moved: true }
}

/** Dragging an end of the range — one shape of `reshapeGrid`. */
export function moveGridRange(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; topPx: number; bottomPx: number }
): Promise<{ moved: true }> {
  return reshapeGrid(userId, wallet, input)
}
