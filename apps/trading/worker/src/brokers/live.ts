import type { OrderUpdatesWsEvent, UserFillsWsEvent } from "@nktkas/hyperliquid"

import { loadTradingAccountState } from "@/lib/hl/account-balance"
import { db } from "@/server/db"
import {
  cancelOrderByCloid,
  cloidPrefixOf,
  placeOrder,
} from "@/server/hyperliquid/exchange"
import { getInfoClient, type AssetInfo } from "@/server/hyperliquid/info"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBotTrades,
  type TradingBot,
  type TradingWallet,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

import type { MarketHub } from "../market-hub"
import type {
  BrokerFill,
  DesiredOrder,
  StrategyOrderStatus,
} from "../strategies/contract"
import type { BotBroker, BrokerOrderUpdate, Placement } from "./types"

const RECONCILE_INTERVAL_MS = 5 * 60_000
const TRACKED_ORDER_RETENTION_MS = 10 * 60_000

type WsFill = UserFillsWsEvent["fills"][number]
type WsOrder = OrderUpdatesWsEvent[number]
type TrackedOrder = {
  purpose: string
  originalSz: number
  filledSz: number
  exchangeRemainingSz: number | null
  remainingSz: number
  status: StrategyOrderStatus | "pending"
  terminalAt: number | null
}

export function remainingOrderSize(
  originalSz: number,
  filledSz: number,
  exchangeRemainingSz: number | null
) {
  const afterFills = Math.max(0, originalSz - filledSz)
  return exchangeRemainingSz === null || !Number.isFinite(exchangeRemainingSz)
    ? afterFills
    : Math.min(afterFills, Math.max(0, exchangeRemainingSz))
}

/**
 * Live execution through the shared exchange layer. Ownership of orders and
 * fills is established by the bot's cloid prefix; account state comes from
 * clearinghouseState and the userFills stream, reconciled periodically so
 * websocket gaps and worker restarts converge instead of drifting.
 */
export class LiveBroker implements BotBroker {
  private readonly bot: TradingBot
  private readonly market: string
  private readonly wallet: TradingWallet
  private readonly network: TradingNetwork
  private readonly asset: AssetInfo
  private readonly hub: MarketHub
  private readonly emitFill: (
    fill: BrokerFill,
    purpose: string,
    cloid: string
  ) => void
  private readonly emitOrderUpdate: (update: BrokerOrderUpdate) => void
  private readonly accountAddress: `0x${string}`
  private position: { szi: string; entryPx: string } | null = null
  private accountValue = 0
  private restingCloids = new Set<string>()
  private trackedOrders = new Map<string, TrackedOrder>()
  private seenFillTids = new Map<number, number>()
  private fillWatermark = 0
  private unsubscribers: (() => void)[] = []
  private reconcileTimer: NodeJS.Timeout | null = null
  private reconciling = false

  constructor(options: {
    bot: TradingBot
    market: string
    wallet: TradingWallet
    network: TradingNetwork
    asset: AssetInfo
    hub: MarketHub
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
    onOrderUpdate: (update: BrokerOrderUpdate) => void
  }) {
    this.bot = options.bot
    this.market = options.market
    this.wallet = options.wallet
    this.network = options.network
    this.asset = options.asset
    this.hub = options.hub
    this.emitFill = options.onFill
    this.emitOrderUpdate = options.onOrderUpdate
    this.accountAddress = (options.wallet.vaultAddress ??
      options.wallet.accountAddress) as `0x${string}`
  }

  async start() {
    this.fillWatermark = Date.now()
    await this.refreshAccount()

    this.unsubscribers.push(
      this.hub.subscribeUserFills(
        this.network,
        this.accountAddress,
        (event) => {
          if (event.isSnapshot) return
          for (const fill of event.fills) {
            void this.handleStreamFill(fill)
          }
        }
      )
    )
    this.unsubscribers.push(
      this.hub.subscribeOrderUpdates(
        this.network,
        this.accountAddress,
        (event) => {
          void this.handleOrderUpdates(event)
        }
      )
    )

    await this.reconcile()
    this.reconcileTimer = setInterval(
      () => void this.reconcile(),
      RECONCILE_INTERVAL_MS
    )
  }

  stop() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    if (this.reconcileTimer) clearInterval(this.reconcileTimer)
    this.reconcileTimer = null
  }

  async place(cloid: string, order: DesiredOrder): Promise<Placement> {
    this.pruneTrackedOrders()
    let px = order.px
    if (!px) {
      // Market order: marketable IOC limit at mid ± 3%.
      const mid = Number(
        this.hub.mid(this.network, this.asset.dex, this.market)
      )
      if (!(mid > 0)) {
        return { kind: "rejected", reason: "no mid price for market order" }
      }
      px = (mid * (order.side === "buy" ? 1.03 : 0.97)).toPrecision(5)
    }
    this.trackedOrders.set(cloid, {
      purpose: order.purpose,
      originalSz: Number(order.sz),
      filledSz: 0,
      exchangeRemainingSz: null,
      remainingSz: Number(order.sz),
      status: "pending",
      terminalAt: null,
    })
    try {
      const status = await placeOrder(
        this.wallet,
        { actor: "bot", botId: this.bot.id, userId: this.bot.userId },
        {
          assetId: this.asset.assetId,
          coin: this.market,
          isBuy: order.side === "buy",
          px,
          sz: order.sz,
          reduceOnly: order.reduceOnly,
          tif: order.orderType === "market" ? "Ioc" : order.tif,
          cloid: cloid as `0x${string}`,
        }
      )
      const tracked = this.trackedOrders.get(cloid)
      if (tracked?.status === "filled") {
        return { kind: "filled", oid: status.oid, remainingSz: "0" }
      }
      if (tracked?.status === "cancelled" || tracked?.status === "rejected") {
        return {
          kind: "rejected",
          reason: `order became ${tracked.status} before placement completed`,
        }
      }
      if (status.kind === "resting") {
        this.restingCloids.add(cloid)
        if (tracked)
          tracked.status =
            tracked.status === "pending" ? "resting" : tracked.status
        return {
          kind: "resting",
          oid: status.oid,
          remainingSz: String(tracked?.remainingSz ?? order.sz),
        }
      }
      // Fill details arrive via the userFills stream (deduped by tid).
      this.trackedOrders.set(cloid, {
        purpose: order.purpose,
        originalSz: Number(order.sz),
        filledSz: Number(order.sz),
        exchangeRemainingSz: 0,
        remainingSz: 0,
        status: "filled",
        terminalAt: Date.now(),
      })
      return { kind: "filled", oid: status.oid, remainingSz: "0" }
    } catch (error) {
      this.trackedOrders.delete(cloid)
      return {
        kind: "rejected",
        reason: error instanceof Error ? error.message : "order rejected",
      }
    }
  }

  async cancel(cloid: string): Promise<boolean> {
    this.restingCloids.delete(cloid)
    try {
      await cancelOrderByCloid(
        this.wallet,
        { actor: "bot", botId: this.bot.id, userId: this.bot.userId },
        {
          assetId: this.asset.assetId,
          coin: this.market,
          cloid: cloid as `0x${string}`,
        }
      )
      const tracked = this.trackedOrders.get(cloid)
      if (tracked) {
        tracked.status = "cancelled"
        tracked.terminalAt = Date.now()
      }
      return true
    } catch {
      // Usually "order already filled/cancelled" — reconcile settles it.
      return false
    }
  }

  async flatten(): Promise<void> {
    await this.refreshAccount()
    if (!this.position) return
    const szi = Number(this.position.szi)
    if (szi === 0) return
    const mid = Number(this.hub.mid(this.network, this.asset.dex, this.market))
    const slip = szi > 0 ? 0.97 : 1.03
    const px = (mid > 0 ? mid : Number(this.position.entryPx)) * slip
    await placeOrder(
      this.wallet,
      { actor: "bot", botId: this.bot.id, userId: this.bot.userId },
      {
        assetId: this.asset.assetId,
        coin: this.market,
        isBuy: szi < 0,
        px: px.toPrecision(5),
        sz: String(Math.abs(szi)),
        reduceOnly: true,
        tif: "Ioc",
      }
    ).catch(() => {})
    await this.refreshAccount()
  }

  positionState() {
    return this.position
  }

  equity(): number {
    return this.accountValue
  }

  openOrderCount() {
    return this.restingCloids.size
  }

  async reconcile(): Promise<void> {
    if (this.reconciling) return
    this.reconciling = true
    this.pruneTrackedOrders()
    try {
      const info = getInfoClient(this.network)

      // 1. Which of our orders still rest on the exchange?
      const openOrders = await info.frontendOpenOrders({
        user: this.accountAddress,
        dex: this.asset.dex,
      })
      const liveCloids = new Set(
        openOrders
          .filter(
            (order) =>
              order.cloid &&
              cloidPrefixOf(order.cloid) === this.bot.cloidPrefix &&
              order.coin === this.market
          )
          .map((order) => order.cloid as string)
      )
      this.restingCloids = liveCloids
      for (const order of openOrders) {
        if (!order.cloid || !liveCloids.has(order.cloid)) continue
        const tracked = this.trackedOrders.get(order.cloid)
        const originalSz = Number(order.origSz)
        const exchangeRemainingSz = Number(order.sz)
        const filledSz = tracked?.filledSz ?? 0
        const remainingSz = remainingOrderSize(
          originalSz,
          filledSz,
          exchangeRemainingSz
        )
        const status = remainingSz < originalSz ? "partially_filled" : "resting"
        this.trackedOrders.set(order.cloid, {
          purpose: tracked?.purpose ?? "live",
          originalSz,
          filledSz,
          exchangeRemainingSz,
          remainingSz,
          status,
          terminalAt: null,
        })
        this.emitOrderUpdate({
          cloid: order.cloid,
          oid: order.oid,
          remainingSz: String(remainingSz),
          status,
        })
      }

      // 2. Backfill fills since the watermark (dedup via unique hl_tid index).
      const since = this.fillWatermark - 60_000
      const fills = await info.userFillsByTime({
        user: this.accountAddress,
        startTime: Math.max(0, since),
      })
      for (const fill of fills) {
        await this.handleStreamFill(fill as WsFill, true)
      }

      // 3. Fresh account state.
      await this.refreshAccount()
    } catch (error) {
      console.error(
        `reconcile failed for bot ${this.bot.name}:`,
        error instanceof Error ? error.message.slice(0, 200) : error
      )
    } finally {
      this.reconciling = false
    }
  }

  async cancelOwnedOrders(): Promise<void> {
    const openOrders = await getInfoClient(this.network).frontendOpenOrders({
      user: this.accountAddress,
      dex: this.asset.dex,
    })
    for (const order of openOrders) {
      if (
        order.cloid &&
        order.coin === this.market &&
        cloidPrefixOf(order.cloid) === this.bot.cloidPrefix
      ) {
        await this.cancel(order.cloid)
      }
    }
  }

  private async handleOrderUpdates(event: OrderUpdatesWsEvent) {
    for (const update of event) await this.handleOrderUpdate(update)
  }

  private async handleOrderUpdate(update: WsOrder) {
    this.pruneTrackedOrders()
    const { order } = update
    if (
      order.coin !== this.market ||
      !order.cloid ||
      cloidPrefixOf(order.cloid) !== this.bot.cloidPrefix
    ) {
      return
    }
    const reportedStatus = liveOrderStatus(update)
    const reportedRemainingSz = reportedStatus === "filled" ? "0" : order.sz
    const tracked = this.trackedOrders.get(order.cloid)
    const originalSz = Number(order.origSz)
    const exchangeRemainingSz = Number(reportedRemainingSz)
    const filledSz = tracked?.filledSz ?? 0
    const remainingSz = remainingOrderSize(
      originalSz,
      filledSz,
      exchangeRemainingSz
    )
    const status =
      tracked?.status === "filled"
        ? "filled"
        : reportedStatus === "resting" && remainingSz < originalSz
          ? "partially_filled"
          : reportedStatus
    this.trackedOrders.set(order.cloid, {
      purpose: tracked?.purpose ?? "live",
      originalSz,
      filledSz,
      exchangeRemainingSz,
      remainingSz,
      status,
      terminalAt:
        status === "resting" || status === "partially_filled"
          ? null
          : Date.now(),
    })
    if (status === "resting" || status === "partially_filled") {
      this.restingCloids.add(order.cloid)
    } else {
      this.restingCloids.delete(order.cloid)
    }
    if (status === "partially_filled" || status === "filled") {
      await this.refreshAccount()
    }
    this.emitOrderUpdate({
      cloid: order.cloid,
      oid: order.oid,
      remainingSz: String(remainingSz),
      status,
    })
  }

  private async handleStreamFill(fill: WsFill, fromBackfill = false) {
    this.pruneTrackedOrders()
    if (fill.coin !== this.market) return
    if (!fill.cloid || cloidPrefixOf(fill.cloid) !== this.bot.cloidPrefix) {
      return
    }
    if (this.seenFillTids.has(fill.tid)) return
    if (fill.time > this.fillWatermark) this.fillWatermark = fill.time

    if (fromBackfill) {
      // Deduplicate through the unique (bot_id, hl_tid) index.
      const inserted = await db
        .insert(tradingBotTrades)
        .values({
          id: uuid(),
          botId: this.bot.id,
          walletId: this.bot.walletId,
          mode: "live",
          market: fill.coin,
          side: fill.side === "B" ? "buy" : "sell",
          px: fill.px,
          sz: fill.sz,
          notional: String(Number(fill.px) * Number(fill.sz)),
          fee: fill.fee,
          closedPnl: fill.closedPnl,
          cloid: fill.cloid,
          oid: fill.oid,
          hlTid: fill.tid,
          fillTime: new Date(fill.time),
          createdAt: now(),
        })
        .onConflictDoNothing()
        .returning({ id: tradingBotTrades.id })
      this.seenFillTids.set(fill.tid, fill.time)
      if (inserted.length === 0) return
    } else {
      this.seenFillTids.set(fill.tid, fill.time)
    }

    const tracked = this.trackedOrders.get(fill.cloid)
    if (tracked) {
      tracked.filledSz = Math.min(
        tracked.originalSz,
        tracked.filledSz + Number(fill.sz)
      )
      tracked.remainingSz = remainingOrderSize(
        tracked.originalSz,
        tracked.filledSz,
        tracked.exchangeRemainingSz
      )
    }
    const remainingSz = String(tracked?.remainingSz ?? 0)
    const orderStatus = Number(remainingSz) > 0 ? "partially_filled" : "filled"
    if (tracked) {
      tracked.status = orderStatus
      tracked.terminalAt =
        orderStatus === "filled" ? Date.now() : tracked.terminalAt
    }
    if (orderStatus === "filled") this.restingCloids.delete(fill.cloid)
    await this.refreshAccount()

    this.emitFill(
      {
        side: fill.side === "B" ? "buy" : "sell",
        px: fill.px,
        sz: fill.sz,
        fee: fill.fee,
        closedPnl: fill.closedPnl,
        time: fill.time,
        cloid: fill.cloid,
        oid: fill.oid,
        hlTid: fill.tid,
        remainingSz,
        orderStatus,
      },
      tracked?.purpose ?? "live",
      fill.cloid
    )
  }

  private async refreshAccount() {
    try {
      const accountState = await loadTradingAccountState(
        getInfoClient(this.network),
        this.accountAddress,
        this.asset
      )
      const state = accountState.clearinghouseState
      this.accountValue = Number(accountState.equity)
      const position = state.assetPositions.find(
        ({ position }) => position.coin === this.market
      )?.position
      this.position =
        position && Number(position.szi) !== 0
          ? { szi: position.szi, entryPx: position.entryPx ?? "0" }
          : null
    } catch (error) {
      console.error(
        `refreshAccount failed for bot ${this.bot.name}:`,
        error instanceof Error ? error.message.slice(0, 200) : error
      )
    }
  }

  private pruneTrackedOrders() {
    const cutoff = Date.now() - TRACKED_ORDER_RETENTION_MS
    for (const [cloid, order] of this.trackedOrders) {
      if (order.terminalAt !== null && order.terminalAt < cutoff) {
        this.trackedOrders.delete(cloid)
      }
    }
    for (const [tid, fillTime] of this.seenFillTids) {
      if (fillTime < cutoff) this.seenFillTids.delete(tid)
    }
  }
}

export function liveOrderStatus(update: WsOrder): BrokerOrderUpdate["status"] {
  if (update.status === "open") {
    return Number(update.order.sz) < Number(update.order.origSz)
      ? "partially_filled"
      : "resting"
  }
  if (update.status === "filled") return "filled"
  if (
    update.status === "canceled" ||
    update.status === "scheduledCancel" ||
    update.status.endsWith("Canceled")
  ) {
    return "cancelled"
  }
  return "rejected"
}
