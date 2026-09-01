import { randomUUID } from "node:crypto"

import { and, count, eq, inArray, max, sql } from "drizzle-orm"

import { parseMarketKey, type CandleInterval } from "@/lib/protocols/contracts"
import {
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  reshapeLadderSettingsPlan,
  reshapeLadderPlan,
  type DcaLadderSettings,
  type DcaParams,
  type LadderShapeChange,
  type LadderPlan,
  type LadderRungState,
} from "@/lib/trade/dca"
import type { GridPlan } from "@/lib/trade/grid"
import type { TradeSide } from "@/lib/trade/paper"
import {
  readWatchPlan,
  watchTriggerDirection,
  type WatchPlan,
} from "@/lib/trade/watch-order"
import { readSignalPlan, type SignalPlan } from "@/lib/trade/signal-order"
import {
  readSmartOrderKind,
  readSmartPlan,
  type SmartLadder,
  type SmartOrder,
  type SmartOrderKind,
  type SmartPlan,
} from "@/lib/trade/smart-plan"
import { isMarketable, paperAccountFigures } from "@/lib/trade/paper"
import { checkOrderMinimum, orderMinimumRefusal } from "@/lib/trade/market-info"
import type { TradeWallet } from "@/lib/trade/wallets"
import { db, type CustomShellDb } from "@/server/db"
import { getProtocol } from "@/server/protocols/registry"
import { marketBaseInForce } from "@/server/trade/base-level"
import { marketRules } from "@/server/trade/market-rules"
import {
  cancelLadderRestPlan,
  cancelLadderRungPlan,
  moveExitLadderPlan,
  updateLadderExitsPlan,
} from "@/server/trade/smart-order-actions"
import { resumeSmartOrderPlan } from "@/server/trade/smart-order-pause"
import { assertSmartOrderPlacable } from "@/server/trade/smart-pairing"
import {
  assertFlowRunAcceptingPlacements,
  flowLadderOrderIds,
  recordFlowRunOrders,
} from "@/server/trade/flow-run-orders"
import {
  exposedMarketKeys,
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
 * Placement is all-or-nothing: every rung is checked before the watched
 * ladder is written. A ladder that is refused places nothing. The browser
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
  /**
   * The ladder exactly as it was written down, so the chart can draw it in
   * the same frame the window closes — the same reason `PlacedGrid` carries
   * its grid. Without it the preview lines die with the window and the real
   * rungs only arrive on the next read, seconds later.
   */
  ladder: SmartLadder
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

  // A missing ceiling is not a ceiling of 1. Keep the chosen borrowing for
  // sizing, but preserve 1 as the engine's "no maintenance margin known"
  // marker so a replay does not invent a liquidation price.
  const maxLeverage = rules.maxLeverage ?? 1
  const leverage =
    rules.maxLeverage === null
      ? params.leverage
      : Math.min(params.leverage, rules.maxLeverage)

  // The same arithmetic the window showed, with borrowing held to this
  // market's maximum before it sizes anything. Each level is then snapped to
  // the market's price grid, and sizes never round up into more risk.
  const drawn = dcaLadderPlan({
    anchorPx,
    equity: input.equity,
    params: { ...params, leverage },
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
    maxPositionPct: params.maxPositionPct,
    sizeMultiplier: params.sizeMultiplier,
    maxOrderVolPct: params.maxOrderVolPct,
    rungs,
    exitRungs: [],
    exitLadderVersion: 2,
    takeProfit: tp
      ? {
          mode: tp.mode,
          pct: tp.mode === "average" ? tp.pct : null,
          exitGapPct: tp.exitGapPct ?? 0,
        }
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

  // Any kind, not just another ladder — with one exception. A live grid
  // holding a fixed-size stop above this ladder's first buy may share the
  // coin; everything else would fight this ladder over the one position's
  // stop, and a practice wallet cannot hold the grid's second stop at all.
  await assertSmartOrderPlacable(userId, wallet, input.marketKey, {
    kind: "dca",
  })

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
    params: input.params,
    interval: input.interval,
    clickPx: input.clickPx,
    mark,
    base,
    rules,
    roundPx,
    equity: input.params.compound ? figures.equity : wallet.startingBalance,
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
  const ladderId = randomUUID()

  await db.transaction(async (tx) => {
    // The same lock every settle takes, so a poll mid-placement waits its turn.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    await assertFlowRunAcceptingPlacements(
      tx,
      userId,
      input.flowRunId,
      input.marketKey
    )

    // Re-checked under the lock: two tabs placing at once must not both win.
    // This is also where the pairing rules finally see the drawn rungs.
    await assertSmartOrderPlacable(
      userId,
      wallet,
      input.marketKey,
      { kind: "dca", plan },
      tx
    )

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
          leverage: plan.leverage,
          maxLeverage,
          reduceOnly: false,
          tpPx: null,
          slPx: null,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        }))
      )
    }

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
    ladder: {
      id: ladderId,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "dca",
      status: "active",
      flowRunId: input.flowRunId ?? null,
      createdAt: now,
      updatedAt: now,
      plan,
    },
  }
}

// ----- Steering a live ladder -------------------------------------------

export type LadderRowRecord = {
  id: string
  marketKey: string
  status: "active" | "done"
  plan: LadderPlan
  flowRunId: string | null
  createdAt: number
}

export type MovedLadder = { moved: true; ladder: SmartLadder }

export async function ladderById(
  userId: string,
  walletId: string,
  ladderId: string,
  tx: CustomShellDb = db
): Promise<LadderRowRecord> {
  const rows = await tx
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
  return {
    id: row.id,
    marketKey: row.marketKey,
    status: row.status,
    plan,
    flowRunId: row.flowRunId ?? null,
    createdAt: row.createdAt.getTime(),
  }
}

export function movedLadder(
  walletId: string,
  ladder: LadderRowRecord,
  plan: LadderPlan,
  updatedAt: number
): MovedLadder {
  return {
    moved: true,
    ladder: {
      id: ladder.id,
      walletId,
      marketKey: ladder.marketKey,
      kind: "dca",
      status: "active",
      flowRunId: ladder.flowRunId,
      createdAt: ladder.createdAt,
      updatedAt,
      plan,
    },
  }
}

export function assertLadderRungsTradable(
  plan: LadderPlan,
  rules: {
    sizeDecimals: number | null
    minOrderValueUsd?: number | null
    minOrderSize?: number | null
  }
): void {
  for (const rung of plan.rungs) {
    const minimum = checkOrderMinimum(rules, rung.px, rung.sz)
    if (minimum.tooSmall) throw new Error("SMART_RUNG_TOO_SMALL")
  }
}

/** Move or re-spread a ladder before its first rung starts. */
export async function reshapeLadder(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string } & (
    | LadderShapeChange
    | { settings: DcaLadderSettings; greenInterval: CandleInterval }
  )
): Promise<MovedLadder> {
  let firstRead: Awaited<ReturnType<typeof ladderById>>
  let settingsContext:
    | {
        anchorPx: number
        equity: number
      }
    | undefined
  if ("settings" in input) {
    const beforeSettle = await ladderById(userId, wallet.id, input.ladderId)
    const ref = parseMarketKey(beforeSettle.marketKey)
    if (!ref) throw new Error("PAPER_MARKET")
    const keys = await exposedMarketKeys(userId, [wallet.id])
    const marks = await marksForKeys([
      ...new Set([...keys, beforeSettle.marketKey]),
    ])
    const book = await settleWallet(userId, wallet, { marks })
    firstRead = await ladderById(userId, wallet.id, input.ladderId)
    const figures = paperAccountFigures({
      startingBalance: wallet.startingBalance,
      realized: book.cash - wallet.startingBalance,
      positions: [...book.positions.values()],
      marks,
    })
    const anchorPx =
      input.settings.anchor === "base"
        ? await marketBaseInForce(
            wallet.protocol,
            wallet.network,
            ref.marketId,
            Date.now(),
            firstRead.plan.baseDetection
          )
        : firstRead.plan.anchorPx
    if (anchorPx === null) throw new Error("SMART_LADDER_NO_BASE")
    settingsContext = {
      anchorPx,
      equity: figures.equity,
    }
  } else {
    await settleWallet(userId, wallet)
    firstRead = await ladderById(userId, wallet.id, input.ladderId)
  }
  if ("exitPx" in input) {
    const goneSells: string[] = []
    await moveExitLadderPlan(firstRead.plan, input, async (orderId) => {
      goneSells.push(orderId)
    })
    const at = Date.now()
    await saveLadderPlan(userId, firstRead.id, firstRead.plan, "active", at)
    await deleteOrders(userId, goneSells)
    await settleWallet(userId, wallet)
    const refreshed = await ladderById(userId, wallet.id, firstRead.id)
    return movedLadder(wallet.id, refreshed, refreshed.plan, Date.now())
  }
  const ref = parseMarketKey(firstRead.marketKey)
  if (!ref) throw new Error("PAPER_MARKET")
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")
  const protocol = getProtocol(wallet.protocol)
  return await db.transaction(async (tx) => {
    // The engine takes the same wallet lock. Re-read the plan after winning it
    // so a rung that bought during this click can never be overwritten by the
    // older all-waiting plan the click started from.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")
    const ladder = await ladderById(userId, wallet.id, input.ladderId, tx)
    if (ladder.flowRunId !== null) throw new Error("SMART_LADDER_FLOW")
    const roundPx = (px: number) =>
      protocol.markets.roundPx(
        px,
        ladder.plan.sizeDecimals,
        ladder.plan.priceTick
      )
    let plan: LadderPlan
    if ("settings" in input) {
      if (!settingsContext) throw new Error("SMART_LADDER_RANGE")
      plan = reshapeLadderSettingsPlan(ladder.plan, input.settings, {
        ...settingsContext,
        volume24hUsd: rules.volume24hUsd,
        greenInterval: input.greenInterval,
        roundPx,
      })
    } else {
      plan = reshapeLadderPlan(ladder.plan, input, roundPx)
    }
    assertLadderRungsTradable(plan, rules)

    const at = Date.now()
    await saveLadderPlan(userId, ladder.id, plan, "active", at, tx)
    return movedLadder(wallet.id, ladder, plan, at)
  })
}

/** Writes any smart order's plan down — the ladder's and the grid's alike. */
export async function saveLadderPlan(
  userId: string,
  ladderId: string,
  plan: SmartPlan,
  status: "active" | "done",
  updatedAt = Date.now(),
  tx: CustomShellDb = db
): Promise<void> {
  await tx
    .update(tradeSmartLadders)
    .set({ plan, status, updatedAt: new Date(updatedAt) })
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.id, ladderId),
        // A cancel may land while the engine is finishing a pass it started
        // from an older copy of this row. Once the cancel marks the row done,
        // that older pass must not put it back on screen as active.
        eq(tradeSmartLadders.status, "active")
      )
    )
}

/** Clears a strategy pause after its owner has fixed the refusal. */
export async function resumeSmartOrder(
  userId: string,
  walletId: string,
  smartOrderId: string
): Promise<void> {
  const rows = await db
    .select({
      kind: tradeSmartLadders.kind,
      plan: tradeSmartLadders.plan,
    })
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, walletId),
        eq(tradeSmartLadders.id, smartOrderId),
        eq(tradeSmartLadders.status, "active")
      )
    )
    .limit(1)
  const row = rows[0]
  const kind = row ? readSmartOrderKind(row.kind) : null
  const plan = kind && row ? readSmartPlan(kind, row.plan) : null
  if (!plan) throw new Error("SMART_ORDER_NOT_FOUND")
  if (!plan.paused) throw new Error("SMART_ORDER_NOT_PAUSED")
  resumeSmartOrderPlan(plan)
  await saveLadderPlan(userId, smartOrderId, plan, "active")
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
  const orderId = cancelLadderRungPlan(ladder.plan, input.rungIndex)
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
): Promise<{ cancelled: number; hasPosition: boolean }> {
  const book = await settleWallet(userId, wallet)
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  const hasPosition = (book.positions.get(ladder.marketKey)?.szi ?? 0) > 0

  const gone: string[] = []
  const result = await cancelLadderRestPlan(ladder.plan, async (orderId) => {
    gone.push(orderId)
  })
  // Rows first, then the plan — see `cancelLadderRung`.
  await deleteOrders(userId, gone)
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
  await settleWallet(userId, wallet)
  return { ...result, hasPosition }
}

/** Calls off a flow's unbought ladder without giving its watched rungs a turn. */
export async function cancelFlowLadderRest(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ complete: boolean; done: boolean }> {
  return cancelFlowLadderWaiting(userId, wallet, input, false)
}

/** Calls off the waiting part of a removed coin, even after an earlier rung bought. */
export async function cancelFlowLadderRemainder(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ complete: boolean; done: boolean }> {
  return cancelFlowLadderWaiting(userId, wallet, input, true)
}

async function cancelFlowLadderWaiting(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string },
  cancelAfterFill: boolean
): Promise<{ complete: boolean; done: boolean }> {
  let done = true
  await db.transaction(async (tx) => {
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    const [row] = await tx
      .select({ plan: tradeSmartLadders.plan })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.walletId, wallet.id),
          eq(tradeSmartLadders.id, input.ladderId),
          eq(tradeSmartLadders.kind, "dca"),
          eq(tradeSmartLadders.status, "active")
        )
      )
      .limit(1)
    const plan = row
      ? (readSmartPlan("dca", row.plan) as LadderPlan | null)
      : null
    if (!plan) throw new Error("SMART_LADDER_NOT_FOUND")

    // A settle that won the lock may have bought a rung after Stop counted
    // this row. The position and every remaining rung are then left alone.
    const hasFill = plan.rungs.some((rung) => rung.status === "filled")
    if (hasFill && !cancelAfterFill) {
      done = false
      return
    }
    if (hasFill) done = false

    const recorded = await flowLadderOrderIds(
      userId,
      wallet.id,
      input.ladderId,
      tx
    )
    for (const rung of plan.rungs) {
      if (rung.status !== "waiting") continue
      if (rung.orderId) recorded.add(rung.orderId)
      rung.status = "cancelled"
      rung.orderId = null
    }
    if (recorded.size > 0) {
      await tx
        .delete(tradePaperOrders)
        .where(
          and(
            eq(tradePaperOrders.userId, userId),
            eq(tradePaperOrders.walletId, wallet.id),
            inArray(tradePaperOrders.id, [...recorded]),
            hasFill ? eq(tradePaperOrders.side, "buy") : undefined,
            hasFill ? eq(tradePaperOrders.reduceOnly, false) : undefined
          )
        )
    }
    await tx
      .update(tradeSmartLadders)
      .set({
        status: hasFill ? "active" : "done",
        plan,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.id, input.ladderId),
          eq(tradeSmartLadders.status, "active")
        )
      )
  })
  return { complete: true, done }
}

/** Calls off one flow-owned signal buy without advancing the rest of its wallet. */
export async function cancelSignalRest(
  userId: string,
  wallet: TradeWallet,
  input: { signalId: string }
): Promise<{ complete: boolean; done: boolean }> {
  let done = true
  await db.transaction(async (tx) => {
    // The normal practice settle takes this same lock. Whichever arrives
    // first finishes before the other reads the order, so Stop can never race
    // a fill and then leave the row active with no order behind it.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(
        and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
      )
      .for("update")

    const [row] = await tx
      .select({ plan: tradeSmartLadders.plan })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.walletId, wallet.id),
          eq(tradeSmartLadders.id, input.signalId),
          eq(tradeSmartLadders.kind, "signal"),
          eq(tradeSmartLadders.status, "active")
        )
      )
      .limit(1)
    const plan = row ? readSignalPlan(row.plan) : null
    if (!plan) throw new Error("SMART_SIGNAL_NOT_FOUND")
    // The engine may have bought between Stop's first count and this lock.
    // Holding or selling belongs to the position now, so Stop leaves it alone.
    if (plan.phase !== "buying" && plan.phase !== "stopping") {
      done = false
      return
    }

    const recorded = await flowLadderOrderIds(
      userId,
      wallet.id,
      input.signalId,
      tx
    )
    if (plan.orderId) recorded.add(plan.orderId)
    if (recorded.size > 0) {
      await tx
        .delete(tradePaperOrders)
        .where(
          and(
            eq(tradePaperOrders.userId, userId),
            eq(tradePaperOrders.walletId, wallet.id),
            inArray(tradePaperOrders.id, [...recorded])
          )
        )
    }
    await tx
      .update(tradeSmartLadders)
      .set({
        status: "done",
        plan: {
          ...plan,
          phase: "stopping",
          orderId: null,
          orderPx: null,
          missingSince: 0,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.id, input.signalId),
          eq(tradeSmartLadders.status, "active")
        )
      )
  })
  return { complete: true, done }
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
  const goneSells: string[] = []
  await updateLadderExitsPlan(plan, input, async (orderId) => {
    goneSells.push(orderId)
  })

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

/** The run that placed this kind of order, where the flow's own record says so. */
function placedByFlow(
  row: {
    walletId: string
    marketKey: string
    kind: SmartOrderKind
    createdAt: Date
  },
  placed: ReadonlyMap<string, { runId: string; since: number }>
): string | null {
  const owner = placed.get(`${row.walletId}:${row.marketKey}:${row.kind}`)
  if (!owner) return null
  // Older than the run itself, so the run cannot have placed it.
  return row.createdAt.getTime() >= owner.since ? owner.runId : null
}

function runningFlows(userId: string, walletIds: readonly string[]) {
  return db
    .select({
      id: tradeFlowRuns.id,
      walletId: tradeFlowRuns.walletId,
      spec: tradeFlowRuns.spec,
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
}

/**
 * A short string that changes whenever `listActiveSmartOrders` would answer
 * differently, and not otherwise.
 *
 * The full answer is every active ladder WITH its plan — measured at 271
 * rows and half a megabyte for one account on 23 August 2026, which the
 * poll carried from the database to the server and on to the browser every
 * four seconds, for 700 ms a time, whether or not anything had moved.
 *
 * The stamp is a hash the database computes over what the browser is
 * actually sent: each row's id, market, kind, plan and flow. Not
 * `updatedAt` — the engine rewrites a watched ladder's row every few seconds
 * without changing its plan, so a stamp on that column changed every poll
 * and saved nothing. Which switched-on flow placed each row comes from the
 * running flows, so those are in the stamp too. Two small aggregate queries,
 * one round trip, thirty-two bytes back.
 */
export async function activeSmartOrdersStamp(
  userId: string,
  walletIds: readonly string[]
): Promise<string> {
  if (walletIds.length === 0) return "0"
  const [ladders, flows] = await Promise.all([
    db
      .select({
        count: count(),
        digest: sql<string>`md5(coalesce(string_agg(${tradeSmartLadders.id} || ':' || ${tradeSmartLadders.marketKey} || ':' || ${tradeSmartLadders.kind} || ':' || coalesce(${tradeSmartLadders.flowRunId}, '') || ':' || ${tradeSmartLadders.plan}::text, '|' order by ${tradeSmartLadders.id}), ''))`,
      })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          eq(tradeSmartLadders.status, "active")
        )
      ),
    db
      .select({
        count: count(),
        // Not `updatedAt`: a running flow rewrites its row every time it
        // looks at a coin, which is every few seconds. What `placedByFlow`
        // reads is the run's id, when it started, and what it has placed.
        newest: max(tradeFlowRuns.startedAt),
        placed: sql<number>`coalesce(sum(jsonb_array_length(${tradeFlowRuns.placed})), 0)`,
      })
      .from(tradeFlowRuns)
      .where(
        and(
          eq(tradeFlowRuns.userId, userId),
          eq(tradeFlowRuns.status, "running"),
          inArray(tradeFlowRuns.walletId, [...walletIds])
        )
      ),
  ])
  const l = ladders[0]
  const f = flows[0]
  return [
    l?.count ?? 0,
    l?.digest ?? "",
    f?.count ?? 0,
    f?.newest?.getTime() ?? 0,
    f?.placed ?? 0,
  ].join(":")
}

/**
 * The active smart orders, or `null` when they are exactly what the caller
 * already holds — judged by the stamp above. The stamp that describes the
 * answer comes back either way, for the caller to send next time.
 */
export async function listActiveSmartOrdersIfChanged(
  userId: string,
  walletIds: readonly string[],
  knownStamp: string | undefined
): Promise<{ smartOrders: SmartOrder[] | null; stamp: string }> {
  const stamp = await activeSmartOrdersStamp(userId, walletIds)
  if (knownStamp !== undefined && knownStamp === stamp) {
    return { smartOrders: null, stamp }
  }
  return { smartOrders: await listActiveSmartOrders(userId, walletIds), stamp }
}

/** Every smart order still worth drawing, of any kind, across these wallets. */
export async function listActiveSmartOrders(
  userId: string,
  walletIds: readonly string[]
): Promise<SmartOrder[]> {
  if (walletIds.length === 0) return []
  // Both reads leave together: the running flows do not depend on the rows.
  const [rows, running] = await Promise.all([
    db
      .select()
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          inArray(tradeSmartLadders.walletId, [...walletIds]),
          eq(tradeSmartLadders.status, "active")
        )
      ),
    runningFlows(userId, walletIds),
  ])

  /**
   * Which switched-on flow placed each coin and kind, for rows carrying no stamp.
   *
   * A ladder placed before the stamp existed says nothing about who placed it,
   * and on an account whose flow watches a hundred and fifty coins that is a
   * hundred and fifty orders reading as hand-placed.
   *
   * **Read off `placed`, which is the flow's own record of what it put in the
   * market — never off its coin list.** The list is what it is watching, and a
   * ladder somebody placed by hand on one of those coins is theirs: the flow
   * finds the coin taken and skips it. Kind matters too. A manual grid may sit
   * above a flow's DCA ladder on the same coin, and the DCA's ownership must
   * not hide that grid from its owner. Going by the coin alone would hide the
   * order on every screen, which is the worst thing this could do with a real
   * order.
   *
   * Still not proof, and it does not pretend to be — a coin the flow placed
   * on months ago, whose ladder finished, and which somebody then placed by
   * hand, reads as the flow's. The order having been created after the run
   * started narrows that to the life of one run. Anything placed from here on
   * carries the stamp and needs none of this.
   */
  const flowPlaced = new Map<string, { runId: string; since: number }>()
  for (const run of running) {
    const kind =
      run.spec.strategy.kind === "signals"
        ? "signal"
        : run.spec.strategy.kind === "dca"
          ? "dca"
          : null
    // Grid flows have carried a run stamp since their first release. Guessing
    // ownership from `placed` would only risk claiming a later grid placed by
    // hand on the same coin.
    if (!kind) continue
    for (const marketKey of run.placed) {
      flowPlaced.set(`${run.walletId}:${marketKey}:${kind}`, {
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
    side: TradeSide
    /** The level to watch — the price that was clicked. */
    px: number
    sz: number
    leverage: number
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
  const protocol = getProtocol(wallet.protocol)
  /**
   * **A watch on a venue this app cannot order on is refused here, not when
   * it fires.** A watched level sends nothing until the price arrives, so an
   * exchange with no order path has nothing to reject at the moment it is
   * saved — the level simply sits there looking like it is working, and the
   * first anyone hears of the problem is a refusal at the price, repeated on
   * every pass. Practice wallets are exempt: they never send anything to an
   * exchange, so a venue with no order path is no obstacle to pretending.
   */
  if (wallet.kind === "live" && protocol.capabilities?.orders === false) {
    throw new Error(`PROTOCOL_NO_ORDERS:${protocol.id}`)
  }
  const [rules, prices] = await Promise.all([
    marketRules(wallet.protocol, wallet.network, ref.marketId),
    protocol.markets.prices(wallet.network, [ref.marketId]),
  ])
  if (!rules) throw new Error("PAPER_MARKET")
  const mark = prices.get(ref.marketId)
  if (mark === undefined) {
    throw new Error(wallet.kind === "paper" ? "PAPER_PRICE" : "LIVE_NO_PRICE")
  }
  const minimum = checkOrderMinimum(
    {
      sizeDecimals: rules.sizeDecimals,
      minOrderValueUsd: rules.minOrderValueUsd ?? null,
      minOrderSize: rules.minOrderSize ?? null,
    },
    input.px,
    input.sz
  )
  const sz = minimum.size
  if (minimum.tooSmall) {
    if (wallet.kind === "paper") throw new Error("PAPER_SIZE")
    throw new Error(
      `LIVE_ORDER_TOO_SMALL:${orderMinimumRefusal(protocol.label, minimum)}`
    )
  }

  const now = new Date()
  const plan: WatchPlan = {
    triggerPx: input.px,
    triggerDirection: watchTriggerDirection(input.px, mark),
    side: input.side,
    sz,
    leverage: input.leverage,
    maxLeverage: rules.maxLeverage ?? 1,
    sizeDecimals: rules.sizeDecimals,
    minOrderSize: rules.minOrderSize ?? null,
    minOrderValueUsd: rules.minOrderValueUsd ?? null,
    priceTick: rules.priceTick,
    tpPx: input.tpPx,
    slPx: input.slPx,
    reduceOnly: input.reduceOnly,
    // Long and Short always wait for the direction recorded above. `maker`
    // remains the separate part-close rule that never pays the spread.
    maker: false,
    heldAtStart: 0,
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
        eq(tradeSmartLadders.id, watchId)
      )
    )
    .limit(1)
  if (!row || row.kind !== "watch") throw new Error("SMART_ORDER_NOT_FOUND")
  // A stale poll can leave the cancelled row on screen long enough for a
  // second press. Calling off the same watch twice has the same result and is
  // not a server failure.
  if (row.status === "done") return { cancelled: true }

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
