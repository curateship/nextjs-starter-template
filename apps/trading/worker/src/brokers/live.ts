import type { UserFillsWsEvent } from "@nktkas/hyperliquid"

import { db } from "@/server/db"
import {
  cancelOrderByCloid,
  cloidPrefixOf,
  placeOrder,
} from "@/server/hyperliquid/exchange"
import { getInfoClient, type AssetInfo } from "@/server/hyperliquid/info"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import { tradingBotTrades, type TradingBot, type TradingWallet } from "@/server/schema"
import { now, uuid } from "@/server/util"

import type { MarketHub } from "../market-hub"
import type { BrokerFill, DesiredOrder } from "../strategies/contract"
import type { BotBroker, Placement } from "./types"

const RECONCILE_INTERVAL_MS = 5 * 60_000

type WsFill = UserFillsWsEvent["fills"][number]

/**
 * Live execution through the shared exchange layer. Ownership of orders and
 * fills is established by the bot's cloid prefix; account state comes from
 * clearinghouseState and the userFills stream, reconciled periodically so
 * websocket gaps and worker restarts converge instead of drifting.
 */
export class LiveBroker implements BotBroker {
  private readonly bot: TradingBot
  private readonly wallet: TradingWallet
  private readonly network: TradingNetwork
  private readonly asset: AssetInfo
  private readonly hub: MarketHub
  private readonly emitFill: (
    fill: BrokerFill,
    purpose: string,
    cloid: string
  ) => void
  private readonly accountAddress: `0x${string}`
  private position: { szi: string; entryPx: string } | null = null
  private accountValue = 0
  private restingCloids = new Set<string>()
  private fillWatermark = 0
  private unsubscribers: (() => void)[] = []
  private reconcileTimer: NodeJS.Timeout | null = null
  private reconciling = false

  constructor(options: {
    bot: TradingBot
    wallet: TradingWallet
    network: TradingNetwork
    asset: AssetInfo
    hub: MarketHub
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
  }) {
    this.bot = options.bot
    this.wallet = options.wallet
    this.network = options.network
    this.asset = options.asset
    this.hub = options.hub
    this.emitFill = options.onFill
    this.accountAddress = (options.wallet.vaultAddress ??
      options.wallet.accountAddress) as `0x${string}`
  }

  async start() {
    this.fillWatermark = Date.now()
    await this.refreshAccount()

    this.unsubscribers.push(
      this.hub.subscribeUserFills(this.network, this.accountAddress, (event) => {
        if (event.isSnapshot) return
        for (const fill of event.fills) {
          void this.handleStreamFill(fill)
        }
      })
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
    let px = order.px
    if (!px) {
      // Market order: marketable IOC limit at mid ± 3%.
      const mid = Number(this.hub.mid(this.network, this.bot.market))
      if (!(mid > 0)) {
        return { kind: "rejected", reason: "no mid price for market order" }
      }
      px = (mid * (order.side === "buy" ? 1.03 : 0.97)).toPrecision(5)
    }
    try {
      const status = await placeOrder(
        this.wallet,
        { actor: "bot", botId: this.bot.id, userId: this.bot.userId },
        {
          assetId: this.asset.assetId,
          coin: this.bot.market,
          isBuy: order.side === "buy",
          px,
          sz: order.sz,
          reduceOnly: order.reduceOnly,
          tif: order.orderType === "market" ? "Ioc" : order.tif,
          cloid: cloid as `0x${string}`,
        }
      )
      if (status.kind === "resting") {
        this.restingCloids.add(cloid)
        return { kind: "resting" }
      }
      // Fill details arrive via the userFills stream (deduped by tid).
      return { kind: "filled" }
    } catch (error) {
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
          coin: this.bot.market,
          cloid: cloid as `0x${string}`,
        }
      )
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
    const mid = Number(this.hub.mid(this.network, this.bot.market))
    const slip = szi > 0 ? 0.97 : 1.03
    const px = (mid > 0 ? mid : Number(this.position.entryPx)) * slip
    await placeOrder(
      this.wallet,
      { actor: "bot", botId: this.bot.id, userId: this.bot.userId },
      {
        assetId: this.asset.assetId,
        coin: this.bot.market,
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
    try {
      const info = getInfoClient(this.network)

      // 1. Which of our orders still rest on the exchange?
      const openOrders = await info.frontendOpenOrders({
        user: this.accountAddress,
      })
      const liveCloids = new Set(
        openOrders
          .filter(
            (order) =>
              order.cloid &&
              cloidPrefixOf(order.cloid) === this.bot.cloidPrefix &&
              order.coin === this.bot.market
          )
          .map((order) => order.cloid as string)
      )
      this.restingCloids = liveCloids

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

  private async handleStreamFill(fill: WsFill, fromBackfill = false) {
    if (fill.coin !== this.bot.market) return
    if (!fill.cloid || cloidPrefixOf(fill.cloid) !== this.bot.cloidPrefix) {
      return
    }
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
      if (inserted.length === 0) return
    }

    this.restingCloids.delete(fill.cloid)
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
      },
      "live",
      fill.cloid
    )
  }

  private async refreshAccount() {
    try {
      const state = await getInfoClient(this.network).clearinghouseState({
        user: this.accountAddress,
      })
      this.accountValue = Number(state.marginSummary.accountValue)
      const position = state.assetPositions.find(
        ({ position }) => position.coin === this.bot.market
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
}
