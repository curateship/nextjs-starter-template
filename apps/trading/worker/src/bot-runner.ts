import { and, eq } from "drizzle-orm"

import type { AutomationConfig } from "@/lib/strategies/strategy-config"
import { db } from "@/server/db"
import { buildCloid } from "@/server/hyperliquid/exchange"
import { getAssetInfo, type AssetInfo } from "@/server/hyperliquid/info"
import { roundPrice, roundSize } from "@/server/hyperliquid/rounding"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import {
  tradingBots,
  tradingBotEvents,
  tradingBotOrders,
  tradingBotState,
  tradingBotTrades,
  type TradingBot,
  type TradingBotState,
  type TradingWallet,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

import { LiveBroker } from "./brokers/live"
import { PaperBroker } from "./brokers/paper"
import type { BotBroker, BrokerOrderUpdate } from "./brokers/types"
import { marketHub, type MarketHub } from "./market-hub"
import { diffOrders, type ExistingOrder } from "./order-differ"
import { resolveStrategy } from "./strategies/registry"
import type {
  BrokerFill,
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "./strategies/contract"

const EVALUATE_DEBOUNCE_MS = 250
const TICK_THROTTLE_MS = 500
const PERSIST_THROTTLE_MS = 2_000
const DEFAULT_PAPER_EQUITY = 10_000

type BotStatus = TradingBot["status"]

export class BotRunner {
  readonly bot: TradingBot
  /** The single market this runner trades; a bot spawns one runner per market. */
  readonly market: string
  private readonly hub: MarketHub
  private params!: AutomationConfig
  private strategy!: Strategy<never, unknown>
  private asset!: AssetInfo
  private broker: BotBroker | null = null
  private strategyState: unknown = {}
  private runtime = {
    dailyRealizedPnl: 0,
    dailyPnlDate: new Date().toISOString().slice(0, 10),
    consecutiveLosses: 0,
    cooldownUntil: null as number | null,
    peakEquity: 0,
  }
  private openOrders = new Map<string, ExistingOrder>()
  private unsubscribers: (() => void)[] = []
  private evaluating = false
  private evaluateQueued = false
  private lastEvaluateAt = 0
  private lastTickAt = 0
  private lastPersistAt = 0
  private paused = false
  private stopped = true

  constructor(bot: TradingBot, market: string, hub: MarketHub = marketHub) {
    this.bot = bot
    this.market = market
    this.hub = hub
  }

  get network(): TradingNetwork {
    return this.botNetwork
  }

  private botNetwork: TradingNetwork = "testnet"

  async start(wallet: TradingWallet) {
    this.botNetwork = wallet.network as TradingNetwork
    await this.setStatus("starting")
    try {
      // The engine validates the AutomationConfig itself; the runner treats
      // params as opaque (hooks receive them typed `never`).
      this.params = this.bot.params as AutomationConfig

      const strategy = resolveStrategy(this.bot.params)
      if (!strategy) {
        throw new Error("Invalid strategy configuration.")
      }
      this.strategy = strategy

      this.asset = await getAssetInfo(this.botNetwork, this.market)
      await this.loadState()

      if (this.bot.mode === "paper") {
        const broker = new PaperBroker({
          network: this.botNetwork,
          coin: this.market,
          startingCash:
            Number(this.bot.paperStartingEquity) || DEFAULT_PAPER_EQUITY,
          hub: this.hub,
          onFill: (fill, purpose, cloid) =>
            void this.onFill(fill, purpose, cloid),
        })
        this.broker = broker
        await this.restoreBrokerState(broker)
        broker.start()
      } else {
        const broker = new LiveBroker({
          bot: this.bot,
          market: this.market,
          wallet,
          network: this.botNetwork,
          asset: this.asset,
          hub: this.hub,
          onFill: (fill, purpose, cloid) =>
            void this.onFill(fill, purpose, cloid),
          onOrderUpdate: (update) => void this.onOrderUpdate(update),
        })
        this.broker = broker
        // Live restarts: local resting rows are stale until reconciled. Scope to
        // this market so sibling markets' orders are left untouched.
        await db
          .update(tradingBotOrders)
          .set({ status: "cancelled", updatedAt: now() })
          .where(
            and(
              eq(tradingBotOrders.botId, this.bot.id),
              eq(tradingBotOrders.market, this.market)
            )
          )
          .catch(() => {})
        await broker.start()
      }

      const warmup = this.strategy.warmup(this.params as never)
      if (warmup.requiresLiveBook) {
        await this.broker.cancelOwnedOrders?.()
      }
      this.strategy.onStart?.(this.ctx(), this.params as never)
      for (const interval of warmup.candleIntervals) {
        const unsubscribe = await this.hub.subscribeCandles(
          this.botNetwork,
          this.market,
          interval,
          (candle) => {
            // Candle close: the event whose t differs from the running one.
            if (candle.T <= Date.now()) this.onCandleClose(candle)
          }
        )
        this.unsubscribers.push(unsubscribe)
      }

      if (warmup.requiresLiveBook) {
        this.unsubscribers.push(
          this.hub.subscribeBook(
            this.botNetwork,
            this.market,
            (book) => {
              if (this.stopped || this.paused) return
              this.strategy.onBook?.(this.ctx(), this.params as never, book, {
                szDecimals: this.asset.szDecimals,
              })
              this.scheduleEvaluate()
            },
            { fast: true }
          )
        )
        const heartbeat = setInterval(() => this.onTick(), TICK_THROTTLE_MS)
        this.unsubscribers.push(() => clearInterval(heartbeat))
      }

      this.unsubscribers.push(
        this.hub.subscribeMids(this.botNetwork, this.asset.dex, () =>
          this.onTick()
        )
      )

      this.stopped = false
      this.paused = this.bot.desiredState === "paused"
      await this.setStatus(this.paused ? "paused" : "running")
      await this.event(
        "info",
        "started",
        `Bot started in ${this.bot.mode} mode.`
      )
      this.scheduleEvaluate()
    } catch (error) {
      const message = error instanceof Error ? error.message : "start failed"
      await this.setStatus("error", message)
      await this.event("error", "start_failed", message)
      this.teardown()
      throw error
    }
  }

  async stop(reason = "Stopped by user") {
    if (this.stopped) return
    this.stopped = true
    await this.cancelAllOrders("stop")
    this.teardown()
    await this.persistState(true)
    await this.setStatus("stopped", reason)
    await this.event("info", "stopped", reason)
  }

  async pause(reason = "Paused") {
    this.paused = true
    await this.cancelAllOrders("pause")
    await this.persistState(true)
    await this.setStatus("paused", reason)
    await this.event("warn", "paused", reason)
  }

  async resume() {
    this.paused = false
    this.runtime.cooldownUntil = null
    await this.setStatus("running")
    await this.event("info", "resumed", "Bot resumed.")
    this.scheduleEvaluate()
  }

  async flatten(reason = "Flatten requested") {
    await this.cancelAllOrders("flatten")
    await this.broker?.flatten()
    await this.persistState(true)
    await this.event("warn", "flatten", reason)
    this.scheduleEvaluate()
  }

  async kill(reason: string) {
    this.paused = true
    await this.cancelAllOrders("kill")
    await this.broker?.flatten()
    this.stopped = true
    this.teardown()
    await this.persistState(true)
    await this.setStatus("killed", reason)
    await this.event("error", "drawdown_kill", reason)
  }

  meta() {
    return {
      running: !this.stopped && !this.paused,
      openOrders: this.openOrders.size,
    }
  }

  private onTick() {
    const nowMs = Date.now()
    if (nowMs - this.lastTickAt < TICK_THROTTLE_MS) return
    this.lastTickAt = nowMs
    if (this.stopped || this.paused) return
    this.strategy.onTick?.(this.ctx(), this.params as never)
    this.scheduleEvaluate()
  }

  private onCandleClose(candle: never | { t: number }) {
    if (this.stopped || this.paused) return
    this.strategy.onCandleClose?.(
      this.ctx(),
      this.params as never,
      candle as never
    )
    this.scheduleEvaluate()
  }

  private async onFill(fill: BrokerFill, purpose: string, cloid: string) {
    // Order bookkeeping — live fills carry only a cloid, so match on it.
    const remainingSz = fill.remainingSz
    const orderStatus = fill.orderStatus
    for (const [key, order] of this.openOrders) {
      if (order.cloid === cloid) {
        if (orderStatus === "filled") this.openOrders.delete(key)
        else order.remainingSz = remainingSz
        purpose = order.purpose
        break
      }
    }

    // Route the fill into the strategy's state machine BEFORE any await:
    // evaluate() re-runs every ~250ms and re-places whatever the state does
    // not know is filled, so updating state after the DB writes (seconds on a
    // remote DB) let a crossed DCA safety order re-buy once per tick. The
    // strategy also keys on fill.purpose (see BrokerFill.purpose), which only
    // the backtest runner attached until now.
    fill.purpose = purpose
    this.strategy.onFill?.(this.ctx(), this.params as never, fill)

    await db
      .update(tradingBotOrders)
      .set({ status: orderStatus, remainingSz, updatedAt: now() })
      .where(eq(tradingBotOrders.cloid, cloid))
      .catch(() => {})

    await db
      .insert(tradingBotTrades)
      .values({
        id: uuid(),
        botId: this.bot.id,
        walletId: this.bot.walletId,
        mode: this.bot.mode,
        market: this.market,
        side: fill.side,
        px: fill.px,
        sz: fill.sz,
        notional: String(Number(fill.px) * Number(fill.sz)),
        fee: fill.fee,
        closedPnl: fill.closedPnl,
        cloid: fill.cloid,
        oid: fill.oid,
        hlTid: fill.hlTid,
        fillTime: new Date(fill.time),
        createdAt: now(),
      })
      .onConflictDoNothing()

    // Daily PnL and loss-streak accounting on realized pnl.
    const realized = Number(fill.closedPnl) - Number(fill.fee)
    const today = new Date().toISOString().slice(0, 10)
    if (this.runtime.dailyPnlDate !== today) {
      this.runtime.dailyPnlDate = today
      this.runtime.dailyRealizedPnl = 0
    }
    this.runtime.dailyRealizedPnl += realized
    if (Number(fill.closedPnl) < 0) {
      this.runtime.consecutiveLosses += 1
    } else if (Number(fill.closedPnl) > 0) {
      this.runtime.consecutiveLosses = 0
    }

    await this.event(
      "info",
      "fill",
      `${fill.side} ${fill.sz} @ ${fill.px} (pnl ${Number(fill.closedPnl).toFixed(2)})`,
      { purpose }
    )

    // Peak-equity bookkeeping stays (it's displayed); the automated risk
    // stops (drawdown-kill, daily-loss pause, cooldowns) are retired — the
    // manual Pause/Flatten/kill commands are the operator's controls now.
    const mid = Number(
      this.hub.mid(this.botNetwork, this.asset.dex, this.market)
    )
    const equity = this.broker?.equity(mid) ?? 0
    if (equity > this.runtime.peakEquity) {
      this.runtime.peakEquity = equity
    }

    await this.persistState(true)
    this.scheduleEvaluate()
  }

  private async onOrderUpdate(update: BrokerOrderUpdate) {
    let matched: ExistingOrder | null = null
    for (const [purpose, order] of this.openOrders) {
      if (order.cloid !== update.cloid) continue
      matched = order
      if (update.status === "resting" || update.status === "partially_filled") {
        order.remainingSz = update.remainingSz
      } else {
        this.openOrders.delete(purpose)
      }
      break
    }
    if (matched) {
      this.strategy.onOrderUpdate?.(
        this.ctx(),
        this.params as never,
        {
          purpose: matched.purpose,
          side: matched.side,
          orderType: "limit",
          px: matched.px ?? undefined,
          sz: matched.sz,
          tif: matched.tif as DesiredOrder["tif"],
          reduceOnly: matched.reduceOnly,
        },
        update.status,
        update.remainingSz
      )
    }
    await db
      .update(tradingBotOrders)
      .set({
        oid: update.oid,
        remainingSz: update.remainingSz,
        status: update.status,
        updatedAt: now(),
      })
      .where(eq(tradingBotOrders.cloid, update.cloid))
      .catch((error: unknown) =>
        console.error("order update persistence failed", error)
      )
    if (matched) await this.persistState(true)
    this.scheduleEvaluate()
  }

  private scheduleEvaluate() {
    if (this.stopped) return
    const since = Date.now() - this.lastEvaluateAt
    const delay = Math.max(0, EVALUATE_DEBOUNCE_MS - since)
    if (this.evaluateQueued) return
    this.evaluateQueued = true
    setTimeout(() => {
      this.evaluateQueued = false
      void this.evaluate()
    }, delay)
  }

  private async evaluate() {
    if (this.evaluating || this.stopped || this.paused || !this.broker) return
    this.evaluating = true
    this.lastEvaluateAt = Date.now()
    try {
      const desired = this.strategy.desiredOrders(
        this.ctx(),
        this.params as never
      )
      const actions = diffOrders(desired, [...this.openOrders.values()])

      for (const action of actions) {
        if (action.kind === "cancel" || action.kind === "replace") {
          await this.cancelOrder(action.existing, action.kind === "cancel")
        }
      }
      for (const action of actions) {
        if (action.kind === "place" || action.kind === "replace") {
          await this.placeOrder(action.desired)
        }
      }

      await this.persistState()
    } catch (error) {
      console.error(`bot ${this.bot.name} evaluate failed`, error)
      await this.event(
        "error",
        "evaluate_failed",
        error instanceof Error ? error.message.slice(0, 300) : "evaluate failed"
      )
    } finally {
      this.evaluating = false
    }
  }

  private async placeOrder(desired: DesiredOrder) {
    if (!this.broker) return
    const rounded: DesiredOrder = {
      ...desired,
      px: desired.px
        ? roundPrice(desired.px, this.asset.szDecimals)
        : undefined,
      sz: roundSize(desired.sz, this.asset.szDecimals),
    }
    if (!(Number(rounded.sz) > 0)) return

    // Fold the market into the hash so two markets sharing a purpose (e.g.
    // "grid:7:buy") don't produce the same cloid across this bot's runners.
    const purposeHash = hashPurpose(`${this.market}:${desired.purpose}`)
    const cloid = buildCloid(this.bot.cloidPrefix, purposeHash)
    const placement = await this.broker.place(cloid, rounded)

    if (placement.kind === "rejected") {
      await db.insert(tradingBotOrders).values({
        id: uuid(),
        botId: this.bot.id,
        cloid,
        oid: null,
        market: this.market,
        side: rounded.side,
        px: rounded.px ?? null,
        sz: rounded.sz,
        remainingSz: rounded.sz,
        orderType: rounded.orderType,
        tif: rounded.tif,
        reduceOnly: rounded.reduceOnly,
        purpose: rounded.purpose,
        status: "rejected",
        createdAt: now(),
        updatedAt: now(),
      })
      this.strategy.onOrderRejected?.(
        this.ctx(),
        this.params as never,
        rounded,
        placement.reason
      )
      return
    }

    const record: ExistingOrder = {
      cloid,
      purpose: rounded.purpose,
      side: rounded.side,
      px: rounded.px ?? null,
      sz: rounded.sz,
      remainingSz: placement.remainingSz,
      tif: rounded.tif,
      reduceOnly: rounded.reduceOnly,
    }
    if (placement.kind === "resting") {
      this.openOrders.set(rounded.purpose, record)
    }

    await db.insert(tradingBotOrders).values({
      id: uuid(),
      botId: this.bot.id,
      cloid,
      oid: placement.oid,
      market: this.market,
      side: rounded.side,
      px: rounded.px ?? null,
      sz: rounded.sz,
      remainingSz: record.remainingSz,
      orderType: rounded.orderType,
      tif: rounded.tif,
      reduceOnly: rounded.reduceOnly,
      purpose: rounded.purpose,
      status:
        placement.kind === "filled"
          ? "filled"
          : Number(record.remainingSz) < Number(record.sz)
            ? "partially_filled"
            : "resting",
      createdAt: now(),
      updatedAt: now(),
    })
    this.strategy.onOrderPlaced?.(
      this.ctx(),
      this.params as never,
      rounded,
      placement.kind,
      record.remainingSz
    )
  }

  private async cancelOrder(existing: ExistingOrder, notifyStrategy = true) {
    const cancelled = (await this.broker?.cancel(existing.cloid)) ?? false
    this.openOrders.delete(existing.purpose)
    if (cancelled) {
      await db
        .update(tradingBotOrders)
        .set({ status: "cancelled", updatedAt: now() })
        .where(eq(tradingBotOrders.cloid, existing.cloid))
        .catch(() => {})
    }
    if (notifyStrategy) {
      this.strategy.onOrderCancelled?.(
        this.ctx(),
        this.params as never,
        {
          purpose: existing.purpose,
          side: existing.side,
          orderType: "limit",
          px: existing.px ?? undefined,
          sz: existing.sz,
          tif: existing.tif as DesiredOrder["tif"],
          reduceOnly: existing.reduceOnly,
        },
        cancelled
      )
    }
  }

  private async cancelAllOrders(reason: string) {
    for (const order of [...this.openOrders.values()]) {
      await this.cancelOrder(order)
    }
    void reason
  }

  private ctx(): StrategyCtx<unknown> {
    const mid = this.hub.mid(this.botNetwork, this.asset.dex, this.market)
    return {
      market: this.market,
      mid,
      candles: (interval, n) =>
        this.hub.getCandles(this.botNetwork, this.market, interval, n),
      position: this.broker?.positionState() ?? null,
      equity: String(this.broker?.equity(Number(mid)) ?? 0),
      // Paper bots compound against their configured starting equity; live bots
      // have no tracked baseline, so compounding scaling is a no-op there.
      startingEquity:
        this.bot.mode === "paper"
          ? String(Number(this.bot.paperStartingEquity) || DEFAULT_PAPER_EQUITY)
          : "0",
      state: this.strategyState,
      setState: (next) => {
        this.strategyState = next
      },
      emit: (type, message, data) =>
        void this.event("info", type, message, {
          market: this.market,
          network: this.botNetwork,
          ...(data && typeof data === "object" ? data : {}),
        }),
      now: Date.now(),
    }
  }

  private async loadState() {
    const [row] = await db
      .select()
      .from(tradingBotState)
      .where(
        and(
          eq(tradingBotState.botId, this.bot.id),
          eq(tradingBotState.market, this.market)
        )
      )
      .limit(1)

    if (row) {
      // Merge over defaults so missing keys (fresh `{}` rows, schema
      // evolution) never leave the strategy with undefined state fields.
      const defaults = this.strategy.init(this.params as never)
      const saved =
        row.strategyState && typeof row.strategyState === "object"
          ? (row.strategyState as Record<string, unknown>)
          : {}
      this.strategyState =
        defaults && typeof defaults === "object"
          ? { ...(defaults as Record<string, unknown>), ...saved }
          : (row.strategyState ?? defaults)
      this.runtime.dailyRealizedPnl = Number(row.dailyRealizedPnl)
      this.runtime.dailyPnlDate =
        row.dailyPnlDate ?? new Date().toISOString().slice(0, 10)
      this.runtime.consecutiveLosses = row.consecutiveLosses
      this.runtime.cooldownUntil = row.cooldownUntil?.getTime() ?? null
      this.runtime.peakEquity = Number(row.peakEquity ?? 0)
      this.savedState = row
    } else {
      this.strategyState = this.strategy.init(this.params as never)
      await db
        .insert(tradingBotState)
        .values({
          botId: this.bot.id,
          market: this.market,
          strategyState: this.strategyState as Record<string, unknown>,
          updatedAt: now(),
        })
        .onConflictDoNothing()
    }
  }

  private savedState: TradingBotState | null = null

  private async restoreBrokerState(broker: PaperBroker) {
    if (!this.savedState) return
    const paperPosition = this.savedState.paperPosition as {
      szi: number
      entryPx: number
    } | null
    const paperCash = this.savedState.paperCash
    if (paperCash !== null || paperPosition) {
      broker.restore({
        cash:
          paperCash !== null
            ? Number(paperCash)
            : Number(this.bot.paperStartingEquity) || DEFAULT_PAPER_EQUITY,
        position: paperPosition,
        orders: [],
      })
    }
    // Resting virtual orders don't survive restarts; strategy re-derives them.
    await db
      .update(tradingBotOrders)
      .set({ status: "cancelled", updatedAt: now() })
      .where(
        and(
          eq(tradingBotOrders.botId, this.bot.id),
          eq(tradingBotOrders.market, this.market)
        )
      )
      .catch(() => {})
  }

  private async persistState(force = false) {
    const nowMs = Date.now()
    if (!force && nowMs - this.lastPersistAt < PERSIST_THROTTLE_MS) return
    this.lastPersistAt = nowMs

    const snapshot = this.broker?.snapshot?.()
    await db
      .update(tradingBotState)
      .set({
        strategyState: this.strategyState as Record<string, unknown>,
        paperPosition: snapshot?.position ?? null,
        paperCash: snapshot ? String(snapshot.cash) : null,
        dailyRealizedPnl: String(this.runtime.dailyRealizedPnl),
        dailyPnlDate: this.runtime.dailyPnlDate,
        consecutiveLosses: this.runtime.consecutiveLosses,
        cooldownUntil: this.runtime.cooldownUntil
          ? new Date(this.runtime.cooldownUntil)
          : null,
        peakEquity: String(this.runtime.peakEquity),
        lastEvalAt: now(),
        updatedAt: now(),
      })
      .where(
        and(
          eq(tradingBotState.botId, this.bot.id),
          eq(tradingBotState.market, this.market)
        )
      )
      .catch((error: unknown) => console.error("persistState failed", error))
  }

  private async setStatus(status: BotStatus, reason: string | null = null) {
    // Per-market status lives on the state row; the bot-level status is a
    // roll-up across all of this bot's markets.
    await db
      .update(tradingBotState)
      .set({ status, statusReason: reason, updatedAt: now() })
      .where(
        and(
          eq(tradingBotState.botId, this.bot.id),
          eq(tradingBotState.market, this.market)
        )
      )
      .catch((error: unknown) => console.error("setStatus failed", error))

    const rows = await db
      .select({ status: tradingBotState.status })
      .from(tradingBotState)
      .where(eq(tradingBotState.botId, this.bot.id))
      .catch(() => [] as { status: string | null }[])

    const rolled = rollUpBotStatus(rows.map((row) => row.status))
    await db
      .update(tradingBots)
      .set({ status: rolled, statusReason: reason, updatedAt: now() })
      .where(eq(tradingBots.id, this.bot.id))
      .catch((error: unknown) => console.error("setStatus failed", error))
  }

  private async event(
    level: "info" | "warn" | "error",
    type: string,
    message: string,
    data?: unknown
  ) {
    await db
      .insert(tradingBotEvents)
      .values({
        id: uuid(),
        botId: this.bot.id,
        level,
        type: type.slice(0, 40),
        message,
        data: data ?? null,
        createdAt: now(),
      })
      .catch(() => {})
  }

  private teardown() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    this.broker?.stop()
  }
}

/**
 * Bot-level status from its per-market statuses. A bot is "running" if any
 * market runs; otherwise the most active remaining state wins, down to
 * "stopped" when every market is stopped.
 */
export function rollUpBotStatus(statuses: (string | null)[]): BotStatus {
  const priority: BotStatus[] = [
    "running",
    "starting",
    "paused",
    "error",
    "killed",
    "stopped",
  ]
  for (const candidate of priority) {
    if (statuses.some((status) => status === candidate)) return candidate
  }
  return "stopped"
}

function hashPurpose(purpose: string): string {
  let hash = 0
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) & 0xffff
  }
  return hash.toString(16).padStart(4, "0")
}
