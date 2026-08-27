import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import {
  marketChartHref,
  marketKey as toMarketKey,
  marketSymbol,
  parseMarketKey,
  type WalletPortfolio,
} from "@/lib/protocols/contracts"
import {
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  ladderHeldSz,
  type LadderPlan,
  type LadderRungState,
  type DcaParams,
} from "@/lib/trade/dca"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridHeldSz,
  gridRangeMovable,
  gridStopPx,
  gridStopUnder,
  type GridParams,
  type GridPlan,
} from "@/lib/trade/grid"
import {
  gridLadderPairingRefusal,
  reattributePairedStops,
  type PairedStopRef,
} from "@/lib/trade/pairing"
import {
  forEachPlanOrderId,
  readSmartEntry,
  readSmartOrderKind,
  type SmartEntry,
  type SmartOrderKind,
  type SmartPlan,
} from "@/lib/trade/smart-plan"
import { judgeOrder } from "@/lib/trade/order-presence"
import { readSignalPlan } from "@/lib/trade/signal-order"
import type { WatchPlan } from "@/lib/trade/watch-order"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  defaultPaperCosts,
  type PaperFillReason,
  type TradeOrder,
  type TradePosition,
} from "@/lib/trade/paper"
import { db } from "@/server/db"
import { checkLiquidationWarnings } from "@/server/trade/liquidation-warning"
import { writeTradeNotice } from "@/server/trade/notices"
import {
  copySmartOrderPauseState,
  isSmartOrderRefusal,
  recordSmartOrderRefusal,
  recordSmartOrderSendSuccess,
  smartOrderRefusalReason,
} from "@/server/trade/smart-order-pause"
import {
  assertFlowRunAcceptingPlacements,
  flowLadderOrderIds,
  rememberFlowRunOrders,
} from "@/server/trade/flow-run-orders"
import { accountOf, getProtocol, ordersOf } from "@/server/protocols/registry"
import { marketBaseInForce } from "@/server/trade/base-level"
import {
  cancelLiveOrder,
  placeLiveOrder,
  rollbackLiveOrder,
  setLiveBrackets,
} from "@/server/trade/live-orders"
import { sweepLiveFills } from "@/server/trade/live-fills"
import { pushedMarks } from "@/server/trade/live-marks"
import { marketRules } from "@/server/trade/market-rules"
import { walletCredential } from "@/server/trade/wallet-auth"
import {
  ladderById,
  saveLadderPlan,
  type PlaceLadderInput,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
import {
  assertSmartOrderPlacable,
  pairedLadderPlan,
} from "@/server/trade/smart-pairing"
import { advanceGrid } from "./smart-grids"
import { advanceSignal } from "./smart-signals"
import { advanceWatch } from "./smart-watch"
import {
  advanceOne,
  ladderBarsKey,
  ladderCandleNeeds,
  type LadderAdvanceInput,
  type LadderBars,
  type LadderEngineDeps,
  type LadderOrderInput,
} from "./smart-ladders"
import {
  draftGridOrder,
  gridById,
  movedGrid,
  saveGridPlan,
  type MovedGrid,
  type PlaceGridInput,
  type PlacedGrid,
} from "./grid-orders"
import {
  bumpOrders,
  fill as fillPaperBook,
  freeCash,
  type WalletBook,
} from "@/server/trade/paper"
import {
  tradeLiveJournal,
  tradeSmartLadders,
  tradeWallets,
} from "@/server/trade/schema"

/**
 * How often the ENGINE asks a wallet's venue for its fills. See the sweep
 * call in `reconcileLiveLaddersOnce` for why this throttle exists at all.
 */
const ENGINE_SWEEP_EVERY_MS = 30_000
const engineSweptAt = new Map<string, number>()

export async function placeLiveDcaLadder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceLadderInput
): Promise<PlacedLadder> {
  return await serializeLiveWallet(userId, wallet, () =>
    placeLiveDcaLadderOnce(userId, wallet, input)
  )
}

/**
 * How long an account read stands in for the next one, in ms.
 *
 * Matched to the price cache, and for the same reason: placing a ladder asks
 * the exchange what the account holds and what is open on it, and neither
 * answer is about the coin being placed. A flow walking a hundred coins asked
 * those two questions a hundred times over, per pass, and that is what spent
 * the account's request allowance until the exchange started refusing
 * everything with a 429.
 */
const ACCOUNT_CACHE_MS = 2_000

/** Inferred rather than named, so it cannot drift from what the adapter returns. */
type AccountAnswer = Awaited<ReturnType<ReturnType<typeof accountOf>["fetch"]>>
type OrdersAnswer = Awaited<
  ReturnType<ReturnType<typeof ordersOf>["portfolio"]>
>

type AccountSnapshot = {
  at: number
  answer: Promise<[AccountAnswer, OrdersAnswer]>
}

const accountCache = new Map<string, AccountSnapshot>()

/** How often one candle feed may be read, across every wallet. */
const CANDLE_FEED_EVERY_MS = 2_500
let lastCandleFeedAt = 0

/**
 * The account and what is open on it, shared between callers a moment apart.
 *
 * Safe to share this briefly because placing a ladder no longer spends
 * anything: rungs are prices the engine watches, and the engine re-checks the
 * cash at the moment a rung actually fires. The two seconds only pace how
 * often a flow walking many coins re-asks the same two questions.
 */
async function accountAndOrders(
  protocol: ReturnType<typeof getProtocol>,
  network: TradeWallet["network"],
  address: string,
  credential: () => string | null
): Promise<[AccountAnswer, OrdersAnswer]> {
  const key = `${network}:${address.toLowerCase()}`
  const cached = accountCache.get(key)
  if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.answer

  const at = Date.now()
  const answer = Promise.all([
    accountOf(protocol).fetch(network, address, credential),
    ordersOf(protocol).portfolio(network, address, credential),
  ]) as Promise<[AccountAnswer, OrdersAnswer]>
  // A failed read must not be remembered as an answer, or one 429 would be
  // repeated to every caller for the next two seconds.
  answer.catch(() => {
    if (accountCache.get(key)?.at === at) accountCache.delete(key)
  })
  accountCache.set(key, { at, answer })
  return answer
}

async function placeLiveDcaLadderOnce(
  userId: string,
  wallet: TradeWallet,
  input: PlaceLadderInput
): Promise<PlacedLadder> {
  if (wallet.kind !== "live" || !wallet.address || !wallet.hasKey) {
    throw new Error("LIVE_WALLET_KEY")
  }
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("LIVE_MARKET")
  }
  // Coarse first, for a fast refusal — the full pairing rules run again
  // inside the write once the rungs are drawn.
  await assertSmartOrderPlacable(userId, wallet, input.marketKey, {
    kind: "dca",
  })

  const protocol = getProtocol(wallet.protocol)
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("LIVE_MARKET")
  const mark = (
    await protocol.markets.prices(wallet.network, [ref.marketId])
  ).get(ref.marketId)
  if (mark === undefined || !(mark > 0)) {
    // Two different things arrive here as the same silence. "The exchange is
    // rationing us" clears on its own and is nobody's fault; "this market has
    // no price" is permanent and worth looking at. Saying the second when it
    // was the first sent somebody hunting for a delisted coin that was
    // trading perfectly well.
    throw new Error(
      (protocol.markets.pricesWereRationed?.(wallet.network, ref.marketId) ??
        false)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

  const credential = await walletCredential(userId, wallet.id)
  const [account, portfolio] = await accountAndOrders(
    protocol,
    wallet.network,
    wallet.address,
    credential
  )
  const held = portfolio.positions.find((one) => one.marketId === ref.marketId)
  if (held && held.szi < 0) throw new Error("SMART_SHORT_HELD")

  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick)
  let anchorPx: number
  if (input.params.anchor === "click") {
    anchorPx = roundPx(input.clickPx)
  } else {
    const base = await marketBaseInForce(
      wallet.protocol,
      wallet.network,
      ref.marketId,
      Date.now(),
      input.params.baseDetection
    )
    if (base === null) throw new Error("SMART_LADDER_NO_BASE")
    anchorPx = roundPx(base)
    // Price under the base does not refuse it — see `draftDcaLadder`, which
    // this deliberately matches. What guards the real danger is the rung check
    // below: a rung already above the market is marked skipped, and a ladder
    // with none left below it is refused as `SMART_LADDER_ABOVE_MARKET`.
  }
  if (!(anchorPx > 0)) throw new Error("LIVE_PRICE")

  const maxLeverage = rules.maxLeverage ?? input.params.leverage
  const leverage = Math.min(input.params.leverage, maxLeverage)
  const drawn = dcaLadderPlan({
    anchorPx,
    equity: input.params.compound ? account.equity : wallet.startingBalance,
    params: { ...input.params, leverage },
    sizeDecimals: rules.sizeDecimals,
    volume24hUsd: rules.volume24hUsd,
  })
  // There is deliberately no exchange-minimum check here.
  //
  // The minimum is about an ORDER, and a waiting rung is not one — it becomes
  // an order only if price ever reaches it, and whether it clears the minimum
  // is a question for that moment, when the pot (and so the rung) may be a
  // different size. Asking at placement refused whole ladders over orders
  // nobody was sending.
  const priced = drawn.rungs.map((rung, index) => {
    const px = roundPx(rung.px)
    const sz = floorSize(rung.sz, rules.sizeDecimals)
    if (!(px > 0) || sz <= 0) {
      throw new Error(`SMART_RUNG_TOO_SMALL:${index + 1}`)
    }
    return { px, sz }
  })
  const twoGreen = input.params.twoGreen
  const rungs: LadderRungState[] = priced.map((rung) => ({
    ...rung,
    status: !twoGreen && rung.px >= mark ? "skipped" : "waiting",
    budget: rung.px * rung.sz,
    orderId: null,
    sellOrderId: null,
    dead: false,
    touched: false,
  }))
  if (rungs.every((rung) => rung.status === "skipped")) {
    throw new Error("SMART_LADDER_ABOVE_MARKET")
  }

  // Two-green marks nothing skipped — price under a rung is its trigger — so
  // the check above cannot fire for it. Real money, so this matters more here
  // than anywhere: without it, a two-green ladder on a coin that has fallen
  // under its deepest rung buys every rung at once on the next two greens.
  // Matches `draftDcaLadder`, which the practice and replay paths use.
  if (twoGreen && rungs.every((rung) => rung.px >= mark)) {
    throw new Error("SMART_LADDER_ABOVE_MARKET")
  }

  // Placing sends NOTHING to the exchange. The ladder is a row the engine
  // watches — each rung a price, bought at market when price reaches it — so
  // there are no orders to place here, no order-cap to count against, and no
  // rollback to carry. Nothing about the account changes until a rung fires.
  const now = new Date()
  const ladderId = randomUUID()
  const plan = ladderPlan(
    input,
    rules.sizeDecimals,
    rules.priceTick,
    maxLeverage,
    leverage,
    anchorPx,
    rungs
  )
  await db.transaction(async (tx) => {
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
    // Under the lock, with the rungs drawn — the full pairing rules run here.
    await assertSmartOrderPlacable(
      userId,
      wallet,
      input.marketKey,
      { kind: "dca", plan },
      tx
    )
    await tx.insert(tradeSmartLadders).values({
      userId,
      id: ladderId,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "dca",
      status: "active",
      plan,
      // Which flow placed it, when a flow did. Nothing has been sent to the
      // exchange yet, so there are no order ids to record here — each rung's
      // is written down as the engine sends it.
      flowRunId: input.flowRunId ?? null,
      createdAt: now,
      updatedAt: now,
    })
  })

  return {
    placed: rungs.filter((rung) => rung.status === "waiting").length,
    passed: rungs.filter((rung) => rung.status === "skipped").length,
    // The row as written, so the chart draws the ladder in the same frame the
    // window closes — see `PlacedLadder`.
    ladder: {
      id: ladderId,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "dca",
      status: "active",
      flowRunId: input.flowRunId ?? null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      plan,
    },
  }
}

function ladderPlan(
  input: PlaceLadderInput,
  sizeDecimals: number | null,
  priceTick: number | null,
  maxLeverage: number,
  leverage: number,
  anchorPx: number,
  rungs: LadderRungState[]
): LadderPlan {
  const takeProfit = input.params.takeProfit
  return {
    anchorPx,
    anchor: input.params.anchor,
    // **Forced, never read from the settings.** Nothing this app places on a
    // real or practice wallet may sit on the book waiting: a resting rung ties
    // up the money for a buy that may never happen, eats the wallet's cap on
    // open orders, and gets drawn twice on the chart — once as the order and
    // once as the ladder's own level. Every rung is a price being watched, and
    // the order is sent when price actually reaches it.
    //
    // A backtest is the one place "limit" still means something, because there
    // is no book to rest on — it models a fill at the level instead. Forcing it
    // here rather than in the engine is what keeps those two apart, so this
    // change does not quietly rewrite what every past run measured.
    rungEntry: "market" as const,
    startedAt: Date.now(),
    baseDetection: input.params.baseDetection,
    sizeDecimals,
    priceTick,
    maxLeverage,
    leverage,
    rungs,
    takeProfit: takeProfit
      ? {
          mode: takeProfit.mode,
          pct: takeProfit.mode === "average" ? takeProfit.pct : null,
        }
      : null,
    stopLoss: input.params.stopLoss
      ? {
          mode: "percent",
          pct: input.params.stopLoss.pct,
          base: ladderBaseStopOf(input.params.stopLoss.base),
        }
      : null,
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen: input.params.twoGreen,
    greenInterval: input.params.twoGreen ? input.interval : null,
    green: null,
    steppedDown: 0,
    awaitingSteppedRung: false,
    awaitingRungAfterWipe: false,
    baseWatch: null,
    reclaim: null,
    // Same as the practice ladder: frozen at placement, see `smart-orders.ts`.
    cascade: input.params.cascade ?? null,
    cascadeSeenAt: null,
    // The wallet-wide entry limit rides on every plan, so the live engine can
    // read it off whichever ladder it happens to look at first.
    entryLimit: input.params.entryLimit ?? null,
  }
}

export async function cancelLiveLadderRung(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string; rungIndex: number }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    await cancelLiveLadderRungOnce(userId, wallet, input)
  })
}

async function cancelLiveLadderRungOnce(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string; rungIndex: number }
): Promise<void> {
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  const rung = ladder.plan.rungs[input.rungIndex]
  if (!rung || rung.status !== "waiting") throw new Error("SMART_RUNG_DONE")
  if (rung.orderId) {
    await cancelLiveOrder(userId, {
      walletId: wallet.id,
      marketKey: ladder.marketKey,
      orderId: rung.orderId,
    })
  }
  rung.status = "cancelled"
  rung.orderId = null
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
}

export async function cancelLiveLadderRest(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ cancelled: number }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    const portfolio =
      wallet.address && wallet.hasKey
        ? await ordersOf(getProtocol(wallet.protocol)).portfolio(
            wallet.network,
            wallet.address,
            await walletCredential(userId, wallet.id)
          )
        : undefined
    await reconcileLiveLaddersOnce(userId, wallet, portfolio)
    return await cancelLiveLadderRestOnce(userId, wallet, input, portfolio)
  })
}

/** Calls off a flow's unbought ladder without advancing any watched rung. */
export async function cancelLiveFlowLadderRest(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ complete: boolean; done: boolean }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    const ladder = await ladderById(userId, wallet.id, input.ladderId)
    // The normal engine may have won the wallet queue after Stop counted this
    // row. Once any rung bought, Stop leaves the whole ladder as it stands.
    if (ladder.plan.rungs.some((rung) => rung.status === "filled")) {
      return { complete: true, done: false }
    }
    if (!wallet.address || !wallet.hasKey) throw new Error("LIVE_WALLET_KEY")
    const portfolio = await ordersOf(getProtocol(wallet.protocol)).portfolio(
      wallet.network,
      wallet.address,
      await walletCredential(userId, wallet.id)
    )
    await cancelLiveLadderRestOnce(userId, wallet, input, portfolio)
    return { complete: true, done: true }
  })
}

/** Calls off a removed coin's waiting rungs and keeps anything already bought. */
export async function cancelLiveFlowLadderRemainder(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ complete: boolean; done: boolean }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    if (!wallet.address || !wallet.hasKey) throw new Error("LIVE_WALLET_KEY")
    const portfolio = await ordersOf(getProtocol(wallet.protocol)).portfolio(
      wallet.network,
      wallet.address,
      await walletCredential(userId, wallet.id)
    )
    await cancelLiveLadderRestOnce(userId, wallet, input, portfolio)
    const [row] = await db
      .select({ status: tradeSmartLadders.status })
      .from(tradeSmartLadders)
      .where(
        and(
          eq(tradeSmartLadders.userId, userId),
          eq(tradeSmartLadders.walletId, wallet.id),
          eq(tradeSmartLadders.id, input.ladderId)
        )
      )
      .limit(1)
    return { complete: true, done: row?.status === "done" }
  })
}

/** Calls off one flow-owned signal buy without advancing unrelated smart orders. */
export async function cancelLiveSignalRest(
  userId: string,
  wallet: TradeWallet,
  input: { signalId: string; now: number }
): Promise<{ complete: boolean; done: boolean }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    const [row] = await db
      .select({
        marketKey: tradeSmartLadders.marketKey,
        plan: tradeSmartLadders.plan,
      })
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
    if (!row || !plan) throw new Error("SMART_SIGNAL_NOT_FOUND")
    if (plan.phase !== "buying" && plan.phase !== "stopping") {
      return { complete: true, done: false }
    }

    const protocol = getProtocol(wallet.protocol)
    if (!wallet.address || !wallet.hasKey) throw new Error("LIVE_WALLET_KEY")
    const portfolio = await ordersOf(protocol).portfolio(
      wallet.network,
      wallet.address,
      await walletCredential(userId, wallet.id)
    )
    const recorded = await flowLadderOrderIds(userId, wallet.id, input.signalId)
    if (plan.orderId) recorded.add(plan.orderId)
    const open = portfolio.orders.filter((order) => recorded.has(order.orderId))
    for (const order of open) {
      await cancelLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: row.marketKey,
        orderId: order.orderId,
        side: order.side,
        px: order.px,
        sz: order.sz,
      })
    }

    if (plan.orderId && !open.some((order) => order.orderId === plan.orderId)) {
      const ref = parseMarketKey(row.marketKey)
      const held = ref
        ? (portfolio.positions.find(
            (position) => position.marketId === ref.marketId
          )?.szi ?? 0)
        : plan.heldWhenPlaced
      const seen = judgeOrder({
        seenOnTheBook: false,
        accountShowsItDone: Math.abs(held - plan.heldWhenPlaced) > 1e-9,
        missingSince: plan.missingSince,
        now: input.now,
      })
      if (seen.presence === "unproven") {
        await saveLadderPlan(
          userId,
          input.signalId,
          { ...plan, phase: "stopping", missingSince: seen.missingSince },
          "active"
        )
        return { complete: false, done: false }
      }
    }

    await saveLadderPlan(
      userId,
      input.signalId,
      {
        ...plan,
        phase: "stopping",
        orderId: null,
        orderPx: null,
        missingSince: 0,
      },
      "done"
    )
    return { complete: true, done: true }
  })
}

async function cancelLiveLadderRestOnce(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string },
  portfolio?: WalletPortfolio
): Promise<{ cancelled: number }> {
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  const recordedIds = await flowLadderOrderIds(userId, wallet.id, ladder.id)
  const planIds = new Set(
    ladder.plan.rungs.flatMap((rung) =>
      [rung.orderId, rung.sellOrderId].filter(
        (orderId): orderId is string => orderId !== null
      )
    )
  )
  const hasFill = ladder.plan.rungs.some((rung) => rung.status === "filled")

  // Older broken stops cleared ids from the plan without cancelling the real
  // orders. The permanent order record still says which ladder sent them, and
  // the exchange says which ones remain open. Only that intersection is safe
  // to cancel: matching by coin or price could take somebody's hand order too.
  for (const order of portfolio?.orders ?? []) {
    if (!recordedIds.has(order.orderId) || planIds.has(order.orderId)) continue
    if (hasFill && (order.side !== "buy" || order.reduceOnly)) continue
    await cancelLiveOrder(userId, {
      walletId: wallet.id,
      marketKey: ladder.marketKey,
      orderId: order.orderId,
    })
  }

  let cancelled = 0
  try {
    for (const rung of ladder.plan.rungs) {
      if (rung.status !== "waiting") continue
      if (rung.orderId) {
        await cancelLiveOrder(userId, {
          walletId: wallet.id,
          marketKey: ladder.marketKey,
          orderId: rung.orderId,
        })
      }
      rung.status = "cancelled"
      rung.orderId = null
      cancelled += 1
    }
  } catch (error) {
    // Keep every successful cancel. The next pass retries only the rungs that
    // still say waiting instead of asking the exchange to cancel the same
    // order again and getting stuck on an already-gone id.
    await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
    throw error
  }
  const status = hasFill ? "active" : "done"
  await saveLadderPlan(userId, ladder.id, ladder.plan, status)
  return { cancelled }
}

export async function updateLiveLadderExits(
  userId: string,
  wallet: TradeWallet,
  input: {
    ladderId: string
    takeProfit: DcaParams["takeProfit"]
    stopLoss: DcaParams["stopLoss"]
  }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    await updateLiveLadderExitsOnce(userId, wallet, input)
    await reconcileLiveLaddersOnce(userId, wallet, undefined, true)
  })
}

async function updateLiveLadderExitsOnce(
  userId: string,
  wallet: TradeWallet,
  input: {
    ladderId: string
    takeProfit: DcaParams["takeProfit"]
    stopLoss: DcaParams["stopLoss"]
  }
): Promise<void> {
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  if (
    ladder.plan.takeProfit?.mode === "prevRung" &&
    input.takeProfit?.mode !== "prevRung"
  ) {
    for (const rung of ladder.plan.rungs) {
      if (!rung.sellOrderId) continue
      await cancelLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: ladder.marketKey,
        orderId: rung.sellOrderId,
      })
      rung.sellOrderId = null
    }
  }
  ladder.plan.takeProfit = input.takeProfit
    ? {
        mode: input.takeProfit.mode,
        pct: input.takeProfit.mode === "average" ? input.takeProfit.pct : null,
      }
    : null
  ladder.plan.stopLoss = input.stopLoss
    ? {
        mode: "percent",
        pct: input.stopLoss.pct,
        base: ladderBaseStopOf(input.stopLoss.base),
      }
    : null
  if (!ladder.plan.stopLoss?.base) ladder.plan.reclaim = null
  ladder.plan.aimedTpPx = null
  ladder.plan.aimedSlPx = null
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
}

const reconciles = new Map<string, Promise<unknown>>()
const EXCHANGE_VISIBILITY_GRACE_MS = 2_000

/**
 * How long a paired grid's stop may be missing from the portfolio read
 * before that absence is believed to mean it fired. Longer than the
 * ordinary order grace on purpose: mistaking a slow read for a fired stop
 * closes the whole grid, and nothing about a stop that really fired gets
 * worse by being noticed a few seconds later — its levels cannot buy below
 * it anyway.
 */
const PAIRED_STOP_VISIBILITY_GRACE_MS = 15_000

async function serializeLiveWallet<T>(
  userId: string,
  wallet: TradeWallet,
  work: () => Promise<T>
): Promise<T> {
  const key = `${userId}:${wallet.id}`
  const previous = reconciles.get(key) ?? Promise.resolve()
  const started = previous.catch(() => undefined).then(work)
  reconciles.set(key, started)
  try {
    return await started
  } finally {
    if (reconciles.get(key) === started) reconciles.delete(key)
  }
}

/**
 * Markets the exchange just refused an order on, and until when their rungs
 * stay held back.
 *
 * **The loop this prevents makes no claim about WHY the refusal happened.**
 * A refused rung is undone — put back to waiting — and the next pass would
 * fire it again: one refused request a second, forever, which is how this app
 * once rate-limited itself off the exchange. The old shield was a rule about
 * sub-market money that turned out to be stale; this one simply believes a
 * refusal for a minute, whatever its reason, so a persistent one costs one
 * request a minute instead of sixty.
 */
const refusalHolds = new Map<string, number>()
const REFUSAL_HOLD_MS = 60_000

/**
 * Test support: forgets every market's hold.
 *
 * The map is keyed by wallet and market and lives for the life of the module,
 * so one test's refused buy quietly skipped the exchange in the next — which
 * read as "the engine did nothing" and hid a real fix behind a green run.
 */
export function resetRefusalHolds(): void {
  refusalHolds.clear()
}

/**
 * The exchange took nothing, and said so in a way that leaves no doubt.
 *
 * A refusal response and the local pre-order refusals qualify. Nothing else
 * does.
 *
 * - `LIVE_ORDER_REFUSED` is the exchange reading the order and refusing it.
 * - `ASTER_REFUSED` and named Aster refusals are negative API responses. The
 *   exchange read the request and returned an error instead of an order.
 * - `EXCHANGE_BUSY` is a rate limit, and it is just as certain: either the
 *   request was never built at all — `rationing.ts` answers "busy" before a
 *   socket is opened — or the exchange answered 429, which is a request it
 *   declined to look at. Neither one can have matched.
 *
 * Everything else stays ambiguous on purpose. A timeout mid-order may have
 * filled, and undoing that is how the same thing gets bought twice.
 *
 * **Ambiguity is not free either.** A watch that marks itself `sent` and then
 * loses the order it was sent for waits for a fill that is never coming, and
 * waits forever: there is no clock on it. So the two answers that promise
 * nothing happened have to be believed, or a rate limit at the wrong second
 * ends the order for good. That is what happened to a Phemex watch on
 * 21 Aug 2026 — twice in eighty minutes, on the same coin.
 */
export function nothingStood(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  // Hyperliquid refusing a post-only order that would have paid the spread.
  // From a plain place it already arrives as `LIVE_ORDER_REFUSED` and is
  // covered below — but the same refusal out of a MODIFY arrives wrapped as
  // `LIVE_EXCHANGE:Error placing new order during modify: Post only order
  // would have immediately matched…`, which the prefixes below do not trust.
  // It is just as certain: the exchange said in words that it kept nothing,
  // and the modify's cancel half already took the old order off the book. Not
  // trusting it froze a reached ETH watch for good on 23 Aug 2026 — `sent`
  // raised, no order anywhere, and nothing left that could ever clear it.
  if (/post only order would have immediately matched/i.test(message)) {
    return true
  }
  return (
    isSmartOrderRefusal(error) ||
    message.startsWith("LIVE_ORDER_REFUSED") ||
    message.startsWith("LIVE_ORDER_SETTINGS") ||
    message.startsWith("LIVE_MARGIN_MODE") ||
    message.startsWith("LIVE_LEVERAGE") ||
    message.startsWith("ASTER_") ||
    message === "EXCHANGE_BUSY"
  )
}

/** Advances live ladders from exchange truth using the same state engine as paper. */
/**
 * Wallets a reconcile is running for right now.
 *
 * **A reconcile that is already running is not worth queueing behind.** Two
 * screens poll this every few seconds, and a pass against a slow or
 * rate-limited exchange can outlast the gap between polls. Waiting our turn
 * meant each poll added another request that sat holding a database
 * connection until its turn came, and once the pool was spent EVERY read in
 * the app — wallets, drawings, positions — waited with it. The panels showed
 * a spinner that never ended and the page stopped responding.
 *
 * So a caller that finds one already in flight is told "being done" and
 * leaves. Nothing is lost: the pass in flight is doing the same work, and the
 * next poll is seconds away.
 */
const reconciling = new Set<string>()

/**
 * A smart order that could not be advanced, said out loud.
 *
 * **Silence is the thing that made this expensive.** The pass that died took
 * the whole wallet with it and reported nothing at all: no journal row, no
 * error on the heartbeat, no mark on the order. From the outside the engine
 * looked healthy and the market looked quiet. Every failure now leaves a
 * trace in the one place a person already looks when an order did not do what
 * it was meant to.
 */
async function noteRowFailure(
  userId: string,
  walletId: string,
  marketKey: string,
  error: unknown
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  console.error("trade engine: could not advance", marketKey, message)
  try {
    await db.insert(tradeLiveJournal).values({
      id: randomUUID(),
      userId,
      walletId,
      marketKey,
      action: "refused",
      side: "buy",
      px: 0,
      sz: 0,
      note: `The engine could not work this order: ${message}`.slice(0, 500),
    })
  } catch {
    // A journal that will not take the row is not a reason to stop the pass;
    // the console line above still carries it.
  }
}

export async function reconcileLiveLadders(
  userId: string,
  wallet: TradeWallet,
  currentPortfolio?: WalletPortfolio
): Promise<void> {
  const key = `${userId}:${wallet.id}`
  if (reconciling.has(key)) return
  reconciling.add(key)
  try {
    await serializeLiveWallet(userId, wallet, () =>
      reconcileLiveLaddersOnce(userId, wallet, currentPortfolio)
    )
  } finally {
    reconciling.delete(key)
  }
}

async function reconcileLiveLaddersOnce(
  userId: string,
  wallet: TradeWallet,
  currentPortfolio?: WalletPortfolio,
  force = false
): Promise<void> {
  if (wallet.kind !== "live" || !wallet.address || !wallet.hasKey) return
  const rows = await db
    .select()
    .from(tradeSmartLadders)
    .where(
      and(
        eq(tradeSmartLadders.userId, userId),
        eq(tradeSmartLadders.walletId, wallet.id),
        eq(tradeSmartLadders.status, "active")
      )
    )
  if (rows.length === 0) return

  // Parsed ONCE, by kind, and everything below reads from here.
  //
  // A row whose plan cannot be read is dropped now rather than skipped in six
  // separate places later — a row that some of this function believes in and
  // the rest does not is how an order ends up resting on the exchange with
  // nothing advancing it.
  const parsed = new Map<string, SmartEntry>()
  for (const row of rows) {
    const kind = readSmartOrderKind(row.kind)
    if (!kind) continue
    const entry = readSmartEntry(kind, row.plan)
    if (entry) parsed.set(row.id, entry)
  }
  if (parsed.size === 0) return

  /** The plan for whichever smart order is working this coin, if any. */
  const planFor = (marketKey: string) => {
    const row = rows.find((one) => one.marketKey === marketKey)
    return row ? (parsed.get(row.id) ?? null) : null
  }

  const protocol = getProtocol(wallet.protocol)
  const credential = await walletCredential(userId, wallet.id)
  const portfolio =
    currentPortfolio ??
    (await ordersOf(protocol).portfolio(
      wallet.network,
      wallet.address,
      credential
    ))
  // The fills record used to be kept only by the browser's poll, so a stop
  // that fired at three in the morning was written down — and its bell notice
  // sent — whenever somebody next opened the page. The engine is already here
  // every second for every wallet with working orders, so it keeps the record
  // too.
  //
  // **Throttled here, on top of the sweep's own pacing.** The sweep skips its
  // 30-second wait whenever the venue's push feed says it needs a recovery
  // read — right for a browser poll, wrong here: on a venue whose feed cannot
  // connect (Phemex under its rate limit), "needs recovery" never clears, so
  // an every-second caller ran the full history read and its order lookups
  // every single second. That spent the venue's whole request ration and got
  // every OTHER request refused — placing a watched order included, measured
  // 23 Aug 2026. A fill is still written down within half a minute of
  // happening, which is what the 3am case needs.
  const lastSweepAt = engineSweptAt.get(wallet.id) ?? 0
  if (Date.now() - lastSweepAt >= ENGINE_SWEEP_EVERY_MS) {
    engineSweptAt.set(wallet.id, Date.now())
    void sweepLiveFills(userId, wallet, portfolio, credential)
  }

  // Hand each stop back to its owner before anything reads the positions.
  // On a coin running a grid above a ladder, the exchange read names the
  // oldest stop leg — usually the grid's — as THE position's stop, and the
  // ladder's engine would then read a price it never wrote as a hand-move
  // and stop managing its stop for good. See `reattributePairedStops`.
  const pairedRefs = new Map<string, PairedStopRef>()
  for (const row of rows) {
    if (row.kind !== "grid") continue
    const entry = parsed.get(row.id)
    if (!entry || entry.kind !== "grid") continue
    const gridPlan = entry.plan as GridPlan
    if (!gridPlan.pairedStop) continue
    const marketId = parseMarketKey(row.marketKey)?.marketId
    if (!marketId) continue
    const ladderRow = rows.find(
      (one) => one.kind === "dca" && one.marketKey === row.marketKey
    )
    const ladderEntry = ladderRow ? parsed.get(ladderRow.id) : undefined
    pairedRefs.set(marketId, {
      orderId: gridPlan.pairedStop.orderId,
      px: gridPlan.pairedStop.px,
      sz: gridPlan.pairedStop.sz,
      ladderAimedSlPx:
        ladderEntry?.kind === "dca"
          ? ((ladderEntry.plan as LadderPlan).aimedSlPx ?? null)
          : null,
    })
  }
  const folio = reattributePairedStops(portfolio, pairedRefs)

  const warningPositions: TradePosition[] = folio.positions.map((held) => {
    const key = toMarketKey({
      protocol: wallet.protocol,
      network: wallet.network,
      marketId: held.marketId,
    })
    return {
      id: key,
      walletId: wallet.id,
      marketKey: key,
      szi: held.szi,
      entryPx: held.entryPx,
      leverage: held.leverage,
      maxLeverage: held.leverage,
      targets: held.targets,
      tpPx: held.tpPx,
      tpSz: held.tpSz,
      slPx: held.slPx,
      feesPaid: 0,
      updatedAt: Date.now(),
      live: {
        marginUsed: held.marginUsed,
        liquidationPx: held.liquidationPx,
        tpOrderId: held.tpOrderId,
        slOrderId: held.slOrderId,
      },
    }
  })
  const liveWarningMarks = pushedMarks(
    warningPositions.map((position) => position.marketKey)
  ).marks
  await checkLiquidationWarnings({
    userId,
    wallet,
    positions: warningPositions,
    marks: liveWarningMarks,
  }).catch((error) =>
    console.error(`Liquidation warning failed for wallet ${wallet.id}`, error)
  )
  const now = Date.now()
  const keys = rows.map((row) => row.marketKey)
  const refs = new Map(
    keys.flatMap((key) => {
      const ref = parseMarketKey(key)
      return ref ? [[ref.marketId, key] as const] : []
    })
  )
  // **Prices come off the open line, and asking is the fallback.**
  //
  // Calling this also OPENS the line, so a live wallet is what gets the
  // socket up. Until it is up, and any time it goes quiet, this answers null
  // and the ordinary ask below still happens.
  const pushed = pushedMarks(keys)
  // Only what the open line is short of. Asking for a market it already
  // carries is a request spent to be told something we were told a moment ago,
  // and on an exchange asked one market at a time that is the whole cost of
  // the pass.
  const askFor = pushed.missing.flatMap((key) => {
    const ref = parseMarketKey(key)
    return ref ? [ref.marketId] : []
  })
  const [account, asked, fills] = await Promise.all([
    accountOf(protocol)
      .fetch(wallet.network, wallet.address, credential)
      .catch((error) => {
        // **Not knowing what the account holds means not spending, not
        // stopping.** Cash of zero fails the affordability check, so a buy
        // waits for the next pass rather than going out on a guess — while
        // everything needing no cash carries on: levels are still watched,
        // stops and targets are still set, exits still leave. Before this,
        // one refused read stopped the whole wallet dead.
        console.error(`Account read failed for wallet ${wallet.id}`, error)
        return null
      }),
    askFor.length === 0
      ? null
      : protocol.markets.prices(wallet.network, askFor).catch((error) => {
          // No price this pass is a quiet pass, not a broken one: every
          // smart order stands still without one, which is exactly what
          // should happen. Letting it through stopped the rest of the
          // wallet being worked at all.
          console.error(`Price read failed for wallet ${wallet.id}`, error)
          return null
        }),
    ordersOf(protocol)
      .fills(
        wallet.network,
        wallet.address,
        // How far back the fill feed is read.
        //
        // From where each order has already read to, not from when it was
        // placed. A ladder makes perhaps forty fills in its whole life, so
        // re-reading everything since placement cost nothing; a grid
        // recycling ten times a day makes hundreds, and re-reading all of
        // them every second is a bill that grows for as long as the grid
        // is winning. The minute of overlap is deliberate — a fill that
        // lands between two reads must not fall down the gap.
        Math.min(
          ...rows.map((row) => {
            const seen = parsed.get(row.id)?.plan
            const to =
              seen && "seenFillsTo" in seen && seen.seenFillsTo > 0
                ? seen.seenFillsTo
                : row.createdAt.getTime()
            return to
          })
        ) - 60_000,
        credential
      )
      .catch((error) => {
        // **A fill feed that will not answer must not stop the trading.**
        // Fills are the record of what already happened — they fill the
        // Journal and move the watermark, and a pass that misses them
        // catches up on the next one. Letting the failure through killed
        // the whole wallet's pass instead, so a level was never compared
        // against the price and nothing fired. Phemex refused this exact
        // read all day on 20 Aug 2026 with a plain 400, while KuCoin's
        // answered and KuCoin's watches fired all day — which is what
        // pinned it to this read.
        console.error(`Fills read failed for wallet ${wallet.id}`, error)
        return []
      }),
  ])
  // The open line first, then whatever had to be asked for. The line already
  // speaks in market keys; the ask answers per market id and has to be
  // translated back. The two never overlap: only markets the line could not
  // answer for were asked about.
  const marks = new Map<string, number>(pushed.marks)
  if (asked) {
    for (const [marketId, px] of asked) {
      const key = refs.get(marketId)
      if (key) marks.set(key, px)
    }
  }

  const positions = new Map<string, TradePosition>()
  for (const held of folio.positions) {
    const marketKey = refs.get(held.marketId)
    if (!marketKey) continue
    const held_plan = planFor(marketKey)?.plan
    positions.set(marketKey, {
      id: marketKey,
      walletId: wallet.id,
      marketKey,
      szi: held.szi,
      entryPx: held.entryPx,
      leverage: held.leverage,
      maxLeverage: held_plan?.maxLeverage ?? held.leverage,
      targets: held.targets,
      tpPx: held.tpPx,
      slPx: held.slPx,
      feesPaid: 0,
      updatedAt: now,
    })
  }
  const orders: TradeOrder[] = folio.orders.flatMap((order) => {
    const marketKey = refs.get(order.marketId)
    if (!marketKey) return []
    return [
      {
        id: order.orderId,
        walletId: wallet.id,
        marketKey,
        side: order.side,
        px: order.px,
        sz: order.sz,
        leverage: 1,
        maxLeverage: planFor(marketKey)?.plan.maxLeverage ?? 1,
        reduceOnly: order.reduceOnly,
        tpPx: null,
        slPx: null,
        createdAt: now,
        updatedAt: now,
      },
    ]
  })
  const liveOrderIds = new Set(orders.map((order) => order.id))
  const managedOrders = new Map<
    string,
    { marketKey: string; side: "buy" | "sell"; px: number; sz: number }
  >()
  for (const row of rows) {
    const entry = parsed.get(row.id)
    if (!entry) continue
    const roundPx = (px: number) =>
      protocol.markets.roundPx(
        px,
        entry.plan.sizeDecimals,
        entry.plan.priceTick
      )

    // Only a ladder has rungs to match fills against.
    //
    // **A grid and a watch both used to fall through here**, and a watch has
    // no rungs at all — so reading them threw, the whole pass died before a
    // single trigger was looked at, and nothing said a word. One watched
    // order on a wallet stopped that wallet's engine completely: levels were
    // crossed and held for twenty minutes on 20 Aug 2026 and nothing fired,
    // on two exchanges, while the app looked perfectly healthy.
    //
    // Named the safe way round — only `dca` goes on — so a kind added later
    // is skipped rather than read as a ladder it is not.
    if (entry.kind !== "dca") continue

    const plan = entry.plan as LadderPlan
    const exits = ladderExitLevels(plan)
    for (const [index, rung] of plan.rungs.entries()) {
      if (rung.orderId) {
        managedOrders.set(rung.orderId, {
          marketKey: row.marketKey,
          side: "buy",
          px: rung.px,
          sz: rung.sz,
        })
      }
      if (rung.sellOrderId) {
        managedOrders.set(rung.sellOrderId, {
          marketKey: row.marketKey,
          side: "sell",
          px: roundPx(exits[index]),
          sz: rung.sz,
        })
      }
    }
  }
  const managedFillTotals = new Map<
    string,
    { sz: number; at: number; fillId: string }
  >()
  for (const one of fills) {
    const managed = managedOrders.get(one.orderId)
    if (!managed || managed.side !== one.side) continue
    const total = managedFillTotals.get(one.orderId)
    managedFillTotals.set(one.orderId, {
      sz: (total?.sz ?? 0) + one.sz,
      at: Math.max(total?.at ?? 0, one.at),
      fillId: total?.fillId ?? one.fillId,
    })
  }
  // When each coin still held was opened, as best the recent fills can say:
  // the earliest fill this window has for it. The exchange's position rows
  // carry no opening time, and an empty list here made the entry cap count
  // only within one pass. A coin whose opening fill has aged out of the
  // window contributes nothing — it was opened too long ago to count against
  // any sane cap anyway.
  const openedAt: number[] = []
  for (const [marketKey] of positions) {
    let earliest = Infinity
    for (const one of fills) {
      if (refs.get(one.marketId) !== marketKey) continue
      if (one.at < earliest) earliest = one.at
    }
    if (Number.isFinite(earliest)) openedAt.push(earliest)
  }
  openedAt.sort((left, right) => left - right)

  const book: WalletBook = {
    wallet,
    // A real wallet pays the exchange's real fees, which is what the default
    // says. Nothing here reads them — the exchange charged them already — but
    // the shape the engine works in wants them.
    costs: defaultPaperCosts(),
    cash:
      (account?.free ?? 0) +
      [...positions.values()].reduce(
        (sum, position) =>
          sum + Math.abs(position.szi * position.entryPx) / position.leverage,
        0
      ),
    positions,
    orders,
    fills: fills.flatMap((one) => {
      const marketKey = refs.get(one.marketId)
      if (!marketKey) return []
      if (managedOrders.has(one.orderId)) return []
      const near = (wanted: number | null) =>
        wanted !== null &&
        Math.abs(one.px - wanted) <= Math.max(1e-8, one.px * 1e-6)
      // EVERY smart order on this coin, not the first row found — a grid
      // above a ladder is two rows, each with a stop of its own that can
      // have fired. A grid never writes a take-profit onto the position —
      // its exits are its resting sells — so only a ladder contributes a
      // target price. Only the two kinds that manage a stop contribute one:
      // a signal trade writes no protection at all, and a watch hands its
      // stop to the position and is done.
      const stopPxs: number[] = []
      const targetPxs: number[] = []
      for (const row of rows) {
        if (row.marketKey !== marketKey) continue
        const entry = parsed.get(row.id)
        if (!entry) continue
        if (entry.kind === "dca") {
          const plan = entry.plan as LadderPlan
          if (plan.aimedSlPx !== null) stopPxs.push(plan.aimedSlPx)
          if (plan.aimedTpPx !== null) targetPxs.push(plan.aimedTpPx)
        }
        if (entry.kind === "grid") {
          const plan = entry.plan as GridPlan
          if (plan.aimedSlPx !== null) stopPxs.push(plan.aimedSlPx)
          // A paired grid's stop is its own exchange order rather than the
          // position's — a sell at its price is still that stop firing.
          if (plan.pairedStop) stopPxs.push(plan.pairedStop.px)
        }
      }
      const reason: PaperFillReason =
        one.side === "sell" && stopPxs.some((px) => near(px))
          ? "stop_loss"
          : one.side === "sell" && targetPxs.some((px) => near(px))
            ? "take_profit"
            : "order"
      if (reason === "order") return []
      return [
        {
          id: one.fillId,
          // The exchange's own fill of a bracket it holds, not of an order
          // this app placed — so there is nothing to point back at.
          orderId: null,
          walletId: wallet.id,
          marketKey,
          side: one.side,
          px: one.px,
          sz: one.sz,
          fee: 0,
          closedPnl: 0,
          reason,
          fillTime: one.at,
        },
      ]
    }),
    touchedMarkets: new Set(),
    goneOrderIds: new Set(),
    // Filled in by `advanceLadders`, off the plans actually on this wallet.
    entryLimit: null,
    openedAt,
    liquidatedThisPass: new Set(),
    crashEntry: { cascading: false, leastLeverage: null },
    ordersVersion: 0,
    // The exchange's own prices for this pass, so what the wallet has left to
    // spend counts the positions that are down.
    marks: new Map(marks),
    addedOrders: [],
  }

  // A few candle feeds per pass, never all of them at once.
  //
  // A flow can hold a hundred-plus ladders, and each wants its 4h base
  // history once every four hours. Reading them all in one pass was three
  // thousand request-weight in a single second — the whole minute's allowance
  // and more, spent in a burst that got every call after it refused. Each
  // read is ~28 weight, so one per pass drains a hundred coins over a couple
  // of minutes and stays inside the budget; a base that waited two extra
  // minutes of a four-hour candle has lost nothing.
  const wanted = await ladderCandleNeeds(userId, wallet.id, now)
  const needs =
    now - lastCandleFeedAt < CANDLE_FEED_EVERY_MS ? [] : wanted.slice(0, 1)
  if (needs.length > 0) lastCandleFeedAt = now
  const ladderBars = new Map<
    string,
    {
      bars: Awaited<ReturnType<typeof protocol.markets.candles>>
      barMs: number
    }
  >()
  await Promise.all(
    needs.map(async (need) => {
      const ref = parseMarketKey(need.marketKey)
      if (!ref) return
      ladderBars.set(ladderBarsKey(need.use, need.marketKey), {
        bars: await protocol.markets.candles(
          wallet.network,
          ref.marketId,
          need.interval,
          need.since
        ),
        barMs: need.barMs,
      })
    })
  )

  /**
   * Runs one smart order's engine and turns what it wanted into real exchange
   * calls — placing, cancelling and market-filling, then saving the plan.
   *
   * One closure for both kinds. The translation is where the money is: a second
   * copy of it would be a second place for a temporary order id to survive into
   * the saved plan, which is the failure that places the same order every
   * second forever.
   */
  const advanceRow = async (
    raw: (typeof rows)[number],
    entry: SmartEntry,
    engine: (
      input: LadderAdvanceInput,
      deps: LadderEngineDeps,
      row: never
    ) => Promise<void>
  ): Promise<void> => {
    const originalPlan = structuredClone(entry.plan)
    // Whether this row is one half of a grid-above-ladder pairing. A paired
    // grid keeps its hands off the position's protection — its own stop is a
    // separate order, reconciled after the engine runs — and a paired
    // ladder's target is sized to the ladder's coins so firing it cannot
    // sell the grid's.
    const paired = rows.some(
      (other) =>
        other.id !== raw.id &&
        other.marketKey === raw.marketKey &&
        (other.kind === "grid" || other.kind === "dca") &&
        parsed.has(other.id)
    )
    let pauseNoticeReason: string | null = null
    const rememberRefusal = (error: unknown): void => {
      const reason = smartOrderRefusalReason(error)
      if (!reason) return
      if (recordSmartOrderRefusal(entry.plan, reason).pausedNow) {
        pauseNoticeReason = reason
      }
    }
    const announcePause = async (): Promise<void> => {
      if (!pauseNoticeReason) return
      const reason = pauseNoticeReason
      pauseNoticeReason = null
      const label =
        entry.kind === "dca"
          ? "ladder"
          : entry.kind === "watch"
            ? "watched order"
            : entry.kind
      try {
        await writeTradeNotice({
          userId,
          title: `${marketSymbol(raw.marketKey)} ${label} paused`,
          body: `${reason} The ${label} will send nothing else until you resume it.`,
          level: "warning",
          href: marketChartHref(raw.marketKey),
        })
      } catch (error) {
        console.error("trade engine: could not write pause notice", error)
      }
    }
    const originalOrders = new Map(
      book.orders
        .filter((order) => order.marketKey === raw.marketKey)
        .map((order) => [order.id, order])
    )
    const originalPosition = book.positions.get(raw.marketKey)
    const originalBrackets = originalPosition
      ? { tpPx: originalPosition.tpPx, slPx: originalPosition.slPx }
      : null
    const pendingPlaces: Array<{ tempId: string; input: LadderOrderInput }> = []
    const pendingFills: Array<LadderOrderInput & { undo?: () => void }> = []
    const pendingCancels = new Set<string>()
    await engine(
      {
        book,
        marks,
        ladderBars: ladderBars as LadderBars,
        now,
      },
      {
        fill: (heldBook, input) => {
          // `reduceOnly` is carried through, not assumed.
          //
          // It used to be hardcoded false here, which was invisible while the
          // only thing this path ever did was buy a rung back. A smart order
          // that SELLS at the market — a grid running out of the top of its
          // range — would then send a plain sell, and in the race where the
          // position has already gone that opens a short with real money.
          pendingFills.push({ ...input, now: input.at, undo: input.undo })
          fillPaperBook(heldBook, input)
        },
        dropOrder: (heldBook, orderId) => {
          pendingCancels.add(orderId)
          heldBook.orders = heldBook.orders.filter(
            (order) => order.id !== orderId
          )
          bumpOrders(heldBook)
          heldBook.goneOrderIds.add(orderId)
        },
        freeCash,
        insertOrder: async (input) => {
          const tempId = `pending:${randomUUID()}`
          pendingPlaces.push({ tempId, input })
          return tempId
        },
        saveLadder: async (row, status) => {
          const accepted: string[] = []
          let marketActionStarted = false
          try {
            let cancelFailed = false
            for (const orderId of pendingCancels) {
              const cancelled = await rollbackLiveOrder(userId, {
                walletId: wallet.id,
                marketKey: row.marketKey,
                orderId,
              })
              if (!cancelled) cancelFailed = true
            }
            // **A cancel that did not cancel voids the replacement.** The chase
            // swaps an order by dropping the old one and placing a new one, and
            // the swap is only safe when the drop really happened — a cancel
            // usually fails because the order already FILLED, and placing the
            // replacement then is buying the same thing twice. The plan keeps
            // `sent`, so the watch waits for the position that fill is about to
            // become instead of spending again.
            if (cancelFailed && entry.kind === "watch") {
              for (const pending of pendingPlaces) {
                forEachPlanOrderId(entry.kind, row.plan, (orderId, set) => {
                  if (orderId === pending.tempId) set(null)
                })
              }
              pendingPlaces.length = 0
            }
            for (const pending of pendingPlaces) {
              const outcome = await placeLiveOrder(userId, {
                walletId: wallet.id,
                marketKey: pending.input.marketKey,
                side: pending.input.side,
                px: pending.input.px,
                sz: pending.input.sz,
                leverage: pending.input.leverage,
                reduceOnly: pending.input.reduceOnly,
                tpPx: null,
                slPx: null,
                restingOnly: true,
              })
              recordSmartOrderSendSuccess(entry.plan)
              // A resting-only order that the venue reports FILLED anyway is
              // not a failure to unwind — the money moved, and unwinding the
              // plan is how the next pass buys it a second time. The watch is
              // told its order is gone (it is: it became a fill) and waits for
              // the position; `sent` on its plan is what keeps it waiting.
              //
              // **The venue does not always name it.** Phemex answers a
              // marketable post-only order with a fill and no order id at all,
              // and requiring one here threw `LIVE_SMART_ORDER_NOT_RESTING` and
              // rolled the whole thing back — leaving the exchange holding a
              // trade the app had just decided never happened. Seen on
              // 20 Aug 2026 at 23:17. The id is worth having and never worth
              // waiting for: the fills sweep carries the trade into the Journal
              // either way.
              if (entry.kind === "watch" && outcome.status === "filled") {
                forEachPlanOrderId(entry.kind, row.plan, (orderId, set) => {
                  if (orderId === pending.tempId) set(null)
                })
                if (outcome.orderId) {
                  await rememberFlowRunOrders({
                    userId,
                    walletId: wallet.id,
                    flowRunId: raw.flowRunId,
                    ladderId: row.id,
                    marketKey: pending.input.marketKey,
                    orderIds: [outcome.orderId],
                  })
                }
                continue
              }
              if (outcome.status !== "resting" || !outcome.orderId)
                throw new Error("LIVE_SMART_ORDER_NOT_RESTING")
              accepted.push(outcome.orderId)
              replacePlanOrderId(
                entry.kind,
                row.plan,
                pending.tempId,
                outcome.orderId
              )
              // Written down the moment the exchange names it, because the plan
              // lets go of this id as soon as the order fills — and the fill
              // that comes back hours later carries the id and nothing else.
              await rememberFlowRunOrders({
                userId,
                walletId: wallet.id,
                flowRunId: raw.flowRunId,
                ladderId: row.id,
                marketKey: pending.input.marketKey,
                orderIds: [outcome.orderId],
              })
            }
            for (const input of pendingFills) {
              if (entry.plan.paused) {
                input.undo?.()
                book.touchedMarkets.delete(input.marketKey)
                continue
              }
              // Still inside a refusal hold: skip the exchange entirely and put
              // the rung back to waiting, exactly as a refusal would have.
              const holdKey = `${wallet.id}:${input.marketKey}`
              const heldUntil = refusalHolds.get(holdKey) ?? 0
              if (!input.reduceOnly && Date.now() < heldUntil) {
                input.undo?.()
                book.touchedMarkets.delete(input.marketKey)
                continue
              }
              marketActionStarted = true
              const mark = marks.get(input.marketKey)
              try {
                const outcome = await placeLiveOrder(userId, {
                  walletId: wallet.id,
                  marketKey: input.marketKey,
                  side: input.side,
                  px: mark ?? input.px,
                  sz: input.sz,
                  leverage: input.leverage,
                  reduceOnly: input.reduceOnly,
                  tpPx: null,
                  slPx: null,
                  // The watched price already made the decision. A second
                  // quote moving back over the level must not turn this into
                  // a resting order after the engine recorded a fill.
                  marketOnly: true,
                })
                recordSmartOrderSendSuccess(entry.plan)
                refusalHolds.delete(holdKey)
                // A rung bought at market. Its fill reaches the record through
                // the exchange like any other, so its order id is written down
                // here too — otherwise the flow's own buys would read as
                // somebody else's.
                if (outcome.orderId) {
                  await rememberFlowRunOrders({
                    userId,
                    walletId: wallet.id,
                    flowRunId: raw.flowRunId,
                    ladderId: row.id,
                    marketKey: input.marketKey,
                    orderIds: [outcome.orderId],
                  })
                }
              } catch (error) {
                // Only the errors that PROMISE nothing stood — see
                // `nothingStood`. The engine's bookkeeping is put back so the
                // rung is not recorded as bought with nothing behind it, which
                // used to end the ladder and let the flow place a fresh one into
                // the same refusal, forever. Anything more ambiguous keeps the
                // conservative advanced state: a transport error mid-order may
                // still have filled, and undoing that is how a rung gets bought
                // twice.
                if (!nothingStood(error)) throw error
                const message =
                  error instanceof Error ? error.message : String(error)
                rememberRefusal(error)
                // The minute's hold is for a refusal, which will be refused
                // again for the same reason a second later. A rate limit is
                // already held off inside the exchange client, per key rather
                // than per market, and the next attempt costs no request at
                // all — so holding this market for a minute on top would only
                // make the order late once the allowance came back.
                if (message !== "EXCHANGE_BUSY") {
                  refusalHolds.set(holdKey, Date.now() + REFUSAL_HOLD_MS)
                }
                input.undo?.()
                // The shadow book still holds the phantom fill; keep this pass's
                // bracket step away from it. The next pass rebuilds the book
                // from the exchange and sees the truth.
                book.touchedMarkets.delete(input.marketKey)
              }
            }
            // The exchange changes and their matching plan are one logical
            // action. A failed save enters the same recovery path as a failed
            // placement so resting orders never drift away from their record.
            await saveLadderPlan(userId, row.id, row.plan, status)
            await announcePause()
          } catch (error) {
            // A market fill cannot be undone. Save the conservative advanced
            // state so a retry cannot buy it twice; the next exchange read
            // corrects the exact position and exits.
            if (marketActionStarted) {
              await saveLadderPlan(userId, row.id, row.plan, status)
              throw error
            }
            const recoveryFailed = await restoreLiveOrders({
              userId,
              wallet,
              marketKey: row.marketKey,
              accepted,
              cancelled: [...pendingCancels]
                .map((id) => originalOrders.get(id))
                .filter((order): order is TradeOrder => order !== undefined),
              kind: entry.kind,
              plan: originalPlan,
            })
            // **Money sent is never un-sent by an unwind.** Everything else in
            // the plan goes back to how this pass found it, but a watch that
            // has spent has spent — and if the rollback forgets that, the very
            // next pass buys the same thing again. A watch bought XRP twice in
            // 55 seconds on 20 Aug 2026 through exactly this door.
            //
            // Unless the exchange said outright that it took nothing. Then no
            // money was sent this pass, and carrying `sent` out of a refusal is
            // not caution — it is a watch that can never fire again, because
            // nothing but a fill or a person ever clears the flag. Note what is
            // NOT touched: `originalPlan` is the row as this pass found it, so a
            // watch that was already `sent` before the pass stays `sent`. Only a
            // flag raised by this pass and refused by the exchange goes back.
            if (
              entry.kind === "watch" &&
              entry.plan.sent &&
              !nothingStood(error)
            ) {
              ;(originalPlan as WatchPlan).sent = true
            }
            rememberRefusal(error)
            copySmartOrderPauseState(originalPlan, entry.plan)
            await saveLadderPlan(userId, row.id, originalPlan, "active")
            await announcePause()
            if (recoveryFailed) throw new Error("LIVE_SMART_ROLLBACK_FAILED")
            throw error
          }

          // Persisted before protection: entries and resting orders now have
          // durable ids. If protection is refused, a retry cannot place them
          // twice.
          const position = book.positions.get(row.marketKey)
          // A signal trade manages no protection. Its exit is the next arrow, so
          // writing a stop or a target for it here would be putting orders on a
          // position that nobody asked for and nothing would ever move again.
          // **Nothing to set and nothing to clear means nothing to say.** A
          // watch with no stop and no target used to call the exchange anyway,
          // to remove protection that was never there — and a position bought
          // at market a moment earlier is not visible to that call yet, so it
          // answered `LIVE_POSITION_GONE`. That refusal then unwound a buy that
          // had really happened. Asking for nothing is not worth a request, let
          // alone that.
          const wantsProtection =
            position !== undefined &&
            (position.tpPx !== null ||
              position.slPx !== null ||
              originalBrackets?.tpPx != null ||
              originalBrackets?.slPx != null)
          if (
            entry.kind !== "signal" &&
            // A paired grid owns no position protection at all — the
            // position's stop and target belong to the ladder beneath it,
            // and the grid's own fixed-size stop is reconciled separately
            // after this engine pass. Writing here would replace the
            // ladder's protection with the grid's idea of it.
            !(entry.kind === "grid" && paired) &&
            position &&
            wantsProtection &&
            book.touchedMarkets.has(row.marketKey)
          ) {
            // A paired ladder's target is sized to the LADDER's coins. The
            // whole-position target a lone ladder writes would, on this
            // coin, sell the grid's coins with it when it fired.
            const pairedTargetSz =
              entry.kind === "dca" && paired
                ? floorSize(
                    Math.min(
                      ladderHeldSz(entry.plan as LadderPlan),
                      Math.max(position.szi, 0)
                    ),
                    entry.plan.sizeDecimals
                  )
                : null
            try {
              await setLiveBrackets(userId, {
                walletId: wallet.id,
                marketKey: row.marketKey,
                targets:
                  position.tpPx === null ||
                  (pairedTargetSz !== null && !(pairedTargetSz > 0))
                    ? []
                    : [
                        {
                          px: position.tpPx,
                          sz: pairedTargetSz ?? position.tpSz ?? null,
                        },
                      ],
                slPx: position.slPx,
              })
            } catch (error) {
              // Leave the plan ready to retry its rule. The adapter says when
              // it already removed the old protection; otherwise its original
              // values are still the exchange truth.
              const oldProtectionGone =
                error instanceof Error &&
                error.message.includes("LIVE_BRACKETS_GONE")
              if (entry.kind === "dca") {
                ;(row.plan as LadderPlan).aimedTpPx = oldProtectionGone
                  ? null
                  : (originalBrackets?.tpPx ?? null)
              }
              // Through `entry`, not `row`, and they are the same object: only
              // `entry` carries the kind, so only it knows this plan has a stop
              // to aim at all. Neither a signal trade nor a watch can reach here
              // — the block this sits inside skips both kinds, and the compiler
              // now knows it.
              if (entry.kind === "dca" || entry.kind === "grid") {
                entry.plan.aimedSlPx = oldProtectionGone
                  ? null
                  : (originalBrackets?.slPx ?? null)
              }
              await saveLadderPlan(userId, row.id, row.plan, status)
              throw error
            }
          }
        },
      },
      {
        id: raw.id,
        marketKey: raw.marketKey,
        plan: entry.plan,
        paired,
      } as never
    )
  }

  /**
   * Keeps a paired grid's fixed-size stop on the exchange in step with the
   * grid: at the plan's stop price, sized to exactly what the grid holds —
   * capped at the position, so a bookkeeping slip can never write a stop
   * that sells more than exists. Replaces only its own old order, through
   * `replaceOrderIds`, so the ladder's protection is never touched.
   *
   * A failure lands in the row-failure record and is retried next pass —
   * the same contract every other exchange write in this pass has.
   */
  const reconcilePairedGridStop = async (
    raw: (typeof rows)[number],
    plan: GridPlan,
    pairedNow: boolean
  ): Promise<void> => {
    try {
      const roundPx = (px: number) =>
        protocol.markets.roundPx(px, plan.sizeDecimals, plan.priceTick)
      const position = book.positions.get(raw.marketKey) ?? null
      const wantedPxRaw = gridStopPx(plan)
      const wantedPx = wantedPxRaw === null ? null : roundPx(wantedPxRaw)
      const positionSz = position && position.szi > 0 ? position.szi : 0
      const wantedSz =
        pairedNow && plan.closedReason === null && wantedPx !== null
          ? floorSize(Math.min(gridHeldSz(plan), positionSz), plan.sizeDecimals)
          : 0
      const have = plan.pairedStop
      const closeEnough = (a: number, b: number) =>
        Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6)
      const status = plan.closedReason === null ? "active" : "done"
      if (wantedSz > 0 && wantedPx !== null) {
        if (
          have &&
          closeEnough(have.px, wantedPx) &&
          closeEnough(have.sz, wantedSz)
        ) {
          return
        }
        const placed = await setLiveBrackets(userId, {
          walletId: wallet.id,
          marketKey: raw.marketKey,
          targets: [],
          slPx: wantedPx,
          slSz: wantedSz,
          replaceOrderIds: have ? [have.orderId] : [],
        })
        plan.pairedStop = placed.slOrderId
          ? {
              orderId: placed.slOrderId,
              px: wantedPx,
              sz: wantedSz,
              placedAt: Date.now(),
            }
          : null
        await saveLadderPlan(userId, raw.id, plan, status)
      } else if (have) {
        // Nothing left for the stop to guard — the grid is empty, done, or
        // the ladder is gone. A plain cancel, not a bracket replace: it
        // works whether or not the position still exists.
        //
        // Forgotten only when the exchange confirmed the cancel. A refusal
        // can mean the venue is busy with the order still standing, and a
        // stop forgotten while it stands is one nothing spares and nothing
        // retries — the record stays and the next pass tries again. A stop
        // that is refused because it already FIRED is caught by the
        // fired-stop check at the top of the pass instead.
        const cancelled = await rollbackLiveOrder(userId, {
          walletId: wallet.id,
          marketKey: raw.marketKey,
          orderId: have.orderId,
        })
        if (cancelled) {
          plan.pairedStop = null
          await saveLadderPlan(userId, raw.id, plan, status)
        }
      }
    } catch (error) {
      await noteRowFailure(userId, wallet.id, raw.marketKey, error)
    }
  }

  for (const raw of rows) {
    // **One smart order failing must not stop the others.**
    //
    // They share a pass because they share one look at the exchange — the
    // account, the open orders and the fills are read once and every row on
    // the wallet is advanced from them. That sharing is right; what was
    // wrong is that a throw anywhere in here took the whole wallet with it.
    // On 20 Aug 2026 a single watched order stopped that wallet completely:
    // no triggers, no rungs, no stops, and the Workers screen still called
    // the worker healthy. Levels were crossed and held for twenty minutes.
    //
    // Now a row that throws is written down and stepped over, and the rest
    // of the wallet carries on.
    try {
      // A just-accepted exchange order can take a moment to appear in the
      // portfolio read. Treating that short delay as a disappearance would
      // place its replacement twice.
      if (
        !force &&
        now - raw.updatedAt.getTime() < EXCHANGE_VISIBILITY_GRACE_MS
      )
        continue
      const entry = parsed.get(raw.id)
      if (!entry) continue
      if (entry.plan.paused) continue

      if (entry.kind === "grid") {
        const plan = entry.plan as GridPlan
        const pairedNow = rows.some(
          (other) =>
            other.id !== raw.id &&
            other.marketKey === raw.marketKey &&
            other.kind === "dca"
        )
        // The grid's own stop no longer standing on the exchange means it
        // fired, and the grid's coins are already sold — the ladder carries
        // the fall from here. Close the grid now, before its engine runs,
        // or it would keep believing in levels whose coins are gone and
        // sell the ladder's instead. The grace covers a stop the exchange
        // has accepted but not yet shown back.
        const stop = plan.pairedStop
        if (
          stop &&
          now - stop.placedAt >= PAIRED_STOP_VISIBILITY_GRACE_MS &&
          !folio.positions.some((one) =>
            one.protectionOrderIds.includes(stop.orderId)
          ) &&
          !folio.orders.some((one) => one.orderId === stop.orderId)
        ) {
          for (const level of plan.levels) {
            if (level.status === "waiting") level.status = "cancelled"
          }
          if (!plan.closedReason) plan.closedReason = "stop"
          plan.pairedStop = null
          await saveLadderPlan(userId, raw.id, plan, "done")
          continue
        }
        // A grid has no orders on the exchange to match fills against: its
        // levels are watched prices and it buys when one is reached.
        await advanceRow(raw, entry, advanceGrid)
        // A paired grid's stop is its own exchange order, kept in step with
        // what the grid actually holds — after the engine, so a level that
        // bought on this pass is covered on this pass. Also runs when the
        // pairing has just ENDED (`pairedStop` still set with no ladder
        // left), to take the now-orphaned stop off before the grid goes
        // back to writing the position's ordinary one.
        if (pairedNow || plan.pairedStop) {
          await reconcilePairedGridStop(raw, plan, pairedNow)
        }
        continue
      }

      if (entry.kind === "signal") {
        // A signal trade has exactly one order on the exchange and does not need
        // its fills matched back to anything. It decides what to do next by
        // looking at the POSITION, which this book has just rebuilt from the
        // exchange — so a partial fill needs no arithmetic here to be understood.
        await advanceRow(raw, entry, advanceSignal)
        continue
      }

      if (entry.kind === "watch") {
        // Nothing is on the exchange at all until the level is touched, and from
        // then on it is the same single chased order a signal trade has. Same
        // reasoning, same path.
        await advanceRow(raw, entry, advanceWatch)
        continue
      }

      const plan = entry.plan as LadderPlan
      const exits = ladderExitLevels(plan)
      for (const [index, rung] of plan.rungs.entries()) {
        if (rung.orderId && !liveOrderIds.has(rung.orderId)) {
          const total = managedFillTotals.get(rung.orderId)
          if (total && total.sz > 0) {
            if (total.sz < rung.sz - 1e-9) {
              rung.sz = floorSize(total.sz, plan.sizeDecimals)
              rung.budget = rung.px * rung.sz
            }
            book.fills.push({
              id: `managed:${total.fillId}`,
              orderId: rung.orderId,
              walletId: wallet.id,
              marketKey: raw.marketKey,
              side: "buy",
              px: rung.px,
              sz: Math.min(total.sz, rung.sz),
              fee: 0,
              closedPnl: 0,
              reason: "order",
              fillTime: total.at,
            })
          }
        }
        if (rung.sellOrderId && !liveOrderIds.has(rung.sellOrderId)) {
          const total = managedFillTotals.get(rung.sellOrderId)
          if (!total || !(total.sz > 0)) continue
          if (total.sz < rung.sz - 1e-9) {
            rung.sz = floorSize(rung.sz - total.sz, plan.sizeDecimals)
            rung.budget = rung.px * rung.sz
            continue
          }
          book.fills.push({
            id: `managed:${total.fillId}`,
            orderId: rung.sellOrderId,
            walletId: wallet.id,
            marketKey: raw.marketKey,
            side: "sell",
            px: protocol.markets.roundPx(
              exits[index],
              plan.sizeDecimals,
              plan.priceTick
            ),
            sz: rung.sz,
            fee: 0,
            closedPnl: 0,
            reason: "order",
            fillTime: total.at,
          })
        }
      }
      await advanceRow(raw, entry, advanceOne as never)
    } catch (error) {
      await noteRowFailure(userId, wallet.id, raw.marketKey, error)
      continue
    }
  }
}

/**
 * Swaps the temporary id an order carried for the real one the exchange
 * answered with, wherever in the plan it is.
 *
 * Through `forEachPlanOrderId` rather than walking the rungs itself, because a
 * plan shape this misses keeps its `pending:` ids in the saved row — and the
 * next pass then reads an id the exchange has never heard of, decides the order
 * vanished, and places it again. Every second. Forever.
 */
function replacePlanOrderId(
  kind: SmartOrderKind,
  plan: SmartPlan,
  before: string,
  after: string
): void {
  forEachPlanOrderId(kind, plan, (orderId, set) => {
    if (orderId === before) set(after)
  })
}

async function restoreLiveOrders(input: {
  userId: string
  wallet: TradeWallet
  marketKey: string
  accepted: string[]
  cancelled: TradeOrder[]
  kind: SmartOrderKind
  plan: SmartPlan
}): Promise<boolean> {
  let failed = false
  for (const orderId of input.accepted.reverse()) {
    // The rollback ANSWERS whether it cancelled rather than throwing — a
    // failed cancel here usually means the order filled in the gap, and the
    // caller has to know the recovery is incomplete either way.
    const cancelled = await rollbackLiveOrder(input.userId, {
      walletId: input.wallet.id,
      marketKey: input.marketKey,
      orderId,
    }).catch(() => false)
    if (!cancelled) failed = true
  }
  for (const order of input.cancelled) {
    await placeLiveOrder(input.userId, {
      walletId: input.wallet.id,
      marketKey: order.marketKey,
      side: order.side,
      px: order.px,
      sz: order.sz,
      leverage: order.leverage,
      reduceOnly: order.reduceOnly,
      tpPx: null,
      slPx: null,
      restingOnly: true,
    })
      .then((outcome) => {
        if (outcome.status !== "resting" || !outcome.orderId) {
          failed = true
          return
        }
        replacePlanOrderId(input.kind, input.plan, order.id, outcome.orderId)
      })
      .catch(() => {
        failed = true
      })
  }
  return failed
}

// ----- The grid's live half ------------------------------------------------

/** Places the live exchange half of a grid order atomically. */
export async function placeLiveGridOrder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  return await serializeLiveWallet(userId, wallet, () =>
    placeLiveGridOrderOnce(userId, wallet, input)
  )
}

async function placeLiveGridOrderOnce(
  userId: string,
  wallet: TradeWallet,
  input: PlaceGridInput
): Promise<PlacedGrid> {
  if (wallet.kind !== "live" || !wallet.address || !wallet.hasKey) {
    throw new Error("LIVE_WALLET_KEY")
  }
  const ref = parseMarketKey(input.marketKey)
  if (
    !ref ||
    ref.protocol !== wallet.protocol ||
    ref.network !== wallet.network
  ) {
    throw new Error("LIVE_MARKET")
  }
  // Coarse first, for a fast refusal — the full pairing rules run again
  // inside the write once the grid and its stop are drawn.
  await assertSmartOrderPlacable(userId, wallet, input.marketKey, {
    kind: "grid",
  })

  const protocol = getProtocol(wallet.protocol)
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("LIVE_MARKET")
  const mark = (
    await protocol.markets.prices(wallet.network, [ref.marketId])
  ).get(ref.marketId)
  if (mark === undefined || !(mark > 0)) {
    // Two different things arrive here as the same silence. "The exchange is
    // rationing us" clears on its own and is nobody's fault; "this market has
    // no price" is permanent and worth looking at. Saying the second when it
    // was the first sent somebody hunting for a delisted coin that was
    // trading perfectly well.
    throw new Error(
      (protocol.markets.pricesWereRationed?.(wallet.network, ref.marketId) ??
        false)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

  const credential = await walletCredential(userId, wallet.id)
  const [account, portfolio] = await Promise.all([
    accountOf(protocol).fetch(wallet.network, wallet.address, credential),
    ordersOf(protocol).portfolio(wallet.network, wallet.address, credential),
  ])
  const held = portfolio.positions.find((one) => one.marketId === ref.marketId)

  // Through the SAME draft the practice wallet uses. The ladder's live path
  // re-implements its draft by hand and has drifted from it — a hardcoded order
  // cap among other things — and there is no reason to repeat that here.
  const now = Date.now()
  const id = randomUUID()
  const { plan, levels, totalCost } = draftGridOrder({
    marketKey: input.marketKey,
    params: input.params,
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    mark,
    rules,
    roundPx: (px: number) =>
      protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick),
    equity: input.params.compound ? account.equity : wallet.startingBalance,
    takerFeeRate: defaultPaperCosts().takerFeeRate,
    startedAt: now,
    heldSzi: held?.szi ?? null,
  })

  const accepted: string[] = []
  try {
    // **Nothing at all is sent here.** A grid's levels are prices it WATCHES,
    // and the engine buys when one is actually reached, at that level's own
    // price. This used to send one market buy covering every level above the
    // price, which is the lump the whole order type exists to avoid.
    const stamp = new Date(now)
    await db.transaction(async (tx) => {
      await tx
        .select({ id: tradeWallets.id })
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
        .for("update")
      // Under the lock, with the grid's stop drawn — the full pairing rules
      // run here.
      await assertSmartOrderPlacable(
        userId,
        wallet,
        input.marketKey,
        { kind: "grid", plan },
        tx
      )
      await tx.insert(tradeSmartLadders).values({
        userId,
        id,
        walletId: wallet.id,
        marketKey: input.marketKey,
        kind: "grid",
        status: "active",
        plan,
        createdAt: stamp,
        updatedAt: stamp,
      })
    })
  } catch (error) {
    const failures: unknown[] = []
    for (const orderId of accepted.reverse()) {
      await rollbackLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: input.marketKey,
        orderId,
      }).catch((rollbackError) => failures.push(rollbackError))
    }
    if (failures.length > 0) throw new Error("LIVE_SMART_ROLLBACK_FAILED")
    throw error
  }

  // The grid itself travels back, so the chart draws it in the same frame the
  // window closes. See `PlacedGrid`.
  return {
    levels: levels.length,
    totalCost,
    grid: {
      id,
      walletId: wallet.id,
      marketKey: input.marketKey,
      kind: "grid" as const,
      status: "active" as const,
      flowRunId: null,
      createdAt: now,
      updatedAt: now,
      plan,
    },
  }
}

/** Calling off one waiting level of a live grid. */
export async function cancelLiveGridLevel(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; levelIndex: number }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const level = grid.plan.levels[input.levelIndex]
    if (!level || level.status !== "waiting") {
      throw new Error("SMART_GRID_LEVEL_DONE")
    }
    level.status = "cancelled"
    await saveGridPlan(userId, grid.id, grid.plan, "active")
  })
}

/** Stop a live grid buying: every waiting level is called off. */
export async function cancelLiveGridRest(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string }
): Promise<{ cancelled: number }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    let cancelled = 0
    for (const level of grid.plan.levels) {
      if (level.status !== "waiting") continue
      level.status = "cancelled"
      cancelled += 1
    }
    await saveGridPlan(userId, grid.id, grid.plan, "active")
    return { cancelled }
  })
}

/** Switching following on or off for a live grid. See `setGridFollow`. */
export async function setLiveGridFollow(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; follow: boolean; followDown?: boolean }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
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
      grid.plan.takeProfitPx = null
      // A hand's own switch counts the range as in play — see `setGridFollow`.
      grid.plan.entered = true
    }
    await saveGridPlan(userId, grid.id, grid.plan, "active")
  })
}

/**
 * Coins held in this market on the exchange right now, or zero.
 *
 * A grid holds nothing for most of its life. Between one cycle and the next
 * every level is waiting and the position is closed, and that is the ordinary
 * state, not a broken one. The stop a grid carries is then a PLAN for later
 * rather than protection on something open.
 *
 * `setLiveBrackets` refuses outright when there is no position, so asking it
 * anyway did not merely waste a call: it threw `LIVE_POSITION_GONE`, the drag
 * was rejected, the stop the hand had just moved was never saved, and a
 * "refused" row went into the Journal for something nobody had done wrong. The
 * paper path has always checked for a position first; this is the live path
 * catching up.
 */
async function heldOnExchange(
  userId: string,
  wallet: TradeWallet,
  marketKey: string
): Promise<number> {
  const ref = parseMarketKey(marketKey)
  if (!ref) return 0
  const protocol = getProtocol(wallet.protocol)
  const portfolio = await ordersOf(protocol).portfolio(
    wallet.network,
    wallet.address as string,
    await walletCredential(userId, wallet.id)
  )
  return (
    portfolio.positions.find((one) => one.marketId === ref.marketId)?.szi ?? 0
  )
}

/**
 * Moves a paired grid's own stop order to a new price, keeping its size,
 * and records what now stands. No stop on the exchange yet — the grid is
 * flat — means nothing to move: the engine places one the moment a level
 * buys, at the price the plan now says.
 */
async function movePairedGridStop(
  userId: string,
  walletId: string,
  marketKey: string,
  plan: GridPlan,
  px: number
): Promise<void> {
  if (!plan.pairedStop) return
  const placed = await setLiveBrackets(userId, {
    walletId,
    marketKey,
    targets: [],
    slPx: px,
    slSz: plan.pairedStop.sz,
    replaceOrderIds: [plan.pairedStop.orderId],
  })
  plan.pairedStop = placed.slOrderId
    ? {
        orderId: placed.slOrderId,
        px,
        sz: plan.pairedStop.sz,
        placedAt: Date.now(),
      }
    : null
}

/** Changing a live grid's stop. */
export async function updateLiveGridStop(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; stopLoss: GridParams["stopLoss"] }
): Promise<void> {
  await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const protocol = getProtocol(wallet.protocol)
    const plan = grid.plan

    plan.stopLoss = input.stopLoss
      ? {
          mode: plan.followDown ? "fixed" : "percent",
          underPct: input.stopLoss.underPct,
          px: plan.followDown
            ? gridStopUnder(plan.bottomPx, input.stopLoss.underPct)
            : null,
          base: input.stopLoss.base,
        }
      : null

    // While a ladder shares the coin, the stop is the handoff line: it must
    // exist and sit above the ladder's first buy, or the pairing's whole
    // safety ordering is gone. Checked before anything reaches the exchange.
    const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
    if (ladder) {
      const refusal = gridLadderPairingRefusal({
        walletKind: wallet.kind,
        protocol: wallet.protocol,
        grid: plan,
        ladder,
      })
      if (refusal) throw new Error(refusal)
    }

    const wanted = gridStopPx(plan)
    const slPx =
      wanted === null
        ? null
        : protocol.markets.roundPx(wanted, plan.sizeDecimals, plan.priceTick)
    if (ladder) {
      // Paired, the grid's stop is its own order — the position's stop
      // belongs to the ladder and is not touched.
      plan.aimedSlPx = null
      if (slPx !== null) {
        await movePairedGridStop(userId, wallet.id, grid.marketKey, plan, slPx)
      }
    } else if ((await heldOnExchange(userId, wallet, grid.marketKey)) > 0) {
      // Only onto the exchange when there is something to protect. Flat, the
      // plan is the whole record, and `advanceGrid` writes the stop onto the
      // position the moment a level buys.
      await setLiveBrackets(userId, {
        walletId: wallet.id,
        marketKey: grid.marketKey,
        // A grid never writes a target: its exits are its resting sells.
        targets: [],
        slPx,
      })
      plan.aimedSlPx = slPx
    } else {
      // Nothing was written, so nothing is remembered as written. Claiming
      // otherwise would make the next pass read a stop it never wrote as one a
      // hand had moved, and leave it alone for good.
      plan.aimedSlPx = null
    }
    await saveGridPlan(userId, grid.id, plan, "active")
  })
}

/** Re-shaping a live grid — see `reshapeGrid` for what it does and why. */
export async function reshapeLiveGrid(
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
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    if (!gridRangeMovable(plan)) throw new Error("SMART_GRID_STARTED")

    const ref = parseMarketKey(grid.marketKey)
    if (!ref) throw new Error("LIVE_MARKET")
    const protocol = getProtocol(wallet.protocol)
    const rules = await marketRules(
      wallet.protocol,
      wallet.network,
      ref.marketId
    )
    if (!rules) throw new Error("LIVE_MARKET")
    const mark = (
      await protocol.markets.prices(wallet.network, [ref.marketId])
    ).get(ref.marketId)
    if (mark === undefined || !(mark > 0)) {
      // Two different things arrive here as the same silence. "The exchange is
      // rationing us" clears on its own and is nobody's fault; "this market has
      // no price" is permanent and worth looking at. Saying the second when it
      // was the first sent somebody hunting for a delisted coin that was
      // trading perfectly well.
      throw new Error(
        (protocol.markets.pricesWereRationed?.(wallet.network, ref.marketId) ??
          false)
          ? "EXCHANGE_BUSY"
          : "LIVE_NO_PRICE"
      )
    }

    const credential = await walletCredential(userId, wallet.id)
    const [account, portfolio] = await Promise.all([
      accountOf(protocol).fetch(
        wallet.network,
        wallet.address as string,
        credential
      ),
      ordersOf(protocol).portfolio(
        wallet.network,
        wallet.address as string,
        credential
      ),
    ])
    // Drawn and fully checked BEFORE a single order is cancelled, so a refused
    // move leaves the grid resting exactly where it was.
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
      roundPx: (px: number) =>
        protocol.markets.roundPx(px, rules.sizeDecimals, rules.priceTick),
      equity: account.equity,
      takerFeeRate: defaultPaperCosts().takerFeeRate,
      startedAt: plan.startedAt,
      heldSzi:
        portfolio.positions.find((one) => one.marketId === ref.marketId)?.szi ??
        null,
    })

    // No orders to cancel, none to place, and no position to settle: every
    // redrawn level starts waiting and owns nothing, and `gridRangeMovable`
    // refused this while anything was held.
    const next = {
      ...draft.plan,
      stopLoss: plan.stopLoss,
      takeProfitPx:
        plan.takeProfitPx === null
          ? null
          : draft.plan.topPx * (plan.takeProfitPx / plan.topPx),
      baseWatch: plan.baseWatch,
      aimedSlPx: plan.aimedSlPx,
      pairedStop: plan.pairedStop,
      seenFillsTo: plan.seenFillsTo,
      // A move re-prices the levels; it does not reset the grid's history.
      cycles: plan.cycles,
      shifts: plan.shifts,
      downShifts: plan.downShifts,
      carriedLevels: plan.carriedLevels,
    }
    // A percent-mode stop rides the bottom of the range, so moving the range
    // moves the stop — and while a ladder shares the coin the stop may not
    // come down to the ladder's first buy. Checked on the redrawn plan
    // before anything is saved.
    const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
    if (ladder) {
      const refusal = gridLadderPairingRefusal({
        walletKind: wallet.kind,
        protocol: wallet.protocol,
        grid: next,
        ladder,
      })
      if (refusal) throw new Error(refusal)
    }
    const at = Date.now()
    await saveGridPlan(userId, grid.id, next, "active", at)
    return movedGrid(wallet.id, grid, next, at)
  })
}

/** Dragging a live grid's take profit or stop loss — see `moveGridExit`. */
export async function moveLiveGridExit(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; which: "takeProfit" | "stopLoss"; px: number }
): Promise<MovedGrid> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    const protocol = getProtocol(wallet.protocol)
    const px = protocol.markets.roundPx(
      input.px,
      plan.sizeDecimals,
      plan.priceTick
    )
    if (!(px > 0)) throw new Error("LIVE_PRICE")

    if (input.which === "takeProfit") {
      if (px <= plan.topPx) throw new Error("SMART_GRID_TARGET_IN_RANGE")
      plan.takeProfitPx = px
    } else {
      if (px >= plan.bottomPx) throw new Error("SMART_GRID_STOP_IN_RANGE")
      plan.stopLoss = {
        mode: "fixed",
        underPct: plan.stopLoss?.underPct ?? 0,
        px,
        base: null,
      }
      // While a ladder shares the coin the stop is the handoff line — it
      // may move, but never to or below the ladder's first buy.
      const ladder = await pairedLadderPlan(userId, wallet.id, grid.marketKey)
      if (ladder) {
        const refusal = gridLadderPairingRefusal({
          walletKind: wallet.kind,
          protocol: wallet.protocol,
          grid: plan,
          ladder,
        })
        if (refusal) throw new Error(refusal)
        // Paired, the grid's stop is its own order; the position's stop is
        // the ladder's and stays where the ladder put it.
        plan.aimedSlPx = null
        await movePairedGridStop(userId, wallet.id, grid.marketKey, plan, px)
      } else if ((await heldOnExchange(userId, wallet, grid.marketKey)) > 0) {
        // See `updateLiveGridStop`: a grid with nothing open has no brackets
        // to set, and asking anyway threw the drag away along with the new
        // stop.
        await setLiveBrackets(userId, {
          walletId: wallet.id,
          marketKey: grid.marketKey,
          targets: [],
          slPx: px,
        })
        plan.aimedSlPx = px
      } else {
        plan.aimedSlPx = null
      }
    }

    const at = Date.now()
    await saveGridPlan(userId, grid.id, plan, "active", at)
    return movedGrid(wallet.id, grid, plan, at)
  })
}

/** Dragging an end of a live grid's range — one shape of `reshapeLiveGrid`. */
export function moveLiveGridRange(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; topPx: number; bottomPx: number }
): Promise<MovedGrid> {
  return reshapeLiveGrid(userId, wallet, input)
}
