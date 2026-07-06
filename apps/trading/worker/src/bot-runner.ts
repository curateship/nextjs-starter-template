import { eq } from "drizzle-orm"

import {
  riskParamsSchema,
  strategyParamsSchema,
  type RiskParams,
  type StrategyParams,
} from "@/lib/strategies/params"
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
import type { BotBroker } from "./brokers/types"
import { marketHub, type MarketHub } from "./market-hub"
import { diffOrders, type ExistingOrder } from "./order-differ"
import { applyRiskFilter } from "./risk-filter"
import { strategies } from "./strategies/registry"
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
  private readonly hub: MarketHub
  private params!: StrategyParams
  private risk!: RiskParams
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

  constructor(bot: TradingBot, hub: MarketHub = marketHub) {
    this.bot = bot
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
      this.params = strategyParamsSchema.parse(this.bot.params)
      this.risk = riskParamsSchema.parse(this.bot.riskParams)

      const strategy = strategies[this.params.strategyType]
      if (!strategy) {
        throw new Error(
          `Strategy "${this.params.strategyType}" is not implemented yet.`
        )
      }
      this.strategy = strategy

      this.asset = await getAssetInfo(this.botNetwork, this.bot.market)
      await this.loadState()

      if (this.bot.mode === "paper") {
        const broker = new PaperBroker({
          network: this.botNetwork,
          coin: this.bot.market,
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
          wallet,
          network: this.botNetwork,
          asset: this.asset,
          hub: this.hub,
          onFill: (fill, purpose, cloid) =>
            void this.onFill(fill, purpose, cloid),
        })
        this.broker = broker
        // Live restarts: local resting rows are stale until reconciled.
        await db
          .update(tradingBotOrders)
          .set({ status: "cancelled", updatedAt: now() })
          .where(eq(tradingBotOrders.botId, this.bot.id))
          .catch(() => {})
        await broker.start()
      }

      const warmup = this.strategy.warmup(this.params as never)
      if (warmup.sourceAddress) {
        const source = warmup.sourceAddress as `0x${string}`
        this.unsubscribers.push(
          this.hub.subscribeUserFills(this.botNetwork, source, (event) => {
            if (event.isSnapshot || this.stopped || this.paused) return
            for (const fill of event.fills) {
              this.strategy.onSourceFill?.(this.ctx(), this.params as never, {
                coin: fill.coin,
                side: fill.side === "B" ? "buy" : "sell",
                px: fill.px,
                sz: fill.sz,
                time: fill.time,
                tid: fill.tid,
              })
            }
            this.scheduleEvaluate()
          })
        )
      }
      for (const interval of warmup.candleIntervals) {
        const unsubscribe = await this.hub.subscribeCandles(
          this.botNetwork,
          this.bot.market,
          interval,
          (candle) => {
            // Candle close: the event whose t differs from the running one.
            if (candle.T <= Date.now()) this.onCandleClose(candle)
          }
        )
        this.unsubscribers.push(unsubscribe)
      }

      this.unsubscribers.push(
        this.hub.subscribeMids(this.botNetwork, () => this.onTick())
      )

      this.stopped = false
      this.paused = this.bot.desiredState === "paused"
      await this.setStatus(this.paused ? "paused" : "running")
      await this.event("info", "started", `Bot started in ${this.bot.mode} mode.`)
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
    for (const [key, order] of this.openOrders) {
      if (order.cloid === cloid) {
        this.openOrders.delete(key)
        purpose = order.purpose
        break
      }
    }
    await db
      .update(tradingBotOrders)
      .set({ status: "filled", remainingSz: "0", updatedAt: now() })
      .where(eq(tradingBotOrders.cloid, cloid))
      .catch(() => {})

    await db.insert(tradingBotTrades).values({
      id: uuid(),
      botId: this.bot.id,
      walletId: this.bot.walletId,
      mode: this.bot.mode,
      market: this.bot.market,
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
    }).onConflictDoNothing()

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

    this.strategy.onFill?.(this.ctx(), this.params as never, fill)
    await this.checkRiskMonitors()
    await this.persistState()
    this.scheduleEvaluate()
  }

  private async checkRiskMonitors() {
    const mid = Number(this.hub.mid(this.botNetwork, this.bot.market))
    const equity = this.broker?.equity(mid) ?? 0
    if (equity > this.runtime.peakEquity) {
      this.runtime.peakEquity = equity
    }

    const drawdownPct =
      this.runtime.peakEquity > 0
        ? ((this.runtime.peakEquity - equity) / this.runtime.peakEquity) * 100
        : 0
    if (drawdownPct > this.risk.maxDrawdownPct) {
      await this.kill(
        `Drawdown ${drawdownPct.toFixed(1)}% exceeded limit ${this.risk.maxDrawdownPct}% (peak $${this.runtime.peakEquity.toFixed(2)}, now $${equity.toFixed(2)}).`
      )
      return
    }

    if (this.runtime.dailyRealizedPnl < -this.risk.dailyLossLimitUsd) {
      await this.pause(
        `Daily loss $${(-this.runtime.dailyRealizedPnl).toFixed(2)} exceeded limit $${this.risk.dailyLossLimitUsd}; auto-paused until resume.`
      )
      return
    }

    if (
      this.risk.cooldownLosses > 0 &&
      this.runtime.consecutiveLosses >= this.risk.cooldownLosses &&
      !this.runtime.cooldownUntil
    ) {
      this.runtime.cooldownUntil =
        Date.now() + this.risk.cooldownMinutes * 60_000
      await this.event(
        "warn",
        "cooldown",
        `${this.runtime.consecutiveLosses} consecutive losses; cooling down for ${this.risk.cooldownMinutes}m.`
      )
      await this.cancelAllOrders("cooldown")
    }
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
    if (this.runtime.cooldownUntil) {
      if (Date.now() < this.runtime.cooldownUntil) return
      this.runtime.cooldownUntil = null
      this.runtime.consecutiveLosses = 0
      await this.event("info", "cooldown_over", "Cooldown finished; resuming.")
    }
    this.evaluating = true
    this.lastEvaluateAt = Date.now()
    try {
      const desired = this.strategy.desiredOrders(
        this.ctx(),
        this.params as never
      )
      const filtered = applyRiskFilter(desired, {
        mid: Number(this.hub.mid(this.botNetwork, this.bot.market)),
        position: this.broker?.positionState() ?? null,
        risk: this.risk,
      })
      const actions = diffOrders(filtered, [...this.openOrders.values()])

      for (const action of actions) {
        if (action.kind === "cancel" || action.kind === "replace") {
          await this.cancelOrder(action.existing)
        }
        if (action.kind === "place" || action.kind === "replace") {
          await this.placeOrder(action.desired)
        }
      }

      // Grid stop-loss/take-profit and similar strategy-level halts.
      if (
        this.params.strategyType === "grid" &&
        (this.strategyState as { stopped?: boolean }).stopped &&
        this.broker.positionState()
      ) {
        await this.flatten("Grid halt (stop-loss or take-profit)")
        await this.pause("Grid stop-loss/take-profit hit")
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

    const purposeHash = hashPurpose(desired.purpose)
    const cloid = buildCloid(this.bot.cloidPrefix, purposeHash)
    const placement = await this.broker.place(cloid, rounded)

    if (placement.kind === "rejected") {
      // Common benign case (e.g. post-only would cross); log at info level.
      return
    }

    const record: ExistingOrder = {
      cloid,
      purpose: rounded.purpose,
      side: rounded.side,
      px: rounded.px ?? null,
      sz: rounded.sz,
      remainingSz: placement.kind === "filled" ? "0" : rounded.sz,
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
      oid: null,
      market: this.bot.market,
      side: rounded.side,
      px: rounded.px ?? null,
      sz: rounded.sz,
      remainingSz: record.remainingSz,
      orderType: rounded.orderType,
      tif: rounded.tif,
      reduceOnly: rounded.reduceOnly,
      purpose: rounded.purpose,
      status: placement.kind === "filled" ? "filled" : "resting",
      createdAt: now(),
      updatedAt: now(),
    })
  }

  private async cancelOrder(existing: ExistingOrder) {
    await this.broker?.cancel(existing.cloid)
    this.openOrders.delete(existing.purpose)
    await db
      .update(tradingBotOrders)
      .set({ status: "cancelled", updatedAt: now() })
      .where(eq(tradingBotOrders.cloid, existing.cloid))
      .catch(() => {})
  }

  private async cancelAllOrders(reason: string) {
    for (const order of [...this.openOrders.values()]) {
      await this.cancelOrder(order)
    }
    void reason
  }

  private ctx(): StrategyCtx<unknown> {
    const mid = this.hub.mid(this.botNetwork, this.bot.market)
    return {
      market: this.bot.market,
      mid,
      candles: (interval, n) =>
        this.hub.getCandles(this.botNetwork, this.bot.market, interval, n),
      position: this.broker?.positionState() ?? null,
      equity: String(this.broker?.equity(Number(mid)) ?? 0),
      state: this.strategyState,
      setState: (next) => {
        this.strategyState = next
      },
      emit: (type, message, data) =>
        void this.event("info", type, message, data),
      now: Date.now(),
    }
  }

  private async loadState() {
    const [row] = await db
      .select()
      .from(tradingBotState)
      .where(eq(tradingBotState.botId, this.bot.id))
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
      await db.insert(tradingBotState).values({
        botId: this.bot.id,
        strategyState: this.strategyState as Record<string, unknown>,
        updatedAt: now(),
      })
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
      .where(eq(tradingBotOrders.botId, this.bot.id))
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
      .where(eq(tradingBotState.botId, this.bot.id))
      .catch((error: unknown) => console.error("persistState failed", error))
  }

  private async setStatus(status: BotStatus, reason: string | null = null) {
    await db
      .update(tradingBots)
      .set({ status, statusReason: reason, updatedAt: now() })
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

function hashPurpose(purpose: string): string {
  let hash = 0
  for (let i = 0; i < purpose.length; i += 1) {
    hash = (hash * 31 + purpose.charCodeAt(i)) & 0xffff
  }
  return hash.toString(16).padStart(4, "0")
}
