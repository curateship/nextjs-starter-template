import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { parseMarketKey, type WalletPortfolio } from "@/lib/protocols/contracts"
import {
  dcaLadderPlan,
  floorSize,
  ladderBaseStopOf,
  ladderExitLevels,
  readLadderPlan,
  DUST_ORDER_USD,
  type LadderPlan,
  type LadderRungState,
  type DcaParams,
} from "@/lib/trade/dca"
import type { TradeWallet } from "@/lib/trade/wallets"
import {
  defaultPaperCosts,
  type PaperFillReason,
  type PaperOrder,
  type PaperPosition,
} from "@/lib/trade/paper"
import { db } from "@/server/db"
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
import {
  activeLadder,
  ladderById,
  saveLadderPlan,
  type PlaceLadderInput,
  type PlacedLadder,
} from "@/server/trade/smart-orders"
import {
  advanceOne,
  ladderBarsKey,
  ladderCandleNeeds,
  type LadderBars,
  type LadderOrderInput,
} from "./smart-ladders"
import {
  bumpOrders,
  fill as fillPaperBook,
  freeCash,
  type WalletBook,
} from "@/server/trade/paper"
import { tradeSmartLadders, tradeWallets } from "@/server/trade/schema"

/** Places the live exchange half of a Smart-order ladder atomically. */
export async function placeLiveDcaLadder(
  userId: string,
  wallet: TradeWallet,
  input: PlaceLadderInput
): Promise<PlacedLadder> {
  return await serializeLiveWallet(userId, wallet, () =>
    placeLiveDcaLadderOnce(userId, wallet, input)
  )
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
  if (await activeLadder(userId, wallet.id, input.marketKey)) {
    throw new Error("SMART_LADDER_EXISTS")
  }

  const protocol = getProtocol(wallet.protocol)
  const rules = await marketRules(wallet.protocol, wallet.network, ref.marketId)
  if (!rules) throw new Error("LIVE_MARKET")
  const mark = (
    await protocol.markets.prices(wallet.network, [ref.marketId])
  ).get(ref.marketId)
  if (mark === undefined || !(mark > 0)) throw new Error("LIVE_NO_PRICE")

  const [account, portfolio] = await Promise.all([
    accountOf(protocol).fetch(wallet.network, wallet.address),
    ordersOf(protocol).portfolio(wallet.network, wallet.address),
  ])
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
    if (mark < anchorPx) throw new Error("SMART_LADDER_UNDER_BASE")
  }
  if (!(anchorPx > 0)) throw new Error("LIVE_PRICE")

  const drawn = dcaLadderPlan({
    anchorPx,
    equity: input.params.compound ? account.equity : wallet.startingBalance,
    params: input.params,
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
  if (totalCost > account.free + 1e-9) throw new Error("SMART_LADDER_COST")

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

  const resting = rungs.filter((rung) => rung.status === "waiting" && !twoGreen)
  if (portfolio.orders.length + resting.length > 50) {
    throw new Error("PAPER_ORDER_LIMIT")
  }

  const accepted: string[] = []
  try {
    for (const rung of resting) {
      const outcome = await placeLiveOrder(userId, {
        walletId: wallet.id,
        marketKey: input.marketKey,
        side: "buy",
        px: rung.px,
        sz: rung.sz,
        leverage: 1,
        reduceOnly: false,
        tpPx: null,
        slPx: null,
        restingOnly: true,
      })
      if (outcome.status !== "resting" || !outcome.orderId) {
        throw new Error("LIVE_SMART_ORDER_NOT_RESTING")
      }
      rung.orderId = outcome.orderId
      accepted.push(outcome.orderId)
    }

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
      const race = await tx
        .select({ id: tradeSmartLadders.id })
        .from(tradeSmartLadders)
        .where(
          and(
            eq(tradeSmartLadders.userId, userId),
            eq(tradeSmartLadders.walletId, wallet.id),
            eq(tradeSmartLadders.marketKey, input.marketKey),
            eq(tradeSmartLadders.status, "active")
          )
        )
        .limit(1)
      if (race.length > 0) {
        throw new Error("SMART_LADDER_EXISTS")
      }
      await tx.insert(tradeSmartLadders).values({
        userId,
        id: randomUUID(),
        walletId: wallet.id,
        marketKey: input.marketKey,
        status: "active",
        plan,
        createdAt: now,
        updatedAt: now,
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
    rungEntry: input.params.rungEntry,
    startedAt: Date.now(),
    baseDetection: input.params.baseDetection,
    sizeDecimals,
    maxLeverage,
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
      Math.min(...rows.map((row) => row.createdAt.getTime())) - 60_000
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
    const plan = rows.find((row) => row.marketKey === marketKey)?.plan
    positions.set(marketKey, {
      id: marketKey,
      walletId: wallet.id,
      marketKey,
      szi: held.szi,
      entryPx: held.entryPx,
      leverage: held.leverage,
      maxLeverage: plan?.maxLeverage ?? held.leverage,
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
        maxLeverage:
          rows.find((row) => row.marketKey === marketKey)?.plan.maxLeverage ??
          1,
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
    const plan = readLadderPlan(row.plan)
    if (!plan) continue
    const exits = ladderExitLevels(plan)
    const roundPx = (px: number) =>
      protocol.markets.roundPx(px, plan.sizeDecimals)
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
      const plan = rows.find((row) => row.marketKey === marketKey)?.plan
      const near = (wanted: number | null) =>
        wanted !== null &&
        Math.abs(one.px - wanted) <= Math.max(1e-8, one.px * 1e-6)
      const reason: PaperFillReason =
        one.side === "sell" && near(plan?.aimedSlPx ?? null)
          ? "stop_loss"
          : one.side === "sell" && near(plan?.aimedTpPx ?? null)
            ? "take_profit"
            : "order"
      if (reason === "order") return []
      return [
        {
          id: one.fillId,
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
    ordersVersion: 0,
    addedOrders: [],
  }

  const needs = await ladderCandleNeeds(userId, wallet.id, now)
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

  for (const raw of rows) {
    // A just-accepted exchange order can take a moment to appear in the
    // portfolio read. Treating that short delay as a disappearance would
    // place its replacement twice.
    if (!force && now - raw.updatedAt.getTime() < EXCHANGE_VISIBILITY_GRACE_MS)
      continue
    const plan = readLadderPlan(raw.plan)
    if (!plan) continue
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
    const originalPlan = structuredClone(plan)
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
    const pendingFills: LadderOrderInput[] = []
    const pendingCancels = new Set<string>()
    await advanceOne(
      {
        book,
        marks,
        ladderBars: ladderBars as LadderBars,
        now,
      },
      {
        fill: (heldBook, input) => {
          pendingFills.push({ ...input, reduceOnly: false, now: input.at })
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
              replacePlanOrderId(row.plan, pending.tempId, outcome.orderId)
            }
            for (const input of pendingFills) {
              marketActionStarted = true
              const mark = marks.get(input.marketKey)
              await placeLiveOrder(userId, {
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
          if (position && book.touchedMarkets.has(row.marketKey)) {
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
              row.plan.aimedTpPx = oldProtectionGone
                ? null
                : (originalBrackets?.tpPx ?? null)
              row.plan.aimedSlPx = oldProtectionGone
                ? null
                : (originalBrackets?.slPx ?? null)
              await saveLadderPlan(userId, row.id, row.plan, status)
              throw error
            }
          }
        },
      },
      { id: raw.id, marketKey: raw.marketKey, plan }
    )
  }
}

function replacePlanOrderId(
  plan: LadderPlan,
  before: string,
  after: string
): void {
  for (const rung of plan.rungs) {
    if (rung.orderId === before) rung.orderId = after
    if (rung.sellOrderId === before) rung.sellOrderId = after
  }
}

async function restoreLiveOrders(input: {
  userId: string
  wallet: TradeWallet
  marketKey: string
  accepted: string[]
  cancelled: PaperOrder[]
  plan: LadderPlan
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
        replacePlanOrderId(input.plan, order.id, outcome.orderId)
      })
      .catch(() => {
        failed = true
      })
  }
  return failed
}
