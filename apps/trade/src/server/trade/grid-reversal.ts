import { randomUUID } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"

import {
  marketChartHref,
  marketSymbol,
  parseMarketKey,
} from "@/lib/protocols/contracts"
import {
  exitSide,
  gridFlippedPcts,
  gridRowPctsFromLevels,
  gridStopPx,
  holdsEntry,
  plannedGridReversal,
  reachedEntry,
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  type GridPlan,
} from "@/lib/trade/grid"
import { paperAccountFigures } from "@/lib/trade/paper"
import type { SmartGrid } from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { draftGridOrder, gridById } from "@/server/trade/grid-orders"
import { writeTradeNotice } from "@/server/trade/notices"
import {
  marksForKeys,
  placePaperOrder,
  settleWallet,
} from "@/server/trade/paper"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"
import { assertSmartOrderPlacable } from "@/server/trade/smart-pairing"

/**
 * Turning a grid around: the stop has fired (or a hand asked), everything held
 * is sold, and a grid running the OTHER way is placed over the same range —
 * its stop on the old End Grid line, its End Grid the same distance past the
 * fired stop as the old stop sat past the range. The range never moves
 * (Tyler, 28 Aug 2026).
 *
 * The numbers come from `plannedGridReversal` in `grid.ts`, so the window's
 * confirmation and what is placed here are the same figures. The reversed
 * grid is drawn through `draftGridOrder`, the door every grid goes through,
 * which is what carries the whole refusal list — step-versus-fee, a level too
 * small, the stop past the close-out price, End Grid already passed — for
 * free.
 *
 * **The reversed grid never inherits the automatic switch.** A whipsaw market
 * must not ping-pong the account unattended; reversing again is one click,
 * and that click is a person deciding. Hand reversals chain freely — a grid
 * that came out of a reversal reverses back the same way.
 */

/**
 * A reversal refusal that already has its sentence. Carried whole in the
 * error, the same way `PART_CLOSE_TOO_SMALL` carries its own words, because a
 * fixed code could not name the figures involved.
 */
export const REVERSE_REFUSAL_PREFIX = "SMART_GRID_REVERSE:"

/** The plain sentence for a refusal the draft threw, for notices and errors. */
export function plainReversalRefusal(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (message.startsWith(REVERSE_REFUSAL_PREFIX)) {
    return message.slice(REVERSE_REFUSAL_PREFIX.length)
  }
  if (message.startsWith("SMART_GRID_STEP_TOO_THIN")) {
    return "The range's levels sit too close together to clear the trading fee the other way round, so each round trip would lose money."
  }
  if (message.startsWith("SMART_GRID_LEVEL_TOO_SMALL")) {
    return "A level of the reversed grid comes out too small to be an order on this market."
  }
  const rung = message.match(/SMART_GRID_RUNG_TOO_SMALL:(\d+)/)
  if (rung) {
    return `Rung ${rung[1]} of the reversed grid comes out too small to be an order on this market.`
  }
  if (message.startsWith("SMART_GRID_TARGET_PASSED")) {
    return "Price is already past where the new End Grid line would sit, so the reversed grid would close the moment it was placed."
  }
  if (message.startsWith("SMART_GRID_STOP_PAST_LIQUIDATION")) {
    return "The exchange would close the reversed short out before its stop was reached, so the stop would never fire."
  }
  if (
    message.startsWith("SMART_PAIR_") ||
    message.startsWith("SMART_LADDER_EXISTS")
  ) {
    return "A DCA ladder is working this coin, and a reversed grid would fight it."
  }
  return "Something refused the reversed grid. Nothing new was placed."
}

/**
 * The reversed grid's plan, fully drawn and checked — or a thrown refusal.
 *
 * Drafted from the OLD plan's frozen market rules rather than a fresh
 * catalogue read, so this works inside the settle's transaction with no call
 * to the exchange, and the automatic path costs nothing it does not already
 * have.
 */
export function buildReversedPlan(input: {
  oldId: string
  plan: GridPlan
  marketKey: string
  mark: number
  equity: number
  takerFeeRate: number
}): GridPlan {
  const { plan, mark } = input
  const reversal = plannedGridReversal(plan)
  if (!reversal.ok) {
    throw new Error(REVERSE_REFUSAL_PREFIX + reversal.reason)
  }
  const ref = parseMarketKey(input.marketKey)
  const protocol = ref ? getProtocol(ref.protocol) : null
  const roundPx = (px: number) =>
    protocol
      ? protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)
      : px

  const draft = draftGridOrder({
    marketKey: input.marketKey,
    params: {
      direction: reversal.direction,
      levels: plan.levels.length,
      potPct: plan.potPct,
      compound: true,
      leverage: plan.leverage,
      maxOrderVolPct: plan.maxOrderVolPct,
      spacing: plan.spacing,
      sizing: "even",
      // A hand-set split turns over with the grid, the same move the window
      // makes when the direction is switched by hand: each share moves to the
      // other end of the range, so rung 1 keeps rung 1's share and rung 1 has
      // moved.
      //
      // **This reads like a pass-through and is not one.** The draft is given
      // the card's ROWS, which are the level list read backwards, and the
      // mirrored level list written out as rows is the old level list
      // unchanged. Both steps are spelled out rather than cancelled, because
      // the day one of them changes the other has to move with it.
      manualSizing: plan.manualSizing,
      manualRungPcts: plan.manualRungPcts
        ? gridRowPctsFromLevels(gridFlippedPcts(plan.manualRungPcts))
        : null,
      // The follow switches carry; their directions swap with the grid.
      follow: plan.follow,
      followDown: plan.followDown,
      // A reversal has its own prices; the anchor fields are never read.
      anchor: "price",
      abovePct: DEFAULT_GRID_ABOVE_PCT,
      rangePct: DEFAULT_GRID_BELOW_PCT,
      baseDetection: plan.baseDetection,
      // The stop as a percent past the losing edge — the draft's close-out
      // refusal reads it — replaced below with the old End Grid line exactly.
      stopLoss: { underPct: reversal.stopUnderPct, base: null },
      // The new End Grid: the old stop's distance, measured past the mark —
      // which at a reversal sits at the fired stop.
      takeProfitPct: reversal.endPct,
      // Never inherited. See the module note.
      reverseWhenStopped: false,
    },
    topPx: plan.topPx,
    bottomPx: plan.bottomPx,
    mark,
    rules: {
      sizeDecimals: plan.sizeDecimals,
      priceTick: plan.priceTick,
      minOrderValueUsd: plan.minOrderValueUsd,
      maxLeverage: plan.maxLeverage,
      // The old volume figure died at the old placement. The guard SETTING
      // carries, and bites again on the next hand re-shape, which reads a
      // fresh catalogue.
      volume24hUsd: null,
    },
    roundPx,
    equity: input.equity,
    takerFeeRate: input.takerFeeRate,
    startedAt: Date.now(),
    // The position was closed a breath ago; a stale read of it must not
    // refuse the flip as "already held the wrong way".
    held: null,
  })

  // The stop is the old End Grid line EXACTLY, not the percent re-derived —
  // fixed, because it is a line somebody can see, not a rule that follows.
  draft.plan.stopLoss = {
    mode: "fixed",
    underPct: reversal.stopUnderPct,
    px: roundPx(reversal.stopPx),
    base: null,
  }
  draft.plan.reversedFrom = input.oldId
  return draft.plan
}

/**
 * Writes the reversed grid down, once — the idempotency that keeps a repeated
 * pass, a crash-and-retry, or a hand racing the automatic flip from doubling
 * it.
 *
 * A grid continuing this one already existing is NOT a failure: the flip
 * happened, just not on this call. The existing row comes back marked
 * `existing`, so a hand path can answer with the grid that is really there
 * instead of an error, and the automatic path can skip the second notice.
 */
export async function insertReversedGrid(
  tx: CustomShellDb,
  input: {
    userId: string
    wallet: TradeWallet
    marketKey: string
    oldId: string
    plan: GridPlan
    now: number
  }
): Promise<{ grid: SmartGrid; existing: boolean }> {
  const already = await tx
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, input.userId),
        eq(tradeSmartLadders.walletId, input.wallet.id),
        eq(tradeSmartLadders.marketKey, input.marketKey),
        sql`${tradeSmartLadders.plan}->>'reversedFrom' = ${input.oldId}`
      )
    )
    .limit(1)
  const found = already[0]
  if (found) {
    return {
      existing: true,
      grid: {
        id: found.id,
        walletId: found.walletId,
        marketKey: found.marketKey,
        kind: "grid",
        status: found.status === "done" ? "done" : "active",
        flowRunId: found.flowRunId ?? null,
        createdAt: found.createdAt.getTime(),
        updatedAt: found.updatedAt.getTime(),
        plan: found.plan as GridPlan,
      },
    }
  }

  await assertSmartOrderPlacable(
    input.userId,
    input.wallet,
    input.marketKey,
    { kind: "grid", plan: input.plan },
    tx
  )
  const id = randomUUID()
  const stamp = new Date(input.now)
  await tx.insert(tradeSmartLadders).values({
    userId: input.userId,
    id,
    walletId: input.wallet.id,
    marketKey: input.marketKey,
    kind: "grid",
    status: "active",
    plan: input.plan,
    createdAt: stamp,
    updatedAt: stamp,
  })
  return {
    existing: false,
    grid: {
      id,
      walletId: input.wallet.id,
      marketKey: input.marketKey,
      kind: "grid",
      status: "active",
      flowRunId: null,
      createdAt: input.now,
      updatedAt: input.now,
      plan: input.plan,
    },
  }
}

/** The bell notice for a flip that happened, in the voice the others use. */
async function reversalNotice(
  userId: string,
  marketKey: string,
  plan: GridPlan,
  database: CustomShellDb
): Promise<void> {
  const symbol = marketSymbol(marketKey)
  const stopPx = gridStopPx(plan)
  await writeTradeNotice({
    userId,
    title: `The ${symbol} grid reversed`,
    body: `Its stop fired and sold everything it held, and a grid running the other way now works the same range. Its stop sits at ${stopPx ?? "the old End Grid line"} and its End Grid at ${plan.takeProfitPx ?? "below the fired stop"}. It will not reverse again on its own.`,
    level: "info",
    href: marketChartHref(marketKey),
    database,
  }).catch(() => undefined)
}

/** The bell notice for a flip that was refused, carrying the reason. */
async function refusalNotice(
  userId: string,
  marketKey: string,
  reason: string,
  database: CustomShellDb
): Promise<void> {
  await writeTradeNotice({
    userId,
    title: `The ${marketSymbol(marketKey)} grid could not reverse`,
    body: `${reason} The grid closed as normal and nothing new was placed.`,
    level: "warning",
    href: marketChartHref(marketKey),
    database,
  }).catch(() => undefined)
}

/**
 * The automatic flip, tried after a grid closed inside an engine pass.
 *
 * Only when the stop demonstrably fired: the engine writes "stop" for a
 * position that vanished for ANY reason — stopped out, closed by hand,
 * liquidated — and only a mark at or past the stop line says the stop is the
 * one that did it. A hand-close inside the range, or a liquidation the stop
 * never reached, closes the grid and nothing more.
 *
 * A refusal is never silent: the sentence lands on the closed grid's
 * `reverseFailReason` and in the bell.
 */
export async function autoReverseStoppedGrid(input: {
  tx: CustomShellDb
  userId: string
  wallet: TradeWallet
  oldId: string
  marketKey: string
  plan: GridPlan
  mark: number | null
  equity: number
  takerFeeRate: number
  now: number
}): Promise<void> {
  const { plan, mark } = input
  if (plan.closedReason !== "stop") return
  if (!plan.reverseWhenStopped) return
  const stopPx = gridStopPx(plan)
  if (
    mark === null ||
    stopPx === null ||
    !reachedEntry(plan.direction, mark, stopPx)
  ) {
    return
  }

  try {
    const reversed = buildReversedPlan({
      oldId: input.oldId,
      plan,
      marketKey: input.marketKey,
      mark,
      equity: input.equity,
      takerFeeRate: input.takerFeeRate,
    })
    const placed = await insertReversedGrid(input.tx, {
      userId: input.userId,
      wallet: input.wallet,
      marketKey: input.marketKey,
      oldId: input.oldId,
      plan: reversed,
      now: input.now,
    })
    if (!placed.existing) {
      await reversalNotice(input.userId, input.marketKey, reversed, input.tx)
    }
  } catch (error) {
    const reason = plainReversalRefusal(error)
    plan.reverseFailReason = reason
    await input.tx
      .update(tradeSmartLadders)
      .set({ plan, updatedAt: new Date(input.now) })
      .where(
        and(
          eq(tradeSmartLadders.userId, input.userId),
          eq(tradeSmartLadders.id, input.oldId)
        )
      )
    await refusalNotice(input.userId, input.marketKey, reason, input.tx)
  }
}

/**
 * The hand reversal on a practice wallet — the reverse icon's confirm.
 *
 * Order of operations, and why: every refusal is checked BEFORE anything is
 * sold, so a refused reversal changes nothing at all. Then the position is
 * closed at market, then one transaction ends the old grid and writes the new
 * one — so there is never a moment with two active smart orders on the coin,
 * and never a new grid running against the old position.
 */
export async function reverseGridOrder(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string }
): Promise<{ reversed: true; grid: SmartGrid }> {
  const book = await settleWallet(userId, wallet)
  const grid = await gridById(userId, wallet.id, input.gridId)
  const plan = grid.plan

  const marks = await marksForKeys([grid.marketKey])
  const mark = marks.get(grid.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  const figures = paperAccountFigures({
    startingBalance: wallet.startingBalance,
    realized: book.cash - wallet.startingBalance,
    positions: [...book.positions.values()],
    marks,
  })

  // Drawn and checked in full before a single coin moves.
  const reversed = buildReversedPlan({
    oldId: grid.id,
    plan,
    marketKey: grid.marketKey,
    mark,
    equity: figures.equity,
    takerFeeRate: book.costs.takerFeeRate,
  })

  // Close what the grid holds, at market — Tyler's words: "Whatever amount im
  // holding will sell at market price and the reverse grid begins."
  const position = book.positions.get(grid.marketKey) ?? null
  if (position && holdsEntry(plan.direction, position.szi)) {
    await placePaperOrder(userId, wallet, {
      marketKey: grid.marketKey,
      side: exitSide(plan.direction),
      px: mark,
      sz: Math.abs(position.szi),
      leverage: position.leverage,
      reduceOnly: true,
      tpPx: null,
      slPx: null,
    })
  }

  // End the old grid the way a hand does, and write the new one, together.
  for (const level of plan.levels) {
    if (level.status === "waiting") level.status = "cancelled"
  }
  for (const level of plan.levels) level.heldSz = 0
  plan.closedReason = "cancelled"
  const now = Date.now()
  let placed: SmartGrid | null = null
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
      .set({ plan, status: "done", updatedAt: new Date(now) })
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.id, grid.id)
        )
      )
    // A duplicate here is the automatic flip having won the race a moment
    // ago. That is success — the grid that is really there is the answer,
    // never "not found" about a reversal that happened.
    const inserted = await insertReversedGrid(tx, {
      userId,
      wallet,
      marketKey: grid.marketKey,
      oldId: grid.id,
      plan: reversed,
      now,
    })
    placed = inserted.grid
  })
  if (!placed) throw new Error("SMART_GRID_NOT_FOUND")
  await settleWallet(userId, wallet)
  return { reversed: true, grid: placed }
}
