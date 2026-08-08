import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import {
  BASE_STOP_BARS,
  BASE_STOP_INTERVAL,
  baseStopDetection,
  baseStopPx,
  DUST_ORDER_USD,
  floorSize,
  ladderExitLevels,
  ladderGreenInterval,
  readLadderPlan,
  rungBudget,
  type LadderPlan,
} from "@/lib/trade/dca"
import { baseInForce } from "@/lib/trade/indicators/base"
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

/** What the exchange charges a buy at market — it takes the price that is there. */
const TWO_GREEN_FEE_RATE = 0.00045

const DAY_MS = 86_400_000

/**
 * Which feed a ladder is asking for. One market can want both at once — a
 * two-green ladder on the 15m and a base stop on the 4h — so the key carries
 * the purpose as well as the market.
 */
export type LadderBarsUse = "green" | "base"

export function ladderBarsKey(use: LadderBarsUse, marketKey: string): string {
  return `${use}:${marketKey}`
}

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
 * The candles the wallet's ladders need before the next settle — asked outside
 * the settle's transaction, because candles are a network call and the
 * transaction holds a lock.
 *
 * Two ladders want them. A two-green ladder watches its own timeframe for the
 * bounce; a base stop watches the 4h for the level it rests under. Both ask
 * only once a bar of their timeframe could actually have closed, so the
 * everyday four-second poll pays nothing for either.
 */
export async function ladderCandleNeeds(
  userId: string,
  walletId: string,
  now: number
): Promise<
  {
    use: LadderBarsUse
    marketKey: string
    interval: CandleInterval
    since: number
    barMs: number
  }[]
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
    use: LadderBarsUse
    marketKey: string
    interval: CandleInterval
    since: number
    barMs: number
  }[] = []
  for (const row of rows) {
    const plan = readLadderPlan(row.plan)
    if (!plan) continue

    const interval = ladderGreenInterval(plan)
    if (interval && plan.rungs.some((rung) => rung.status === "waiting")) {
      const since = plan.green?.seenTo ?? row.createdAt.getTime()
      // Only when a fresh bar could have closed since the last one read.
      if (now - since >= INTERVAL_MS[interval]) {
        needs.push({
          use: "green",
          marketKey: row.marketKey,
          interval,
          since,
          barMs: INTERVAL_MS[interval],
        })
      }
    }

    // The base window is read whole every time rather than added to, because
    // the level in force depends on the candles around it, not just the newest
    // one. `seenTo` only decides WHEN to ask, never how far back.
    if (plan.stopLoss?.base || plan.anchor === "base") {
      const barMs = INTERVAL_MS[BASE_STOP_INTERVAL]
      const seenTo = plan.baseWatch?.seenTo ?? 0
      if (now - seenTo >= barMs) {
        needs.push({
          use: "base",
          marketKey: row.marketKey,
          interval: BASE_STOP_INTERVAL,
          since: now - BASE_STOP_BARS * barMs,
          barMs,
        })
      }
    }
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
    ladderBars: LadderBars
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
    ladderBars: LadderBars
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

  // ----- The 4h base the stop rides, and the buy-back clock ---------------

  if (plan.stopLoss?.base || plan.anchor === "base") {
    if (watchBase(plan, input, row.marketKey)) changed = true
  }

  // ----- The base moved before anything bought ---------------------------

  if (reanchorToBase(plan, input, deps, roundPx)) changed = true

  // ----- Two-green mode: watch the candles, buy on confirmation ----------

  if (plan.twoGreen) {
    if (watchCandles(plan, input, deps, row.marketKey)) changed = true
  }

  // ----- A stop took a rung, not the ladder ------------------------------

  if (stepDownAfterStop(plan, input, deps, row)) changed = true

  // ----- Is the ladder over? ---------------------------------------------

  const position = book.positions.get(row.marketKey) ?? null
  const anyBought = plan.rungs.some(
    (rung) => rung.status === "filled" || rung.status === "sold"
  )
  const anyWaiting = plan.rungs.some((rung) => rung.status === "waiting")
  const anySellResting = plan.rungs.some((rung) => rung.sellOrderId !== null)

  // Flat and finished, versus flat between rungs. A base-stop ladder that has
  // stepped down is flat ON PURPOSE: it sold at a stop and the next rung has
  // not bought yet. Without this the very next settle would read "sold
  // everything, holding nothing" and close the ladder it just stepped.
  const betweenRungs = plan.steppedDown > 0 && anyWaiting

  const over =
    // The trade exited — stop, target, closed by hand, liquidated, or every
    // slice sold. However it went, buying deeper is no longer the plan.
    (anyBought && !position && !betweenRungs) ||
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

  // ----- Putting back a rung the stop took --------------------------------

  if (reclaimRung(plan, input, deps, row)) changed = true

  // ----- Aim the brackets the ladder manages -----------------------------

  // Re-read: a buy-back a moment ago opened the position this aims at.
  const held = book.positions.get(row.marketKey) ?? null
  if (held && held.szi > 0) {
    if (aimBrackets(plan, held, roundPx)) {
      // The aim changed the position row, so the save has to know — and the
      // stamp moves so a bracket cannot be fired by candles older than itself.
      held.updatedAt = now
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
          leverage: held.leverage,
          maxLeverage: plan.maxLeverage,
          reduceOnly: true,
          now,
        })
        changed = true
      }
    }
  }

  // ----- Rungs under the stop come off the book --------------------------

  if (reconcileDeadRungs(plan, input, deps, held?.slPx ?? null)) {
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
      const desired = wantedStopPx(plan, position.entryPx, roundPx)
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
 * Where the ladder wants its stop: under the base when one can carry it, and
 * on the plain percent until then.
 *
 * Null is a real answer, not a missing one — a 100% stop is one that price
 * would have to reach zero to hit, which is how you say "nothing until the
 * base arrives". Writing a stop at zero instead would be a stop in name only,
 * and it would sit under every rung and kill them all.
 */
export function wantedStopPx(
  plan: Pick<LadderPlan, "rungs" | "stopLoss" | "baseWatch">,
  entryPx: number,
  roundPx: (px: number) => number
): number | null {
  const sl = plan.stopLoss
  if (!sl) return null
  const level = baseStopPx(plan, plan.baseWatch?.levelPx ?? null)
  if (level !== null) return roundPx(level)
  const pct = sl.pct ?? 0
  if (!(pct > 0) || pct >= 100) return null
  return roundPx(entryPx * (1 - pct / 100))
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
 *
 * **One rung at a time once the base stop has stepped the ladder down.** Before
 * the first stop every rung rests at once, which is what you see when you place
 * one; after it, only the next rung is on the book, because the rungs below it
 * belong to a round that has not happened yet and would need a stop nobody has
 * worked out.
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
    if (plan.steppedDown > 0) break
  }
  return changed
}

/**
 * Reads the 4h window and answers two questions from it at once: where the
 * base the stop rests under sits now, and how the buy-back clock is doing.
 *
 * The window is re-read whole each time rather than added to, because a level
 * depends on the candles either side of it, not on the newest one. Only the
 * bars nobody has read before are shown to the buy-back clock, so re-reading
 * the same window cannot restart or double-advance it.
 *
 * `seenTo` is a CLOSE time, not an open time — it decides when this is worth
 * asking for again, and a bar that just closed must not read as four hours old.
 */
function watchBase(
  plan: LadderPlan,
  input: { ladderBars: LadderBars; now: number },
  marketKey: string
): boolean {
  // The stop's frozen settings when it has them, and the chart's own when the
  // ladder only wants the level to hang from — two ways to want the same
  // number, and one place that works it out.
  const stop = plan.stopLoss?.base ?? null
  const detection = stop ?? baseStopDetection()
  const feed = input.ladderBars.get(ladderBarsKey("base", marketKey))
  if (!feed) return false

  const seenTo = plan.baseWatch?.seenTo ?? 0
  // The bar still being filled in is left out: it cannot have confirmed a
  // level, and a close that has not happened cannot start a clock either.
  const closed = feed.bars
    .filter((bar) => bar.openTime + feed.barMs <= input.now)
    .sort((a, b) => a.openTime - b.openTime)

  if (closed.length === 0) {
    // Nothing came back — a market too new to have history, or a call that
    // failed. Note that we looked, so this is not asked again every four
    // seconds, and leave the level exactly as it was.
    plan.baseWatch = {
      levelPx: plan.baseWatch?.levelPx ?? null,
      seenTo: input.now,
    }
    return true
  }

  plan.baseWatch = {
    levelPx: baseInForce(closed, {
      searchBars: detection.searchBars,
      holdBars: detection.holdBars,
    }),
    seenTo: closed[closed.length - 1].openTime + feed.barMs,
  }

  const reclaim = plan.reclaim
  if (reclaim && stop && stop.reclaimDays > 0) {
    for (const bar of closed) {
      if (bar.openTime + feed.barMs <= seenTo) continue
      if (bar.close > reclaim.levelPx) {
        reclaim.aboveSince ??= bar.openTime + feed.barMs
      } else {
        // A CLOSE back under the level resets the wait. A wick under it does
        // not: that noise is the whole thing this is meant to sit through, and
        // reading lows instead would let one spike throw away days of waiting.
        reclaim.aboveSince = null
      }
    }
  }
  return true
}

/**
 * A base-anchored ladder follows its base while nothing has bought yet.
 *
 * The whole ladder is a set of ratios below one level, so moving the level
 * moves every rung with it and the shape is untouched. Each rung keeps the
 * dollars it was given and buys whatever that now comes to.
 *
 * **The moment anything buys, the ladder is committed** — and that is the only
 * condition. The deeper rungs stay counted off the base the first buy was
 * measured from, because re-pricing them under a position already open would
 * leave a ladder whose rungs no longer relate to what it paid.
 *
 * Where price sits against the new base is deliberately NOT a condition. Price
 * falling under a base is the ladder doing its job — the rungs live down there
 * and it is what they are waiting for.
 *
 * Following the base DOWN as well as up is deliberate, and it is the plain
 * ladder's rule in the app this is a port of: following only downward left
 * ladders armed on an old low base while price ran away above them.
 */
function reanchorToBase(
  plan: LadderPlan,
  input: { book: WalletBook },
  deps: LadderEngineDeps,
  roundPx: (px: number) => number
): boolean {
  if (plan.anchor !== "base" || plan.steppedDown > 0) return false
  const level = plan.baseWatch?.levelPx ?? null
  if (level === null || !(level > 0) || !(plan.anchorPx > 0)) return false
  if (
    plan.rungs.some(
      (rung) => rung.status === "filled" || rung.status === "sold"
    )
  ) {
    return false
  }
  if (near(level, plan.anchorPx)) return false

  const scale = level / plan.anchorPx
  const moved = plan.rungs.map((rung) => {
    const px = roundPx(rung.px * scale)
    return { px, sz: floorSize(rungBudget(rung) / px, plan.sizeDecimals) }
  })
  // A rung that would round away to nothing at the new prices means the whole
  // move is refused: half a ladder is worse than one hung a little too high.
  if (moved.some((rung) => !(rung.px > 0) || rung.sz <= 0)) return false

  const liveOrderIds = new Set(input.book.orders.map((order) => order.id))
  for (const [index, rung] of plan.rungs.entries()) {
    if (rung.orderId && liveOrderIds.has(rung.orderId)) {
      deps.dropOrder(input.book, rung.orderId)
    }
    rung.orderId = null
    rung.px = moved[index].px
    rung.sz = moved[index].sz
    rung.dead = false
    rung.touched = false
    // Skipped was an answer about the old prices. These are new ones.
    if (rung.status === "skipped") rung.status = "waiting"
  }
  plan.anchorPx = roundPx(level)
  return true
}

/**
 * The stop took a rung, and a rung is not the ladder.
 *
 * Everything is sold, every resting order comes off — there is no point
 * keeping a rung on the book under a level price has just proved it will go
 * through — and the next rung down is left to be armed on its own, with a
 * fresh stop under whatever base is in force by the time it buys.
 *
 * **Running out of rungs is the end, and it is final.** Nothing is armed and
 * no buy-back is remembered, so a ladder whose bets double cannot come back for
 * another round. That rule is the whole reason the old app's ladder stopped
 * turning a $25,000 pot into $76,750.
 */
function stepDownAfterStop(
  plan: LadderPlan,
  input: { book: WalletBook },
  deps: LadderEngineDeps,
  row: LadderRow
): boolean {
  const base = plan.stopLoss?.base
  if (!base) return false
  const { book } = input

  // Still holding something: nothing was stopped out of.
  if (book.positions.get(row.marketKey)) return false

  const cut = book.fills.find(
    (fill) => fill.marketKey === row.marketKey && fill.reason === "stop_loss"
  )
  if (!cut) return false
  if (!plan.rungs.some((rung) => rung.status === "waiting")) return false

  // The deepest rung that was actually holding is the one worth putting back:
  // one rung's budget, never the whole position's.
  let deepest = -1
  for (const [index, rung] of plan.rungs.entries()) {
    if (rung.status === "filled") deepest = index
  }

  const liveOrderIds = new Set(book.orders.map((order) => order.id))
  for (const rung of plan.rungs) {
    if (rung.orderId && liveOrderIds.has(rung.orderId)) {
      deps.dropOrder(book, rung.orderId)
    }
    if (rung.sellOrderId && liveOrderIds.has(rung.sellOrderId)) {
      deps.dropOrder(book, rung.sellOrderId)
    }
    rung.orderId = null
    rung.sellOrderId = null
    // Every rung starts the next round with a clean sheet: the stop that made
    // them unreachable has gone with the position it belonged to.
    rung.dead = false
    rung.touched = false
    if (rung.status === "filled") rung.status = "sold"
  }

  plan.steppedDown += 1
  plan.aimedTpPx = null
  plan.aimedSlPx = null
  plan.reclaim =
    deepest >= 0 && base.reclaimDays > 0
      ? {
          // Where you were actually cut, which is what the wait is measured
          // against — not the base, which sits above it whenever the stop is
          // set to rest some way under one.
          levelPx: cut.px,
          rungIndex: deepest,
          dollars: rungBudget(plan.rungs[deepest]),
          aboveSince: null,
        }
      : null
  return true
}

/**
 * Price climbed back over the level the stop cut at and stayed there, so the
 * rung goes back on — at market, for the money that rung was always allowed to
 * spend.
 *
 * Dollars rather than coins is the whole safeguard: a level reclaimed months
 * later at three times the price would cost three times as much if the coin
 * count were what got put back.
 *
 * You always buy back HIGHER than you were stopped at. That is the price of
 * waiting for proof, and it is the honest cost of the setting.
 */
function reclaimRung(
  plan: LadderPlan,
  input: {
    book: WalletBook
    marks: ReadonlyMap<string, number>
    now: number
  },
  deps: LadderEngineDeps,
  row: LadderRow
): boolean {
  const reclaim = plan.reclaim
  const base = plan.stopLoss?.base
  if (!reclaim || !base || base.reclaimDays <= 0) return false
  if (reclaim.aboveSince === null) return false
  if (input.now - reclaim.aboveSince < base.reclaimDays * DAY_MS) return false
  // Holding again already — the next rung bought while the clock ran. There is
  // nothing to put back, and adding to it was never the offer.
  if (input.book.positions.get(row.marketKey)) return false

  const mark = input.marks.get(row.marketKey) ?? null
  if (mark === null || !(mark > 0)) return false

  const sz = floorSize(reclaim.dollars / mark, plan.sizeDecimals)
  const cost = sz * mark
  if (sz <= 0 || cost < DUST_ORDER_USD) {
    // Too small to be an order at this price, and it will not grow — waiting
    // longer only means checking forever.
    plan.reclaim = null
    return true
  }
  // Not affordable this minute. Left armed rather than thrown away: cash frees
  // up when another market's trade closes.
  if (cost > deps.freeCash(input.book) + 1e-9) return false

  deps.fill(input.book, {
    marketKey: row.marketKey,
    side: "buy",
    px: mark,
    sz,
    feeRate: TWO_GREEN_FEE_RATE,
    leverage: 1,
    maxLeverage: plan.maxLeverage,
    reason: "order",
    at: input.now,
  })
  const rung = plan.rungs[reclaim.rungIndex]
  if (rung) {
    rung.status = "filled"
    rung.sz = sz
  }
  plan.reclaim = null
  return true
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
    ladderBars: LadderBars
    now: number
  },
  deps: LadderEngineDeps,
  marketKey: string
): boolean {
  const feed = input.ladderBars.get(ladderBarsKey("green", marketKey))
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
