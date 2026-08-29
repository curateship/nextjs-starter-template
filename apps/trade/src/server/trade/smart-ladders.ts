import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import type { CandleBar, CandleInterval } from "@/lib/protocols/contracts"
import {
  BASE_STOP_BARS,
  BASE_STOP_INTERVAL,
  baseStopPx,
  MIN_ORDER_USD,
  floorSize,
  ladderExitLevels,
  ladderWatchInterval,
  rungBudget,
  type LadderPlan,
} from "@/lib/trade/dca"
import { canOpenAnother, type EntryLimit } from "@/lib/trade/entry-limit"
import type { GridPlan } from "@/lib/trade/grid"
import type { SignalPlan } from "@/lib/trade/signal-order"
import type { WatchPlan } from "@/lib/trade/watch-order"
import { readSmartOrderKind, readSmartPlan } from "@/lib/trade/smart-plan"
import {
  holdUntil,
  marketIsCascading,
  type CascadeSettings,
} from "@/lib/trade/cascade"
import {
  ascending,
  firstOpenAfter,
  lastClosedIndex,
} from "@/lib/trade/candle-window"
import { slippedPx } from "@/lib/trade/paper"
import { db, type CustomShellDb } from "@/server/db"
import { recordFlowRunOrders } from "@/server/trade/flow-run-orders"
import { getProtocol } from "@/server/protocols/registry"
import { tradePaperOrders, tradeSmartLadders } from "@/server/trade/schema"
import { paperAccountFigures } from "@/lib/trade/paper"
import { autoReverseStoppedGrid } from "@/server/trade/grid-reversal"
import { advanceGrid, type GridRow } from "./smart-grids"
import { advanceSignal } from "./smart-signals"
import { advanceWatch } from "./smart-watch"
import {
  aimStop,
  INTERVAL_MS,
  ladderBarsKey as barsKey,
  makeFillClaimer,
  near,
  nearNullable,
  readBaseWatch,
  type LadderAdvanceInput,
  type LadderBars,
  type LadderBarsUse,
  type LadderEngineDeps,
  type LadderOrderInput,
  type SmartRow,
} from "./smart-engine"
import {
  exitOrderIdOf,
  liveOrderIds,
  type WalletBook,
} from "@/server/trade/paper"

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

// The contract every smart-order engine is driven through — the deps shape,
// the advance input, the candle feeds and the few rules both engines share —
// lives in `smart-engine.ts` so the ladder and the grid can use it without
// importing each other. Re-exported here because this file was its only home
// for a long time and plenty of callers still reach for it by this name.
export {
  ladderBarsKey,
  type LadderAdvanceInput,
  type LadderBars,
  type LadderBarsUse,
  type LadderEngineDeps,
  type LadderFeed,
  type LadderOrderInput,
} from "./smart-engine"

const DAY_MS = 86_400_000

export type LadderRow = {
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
      kind: tradeSmartLadders.kind,
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
    const kind = readSmartOrderKind(row.kind)
    if (!kind) continue
    const parsed = readSmartPlan(kind, row.plan)
    if (!parsed) continue

    // A grid needs no candles of its own. Its buys and sells are resting
    // orders, filled by the market walk that has already happened — the only
    // feed it ever wants is the 4h its base stop rides, and only when that is
    // switched on.
    if (kind === "grid") {
      const gridPlan = parsed as GridPlan
      if (gridPlan.stopLoss?.base) {
        const barMs = INTERVAL_MS[BASE_STOP_INTERVAL]
        const seenTo = gridPlan.baseWatch?.seenTo ?? 0
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
      continue
    }

    const plan = parsed as LadderPlan
    const interval = ladderWatchInterval(plan)
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

/**
 * Brings every active smart order of one wallet up to date with what the settle
 * just replayed — ladders and grids alike. Runs inside the settle's
 * transaction, after the markets were walked and before the book is saved, so
 * bracket changes ride the same save and a half-advanced order can never reach
 * the database.
 */
export async function advanceLadders(
  input: LadderAdvanceInput & { tx: CustomShellDb; userId: string },
  deps: Omit<LadderEngineDeps, "insertOrder" | "saveLadder">
): Promise<void> {
  const rows = await input.tx
    .select({
      id: tradeSmartLadders.id,
      marketKey: tradeSmartLadders.marketKey,
      kind: tradeSmartLadders.kind,
      plan: tradeSmartLadders.plan,
      flowRunId: tradeSmartLadders.flowRunId,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, input.userId),
        eq(tradeSmartLadders.walletId, input.book.wallet.id),
        eq(tradeSmartLadders.status, "active")
      )
    )

  // The wallet's own rule, taken off the plans on it.
  //
  // It lives on the book because it counts COINS across the wallet, and no one
  // ladder can see the others. Every ladder a flow places carries the same
  // numbers, so the first one that has them answers for all of them; a wallet
  // with none is unchanged.
  for (const raw of rows) {
    const plan = readSmartPlan(readSmartOrderKind(raw.kind) ?? "dca", raw.plan)
    const limit = (plan as { entryLimit?: EntryLimit | null } | null)
      ?.entryLimit
    if (limit) {
      input.book.entryLimit = limit
      break
    }
  }

  // The same for the crash rule's leverage floor, and whether a crash is on.
  // A rung fires without ever going through a ladder, so both have to be on
  // the book before the first one is worked.
  for (const raw of rows) {
    const plan = readSmartPlan(readSmartOrderKind(raw.kind) ?? "dca", raw.plan)
    const cascade = (plan as { cascade?: CascadeSettings | null } | null)
      ?.cascade
    if (!cascade) continue
    const cascading = input.cascading ?? cascadingFromLadderBars(cascade, input)
    input.book.crashEntry = {
      cascading,
      leastLeverage: cascade.leastLeverage ?? null,
    }
    break
  }

  for (const raw of rows) {
    const kind = readSmartOrderKind(raw.kind)
    if (!kind) continue
    const plan = readSmartPlan(kind, raw.plan)
    if (!plan) continue
    // Built per row rather than once, so every order this smart order sends
    // carries the flow that placed it — a rung's sell as much as its buy.
    const withDatabase: LadderEngineDeps = {
      ...deps,
      insertOrder: (order) =>
        insertLadderOrder(input.tx, input.userId, input.book, order, {
          flowRunId: raw.flowRunId,
          ladderId: raw.id,
        }),
      saveLadder: (row, status, now) =>
        saveLadderRow(input.tx, input.userId, row, status, now),
    }
    if (kind === "grid") {
      const row: GridRow = {
        id: raw.id,
        marketKey: raw.marketKey,
        plan: plan as GridPlan,
      }
      // The engine is pure and cannot reverse a grid itself. Watch what it
      // writes: a grid that closes on this pass with its stop fired and the
      // reverse switch on is turned around HERE, inside the same settle
      // transaction — old grid done and new grid written together, so there
      // is never a moment with two active smart orders on the coin.
      const closedAs = { status: "active" as "active" | "done" }
      await advanceGrid(
        input,
        {
          ...withDatabase,
          saveLadder: (savedRow, status, at) => {
            closedAs.status = status
            return withDatabase.saveLadder(savedRow, status, at)
          },
        },
        row
      )
      if (closedAs.status === "done" && row.plan.reverseWhenStopped) {
        const marks = input.marks
        const figures = paperAccountFigures({
          startingBalance: input.book.wallet.startingBalance,
          realized: input.book.cash - input.book.wallet.startingBalance,
          positions: [...input.book.positions.values()],
          marks,
        })
        await autoReverseStoppedGrid({
          tx: input.tx,
          userId: input.userId,
          wallet: input.book.wallet,
          oldId: raw.id,
          marketKey: raw.marketKey,
          plan: row.plan,
          mark: marks.get(raw.marketKey) ?? null,
          equity: figures.equity,
          takerFeeRate: input.book.costs.takerFeeRate,
          now: input.now,
        })
      }
      continue
    }
    if (kind === "signal") {
      await advanceSignal(input, withDatabase, {
        id: raw.id,
        marketKey: raw.marketKey,
        plan: plan as SignalPlan,
      })
      continue
    }
    if (kind === "watch") {
      await advanceWatch(input, withDatabase, {
        id: raw.id,
        marketKey: raw.marketKey,
        plan: plan as WatchPlan,
      })
      continue
    }
    const row: LadderRow = {
      id: raw.id,
      marketKey: raw.marketKey,
      plan: plan as LadderPlan,
    }
    await advanceOne(input, withDatabase, row)
  }
}

/**
 * The crash signal, read off the candles a live pass already has.
 *
 * **What this can and cannot see.** The replay holds every coin in the run;
 * a live pass only holds candles for markets that currently have a ladder
 * working. So the count is "how many of the coins I am trading are collapsing",
 * not "how many coins exist". For the flow this was built for — a ladder on
 * every coin in the list — those are the same thing. For somebody running five
 * ladders they are not, and a `minCoins` of ten can never be reached. That is
 * the honest limit of asking the question from here, and it fails SAFE: the
 * rule does not fire, and the ladder sells exactly as it always did.
 *
 * Answered once per pass and remembered against the candle map, because every
 * ladder in the same pass is asking the identical question of the identical
 * candles.
 */
const cascadeAnswers = new WeakMap<object, Map<string, boolean>>()

function cascadingFromLadderBars(
  settings: CascadeSettings,
  input: LadderAdvanceInput
): boolean {
  const memo =
    cascadeAnswers.get(input.ladderBars) ?? new Map<string, boolean>()
  cascadeAnswers.set(input.ladderBars, memo)
  const stamp = `${input.now}:${settings.fallPct}:${settings.withinHours}:${settings.minCoins}`
  const seen = memo.get(stamp)
  if (seen !== undefined) return seen

  const coins = new Map<string, readonly CandleBar[]>()
  for (const [key, feed] of input.ladderBars) {
    // Only the ladder's own timeframe. The 4h base feed is the same market
    // again, and counting it twice would let five coins look like ten.
    if (!key.startsWith("green:")) continue
    coins.set(key.slice("green:".length), feed.bars)
  }
  const answer = marketIsCascading({ settings, coins, now: input.now })
  memo.set(stamp, answer)
  return answer
}

export async function advanceOne(
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  row: LadderRow
): Promise<void> {
  const { book, now } = input
  const plan = row.plan
  const roundPx = (px: number) =>
    getProtocol(book.wallet.protocol).markets.roundPx(
      px,
      plan.sizeDecimals,
      plan.priceTick
    )
  let changed = false

  // ----- Is the market falling off a cliff? ------------------------------
  //
  // Worked out here when the caller did not, which is what makes this work for
  // real money and not only in a replay. The replay knows every coin in the
  // run and says so; the practice and live engines each call straight into
  // here with the candles they already hold, and neither had any way to pass
  // an answer. Left as it was, the whole rule was a backtest feature.
  //
  // Remembered on the plan the moment it is seen, so the hold survives a
  // restart. The engine going down mid-crash is not a hypothetical — that is
  // when it is busiest — and a ladder that forgot would come back up and sell
  // the whole thing into the hole it was deliberately waiting out.
  const cascading =
    input.cascading ??
    (plan.cascade ? cascadingFromLadderBars(plan.cascade, input) : false)
  if (plan.cascade && cascading) {
    plan.cascadeSeenAt = now
    changed = true
  }
  const holdingOut =
    plan.cascade !== null &&
    plan.cascadeSeenAt !== null &&
    now < holdUntil(plan.cascade, plan.cascadeSeenAt)

  // ----- What just happened to the ladder's orders -----------------------

  const live = liveOrderIds(book)
  // This settle's fills, each spent on at most one rung — two rungs at the
  // same price must not both claim the same fill.
  const fillFor = makeFillClaimer(book, row.marketKey)

  for (const rung of plan.rungs) {
    if (rung.status === "waiting" && rung.orderId && !live.has(rung.orderId)) {
      // The rung's order is gone: it bought, or the engine dropped it — a
      // cancel by hand, or a buy the account could no longer afford.
      const exitId = exitOrderIdOf(rung.orderId)
      rung.orderId = null
      // A rung whose order vanished without filling goes back to WAITING —
      // never "skipped". The only thing that drops a rung's order besides a
      // fill is the engine refusing it for money, and money comes back; a
      // cancel by hand marks the rung "cancelled" itself and never comes
      // through here. The revive pass owns a waiting rung from there: it
      // re-arms it above the market, fires it at the market when price has
      // already passed it and the wallet rules allow, and otherwise keeps
      // waiting. "Skipped for ever" is what emptied CLO's deepest rung on
      // 6 Feb 2026 — dropped for cash mid-crash, stamped skipped at the
      // candle's end, never bought the bottom it was built for.
      rung.status = fillFor("buy", rung.px, rung.sz) ? "filled" : "waiting"
      // The exit that rode along with the buy is already on the book, or has
      // already filled. Claiming it here is what stops the block below from
      // placing a second sell at the same price.
      // Mid-crash there IS no exit riding along — it was withheld — so
      // claiming one here would leave the rung pointing at an order that does
      // not exist, and block the real sell from ever being placed once the
      // hold ends.
      if (
        rung.status === "filled" &&
        plan.takeProfit?.mode === "prevRung" &&
        !holdingOut
      ) {
        rung.sellOrderId = exitId
      }
      changed = true
    }
    if (rung.sellOrderId && !live.has(rung.sellOrderId)) {
      // Its sell is gone: sold at the rung above, or dropped because the
      // position it was to reduce is no longer there.
      const target = ladderExitLevels(plan)[plan.rungs.indexOf(rung)]
      rung.sellOrderId = null
      if (
        rung.status === "filled" &&
        fillFor("sell", roundPx(target), rung.sz)
      ) {
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

  // ----- The rungs themselves -------------------------------------------

  // Two-green waits for its confirmation candles; every other ladder's rungs
  // are triggers, fired off the live price the moment it crosses them.
  if (plan.twoGreen) {
    if (watchCandles(plan, input, deps, row.marketKey)) changed = true
  } else if (plan.rungEntry === "market") {
    if (fireRungsOnMark(plan, input, deps, row.marketKey)) changed = true
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
  // just stepped down is flat ON PURPOSE: it sold at a stop and the next rung
  // has not bought yet. Without this the very next settle would read "sold
  // everything, holding nothing" and close the ladder it just stepped.
  //
  // It has to be "just" stepped, not "ever" stepped — see the note on
  // `awaitingSteppedRung`.
  const betweenRungs = plan.awaitingSteppedRung && anyWaiting

  // Wiped out — and the rungs below carry on.
  //
  // A liquidation is not the ladder finishing. It is the exchange taking one
  // position away while the wallet still holds money, and the rungs under it
  // are the whole reason the ladder exists: on 10 October 2025 GALA bought two
  // rungs, was wiped at 0.006146, and had three rungs waiting between there
  // and a fall of 66% — with $4,044 of the $6,956 wallet sitting free. Ending
  // the ladder there cancelled all three.
  //
  // Only the rungs that had already bought are gone with the position. The
  // ones still waiting have spent nothing, so nothing has happened to them.
  // Off the sticky set, not off `fills`: a minute-walked candle drains its
  // fills every minute, and the evidence disappeared before this question was
  // asked — the ladder died in exactly the candle it was built to survive.
  //
  // And REMEMBERED ON THE PLAN, because one candle is not long enough either:
  // mid-crash the crash rule itself can refuse the re-buy for candles on end
  // — a 3x coin during a cascade with a 10x floor — and the pass after the
  // flag faded read the ladder as finished. CLO on 6 Feb 2026 lost its rung 6
  // exactly that way.
  if (book.liquidatedThisPass.has(row.marketKey) && anyWaiting) {
    if (!plan.awaitingRungAfterWipe) {
      plan.awaitingRungAfterWipe = true
      changed = true
    }
  }
  const wipedOut = plan.awaitingRungAfterWipe

  const over =
    // The trade exited — stop, target, closed by hand, or every slice sold.
    // However it went, buying deeper is no longer the plan. A liquidation is
    // the exception: see above.
    (anyBought && !position && !betweenRungs && !(wipedOut && anyWaiting)) ||
    // Turned into a short by hand: a buy ladder has no business adding to it.
    (position !== null && position.szi < 0) ||
    // Nothing waiting, nothing held, nothing resting: there is no ladder left.
    (!anyWaiting && !position && !anySellResting)

  if (over) {
    for (const rung of plan.rungs) {
      if (rung.orderId && live.has(rung.orderId)) {
        deps.dropOrder(book, rung.orderId)
      }
      if (rung.sellOrderId && live.has(rung.sellOrderId)) {
        deps.dropOrder(book, rung.sellOrderId)
      }
      rung.orderId = null
      rung.sellOrderId = null
      if (rung.status === "waiting") rung.status = "cancelled"
    }
    await persistLadder(input, deps, row, "done")
    return
  }

  // ----- Putting back a rung the stop took --------------------------------

  if (reclaimRung(plan, input, deps, row)) changed = true

  // ----- Aim the brackets the ladder manages -----------------------------

  // Re-read: a buy-back a moment ago opened the position this aims at.
  const held = book.positions.get(row.marketKey) ?? null

  // Nothing held means nothing to remember aiming at.
  //
  // `aimBrackets` below reads a stop that is not the one it last wrote as "a
  // hand moved this", and from then on it leaves that side alone forever. A
  // position that has closed and been replaced by a fresh one looks exactly
  // like that: the plan still remembers the old stop while the new position
  // carries none. The ladder then decided its stop had been taken off by hand
  // and never aimed one again — on YGG that was six rungs bought all the way
  // down an 80% fall with no stop behind any of them. A stop-out already
  // cleared these; a take-profit exit did not, which is the whole difference.
  if (!held || held.szi <= 0) {
    if (plan.aimedTpPx !== null || plan.aimedSlPx !== null) {
      plan.aimedTpPx = null
      plan.aimedSlPx = null
      changed = true
    }
  }

  if (held && held.szi > 0) {
    // Something is held again, so whatever the stop took has been replaced.
    if (plan.awaitingSteppedRung) {
      plan.awaitingSteppedRung = false
      changed = true
    }
    // And whatever the exchange took has been re-bought: the wipe is over.
    if (plan.awaitingRungAfterWipe) {
      plan.awaitingRungAfterWipe = false
      changed = true
    }

    if (aimBrackets(plan, held, roundPx)) {
      // The aim changed the position row, so the save has to know — and the
      // stamp moves so a bracket cannot be fired by candles older than itself.
      held.updatedAt = now
      book.touchedMarkets.add(row.marketKey)
      changed = true
    }

    // "Sell at previous rung": every bought rung gets its own sell, resting
    // at the price of the rung above it — the first at the click itself.
    //
    // Not while the market is falling off a cliff. This is the whole point of
    // the crash rule: the ladder's biggest bet is its deepest rung, and the
    // rung above it is barely off the floor, so selling there hands the
    // largest slice of the trade the smallest part of the bounce. The sells
    // are not moved or cancelled, just not placed yet — when the hold ends
    // this block runs as it always did.
    if (plan.takeProfit?.mode === "prevRung" && !holdingOut) {
      const exits = ladderExitLevels(plan)
      const mark = input.marks.get(row.marketKey) ?? null
      for (const [index, rung] of plan.rungs.entries()) {
        if (rung.status !== "filled" || rung.sellOrderId) continue
        // At the rung above, or at the market if price is already past it.
        //
        // A sell resting BELOW the market is a sale that has already happened
        // everywhere except here: a real exchange fills it instantly at the
        // better price. This engine only fills an order when price crosses it,
        // so one left at a stale level simply waits for the market to come
        // back down — which after a crash it does not. That stranded the three
        // biggest lots of every held ladder, open forever.
        //
        // Below the market it is untouched, which is every ordinary sale.
        rung.sellOrderId = await deps.insertOrder({
          marketKey: row.marketKey,
          side: "sell",
          px: roundPx(
            mark !== null && mark > exits[index] ? mark : exits[index]
          ),
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
  if (await reviveRungs(plan, input, deps, row, holdingOut)) changed = true

  if (changed) await persistLadder(input, deps, row, "active")
}

/**
 * Keeps the position's target and stop where the ladder's rules say — unless
 * a hand has moved them. The plan remembers what it last wrote (`aimedTpPx`,
 * `aimedSlPx`); a position carrying anything else was changed on purpose, and
 * from then on that side is fixed rather than quietly dragged back.
 */
function aimBrackets(
  plan: LadderPlan,
  position: {
    tpPx: number | null
    slPx: number | null
    entryPx: number
    updatedAt: number
  },
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
    // The same rule the grid uses, from the one place it lives: follow the
    // stop until a hand moves it, then never touch it again.
    if (
      aimStop(
        plan,
        position,
        wantedStopPx(plan, position.entryPx, roundPx),
        () => {
          sl.mode = "fixed"
          sl.pct = null
        }
      )
    ) {
      changed = true
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
  const live = liveOrderIds(input.book)
  let changed = false
  for (const rung of plan.rungs) {
    if (rung.status !== "waiting") continue
    const shouldBeDead = slPx !== null && rung.px <= slPx
    if (shouldBeDead && !rung.dead) {
      rung.dead = true
      if (rung.orderId && live.has(rung.orderId)) {
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
    book: WalletBook
    marks: ReadonlyMap<string, number>
    now: number
    /** The candle this pass is inside has not finished — see `advanceOne`. */
    midCandle?: boolean
  },
  deps: LadderEngineDeps,
  row: LadderRow,
  /** The market is falling off a cliff, so exits do not ride along with buys. */
  holdingOut: boolean
): Promise<boolean> {
  // Nothing rests when the rungs buy at market: there is no order to revive.
  if (plan.twoGreen || plan.rungEntry === "market") return false
  const mark = input.marks.get(row.marketKey) ?? null
  let changed = false
  for (const rung of plan.rungs) {
    if (rung.status !== "waiting" || rung.dead || rung.orderId) continue
    changed = true
    // A rung the price has already gone past FIRES AT THE MARKET, exactly as
    // it would live — never as a resting order at its own stale price.
    //
    // Live, a rung is a trigger: price at or under the level with money free
    // means buy now, at whatever the price is. The replay used to write these
    // rungs off instead ("skipped"), because re-resting a LIMIT below the
    // market fills next bar at the price the market already left and
    // manufactures money — one DEXE crash became a column of free round
    // trips that way. Filling at the CURRENT mark keeps both truths: the
    // rung still buys, and it pays today's price, not yesterday's. CLO on
    // 6 Feb 2026 is the case this exists for — the crash rule rightly held
    // its deepest rung back while price fell through the level, and "skipped
    // for ever" was the replay lying about what live would have done.
    //
    // The same gates as a live trigger: never mid-candle (the end-of-candle
    // price is the honest one), never opening a coin the wallet-wide rules
    // refuse, never with money that is not there — and a refusal leaves the
    // rung WAITING, to try again when the rule lets go.
    if (mark !== null && mark <= rung.px) {
      if (input.midCandle) continue
      if (
        !mayOpenCoin(input.book, row.marketKey, plan.maxLeverage, input.now)
      ) {
        continue
      }
      const px = slippedPx(mark, "buy", input.book.costs.slippageRate)
      if (px * rung.sz < MIN_ORDER_USD) continue
      if ((px * rung.sz) / plan.leverage > deps.freeCash(input.book) + 1e-9) {
        continue
      }
      deps.fill(input.book, {
        marketKey: row.marketKey,
        side: "buy",
        px,
        sz: rung.sz,
        feeRate: input.book.costs.takerFeeRate,
        leverage: plan.leverage,
        maxLeverage: plan.maxLeverage,
        reduceOnly: false,
        reason: "order",
        at: input.now,
      })
      rung.status = "filled"
      continue
    }
    rung.orderId = await deps.insertOrder({
      marketKey: row.marketKey,
      side: "buy",
      px: rung.px,
      sz: rung.sz,
      // The ladder's own leverage, not a flat 1. A rung armed at placement got
      // `plan.leverage` and one revived here got cash, so the same ladder held
      // two different kinds of position depending on whether a stop had been
      // through it. On a live or practice wallet the plan always says 1 and
      // nothing changes; in a replay it is the difference between a borrowed
      // ladder and half a borrowed ladder.
      leverage: plan.leverage,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      now: input.now,
      // "Sell at the rung above" is known before the buy happens, so it rides
      // along and rests the moment the buy fills.
      //
      // Except mid-crash. This is the one that matters most in a replay: the
      // whole ladder buys and sells inside a single four-hour candle, so an
      // exit riding along with the buy is the ONLY way the deepest rung ever
      // gets sold at the floor. Withholding it here is what actually lets the
      // biggest slice ride the bounce.
      exitPx:
        plan.takeProfit?.mode === "prevRung" && !holdingOut
          ? ladderExitLevels(plan)[plan.rungs.indexOf(rung)]
          : null,
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
  // What this ladder was placed with — all four of them, from the one place
  // the plan keeps them.
  const detection = plan.baseDetection
  const feed = input.ladderBars.get(barsKey("base", marketKey))
  if (!feed) return false

  const seenTo = plan.baseWatch?.seenTo ?? 0
  // The bar still being filled in is left out: it cannot have confirmed a
  // level, and a close that has not happened cannot start a clock either.
  const read = readBaseWatch(
    feed,
    detection,
    input.now,
    plan.baseWatch?.levelPx ?? null
  )
  if (!read) return false
  plan.baseWatch = read.watch
  const { bars, cut } = read
  // Nothing came back — a market too new to have history, or a call that
  // failed. The watch above notes that we looked, so this is not asked again
  // every four seconds, and the level is left exactly as it was.
  if (cut < 0) return true

  const reclaim = plan.reclaim
  if (reclaim && stop && stop.reclaimDays > 0) {
    // Only the bars this ladder has not read yet, which is what the skip below
    // used to work out the long way round — from the start of the history,
    // every pass.
    for (let i = firstOpenAfter(bars, seenTo - feed.barMs); i <= cut; i += 1) {
      const bar = bars[i]
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

  const live = liveOrderIds(input.book)
  for (const [index, rung] of plan.rungs.entries()) {
    if (rung.orderId && live.has(rung.orderId)) {
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

  const live = liveOrderIds(book)
  for (const rung of plan.rungs) {
    if (rung.orderId && live.has(rung.orderId)) {
      deps.dropOrder(book, rung.orderId)
    }
    if (rung.sellOrderId && live.has(rung.sellOrderId)) {
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
  plan.awaitingSteppedRung = true
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
  input: Pick<LadderAdvanceInput, "book" | "marks" | "now">,
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

  // Kept armed, not thrown away: money can be moved onto the market later.

  const sz = floorSize(reclaim.dollars / mark, plan.sizeDecimals)
  const cost = sz * mark
  if (sz <= 0 || cost < MIN_ORDER_USD) {
    // Too small to be an order at this price, and it will not grow — waiting
    // longer only means checking forever.
    plan.reclaim = null
    return true
  }
  // Not affordable this minute. Left armed rather than thrown away: cash frees
  // up when another market's trade closes.
  if (cost > deps.freeCash(input.book) + 1e-9) return false

  const rung = plan.rungs[reclaim.rungIndex]
  const priorStatus = rung?.status
  const priorSz = rung?.sz
  deps.fill(input.book, {
    marketKey: row.marketKey,
    side: "buy",
    // A buy-back is a market order, so it pays the book's slippage. Zero for a
    // practice wallet, which is where this number came in.
    px: slippedPx(mark, "buy", input.book.costs.slippageRate),
    sz,
    feeRate: input.book.costs.takerFeeRate,
    leverage: 1,
    maxLeverage: plan.maxLeverage,
    reduceOnly: false,
    reason: "order",
    at: input.now,
    undo: () => {
      if (rung && priorStatus !== undefined && priorSz !== undefined) {
        rung.status = priorStatus
        rung.sz = priorSz
      }
      plan.reclaim = reclaim
    },
  })
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
  input: Pick<LadderAdvanceInput, "book" | "ladderBars" | "now">,
  deps: LadderEngineDeps,
  marketKey: string
): boolean {
  const feed = input.ladderBars.get(barsKey("green", marketKey))
  if (!feed || feed.bars.length === 0) return false

  // A ladder that has never watched starts from the moment it existed, never
  // from the start of the feed — without that, the first pass walked every
  // candle in history and bought rungs on bars from months before it was
  // placed.
  //
  // **The minus one millisecond is a replay's arming bar.** A backtest arms a
  // ladder at the exact close of a bar, and the next bar opens at that same
  // instant. `firstOpenAfter` is strictly "after", so a ladder armed on the
  // boundary never read the first bar of its own life and a dip on it was
  // silently missed. Live placements happen mid-bar, where no bar opens
  // inside that millisecond, so this changes nothing for them.
  const seenTo = plan.green?.seenTo ?? plan.startedAt - 1
  let lastGreen = plan.green?.lastGreen ?? false
  let newest = seenTo
  let changed = false

  // The stretch this ladder has not read yet, named by two binary searches
  // rather than a walk of the whole feed. A replay hands the entire history
  // over on every bar, so filtering it here was the run's biggest single cost
  // after the base.
  const bars = ascending(feed.bars)
  const from = firstOpenAfter(bars, seenTo)
  const to = lastClosedIndex(bars, feed.barMs, input.now)

  for (let i = from; i <= to; i += 1) {
    const bar = bars[i]
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
    // The two green closes ARE the trigger in this mode — a touched rung
    // waits for them, however far price fell in the meantime.
    if (!twoGreenNow) continue

    const next = plan.rungs.find(
      (rung) => rung.status === "waiting" && !rung.dead && rung.touched
    )
    if (!next) continue

    // Bought at the confirming candle's close, at market — so it pays the
    // spread. And it spends the rung's DOLLARS at that price, rather than a
    // coin count fixed at a level it never filled at.
    const reached = bar.close
    const px = slippedPx(reached, "buy", input.book.costs.slippageRate)
    const sz = floorSize(rungBudget(next) / px, plan.sizeDecimals)
    if (sz <= 0) continue
    if (!mayOpenCoin(input.book, marketKey, plan.maxLeverage, input.now)) {
      continue
    }
    if (px * sz > deps.freeCash(input.book) + 1e-9) continue
    const priorSz = next.sz

    deps.fill(input.book, {
      marketKey,
      side: "buy",
      // Confirmation buys at market, so it pays the book's slippage too.
      px,
      sz,
      feeRate: input.book.costs.takerFeeRate,
      leverage: 1,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      reason: "order",
      at: bar.openTime + feed.barMs,
      undo: () => {
        next.status = "waiting"
        next.sz = priorSz
      },
    })
    next.sz = sz
    next.status = "filled"
  }

  if (changed) {
    plan.green = { seenTo: newest, lastGreen }
  }
  return changed
}

/**
 * Buys every rung the live price has crossed, at that price, right now.
 *
 * **This is the trigger.** A rung is a price being watched, never an order,
 * and the moment the mark is at or under it the buy goes out — mid-candle,
 * the same way the grid fires its levels. The candle-close version of this
 * bought one rung per bar and missed the crash a ladder exists for: a fall
 * through three rungs inside one four-hour candle is the day the strategy is
 * about, and it bought once.
 *
 * Every crossed rung fires in one pass, shallowest first. Each buys at the
 * price actually there — at worst the rung, at best the gap below it — and
 * spends the rung's DOLLARS at that price rather than a coin count fixed at a
 * price it never saw. A rung it cannot afford stays waiting: the pot moves,
 * and the next look is seconds away.
 */
/**
 * May this ladder open a NEW coin on this wallet right now?
 *
 * The wallet-wide rules — the entry cap and the crash rule's leverage floor —
 * are enforced where a rung actually fires. The replay's rungs rest as orders
 * and are gated inside `fillOrder`; a practice or live rung is a TRIGGER that
 * calls `deps.fill` directly, and without this check both rules were
 * backtest-only: the one wallet they exist for — real money on a crash day —
 * never saw them.
 *
 * Adding to a coin already held is never limited; the answer only matters for
 * the fill that would open one. A refused rung is left waiting, and the next
 * pass asks again — room comes back as the window moves and the crash ends.
 */
export function mayOpenCoin(
  book: WalletBook,
  marketKey: string,
  maxLeverage: number,
  now: number
): boolean {
  const held = book.positions.get(marketKey)
  if (held && Math.abs(held.szi) > 1e-12) return true
  if (
    book.crashEntry.cascading &&
    book.crashEntry.leastLeverage !== null &&
    maxLeverage < book.crashEntry.leastLeverage
  ) {
    return false
  }
  return canOpenAnother(book.entryLimit, book.openedAt, now)
}

function fireRungsOnMark(
  plan: LadderPlan,
  input: LadderAdvanceInput,
  deps: LadderEngineDeps,
  marketKey: string
): boolean {
  const mark = input.marks.get(marketKey)
  if (mark === undefined || !(mark > 0)) return false

  let changed = false
  for (const rung of plan.rungs) {
    if (rung.status !== "waiting" || rung.dead || mark > rung.px) continue
    const px = slippedPx(mark, "buy", input.book.costs.slippageRate)
    const sz = floorSize(rungBudget(rung) / px, plan.sizeDecimals)
    if (sz <= 0) continue
    // Under the exchange's minimum, the order is refused before it exists —
    // sending it anyway spent a request to be told no, and the refusal path
    // then recorded the rung as bought with nothing behind it. The rung stays
    // waiting instead: pots move, and a rung too small today may clear the
    // bar tomorrow. The buy-back path applies the same rule.
    if (px * sz < MIN_ORDER_USD) continue
    if (!mayOpenCoin(input.book, marketKey, plan.maxLeverage, input.now)) {
      continue
    }
    if (px * sz > deps.freeCash(input.book) + 1e-9) continue
    const priorSz = rung.sz
    deps.fill(input.book, {
      marketKey,
      side: "buy",
      px,
      sz,
      feeRate: input.book.costs.takerFeeRate,
      leverage: 1,
      maxLeverage: plan.maxLeverage,
      reduceOnly: false,
      reason: "order",
      at: input.now,
      undo: () => {
        rung.status = "waiting"
        rung.sz = priorSz
      },
    })
    rung.sz = sz
    rung.status = "filled"
    changed = true
  }
  return changed
}

async function insertLadderOrder(
  tx: CustomShellDb,
  userId: string,
  book: WalletBook,
  input: LadderOrderInput,
  owner: { flowRunId: string | null; ladderId: string }
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
  // The practice engine's own ids, kept in the same ledger the real ones go
  // in. A practice fill carries the order it came from and nothing about the
  // flow, exactly like a real one, so it needs exactly the same answer.
  await recordFlowRunOrders(tx, {
    userId,
    walletId: book.wallet.id,
    flowRunId: owner.flowRunId,
    ladderId: owner.ladderId,
    marketKey: input.marketKey,
    orderIds: [id],
  })
  return id
}

async function saveLadderRow(
  tx: CustomShellDb,
  userId: string,
  row: SmartRow,
  status: "active" | "done",
  now: number
): Promise<void> {
  await tx
    .update(tradeSmartLadders)
    .set({ plan: row.plan, status, updatedAt: new Date(now) })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, row.id)
      )
    )
}

async function persistLadder(
  input: { now: number },
  deps: LadderEngineDeps,
  row: LadderRow,
  status: "active" | "done"
): Promise<void> {
  await deps.saveLadder(row, status, input.now)
}
