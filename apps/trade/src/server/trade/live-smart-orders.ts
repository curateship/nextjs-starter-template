import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey, type WalletPortfolio } from "@/lib/protocols/contracts"
import {
  CASH_ONLY,
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  type LadderPlan,
  type LadderRungState,
  type DcaParams,
} from "@/lib/trade/dca"
import {
  DEFAULT_GRID_ABOVE_PCT,
  DEFAULT_GRID_BELOW_PCT,
  gridRangeMovable,
  gridStopPx,
  type GridParams,
} from "@/lib/trade/grid"
import {
  forEachPlanOrderId,
  readSmartEntry,
  readSmartOrderKind,
  type SmartEntry,
  type SmartOrderKind,
  type SmartPlan,
} from "@/lib/trade/smart-plan"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  defaultPaperCosts,
  type PaperFillReason,
  type PaperOrder,
  type PaperPosition,
} from "@/lib/trade/paper"
import { db } from "@/server/db"
import { rememberFlowRunOrders } from "@/server/trade/flow-run-orders"
import {
  accountOf,
  getProtocol,
  ordersOf,
} from "@/server/protocols/registry"
import { marketBaseInForce } from "@/server/trade/base-level"
import {
  cancelLiveOrder,
  placeLiveOrder,
  rollbackLiveOrder,
  setLiveBrackets,
} from "@/server/trade/live-orders"
import { marketRules } from "@/server/trade/market-rules"
import { pricesWereRationed } from "@/server/protocols/hyperliquid/prices"
import { marketsWalletHasMoneyOn } from "@/server/protocols/hyperliquid/user-markets"
import {
  activeSmartOrderId,
  ladderById,
  saveLadderPlan,
  type PlaceLadderInput,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
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
  saveGridPlan,
  type PlaceGridInput,
  type PlacedGrid,
} from "./grid-orders"
import {
  bumpOrders,
  fill as fillPaperBook,
  freeCash,
  type WalletBook,
} from "@/server/trade/paper"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

/** The flow's cap when it has one, never more than the account holds. */
function livePotOf(
  input: { potUsd?: number },
  walletPot: number
): number {
  if (input.potUsd === undefined) return walletPot
  return Math.min(input.potUsd, walletPot)
}

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
  address: string
): Promise<[AccountAnswer, OrdersAnswer]> {
  const key = `${network}:${address.toLowerCase()}`
  const cached = accountCache.get(key)
  if (cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.answer

  const at = Date.now()
  const answer = Promise.all([
    accountOf(protocol).fetch(network, address),
    ordersOf(protocol).portfolio(network, address),
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
  if (await activeSmartOrderId(userId, wallet.id, input.marketKey)) {
    throw new Error("SMART_LADDER_EXISTS")
  }

  // Hyperliquid keeps each market's money separate, and a rung fired on a
  // market the wallet holds nothing on is refused every single time. Checked
  // from the live feed when it has spoken; a feed that has not answered skips
  // the check rather than reading silence as an empty wallet.
  const funded = marketsWalletHasMoneyOn(wallet.network, wallet.address)
  if (funded !== null) {
    const marketName = ref.marketId.includes(":")
      ? ref.marketId.slice(0, ref.marketId.indexOf(":"))
      : ""
    if (marketName !== "" && !funded.includes(marketName)) {
      throw new Error("EXCHANGE_NO_MARGIN")
    }
  }

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
      pricesWereRationed(wallet.network, ref.marketId)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

  const [account, portfolio] = await accountAndOrders(
    protocol,
    wallet.network,
    wallet.address
  )
  const held = portfolio.positions.find((one) => one.marketId === ref.marketId)
  if (held && held.szi < 0) throw new Error("SMART_SHORT_HELD")

  const roundPx = (px: number) =>
    protocol.markets.roundPx(px, rules.sizeDecimals)
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

  const drawn = dcaLadderPlan({
    anchorPx,
    equity: livePotOf(input, input.params.compound ? account.equity : wallet.startingBalance),
    // Real money, so the same rule as the practice path and for the same
    // reason: the sizing multiplies each rung by the borrowing setting while
    // the orders below are sent at leverage 1. Reading it here would buy three
    // times the intended coin with cash, on a real Hyperliquid account, from a
    // box the panel says is only for backtests.
    params: { ...input.params, leverage: CASH_ONLY },
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
  // Only what could actually be committed at once has to be affordable now.
  //
  // A watching ladder commits nothing when it is placed: each rung is bought
  // when price reaches it, and the engine re-checks the cash at that moment.
  // Demanding the whole ladder's cost up front refused ladders over money they
  // would never hold at the same time.
  const committing = Math.max(...priced.map((r) => r.px * r.sz))
  if (committing > account.free + 1e-9) throw new Error("SMART_LADDER_COST")

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
  const plan = ladderPlan(
    input,
    rules.sizeDecimals,
    rules.maxLeverage ?? 1,
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
    const race = await activeSmartOrderId(
      userId,
      wallet.id,
      input.marketKey,
      tx
    )
    if (race) throw new Error("SMART_LADDER_EXISTS")
    await tx.insert(tradeSmartLadders).values({
      userId,
      id: randomUUID(),
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
  }
}

function ladderPlan(
  input: PlaceLadderInput,
  sizeDecimals: number | null,
  maxLeverage: number,
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
    maxLeverage,
    // Cash, deliberately, and not read from the settings. A real wallet's
    // ladder taking leverage would hand the exchange a price at which it can
    // close the position — a decision nobody has made yet. The setting exists
    // so a backtest can measure the idea; it does not reach a live book.
    leverage: 1,
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
    await reconcileLiveLaddersOnce(userId, wallet)
    return await cancelLiveLadderRestOnce(userId, wallet, input)
  })
}

async function cancelLiveLadderRestOnce(
  userId: string,
  wallet: TradeWallet,
  input: { ladderId: string }
): Promise<{ cancelled: number }> {
  const ladder = await ladderById(userId, wallet.id, input.ladderId)
  let cancelled = 0
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
  await saveLadderPlan(userId, ladder.id, ladder.plan, "active")
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

/** Advances live ladders from exchange truth using the same state engine as paper. */
export async function reconcileLiveLadders(
  userId: string,
  wallet: TradeWallet,
  currentPortfolio?: WalletPortfolio
): Promise<void> {
  await serializeLiveWallet(userId, wallet, () =>
    reconcileLiveLaddersOnce(userId, wallet, currentPortfolio)
  )
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
  const portfolio =
    currentPortfolio ??
    (await ordersOf(protocol).portfolio(wallet.network, wallet.address))
  const now = Date.now()
  const keys = rows.map((row) => row.marketKey)
  const refs = new Map(
    keys.flatMap((key) => {
      const ref = parseMarketKey(key)
      return ref ? [[ref.marketId, key] as const] : []
    })
  )
  const [account, prices, fills] = await Promise.all([
    accountOf(protocol).fetch(wallet.network, wallet.address),
    protocol.markets.prices(wallet.network, [...refs.keys()]),
    ordersOf(protocol).fills(
      wallet.network,
      wallet.address,
      // How far back the fill feed is read.
      //
      // From where each order has already read to, not from when it was
      // placed. A ladder makes perhaps forty fills in its whole life, so
      // re-reading everything since placement cost nothing; a grid recycling
      // ten times a day makes hundreds, and re-reading all of them every second
      // is a bill that grows for as long as the grid is winning. The minute of
      // overlap is deliberate — a fill that lands between two passes must not
      // fall down the gap.
      Math.min(
        ...rows.map((row) => {
          const seen = parsed.get(row.id)?.plan
          const to =
            seen && "seenFillsTo" in seen && seen.seenFillsTo > 0
              ? seen.seenFillsTo
              : row.createdAt.getTime()
          return to
        })
      ) - 60_000
    ),
  ])
  const marks = new Map<string, number>()
  for (const [marketId, px] of prices) {
    const key = refs.get(marketId)
    if (key) marks.set(key, px)
  }

  const positions = new Map<string, PaperPosition>()
  for (const held of portfolio.positions) {
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
      tpPx: held.tpPx,
      slPx: held.slPx,
      feesPaid: 0,
      updatedAt: now,
    })
  }
  const orders: PaperOrder[] = portfolio.orders.flatMap((order) => {
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
      protocol.markets.roundPx(px, entry.plan.sizeDecimals)

    // A grid manages no exchange orders — its levels are watched prices — so
    // there is nothing of its to match fills against.
    if (entry.kind === "grid") continue

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
      account.free +
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
      const entry = planFor(marketKey)
      const near = (wanted: number | null) =>
        wanted !== null &&
        Math.abs(one.px - wanted) <= Math.max(1e-8, one.px * 1e-6)
      // A grid never writes a take-profit onto the position — its exits are its
      // resting sells — so there is no target price for one of its fills to
      // have come from.
      const aimedTpPx =
        entry && entry.kind === "dca" ? (entry.plan as LadderPlan).aimedTpPx : null
      // Only the two that manage a stop of their own can have fired one. A
      // signal trade writes no protection at all — its exit is the next arrow
      // — and a watch hands its stop to the position and is done.
      const aimedSlPx =
        entry && (entry.kind === "dca" || entry.kind === "grid")
          ? entry.plan.aimedSlPx
          : null
      const reason: PaperFillReason =
        one.side === "sell" && near(aimedSlPx)
          ? "stop_loss"
          : one.side === "sell" && near(aimedTpPx)
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
      // Which markets this wallet can actually pay on, from the live feed —
      // null while it has not spoken, which switches the guard off rather
      // than reading silence as an empty wallet.
      fundedMarkets: (() => {
        const funded = wallet.address
          ? marketsWalletHasMoneyOn(wallet.network, wallet.address)
          : null
        return funded === null ? null : new Set(funded)
      })(),
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
          for (const orderId of pendingCancels) {
            await rollbackLiveOrder(userId, {
              walletId: wallet.id,
              marketKey: row.marketKey,
              orderId,
            })
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
            if (outcome.status !== "resting" || !outcome.orderId)
              throw new Error("LIVE_SMART_ORDER_NOT_RESTING")
            accepted.push(outcome.orderId)
            replacePlanOrderId(entry.kind, row.plan, pending.tempId, outcome.orderId)
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
              })
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
              // Only the one error that PROMISES nothing stood: the exchange
              // processed our order and its own status refused it. The engine's
              // bookkeeping is put back so the rung is not recorded as bought
              // with nothing behind it — which used to end the ladder and let
              // the flow place a fresh one into the same refusal, forever.
              // Anything more ambiguous keeps the conservative advanced state:
              // a transport error mid-order may still have filled, and undoing
              // that is how a rung gets bought twice.
              const message =
                error instanceof Error ? error.message : String(error)
              if (!message.startsWith("LIVE_ORDER_REFUSED")) throw error
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
              .filter((order): order is PaperOrder => order !== undefined),
            kind: entry.kind,
            plan: originalPlan,
          })
          await saveLadderPlan(userId, row.id, originalPlan, "active")
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
        if (
          entry.kind !== "signal" &&
          position &&
          book.touchedMarkets.has(row.marketKey)
        ) {
          try {
            await setLiveBrackets(userId, {
              walletId: wallet.id,
              marketKey: row.marketKey,
              tpPx: position.tpPx,
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
    { id: raw.id, marketKey: raw.marketKey, plan: entry.plan } as never
  )
  }

  for (const raw of rows) {
    // A just-accepted exchange order can take a moment to appear in the
    // portfolio read. Treating that short delay as a disappearance would
    // place its replacement twice.
    if (!force && now - raw.updatedAt.getTime() < EXCHANGE_VISIBILITY_GRACE_MS)
      continue
    const entry = parsed.get(raw.id)
    if (!entry) continue

    if (entry.kind === "grid") {
      // A grid has no orders on the exchange to match fills against: its
      // levels are watched prices and it buys when one is reached.
      await advanceRow(raw, entry, advanceGrid)
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
          px: protocol.markets.roundPx(exits[index], plan.sizeDecimals),
          sz: rung.sz,
          fee: 0,
          closedPnl: 0,
          reason: "order",
          fillTime: total.at,
        })
      }
    }
    await advanceRow(raw, entry, advanceOne as never)
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
  cancelled: PaperOrder[]
  kind: SmartOrderKind
  plan: SmartPlan
}): Promise<boolean> {
  let failed = false
  for (const orderId of input.accepted.reverse()) {
    await rollbackLiveOrder(input.userId, {
      walletId: input.wallet.id,
      marketKey: input.marketKey,
      orderId,
    }).catch(() => {
      failed = true
    })
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
  if (await activeSmartOrderId(userId, wallet.id, input.marketKey)) {
    throw new Error("SMART_LADDER_EXISTS")
  }

  // Hyperliquid keeps each market's money separate, and a rung fired on a
  // market the wallet holds nothing on is refused every single time. Checked
  // from the live feed when it has spoken; a feed that has not answered skips
  // the check rather than reading silence as an empty wallet.
  const funded = marketsWalletHasMoneyOn(wallet.network, wallet.address)
  if (funded !== null) {
    const marketName = ref.marketId.includes(":")
      ? ref.marketId.slice(0, ref.marketId.indexOf(":"))
      : ""
    if (marketName !== "" && !funded.includes(marketName)) {
      throw new Error("EXCHANGE_NO_MARGIN")
    }
  }

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
      pricesWereRationed(wallet.network, ref.marketId)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

  const [account, portfolio] = await Promise.all([
    accountOf(protocol).fetch(wallet.network, wallet.address),
    ordersOf(protocol).portfolio(wallet.network, wallet.address),
  ])
  const held = portfolio.positions.find((one) => one.marketId === ref.marketId)

  // Through the SAME draft the practice wallet uses. The ladder's live path
  // re-implements its draft by hand and has drifted from it — a hardcoded order
  // cap among other things — and there is no reason to repeat that here.
  const now = Date.now()
  const { plan, levels, totalCost, startingSz } = draftGridOrder({
    marketKey: input.marketKey,
    params: input.params,
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    mark,
    rules,
    roundPx: (px: number) => protocol.markets.roundPx(px, rules.sizeDecimals),
    equity: input.params.compound ? account.equity : wallet.startingBalance,
    freeCash: account.free,
    takerFeeRate: defaultPaperCosts().takerFeeRate,
    startedAt: now,
    heldSzi: held?.szi ?? null,
  })

  const accepted: string[] = []
  try {
    // Nothing rests. A grid's levels are prices it WATCHES, and the engine
    // buys when one is reached — so the only thing to send now is the position
    // standing behind the levels that start out selling.
    if (startingSz > 0) {
      await placeLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: input.marketKey,
        side: "buy",
        px: mark,
        sz: startingSz,
        leverage: 1,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
      })
    }

    const stamp = new Date(now)
    await db.transaction(async (tx) => {
      await tx
        .select({ id: tradeWallets.id })
        .from(tradeWallets)
        .where(
          and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, wallet.id))
        )
        .for("update")
      const race = await activeSmartOrderId(
        userId,
        wallet.id,
        input.marketKey,
        tx
      )
      if (race) throw new Error("SMART_LADDER_EXISTS")
      await tx.insert(tradeSmartLadders).values({
        userId,
        id: randomUUID(),
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

  return { levels: levels.length, totalCost }
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
          mode: "percent",
          underPct: input.stopLoss.underPct,
          px: null,
          base: input.stopLoss.base,
        }
      : null

    const wanted = gridStopPx(plan)
    const slPx =
      wanted === null
        ? null
        : protocol.markets.roundPx(wanted, plan.sizeDecimals)
    await setLiveBrackets(userId, {
      walletId: wallet.id,
      marketKey: grid.marketKey,
      // A grid never writes a target: its exits are its resting sells.
      tpPx: null,
      slPx,
    })
    plan.aimedSlPx = slPx
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
): Promise<{ moved: true }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    if (!gridRangeMovable(plan)) throw new Error("SMART_GRID_STARTED")

    const ref = parseMarketKey(grid.marketKey)
    if (!ref) throw new Error("LIVE_MARKET")
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
      pricesWereRationed(wallet.network, ref.marketId)
        ? "EXCHANGE_BUSY"
        : "LIVE_NO_PRICE"
    )
  }

    const [account, portfolio] = await Promise.all([
      accountOf(protocol).fetch(wallet.network, wallet.address as string),
      ordersOf(protocol).portfolio(wallet.network, wallet.address as string),
    ])
    const held = plan.levels.reduce((sum, level) => sum + level.budget, 0)

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
      roundPx: (px: number) => protocol.markets.roundPx(px, rules.sizeDecimals),
      equity: account.equity,
      freeCash: account.free + held,
      takerFeeRate: defaultPaperCosts().takerFeeRate,
      startedAt: plan.startedAt,
      heldSzi:
        portfolio.positions.find((one) => one.marketId === ref.marketId)?.szi ??
        null,
    })

    // No orders to cancel and none to place — the levels are watched prices.
    // But a range dragged up over the price has levels ABOVE it now, and those
    // are levels the grid SELLS at, so it has to hold the coins for them the
    // same way a fresh grid does. Left out, the plan says "holding" with no
    // position behind it and the next pass closes the grid for losing coins it
    // never bought.
    const heldNow =
      portfolio.positions.find((one) => one.marketId === ref.marketId)?.szi ?? 0
    const shortfall = draft.startingSz - heldNow
    if (Math.abs(shortfall) > 1e-9) {
      const sz = floorSize(Math.abs(shortfall), draft.plan.sizeDecimals)
      if (sz > 0) {
        const buying = shortfall > 0
        await placeLiveOrder(userId, {
          walletId: wallet.id,
          marketKey: grid.marketKey,
          side: buying ? "buy" : "sell",
          px: mark,
          sz,
          leverage: 1,
          // Selling back what the new levels no longer need may only shrink
          // what is held — never open a short into a position that has gone.
          reduceOnly: !buying,
          tpPx: null,
          slPx: null,
        })
      }
    }
    await saveGridPlan(
      userId,
      grid.id,
      {
        ...draft.plan,
        stopLoss: plan.stopLoss,
        takeProfitPx:
          plan.takeProfitPx === null
            ? null
            : draft.plan.topPx * (plan.takeProfitPx / plan.topPx),
        baseWatch: plan.baseWatch,
        aimedSlPx: plan.aimedSlPx,
        seenFillsTo: plan.seenFillsTo,
        cycles: plan.cycles,
      },
      "active"
    )
    return { moved: true as const }
  })
}

/** Dragging a live grid's take profit or stop loss — see `moveGridExit`. */
export async function moveLiveGridExit(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; which: "takeProfit" | "stopLoss"; px: number }
): Promise<{ moved: true }> {
  return await serializeLiveWallet(userId, wallet, async () => {
    await reconcileLiveLaddersOnce(userId, wallet)
    const grid = await gridById(userId, wallet.id, input.gridId)
    const plan = grid.plan
    const protocol = getProtocol(wallet.protocol)
    const px = protocol.markets.roundPx(input.px, plan.sizeDecimals)
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
      await setLiveBrackets(userId, {
        walletId: wallet.id,
        marketKey: grid.marketKey,
        tpPx: null,
        slPx: px,
      })
      plan.aimedSlPx = px
    }

    await saveGridPlan(userId, grid.id, plan, "active")
    return { moved: true as const }
  })
}

/** Dragging an end of a live grid's range — one shape of `reshapeLiveGrid`. */
export function moveLiveGridRange(
  userId: string,
  wallet: TradeWallet,
  input: { gridId: string; topPx: number; bottomPx: number }
): Promise<{ moved: true }> {
  return reshapeLiveGrid(userId, wallet, input)
}
