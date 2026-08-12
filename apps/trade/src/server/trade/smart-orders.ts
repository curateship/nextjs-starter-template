import { randomUUID } from "node:crypto"

import { and, eq, inArray } from "drizzle-orm"

import {
  parseMarketKey,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import {
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  DUST_ORDER_USD,
  type DcaParams,
  type LadderPlan,
  type LadderRungState,
} from "@/lib/trade/dca"
import type { GridPlan } from "@/lib/trade/grid"
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
import {
  exposedMarketKeys,
  freeCash,
  marksForKeys,
  MAX_OPEN_ORDERS,
  saveBook,
  settleWallet,
} from "@/server/trade/paper"
import { wantedStopPx } from "./smart-ladders"
import {
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
    maxLeverage: number | null
    volume24hUsd: number | null
  }
  roundPx: (px: number) => number
  /** What the whole account is worth, which is what the pot is a share of. */
  equity: number
  freeCash: number
  /** When this ladder is being created, in epoch ms — where its watch starts. */
  startedAt?: number
  /** How many orders the wallet already has waiting, against the cap. */
  openOrderCount: number
  /**
   * The cap itself, when it is not a hand-driven practice wallet's.
   *
   * `MAX_OPEN_ORDERS` is fifty because a wallet somebody clicks around with
   * should not grow a fleet of forgotten orders. A backtest walking a hundred
   * coins is not that: fourteen coins with eight rungs each already fill fifty,
   * and every coin after them was refused for the whole run — which is exactly
   * what happened, alphabetically, and left a hundred and fifty coins showing
   * no trades at all. A replay says how many its own run needs.
   */
  maxOpenOrders?: number
  /** What is already held in this market, signed, or null when nothing is. */
  heldSzi: number | null
  /**
   * Where an order id comes from. Injected so a backtest can count instead of
   * rolling a dice — nothing inside a replayed run may read a random number,
   * or two identical runs stop being identical.
   */
  nextOrderId: () => string
}

export type LadderDraft = {
  plan: LadderPlan
  rungs: LadderRungState[]
  /** What the whole ladder costs if every rung buys, at 1x. */
  totalCost: number
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
    // Price under the base means the level has already gone. The ladder arms
    // when price is AT OR ABOVE a confirmed base and buys the fall from there;
    // starting it halfway down is a different trade nobody asked for.
    if (mark < anchorPx) throw new Error("SMART_LADDER_UNDER_BASE")
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

  let totalCost = 0
  const priced = drawn.rungs.map((rung, index) => {
    const px = roundPx(rung.px)
    const sz = floorSize(rung.sz, rules.sizeDecimals)
    if (!(px > 0) || sz <= 0 || px * sz < DUST_ORDER_USD) {
      throw new Error(`SMART_RUNG_TOO_SMALL:${index + 1}`)
    }
    totalCost += px * sz
    return { px, sz }
  })

  if (totalCost > input.freeCash + 1e-9) throw new Error("SMART_LADDER_COST")

  const twoGreen = params.twoGreen
  // Rungs that buy at market rest NOTHING on the book: each is a level being
  // watched, and a candle closing past it is what buys. Two-green mode was
  // already like this; it is now one case of it rather than the only one.
  const watching = params.rungEntry === "market" || twoGreen
  const restingCount = watching
    ? 0
    : priced.filter((rung) => !isMarketable("buy", rung.px, mark)).length
  if (input.openOrderCount + restingCount > (input.maxOpenOrders ?? MAX_OPEN_ORDERS)) {
    throw new Error("PAPER_ORDER_LIMIT")
  }

  const maxLeverage = rules.maxLeverage ?? 1

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
      // Two-green mode is exempt because nothing rests there: price being
      // below a rung is that mode's TRIGGER, not a moment it missed. Skipping
      // them would throw away the rungs it exists to buy.
      state.status = "skipped"
    } else if (!watching) {
      state.orderId = input.nextOrderId()
    }
    return state
  })

  if (rungs.every((rung) => rung.status === "skipped")) {
    throw new Error("SMART_LADDER_ABOVE_MARKET")
  }

  const tp = params.takeProfit
  const plan: LadderPlan = {
    anchorPx,
    anchor: params.anchor,
    baseDetection: params.baseDetection,
    sizeDecimals: rules.sizeDecimals,
    maxLeverage,
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
    rungEntry: params.rungEntry,
    // Where the candle watch starts reading. Anything earlier belongs to a
    // market this ladder was not alive for.
    startedAt: input.startedAt ?? 0,
    greenInterval: watching ? input.interval : null,
    green: null,
    steppedDown: 0,
    awaitingSteppedRung: false,
    baseWatch: null,
    reclaim: null,
    // Frozen onto the ladder at placement, like every other rule here: editing
    // the strategy tomorrow must not change what a ladder already trading is
    // doing in the middle of a crash.
    cascade: params.cascade ?? null,
    cascadeSeenAt: null,
  }

  return { plan, rungs, totalCost }
}

export async function placeDcaLadder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceLadderInput
): Promise<PlacedLadder> {
  const ref = parseMarketKey(input.marketKey)
  if (!ref || ref.protocol !== wallet.protocol || ref.network !== wallet.network) {
    throw new Error("PAPER_MARKET")
  }
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("PAPER_MARKET")

  // Any kind, not just another ladder: a grid on this coin would fight this
  // ladder over the one position's stop.
  const existing = await activeSmartOrderId(userId, wallet.id, input.marketKey)
  if (existing) throw new Error("SMART_LADDER_EXISTS")

  const protocol = getProtocol(wallet.protocol)
  const roundPx = (px: number) => protocol.markets.roundPx(px, rules.sizeDecimals)

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
    freeCash: freeCash(book),
    openOrderCount: book.orders.length,
    heldSzi: book.positions.get(input.marketKey)?.szi ?? null,
    nextOrderId: randomUUID,
  })

  const now = Date.now()
  const maxLeverage = plan.maxLeverage

  await db.transaction(async (tx) => {
    // The same lock every settle takes, so a poll mid-placement waits its turn.
    await tx
      .select({ id: tradeWallets.id })
      .from(tradeWallets)
      .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id)))
      .for("update")

    // Re-checked under the lock: two tabs placing at once must not both win,
    // and neither may a ladder and a grid.
    const race = await activeSmartOrderId(userId, wallet.id, input.marketKey, tx)
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

    await tx.insert(tradeSmartLadders).values({
      userId,
      id: randomUUID(),
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "dca",
      status: "active",
      plan,
      createdAt: new Date(now),
      updatedAt: new Date(now),
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
        eq(tradeSmartLadders.status, "active")
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
  return plan ? { id: row.id, marketKey: row.marketKey, status: row.status, plan } : null
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
    protocol.markets.roundPx(px, plan.sizeDecimals)

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
      createdAt: row.createdAt.getTime(),
      updatedAt: row.updatedAt.getTime(),
    }
    orders.push(
      kind === "grid"
        ? { ...shared, kind, plan: plan as GridPlan }
        : { ...shared, kind, plan: plan as LadderPlan }
    )
  }
  return orders
}
