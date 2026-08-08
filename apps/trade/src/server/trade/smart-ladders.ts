import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import {
  ladderExitLevels,
  ladderGreenInterval,
  readLadderPlan,
  type LadderPlan,
} from "@/lib/trade/dca"
import type { PaperSide } from "@/lib/trade/paper"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { tradePaperOrders, tradeSmartLadders } from "@/server/trade/schema"
import type { WalletBook } from "@/server/trade/paper"

/**
 * What a placed DCA ladder does as price moves — the half of the practice
 * engine that keeps working a ladder after one right-click placed it.
 *
 * `advanceLadders` runs inside every settle, after the candles and today's
 * price have been replayed and before the book is saved. It reads what just
 * happened to the ladder's orders and reacts: a rung that bought gets its
 * sell placed or the position's brackets re-aimed, a stop that took the trade
 * ends the whole ladder, rungs under the stop come off the book, and a
 * two-green ladder watches its candles and buys on confirmation.
 *
 * The engine's own machinery — filling, dropping orders, counting free cash —
 * is handed in as `deps` rather than imported, so this file never imports the
 * engine that imports it.
 */

export type LadderEngineDeps = {
  fill: (
    book: WalletBook,
    input: {
      marketKey: string
      side: PaperSide
      px: number
      sz: number
      feeRate: number
      leverage: number
      maxLeverage: number
      reason: "order"
      at: number
    }
  ) => void
  dropOrder: (book: WalletBook, orderId: string) => void
  freeCash: (book: WalletBook) => number
}

/** What the exchange charges a two-green buy — it takes the price that is there. */
const TWO_GREEN_FEE_RATE = 0.00045

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
}

/** Close enough for two doubles that came from the same arithmetic. */
function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9)
}

function nearNullable(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  return near(a, b)
}

type LadderRow = {
  id: string
  marketKey: string
  plan: LadderPlan
}

/**
 * The candles the wallet's two-green ladders need before the next settle —
 * asked outside the settle's transaction, because candles are a network call
 * and the transaction holds a lock.
 *
 * Empty for a wallet with no two-green ladder, and empty again until the next
 * bar of the watched timeframe could actually have closed — so the everyday
 * four-second poll pays nothing for this.
 */
export async function ladderCandleNeeds(
  userId: string,
  walletId: string,
  now: number
): Promise<
  { marketKey: string; interval: CandleInterval; since: number; barMs: number }[]
> {
  const rows = await db
    .select({
      marketKey: tradeSmartLadders.marketKey,
      plan: tradeSmartLadders.plan,
      createdAt: tradeSmartLadders.createdAt,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.status, "active")
      )
    )

  const needs: {
    marketKey: string
    interval: CandleInterval
    since: number
    barMs: number
  }[] = []
  for (const row of rows) {
    const plan = readLadderPlan(row.plan)
    if (!plan) continue
    const interval = ladderGreenInterval(plan)
    if (!interval) continue
    if (!plan.rungs.some((rung) => rung.status === "waiting")) continue
    const since = plan.green?.seenTo ?? row.createdAt.getTime()
    // Only when a fresh bar could have closed since the last one read.
    if (now - since < INTERVAL_MS[interval]) continue
    needs.push({
      marketKey: row.marketKey,
      interval,
      since,
      barMs: INTERVAL_MS[interval],
    })
  }
  return needs
}

export type LadderBars = ReadonlyMap<string, { bars: CandleBar[]; barMs: number }>

/**
 * Brings every active ladder of one wallet up to date with what the settle
 * just replayed. Runs inside the settle's transaction, after the markets were
 * walked and before the book is saved — so bracket changes ride the same save
 * and a half-advanced ladder can never reach the database.
 */
export async function advanceLadders(
  input: {
    tx: CustomShellDb
    userId: string
    book: WalletBook
    marks: ReadonlyMap<string, number>
    greenBars: LadderBars
    now: number
  },
  deps: LadderEngineDeps
): Promise<void> {
  const rows = await input.tx
    .select({
      id: tradeSmartLadders.id,
      marketKey: tradeSmartLadders.marketKey,
      plan: tradeSmartLadders.plan,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, input.userId),
        eq(tradeSmartLadders.walletId, input.book.wallet.id),
        eq(tradeSmartLadders.status, "active")
      )
    )

  for (const raw of rows) {
    const plan = readLadderPlan(raw.plan)
    if (!plan) continue
    const row: LadderRow = { id: raw.id, marketKey: raw.marketKey, plan }
    await advanceOne(input, deps, row)
  }
}

async function advanceOne(
  input: {
    tx: CustomShellDb
    userId: string
    book: WalletBook
    marks: ReadonlyMap<string, number>
    greenBars: LadderBars
    now: number
  },
  deps: LadderEngineDeps,
  row: LadderRow
): Promise<void> {
  const { tx, userId, book, now } = input
  const plan = row.plan
  const roundPx = (px: number) =>
    getProtocol(book.wallet.protocol).markets.roundPx(px, plan.sizeDecimals)
  let changed = false

  // ----- What just happened to the ladder's orders -----------------------

  const liveOrderIds = new Set(book.orders.map((order) => order.id))
  // This settle's fills, each spent on at most one rung — two rungs at the
  // same price must not both claim the same fill.
  const usedFillIds = new Set<string>()
  const fillFor = (side: PaperSide, px: number, maxSz: number) => {
    const found = book.fills.find(
      (fill) =>
        !usedFillIds.has(fill.id) &&
        fill.marketKey === row.marketKey &&
        fill.side === side &&
        fill.reason === "order" &&
        near(fill.px, px) &&
        fill.sz <= maxSz + 1e-9
    )
    if (found) usedFillIds.add(found.id)
    return found ?? null
  }

  for (const rung of plan.rungs) {
    if (rung.status === "waiting" && rung.orderId && !liveOrderIds.has(rung.orderId)) {
      // The rung's order is gone: it bought, or the engine dropped it — a
      // cancel by hand, or a buy the account could no longer afford.
      rung.orderId = null
      rung.status = fillFor("buy", rung.px, rung.sz) ? "filled" : "skipped"
      changed = true
    }
    if (rung.sellOrderId && !liveOrderIds.has(rung.sellOrderId)) {
      // Its sell is gone: sold at the rung above, or dropped because the
      // position it was to reduce is no longer there.
      const target = ladderExitLevels(plan)[plan.rungs.indexOf(rung)]
      rung.sellOrderId = null
      if (rung.status === "filled" && fillFor("sell", roundPx(target), rung.sz)) {
        rung.status = "sold"
      }
      changed = true
    }
  }

  // ----- Two-green mode: watch the candles, buy on confirmation ----------

  if (plan.twoGreen) {
    if (watchCandles(plan, input, deps, row.marketKey)) changed = true
  }

  // ----- Is the ladder over? ---------------------------------------------

  const position = book.positions.get(row.marketKey) ?? null
  const anyBought = plan.rungs.some(
    (rung) => rung.status === "filled" || rung.status === "sold"
  )
  const anyWaiting = plan.rungs.some((rung) => rung.status === "waiting")
  const anySellResting = plan.rungs.some((rung) => rung.sellOrderId !== null)

  const over =
    // The trade exited — stop, target, closed by hand, liquidated, or every
    // slice sold. However it went, buying deeper is no longer the plan.
    (anyBought && !position) ||
    // Turned into a short by hand: a buy ladder has no business adding to it.
    (position !== null && position.szi < 0) ||
    // Nothing waiting, nothing held, nothing resting: there is no ladder left.
    (!anyWaiting && !position && !anySellResting)

  if (over) {
    for (const rung of plan.rungs) {
      if (rung.orderId && liveOrderIds.has(rung.orderId)) {
        deps.dropOrder(book, rung.orderId)
      }
      if (rung.sellOrderId && liveOrderIds.has(rung.sellOrderId)) {
        deps.dropOrder(book, rung.sellOrderId)
      }
      rung.orderId = null
      rung.sellOrderId = null
      if (rung.status === "waiting") rung.status = "cancelled"
    }
    await saveLadder(tx, userId, row, "done", now)
    return
  }

  // ----- Aim the brackets the ladder manages -----------------------------

  if (position && position.szi > 0) {
    if (aimBrackets(plan, position, roundPx)) {
      // The aim changed the position row, so the save has to know — and the
      // stamp moves so a bracket cannot be fired by candles older than itself.
      position.updatedAt = now
      book.touchedMarkets.add(row.marketKey)
      changed = true
    }

    // "Sell at previous rung": every bought rung gets its own sell, resting
    // at the price of the rung above it — the first at the click itself.
    if (plan.takeProfit?.mode === "prevRung") {
      const exits = ladderExitLevels(plan)
      for (const [index, rung] of plan.rungs.entries()) {
        if (rung.status !== "filled" || rung.sellOrderId) continue
        rung.sellOrderId = await insertLadderOrder(tx, userId, book, {
          marketKey: row.marketKey,
          side: "sell",
          px: roundPx(exits[index]),
          sz: rung.sz,
          leverage: position.leverage,
          maxLeverage: plan.maxLeverage,
          reduceOnly: true,
          now,
        })
        changed = true
      }
    }
  }

  // ----- Rungs under the stop come off the book --------------------------

  if (reconcileDeadRungs(plan, input, deps, position?.slPx ?? null)) {
    changed = true
  }
  // Reviving a dead rung inserts its order back; do it after the dead pass so
  // one advance never both drops and re-adds the same rung.
  if (await reviveRungs(plan, input, row)) changed = true

  if (changed) await saveLadder(tx, userId, row, "active", now)
}

/**
 * Keeps the position's target and stop where the ladder's rules say — unless
 * a hand has moved them. The plan remembers what it last wrote (`aimedTpPx`,
 * `aimedSlPx`); a position carrying anything else was changed on purpose, and
 * from then on that side is fixed rather than quietly dragged back.
 */
function aimBrackets(
  plan: LadderPlan,
  position: { tpPx: number | null; slPx: number | null; entryPx: number; updatedAt: number },
  roundPx: (px: number) => number
): boolean {
  let changed = false

  const tp = plan.takeProfit
  if (tp && tp.mode !== "fixed" && tp.mode !== "prevRung") {
    if (!nearNullable(plan.aimedTpPx, position.tpPx)) {
      tp.mode = "fixed"
      tp.pct = null
      plan.aimedTpPx = position.tpPx
      changed = true
    } else {
      const desired =
        tp.mode === "average"
          ? roundPx(position.entryPx * (1 + (tp.pct ?? 0) / 100))
          : nearestRungExit(plan, roundPx)
      if (desired !== null && !nearNullable(desired, position.tpPx)) {
        position.tpPx = desired
        plan.aimedTpPx = desired
        changed = true
      }
    }
  }

  const sl = plan.stopLoss
  if (sl && sl.mode === "percent") {
    if (!nearNullable(plan.aimedSlPx, position.slPx)) {
      sl.mode = "fixed"
      sl.pct = null
      plan.aimedSlPx = position.slPx
      changed = true
    } else {
      const desired = roundPx(position.entryPx * (1 - (sl.pct ?? 0) / 100))
      if (!nearNullable(desired, position.slPx)) {
        position.slPx = desired
        plan.aimedSlPx = desired
        changed = true
      }
    }
  }

  return changed
}

/**
 * "Sell everything at nearest rung": one exit for the whole position at the
 * rung above the deepest buy — it slides deeper as deeper rungs fill.
 */
function nearestRungExit(
  plan: LadderPlan,
  roundPx: (px: number) => number
): number | null {
  let deepest = -1
  for (const [index, rung] of plan.rungs.entries()) {
    if (rung.status === "filled" || rung.status === "sold") deepest = index
  }
  if (deepest < 0) return null
  return roundPx(ladderExitLevels(plan)[deepest])
}

/**
 * A rung at or below the position's stop can never buy: price has to pass the
 * stop to reach it, and the stop ends the ladder. Its order comes off the
 * book — quietly, because the chart keeps drawing the rung, faded — and comes
 * back the moment the stop sits below it again.
 */
function reconcileDeadRungs(
  plan: LadderPlan,
  input: { book: WalletBook },
  deps: LadderEngineDeps,
  slPx: number | null
): boolean {
  const liveOrderIds = new Set(input.book.orders.map((order) => order.id))
  let changed = false
  for (const rung of plan.rungs) {
    if (rung.status !== "waiting") continue
    const shouldBeDead = slPx !== null && rung.px <= slPx
    if (shouldBeDead && !rung.dead) {
      rung.dead = true
      if (rung.orderId && liveOrderIds.has(rung.orderId)) {
        deps.dropOrder(input.book, rung.orderId)
      }
      rung.orderId = null
      changed = true
    } else if (!shouldBeDead && rung.dead) {
      rung.dead = false
      changed = true
    }
  }
  return changed
}

/**
 * A revived rung gets its resting order back — unless price has already gone
 * past it while it was dead. Filling it then would buy above the market, so
 * its moment is simply gone: it is marked skipped and says so.
 */
async function reviveRungs(
  plan: LadderPlan,
  input: {
    tx: CustomShellDb
    userId: string
    book: WalletBook
    marks: ReadonlyMap<string, number>
    now: number
  },
  row: LadderRow
): Promise<boolean> {
  if (plan.twoGreen) return false
  const mark = input.marks.get(row.marketKey) ?? null
  let changed = false
  for (const rung of plan.rungs) {
    if (rung.status !== "waiting" || rung.dead || rung.orderId) continue
    changed = true
    if (mark !== null && mark <= rung.px) {
      rung.status = "skipped"
      continue
    }
    rung.orderId = await insertLadderOrder(input.tx, input.userId, input.book, {
      marketKey: row.marketKey,
      side: "buy",
      px: rung.px,
      sz: rung.sz,
      leverage: 1,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      now: input.now,
    })
  }
  return changed
}

/**
 * Two-green mode: no orders rest. The ladder reads each closed candle of its
 * chosen timeframe once, remembers which rungs price has reached, and buys the
 * shallowest reached rung at the moment two green candles in a row confirm the
 * turn — at that candle's close, which is where the confirmation happened.
 */
function watchCandles(
  plan: LadderPlan,
  input: {
    book: WalletBook
    greenBars: LadderBars
    now: number
  },
  deps: LadderEngineDeps,
  marketKey: string
): boolean {
  const feed = input.greenBars.get(marketKey)
  if (!feed || feed.bars.length === 0) return false

  const seenTo = plan.green?.seenTo ?? 0
  let lastGreen = plan.green?.lastGreen ?? false
  let newest = seenTo
  let changed = false

  const closed = feed.bars
    .filter(
      (bar) => bar.openTime > seenTo && bar.openTime + feed.barMs <= input.now
    )
    .sort((a, b) => a.openTime - b.openTime)

  for (const bar of closed) {
    newest = bar.openTime
    changed = true

    for (const rung of plan.rungs) {
      if (rung.status === "waiting" && !rung.touched && bar.low <= rung.px) {
        rung.touched = true
      }
    }

    const green = bar.close > bar.open
    const twoGreenNow = lastGreen && green
    lastGreen = green
    if (!twoGreenNow) continue

    // Confirmation: buy the shallowest reached rung, one per candle. A rung
    // the account cannot afford right now is left reached — it says so on the
    // chart and buys on a later confirmation if cash frees up.
    const next = plan.rungs.find(
      (rung) => rung.status === "waiting" && rung.touched && !rung.dead
    )
    if (!next) continue
    if (next.px * next.sz > deps.freeCash(input.book) + 1e-9) continue

    deps.fill(input.book, {
      marketKey,
      side: "buy",
      px: bar.close,
      sz: next.sz,
      feeRate: TWO_GREEN_FEE_RATE,
      leverage: 1,
      maxLeverage: plan.maxLeverage,
      reason: "order",
      at: bar.openTime + feed.barMs,
    })
    next.status = "filled"
  }

  if (changed) {
    plan.green = { seenTo: newest, lastGreen }
  }
  return changed
}

async function insertLadderOrder(
  tx: CustomShellDb,
  userId: string,
  book: WalletBook,
  input: {
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    leverage: number
    maxLeverage: number
    reduceOnly: boolean
    now: number
  }
): Promise<string> {
  const id = randomUUID()
  await tx.insert(tradePaperOrders).values({
    userId,
    id,
    walletId: book.wallet.id,
    marketKey: input.marketKey,
    side: input.side,
    px: input.px,
    sz: input.sz,
    leverage: input.leverage,
    maxLeverage: input.maxLeverage,
    reduceOnly: input.reduceOnly,
    tpPx: null,
    slPx: null,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
  })
  return id
}

async function saveLadder(
  tx: CustomShellDb,
  userId: string,
  row: LadderRow,
  status: "active" | "done",
  now: number
): Promise<void> {
  await tx
    .update(tradeSmartLadders)
    .set({ plan: row.plan, status, updatedAt: new Date(now) })
    .where(
      and(eq(tradeSmartLadders.userId, userId), eq(tradeSmartLadders.id, row.id))
    )
}
