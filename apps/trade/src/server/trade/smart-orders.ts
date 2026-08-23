import { randomUUID } from "node:crypto"

import { and, eq, inArray, ne } from "drizzle-orm"

import { parseMarketKey, type CandleInterval } from "@/lib/protocols/contracts"
import {
  CASH_ONLY,
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  type DcaParams,
  type LadderPlan,
  type LadderRungState,
} from "@/lib/trade/dca"
import type { GridPlan } from "@/lib/trade/grid"
import type { PaperSide } from "@/lib/trade/paper"
import { readWatchPlan, type WatchPlan } from "@/lib/trade/watch-order"
import type { SignalPlan } from "@/lib/trade/signal-order"
import {
  readSmartOrderKind,
  readSmartPlan,
  type SmartOrder,
  type SmartPlan,
} from "@/lib/trade/smart-plan"
import { isMarketable, paperAccountFigures } from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketBaseInForce } from "@/server/trade/base-level"
import { marketRules } from "@/server/trade/market-rules"
import { recordFlowRunOrders } from "@/server/trade/flow-run-orders"
import {
  exposedMarketKeys,
  freeCash,
  marksForKeys,
  saveBook,
  settleWallet,
} from "@/server/trade/paper"
import { wantedStopPx } from "./smart-ladders"
import {
  tradeFlowRuns,
  tradePaperOrders,
  tradePaperPositions,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * Placing and steering smart-order ladders — the actions behind the
 * right-click window. The engine half, what a ladder does as price moves,
 * lives in `smart-ladders.ts` and runs inside every settle.
 *
 * Placement is all-or-nothing: the whole ladder is checked — every rung big
 * enough to be an order, the whole cost within the free cash, the order cap —
 * and only then written. A ladder that is refused places nothing. The browser
 * never sends a size; every number is derived here from the same arithmetic
 * the window used, so what was shown is what is placed.
 */

export type PlaceLadderInput = {
  marketKey: string
  /** The right-clicked price. Used only when the ladder hangs off the click. */
  clickPx: number
  /** The chart's timeframe at placement — what two-green mode watches. */
  interval: CandleInterval
  params: DcaParams
  /**
   * The pot this ladder is a share of, when it is not the whole wallet.
   *
   * A hand-placed ladder measures "most of the pot, per coin" against the
   * wallet itself. A flow measures it against the money that flow was given —
   * so twenty coins on a $500 cap size themselves off $500, not off everything
   * in the account. Left out by every hand-placed ladder, which is why it is
   * optional rather than a fourth meaning bolted onto an existing field.
   */
  potUsd?: number
  /**
   * The switched-on flow placing this, when a flow is placing it.
   *
   * Left out by every hand-placed ladder, and that is the whole point: it is
   * what lets a run's dashboard show its own trades and leave alone the ones
   * somebody placed themselves on the same wallet.
   */
  flowRunId?: string | null
}

export type PlacedLadder = {
  /** How many rungs the ladder has. */
  placed: number
  /** Rungs price had already passed, so they never got a chance to wait. */
  passed: number
}

/**
 * Everything a ladder needs to be worked out, with nothing that reaches a
 * database, a clock or the exchange. Handed in so the same arithmetic serves
 * the right-click window and a replay of last March.
 */
export type LadderDraftInput = {
  marketKey: string
  params: DcaParams
  /** The chart's timeframe at placement — what two-green mode watches. */
  interval: CandleInterval
  /** The right-clicked price. Only read when the ladder hangs off the click. */
  clickPx: number
  /** Today's price for this market. */
  mark: number
  /** The confirmed base, or null when there is none. Only read when anchoring to it. */
  base: number | null
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
  freeCash: number
  /** When this ladder is being created, in epoch ms — where its watch starts. */
  startedAt?: number
  /** What is already held in this market, signed, or null when nothing is. */
  heldSzi: number | null
}

export type LadderDraft = {
  plan: LadderPlan
  rungs: LadderRungState[]
}

/**
 * The ladder a set of settings describes: where it hangs from, what each rung
 * costs, and every reason it might be refused.
 *
 * Its own function because two very different callers need exactly this
 * decision and must never disagree about it. `placeDcaLadder` below fetches
 * the base and the prices and then asks this; a backtest replays a candle,
 * reads the base off the bars it already has, and asks this. A rung refused on
 * the chart is refused in the test, with the same code, for the same reason.
 *
 * Throws the refusal codes; the API layer owns the sentences.
 */
export function draftDcaLadder(input: LadderDraftInput): LadderDraft {
  const { params, rules, roundPx, mark } = input

  // Where rung 1 is measured from. The base is the QFL rule and the default:
  // the ladder hangs off the level it is betting on, and each rung after steps
  // down from the one above. The click is the way out for a ladder somewhere
  // the indicator has not marked.
  let anchorPx: number
  if (params.anchor === "click") {
    anchorPx = roundPx(input.clickPx)
    if (!(anchorPx > 0)) throw new Error("PAPER_PRICE")
  } else {
    if (input.base === null) throw new Error("SMART_LADDER_NO_BASE")
    anchorPx = roundPx(input.base)
    if (!(anchorPx > 0)) throw new Error("PAPER_PRICE")
    // **Price being under the base is not a reason to refuse.**
    //
    // It used to be: "the level has gone, wait for a new one". In practice it
    // threw away coins it had no reason to. A ladder's rungs sit 20% or more
    // below the base, so a coin a few percent under it still has every rung
    // far below today's price and buys nothing today — NEO sat refused at
    // $1.65 against a base of $1.72 while its rungs were $1.38, $1.06 and
    // $0.78.
    //
    // The case the rule was really about — price so far under the base that
    // the rungs are above the market, so the ladder buys instantly into a
    // fall — is already handled below and better: each rung price is compared
    // with today's price, one that has been passed is marked skipped, and a
    // ladder with nothing left below the market is refused outright with
    // `SMART_LADDER_ABOVE_MARKET`. That asks about the prices being bought at
    // rather than about the level they were measured from.
  }

  if (input.heldSzi !== null && input.heldSzi < 0) {
    throw new Error("SMART_SHORT_HELD")
  }

  // The same arithmetic the window showed, then each level snapped to the
  // market's price grid — sizes never round up into more risk.
  const drawn = dcaLadderPlan({
    anchorPx,
    equity: input.equity,
    params,
    sizeDecimals: rules.sizeDecimals,
    volume24hUsd: rules.volume24hUsd,
  })

  // A rung that rounds away to nothing can never become an order. A stated
  // dollar floor is checked for the whole plan here too: allowing the valid
  // rungs through and refusing only the thin ones would create half a plan.
  const priced = drawn.rungs.map((rung, index) => {
    const px = roundPx(rung.px)
    const sz = floorSize(rung.sz, rules.sizeDecimals)
    if (!(px > 0) || sz <= 0) {
      throw new Error(`SMART_RUNG_TOO_SMALL:${index + 1}`)
    }
    return { px, sz }
  })
  const floor = rules.minOrderValueUsd ?? null
  if (floor !== null && priced.some((rung) => rung.px * rung.sz < floor)) {
    const total = priced.reduce((sum, rung) => sum + rung.px * rung.sz, 0)
    const covered = Math.min(priced.length, Math.floor(total / floor + 1e-9))
    throw new Error(
      `SMART_RUNG_DOLLAR_FLOOR:${floor}:${total}:${covered}:${priced.length}`
    )
  }

  const twoGreen = params.twoGreen

  const maxLeverage = rules.maxLeverage ?? 1
  // Held to the coin's ceiling ONLY when the coin actually named one. The
  // exchange would refuse a bigger ask at the moment of the buy, which reads as
  // the strategy failing rather than as a number somebody typed.
  //
  // The `?? 1` above is "nobody said", not a limit of one, and clamping to it
  // would quietly turn every ladder on a market with no stated ceiling back
  // into cash — which is most of a Binance replay, and is exactly the bug where
  // 2x did nothing at all.
  const leverage =
    rules.maxLeverage === null
      ? params.leverage
      : Math.min(params.leverage, rules.maxLeverage)

  // Only what could be committed at once has to be affordable now. Placing
  // commits nothing — each rung is bought when price reaches it, and the cash
  // is re-checked then — so the whole-ladder cost is not the question, and
  // asking it refused ladders over money they would never hold at one time.
  // There is no order-cap check for the same reason: placing puts nothing on
  // the book.
  //
  // Divided by the leverage because that is what the cash has to cover: a
  // borrowed rung holding $2,000 of coin is $1,000 out of the account. Asking
  // for the whole notional would refuse every borrowed ladder at the moment it
  // was placed — which is exactly what borrowing is supposed to avoid.
  const committing =
    Math.max(...priced.map((rung) => rung.px * rung.sz)) / leverage
  if (committing > input.freeCash + 1e-9) throw new Error("SMART_LADDER_COST")

  const rungs: LadderRungState[] = priced.map((rung) => {
    const state: LadderRungState = {
      px: rung.px,
      sz: rung.sz,
      status: "waiting",
      // Frozen here and never recalculated: this is the ceiling a buy-back is
      // held to, so it has to survive a rung whose size changes.
      budget: rung.px * rung.sz,
      orderId: null,
      sellOrderId: null,
      dead: false,
      touched: false,
    }
    // Still skipped when price is ALREADY below the rung, market-bought or
    // not: its moment has been and gone. Watching for the level instead of
    // resting an order does not change that — and without this, every rung
    // already under the price fills on the very next bar, which turned one
    // ladder into a cascade of buys at one price.
    if (!twoGreen && isMarketable("buy", rung.px, mark)) {
      // Price is already below this rung, so its moment has been and gone.
      //
      // It used to buy here, at the market — which is defensible for one rung
      // clicked just above the price and wrong for a ladder placed well above
      // it, where several rungs collapse into a single buy at a single price.
      // That is not a ladder, and it is not what a ladder placed above a level
      // was meant to do: this one buys as price FALLS to each rung. A rung
      // price has already passed is skipped, exactly as `reviveRungs` skips
      // one that was passed while it sat under a stop.
      //
      // Two-green mode is exempt because price being below a rung is that
      // mode's TRIGGER, not a moment it missed. Skipping them would throw
      // away the rungs it exists to buy.
      state.status = "skipped"
    }
    return state
  })

  if (rungs.every((rung) => rung.status === "skipped")) {
    throw new Error("SMART_LADDER_ABOVE_MARKET")
  }

  // Two-green mode marks nothing as skipped — price being under a rung is its
  // trigger — so the check above can never fire for it. That was covered by
  // the under-base refusal until it was removed, and without this a two-green
  // ladder placed on a coin that has fallen under its deepest rung would buy
  // EVERY rung at once on the next two green candles: the cascade of buys at
  // one price the skip rule above exists to prevent, arriving through the one
  // door that rule does not watch.
  if (twoGreen && rungs.every((rung) => isMarketable("buy", rung.px, mark))) {
    throw new Error("SMART_LADDER_ABOVE_MARKET")
  }

  const tp = params.takeProfit
  const plan: LadderPlan = {
    anchorPx,
    anchor: params.anchor,
    baseDetection: params.baseDetection,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    maxLeverage,
    leverage,
    rungs,
    takeProfit: tp
      ? { mode: tp.mode, pct: tp.mode === "average" ? tp.pct : null }
      : null,
    stopLoss: params.stopLoss
      ? {
          mode: "percent",
          pct: params.stopLoss.pct,
          base: ladderBaseStopOf(params.stopLoss.base),
        }
      : null,
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen,
    // **Forced, never read from the settings — everywhere.** Nothing this app
    // places may sit on the book waiting: a resting rung ties up the money for
    // a buy that may never happen, eats the wallet's cap on open orders, and
    // gets drawn twice on the chart. Every rung is a price being watched, and
    // the order is sent when price actually reaches it. Backtests come through
    // this same draft on purpose, so the tested strategy and the running one
    // are one strategy — a replay that modelled resting fills would be testing
    // behaviour the live wallet no longer has.
    rungEntry: "market" as const,
    // Where the candle watch starts reading. Anything earlier belongs to a
    // market this ladder was not alive for.
    startedAt: input.startedAt ?? 0,
    greenInterval: input.interval,
    green: null,
    steppedDown: 0,
    awaitingSteppedRung: false,
    awaitingRungAfterWipe: false,
    baseWatch: null,
    reclaim: null,
    // Frozen onto the ladder at placement, like every other rule here: editing
    // the strategy tomorrow must not change what a ladder already trading is
    // doing in the middle of a crash.
    cascade: params.cascade ?? null,
    cascadeSeenAt: null,
    // The wallet-wide entry limit rides on every plan, so the live engine can
    // read it off whichever ladder it happens to look at first.
    entryLimit: params.entryLimit ?? null,
  }

  return { plan, rungs }
}

/**
 * The pot a ladder sizes itself from: the flow's cap when there is one, and
 * never more than the wallet really has behind it.
 *
 * Capped both ways on purpose. A cap bigger than the account would size rungs
 * off money that is not there, and every one of them would be refused at the
 * moment it tried to buy — which reads as the strategy failing rather than as
 * a number somebody typed.
 */
function potOf(input: PlaceLadderInput, walletPot: number): number {
  if (input.potUsd === undefined) return walletPot
  return Math.min(input.potUsd, walletPot)
}

export async function placeDcaLadder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceLadderInput
): Promise<PlacedLadder> {
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

  // Any kind, not just another ladder: a grid on this coin would fight this
  // ladder over the one position's stop.
  const existing = await activeSmartOrderId(userId, wallet.id, input.marketKey)
  if (existing) throw new Error("SMART_LADDER_EXISTS")

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)

  // One mark fetch covers the settle, the sizing and the marketable check.
  const keys = await exposedMarketKeys(userId, [wallet.id])
  const marks = await marksForKeys([...new Set([...keys, input.marketKey])])
  const mark = marks.get(input.marketKey)
  if (mark === undefined || !(mark > 0)) throw new Error("PAPER_NO_PRICE")

  const base =
    input.params.anchor === "click"
      ? null
      : await marketBaseInForce(
          wallet.protocol,
          wallet.network,
          ref.marketId,
          Date.now(),
          input.params.baseDetection
        )

  const book = await settleWallet(userId, wallet, { marks })

  const figures = paperAccountFigures({
    startingBalance: wallet.startingBalance,
    realized: book.cash - wallet.startingBalance,
    positions: [...book.positions.values()],
    marks,
  })

  const { plan, rungs } = draftDcaLadder({
    marketKey: input.marketKey,
    // Borrowing is a backtest instrument and must not reach a wallet. The
    // sizing multiplies every rung by it while the orders are still sent at
    // leverage 1, so a ladder that read it would buy three times the coin and
    // pay the whole price in cash. Forced here rather than trusted upstream:
    // this is the only door a practice ladder comes through.
    params: { ...input.params, leverage: CASH_ONLY },
    interval: input.interval,
    clickPx: input.clickPx,
    mark,
    base,
    rules,
    roundPx,
    equity: potOf(
      input,
      input.params.compound ? figures.equity : wallet.startingBalance
    ),
    freeCash: freeCash(book),
    // Where the candle watch starts reading. Without this the plan kept the
    // draft's zero, and the first settle walked every candle the feed held —
    // buying rungs on bars from months before the ladder existed. The live
    // path always passed it; this one only got away with not doing so while
    // resting rungs were still a mode that never read candles at all.
    startedAt: Date.now(),
    heldSzi: book.positions.get(input.marketKey)?.szi ?? null,
  })

  const now = Date.now()
  const maxLeverage = plan.maxLeverage

  await db.transaction(async (tx) => {
    // The same lock every settle takes, so a poll mid-placement waits its turn.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    // Re-checked under the lock: two tabs placing at once must not both win,
    // and neither may a ladder and a grid.
    const race = await activeSmartOrderId(
      userId,
      wallet.id,
      input.marketKey,
      tx
    )
    if (race) throw new Error("SMART_LADDER_EXISTS")

    await saveBook(tx, userId, book, new Date(now))

    const waiting = rungs.filter((rung) => rung.orderId !== null)
    if (waiting.length > 0) {
      await tx.insert(tradePaperOrders).values(
        waiting.map((rung) => ({
          userId,
          id: rung.orderId as string,
          walletId: wallet.id,
          marketKey: input.marketKey,
          side: "buy" as const,
          px: rung.px,
          sz: rung.sz,
          leverage: 1,
          maxLeverage,
          reduceOnly: false,
          tpPx: null,
          slPx: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }))
      )
    }

    const ladderId = randomUUID()
    await tx.insert(tradeSmartLadders).values({
      userId,
      id: ladderId,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "dca",
      status: "active",
      plan,
      flowRunId: input.flowRunId ?? null,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    // The rungs that were placed resting belong to the run from this moment.
    // Recorded now rather than when they fill, because by then the plan has
    // let go of the id.
    await recordFlowRunOrders(tx, {
      userId,
      walletId: wallet.id,
      flowRunId: input.flowRunId ?? null,
      ladderId,
      marketKey: input.marketKey,
      orderIds: waiting.map((rung) => rung.orderId as string),
    })
  })

  // One more settle lets the ladder engine finish the job — aim the brackets
  // of anything that bought immediately, and rest its sells.
  await settleWallet(userId, wallet, { marks })

  return {
    placed: rungs.filter((rung) => rung.status === "waiting").length,
    // Rungs price had already passed. Reported rather than hidden: a ladder
    // that placed four of seven buys should say so on the spot.
    passed: rungs.filter((rung) => rung.status === "skipped").length,
  }
}

// ----- Steering a live ladder -------------------------------------------

export type LadderRowRecord = {
  id: string
  marketKey: string
  status: "active" | "done"
  plan: LadderPlan
}

/**
 * Is there ALREADY a smart order working on this coin in this wallet, of any
 * kind? Its id, or null.
 *
 * This is the exclusivity check both placement paths make, and it deliberately
 * does not parse the plan. There is one position per coin per wallet and every
 * kind of smart order writes its stop, so two of them would fight — and a check
 * that parsed the plan would answer "no" for the kind it did not recognise and
 * let exactly that happen.
 */
export async function activeSmartOrderId(
  userId: string,
  walletId: string,
  marketKey: string,
  tx: CustomShellDb = db
): Promise<string | null> {
  const rows = await tx
    .select({ id: tradeSmartLadders.id })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.status, "active"),
        // A watched price is a plain order that shares this table, not a
        // strategy. The one-per-coin rule exists so two strategies cannot
        // both manage the same position — a plain order manages nothing, so
        // it neither blocks a ladder nor is blocked by one. Before plain
        // orders became watches, they rested on the book and this rule never
        // saw them; becoming a row here must not change what they may do.
        ne(tradeSmartLadders.kind, "watch")
      )
    )
    .limit(1)
  return rows[0]?.id ?? null
}

export async function activeLadder(
  userId: string,
  walletId: string,
  marketKey: string
): Promise<LadderRowRecord | null> {
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.marketKey, marketKey),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  const row = rows[0]
  if (!row || row.kind !== "dca") return null
  const plan = readSmartPlan("dca", row.plan) as LadderPlan | null
  return plan
    ? { id: row.id, marketKey: row.marketKey, status: row.status, plan }
    : null
}

export async function ladderById(
  userId: string,
  walletId: string,
  ladderId: string
): Promise<LadderRowRecord> {
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, ladderId)
      )
    )
    .limit(1)
  const row = rows[0]
  const plan =
    row && row.status === "active" && row.kind === "dca"
      ? (readSmartPlan("dca", row.plan) as LadderPlan | null)
      : null
  if (!row || !plan) throw new Error("SMART_LADDER_NOT_FOUND")
  return { id: row.id, marketKey: row.marketKey, status: row.status, plan }
}

/** Writes any smart order's plan down — the ladder's and the grid's alike. */
export async function saveLadderPlan(
  userId: string,
  ladderId: string,
  plan: SmartPlan,
  status: "active" | "done"
): Promise<void> {
  await db
    .update(tradeSmartLadders)
    .set({ plan, status, updatedAt: new Date() })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, ladderId)
      )
    )
}

async function deleteOrders(userId: string, orderIds: string[]): Promise<void> {
  if (orderIds.length === 0) return
  await db
    .delete(tradePaperOrders)
    .where(
      and(
        eq(tradePaperOrders.userId, userId),
        inArray(tradePaperOrders.id, orderIds)
      )
    )
}

/** Calling off one waiting rung — its × on the chart. */
export async function cancelLadderRung(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string; rungIndex: number }
): Promise<void> {
  await settleWallet(userId, wallet)
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  const rung = ladder.plan.rungs[input.rungIndex]
  if (!rung) throw new Error("SMART_RUNG_DONE")
  if (rung.status !== "waiting") throw new Error("SMART_RUNG_DONE")

  const orderId = rung.orderId
  rung.status = "cancelled"
  rung.orderId = null
  // The row goes before the plan does: a settle landing between the two would
  // otherwise fill an order the plan already calls off.
  if (orderId) await deleteOrders(userId, [orderId])
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
  // The next settle notices if that was the last thing keeping it alive.
  await settleWallet(userId, wallet)
}

/** Stop buying deeper: every waiting rung is called off, what's bought stays. */
export async function cancelLadderRest(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ cancelled: number }> {
  await settleWallet(userId, wallet)
  const ladder = await ladderById(userId, wallet.id, input.ladderId)

  const gone: string[] = []
  let cancelled = 0
  for (const rung of ladder.plan.rungs) {
    if (rung.status !== "waiting") continue
    if (rung.orderId) gone.push(rung.orderId)
    rung.status = "cancelled"
    rung.orderId = null
    cancelled += 1
  }
  // Rows first, then the plan — see `cancelLadderRung`.
  await deleteOrders(userId, gone)
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
  await settleWallet(userId, wallet)
  return { cancelled }
}

/**
 * Changing a live ladder's exits — the one edit that is always safe, because
 * exits only shape future sells. The position's brackets are rewritten here
 * and the plan's memory of them synced, so the next settle carries on from
 * the new rules rather than mistaking them for a hand-drag.
 */
export async function updateLadderExits(
  userId: string,
  wallet: TradeWallet,
  input: {
    ladderId: string
    takeProfit: DcaParams["takeProfit"]
    stopLoss: DcaParams["stopLoss"]
  }
): Promise<void> {
  const book = await settleWallet(userId, wallet)
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  const plan = ladder.plan

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)

  // Leaving "sell at previous rung" takes its resting sells off the book.
  const leavingPrevRung =
    plan.takeProfit?.mode === "prevRung" &&
    input.takeProfit?.mode !== "prevRung"
  const goneSells: string[] = []
  if (leavingPrevRung) {
    for (const rung of plan.rungs) {
      if (rung.sellOrderId) goneSells.push(rung.sellOrderId)
      rung.sellOrderId = null
    }
  }

  plan.takeProfit = input.takeProfit
    ? {
        mode: input.takeProfit.mode,
        pct: input.takeProfit.mode === "average" ? input.takeProfit.pct : null,
      }
    : null
  plan.stopLoss = input.stopLoss
    ? {
        mode: "percent",
        pct: input.stopLoss.pct,
        base: ladderBaseStopOf(input.stopLoss.base),
      }
    : null
  // Switching the base rule off drops what it was waiting on. A buy-back is
  // that rule's promise, and it must not outlive it.
  if (!plan.stopLoss?.base) plan.reclaim = null

  // Rewrite the position's brackets to the new rules right now, and remember
  // exactly what was written — anything else there later means a hand moved it.
  const position = book.positions.get(ladder.marketKey) ?? null
  let tpPx: number | null = null
  let slPx: number | null = null
  if (position && position.szi > 0) {
    if (plan.takeProfit?.mode === "average") {
      tpPx = roundPx(position.entryPx * (1 + (plan.takeProfit.pct ?? 0) / 100))
    } else if (plan.takeProfit?.mode === "nearestRung") {
      let deepest = -1
      for (const [index, rung] of plan.rungs.entries()) {
        if (rung.status === "filled" || rung.status === "sold") deepest = index
      }
      tpPx = deepest >= 0 ? roundPx(ladderExitLevels(plan)[deepest]) : null
    }
    slPx = wantedStopPx(plan, position.entryPx, roundPx)
    await db
      .update(tradePaperPositions)
      .set({ tpPx, slPx, updatedAt: new Date() })
      .where(
        and(
          eq(tradePaperPositions.userId, userId),
          eq(tradePaperPositions.walletId, wallet.id),
          eq(tradePaperPositions.marketKey, ladder.marketKey)
        )
      )
  }
  plan.aimedTpPx = tpPx
  plan.aimedSlPx = slPx

  await saveLadderPlan(userId, ladder.id, plan, "active")
  await deleteOrders(userId, goneSells)
  // The next settle rests new sells, wakes rungs from under a raised stop,
  // and fades the ones under a lowered one.
  await settleWallet(userId, wallet)
}

/** The run that placed this order, where only the flow's own record says so. */
function placedByFlow(
  row: { walletId: string; marketKey: string; createdAt: Date },
  placed: ReadonlyMap<string, { runId: string; since: number }>
): string | null {
  const owner = placed.get(`${row.walletId}:${row.marketKey}`)
  if (!owner) return null
  // Older than the run itself, so the run cannot have placed it.
  return row.createdAt.getTime() >= owner.since ? owner.runId : null
}

/** Every smart order still worth drawing, of any kind, across these wallets. */
export async function listActiveSmartOrders(
  userId: string,
  walletIds: readonly string[]
): Promise<SmartOrder[]> {
  if (walletIds.length === 0) return []
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        inArray(tradeSmartLadders.walletId, [...walletIds]),
        eq(tradeSmartLadders.status, "active")
      )
    )

  /**
   * Which switched-on flow placed each coin's order, for rows carrying no stamp.
   *
   * A ladder placed before the stamp existed says nothing about who placed it,
   * and on an account whose flow watches a hundred and fifty coins that is a
   * hundred and fifty orders reading as hand-placed.
   *
   * **Read off `placed`, which is the flow's own record of what it put in the
   * market — never off its coin list.** The list is what it is watching, and a
   * ladder somebody placed by hand on one of those coins is theirs: the flow
   * finds the coin taken and skips it. Going by the list would have hidden
   * that order from its owner on every screen, which is the worst thing this
   * could do with a real order.
   *
   * Still not proof, and it does not pretend to be — a coin the flow placed
   * on months ago, whose ladder finished, and which somebody then placed by
   * hand, reads as the flow's. The order having been created after the run
   * started narrows that to the life of one run. Anything placed from here on
   * carries the stamp and needs none of this.
   */
  const running = await db
    .select({
      id: tradeFlowRuns.id,
      walletId: tradeFlowRuns.walletId,
      placed: tradeFlowRuns.placed,
      startedAt: tradeFlowRuns.startedAt,
    })
    .from(tradeFlowRuns)
    .where(
      and(
        eq(tradeFlowRuns.userId, userId),
        eq(tradeFlowRuns.status, "running"),
        inArray(tradeFlowRuns.walletId, [...walletIds])
      )
    )
  const flowPlaced = new Map<string, { runId: string; since: number }>()
  for (const run of running) {
    for (const marketKey of run.placed) {
      flowPlaced.set(`${run.walletId}:${marketKey}`, {
        runId: run.id,
        since: run.startedAt.getTime(),
      })
    }
  }

  const orders: SmartOrder[] = []
  for (const row of rows) {
    const kind = readSmartOrderKind(row.kind)
    if (!kind) continue
    const plan = readSmartPlan(kind, row.plan)
    if (!plan) continue
    const shared = {
      id: row.id,
      walletId: row.walletId,
      marketKey: row.marketKey,
      status: "active" as const,
      flowRunId: row.flowRunId ?? placedByFlow(row, flowPlaced),
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }
    orders.push(
      kind === "grid"
        ? { ...shared, kind, plan: plan as GridPlan }
        : kind === "signal"
          ? { ...shared, kind, plan: plan as SignalPlan }
          : kind === "watch"
            ? { ...shared, kind, plan: plan as WatchPlan }
            : { ...shared, kind: "dca" as const, plan: plan as LadderPlan }
    )
  }
  return orders
}

/**
 * Sets a price to watch, and what to do when the market reaches it.
 *
 * **Nothing is sent anywhere.** One row is written; the engine's next pass is
 * what notices the level being touched and starts asking for a price. That is
 * the whole difference from a resting order, and it is why this works the same
 * on a practice wallet and a real one — neither of them has anything on a book
 * until the moment it is wanted.
 *
 * One smart order per coin per wallet, checked under the same lock every other
 * placement takes: a watch and a ladder on one coin would both write that
 * position's stop and fight over it.
 */
export async function placeWatchOrder(
  userId: string,
  wallet: TradeWallet,
  input: {
    marketKey: string
    side: PaperSide
    /** The level to watch — the price that was clicked. */
    px: number
    sz: number
    leverage: number
    marginMode?: "cross" | "isolated" | null
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }
): Promise<{ watching: true }> {
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

  const now = new Date()
  const plan: WatchPlan = {
    triggerPx: input.px,
    side: input.side,
    sz: input.sz,
    leverage: input.leverage,
    marginMode: input.marginMode ?? null,
    maxLeverage: rules.maxLeverage ?? 1,
    sizeDecimals: rules.sizeDecimals,
    priceTick: rules.priceTick,
    tpPx: input.tpPx,
    slPx: input.slPx,
    reduceOnly: input.reduceOnly,
    // It waits at the level rather than following the price away from it,
    // which is the closest thing to the resting order this stands in for.
    chaseGiveUp: 0,
    phase: "waiting",
    // Nothing has been sent for this watch — the whole point of it.
    sent: false,
    orderId: null,
    orderPx: null,
    missingSince: 0,
    heldWhenPlaced: 0,
    chasedAt: 0,
    chases: 0,
    startedAt: now.getTime(),
  }

  await db.transaction(async (tx) => {
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")
    // No one-per-coin check: several plain orders on one coin were always
    // allowed when they rested on the book, and a ladder on the coin is no
    // reason to refuse a hand-placed order beside it.
    await tx.insert(tradeSmartLadders).values({
      userId,
      id: randomUUID(),
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "watch",
      status: "active",
      plan,
      createdAt: now,
      updatedAt: now,
    })
  })

  return { watching: true }
}

/**
 * Calls off a watched price.
 *
 * **It marks the row rather than deleting it**, and the engine's next pass does
 * the cancelling — the same road a flow being switched off takes. While the
 * level has not been touched there is nothing to cancel anywhere and the row
 * simply ends; once it has, there may be an order resting on a real exchange,
 * and only the engine has the wiring to take that back.
 */
export async function cancelWatchOrder(
  userId: string,
  walletId: string,
  watchId: string
): Promise<{ cancelled: true }> {
  const [row] = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, watchId),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  if (!row || row.kind !== "watch") throw new Error("SMART_ORDER_NOT_FOUND")

  const plan = readWatchPlan(row.plan)
  if (!plan) throw new Error("SMART_ORDER_NOT_FOUND")

  // Nothing has been sent, so nothing has to be taken back: the row is the
  // whole of the order and it ends here.
  if (plan.phase === "waiting" && plan.orderId === null) {
    await db
      .update(tradeSmartLadders)
      .set({ status: "done", updatedAt: new Date() })
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.id, watchId)
        )
      )
    return { cancelled: true }
  }

  await db
    .update(tradeSmartLadders)
    .set({
      plan: { ...plan, phase: "stopping" },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, watchId)
      )
    )
  return { cancelled: true }
}

/**
 * Changes what a watched price is for — its size, stop and target — while it
 * is still watching. The drag on the chart resizes a stop the same way a
 * practice order's does, so the trade keeps risking the same money.
 */
export async function editWatchOrder(
  userId: string,
  walletId: string,
  watchId: string,
  changes: { sz: number; tpPx: number | null; slPx: number | null }
): Promise<{ saved: true }> {
  if (!(changes.sz > 0)) throw new Error("SMART_ORDER_PRICE")
  const [row] = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, watchId),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  if (!row || row.kind !== "watch") throw new Error("SMART_ORDER_NOT_FOUND")
  const plan = readWatchPlan(row.plan)
  if (!plan) throw new Error("SMART_ORDER_NOT_FOUND")
  if (plan.phase !== "waiting" || plan.orderId !== null) {
    throw new Error("SMART_WATCH_TAKING")
  }
  await db
    .update(tradeSmartLadders)
    .set({
      plan: { ...plan, sz: changes.sz, tpPx: changes.tpPx, slPx: changes.slPx },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, watchId)
      )
    )
  return { saved: true }
}

/**
 * Drags a watched price to a new level.
 *
 * Only while it is still WATCHING. Once the level has been touched the chase
 * is working the exchange, and the thing on screen is an order in flight, not
 * a line to reposition — moving the trigger then would be rewriting history.
 */
export async function moveWatchOrder(
  userId: string,
  walletId: string,
  watchId: string,
  px: number
): Promise<{ moved: true }> {
  if (!(px > 0)) throw new Error("SMART_ORDER_PRICE")
  const [row] = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, watchId),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  if (!row || row.kind !== "watch") throw new Error("SMART_ORDER_NOT_FOUND")
  const plan = readWatchPlan(row.plan)
  if (!plan) throw new Error("SMART_ORDER_NOT_FOUND")
  if (plan.phase !== "waiting" || plan.orderId !== null) {
    throw new Error("SMART_WATCH_TAKING")
  }
  await db
    .update(tradeSmartLadders)
    .set({
      plan: { ...plan, triggerPx: px },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, watchId)
      )
    )
  return { moved: true }
}
