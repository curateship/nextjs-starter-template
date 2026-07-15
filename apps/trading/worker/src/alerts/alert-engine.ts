import type { InfoClient } from "@nktkas/hyperliquid"

import {
  ALERT_COOLDOWN_MS,
  evaluateWindowAlert,
  nextPriceLevelState,
  nextThresholdState,
  type AlertRuleItem,
  type MarketBar,
  type PriceLevelState,
  type ThresholdState,
} from "@/lib/alerts"
import {
  listActiveAlertRules,
  listAlertRuleTriggerTimes,
  markAlertRulesEvaluated,
  recordAlertEvent,
} from "@/server/alerts"

type RateLimiter = { take: (weight?: number) => Promise<void> }

const REFRESH_MS = 10_000
const EVALUATE_MS = 2_000
const EVALUATED_TOUCH_MS = 60_000
const ONE_MINUTE_MS = 60_000
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
const MAX_ONE_MINUTE_BARS = 450
const MAX_FIFTEEN_MINUTE_BARS = 2_100

export type AlertTrade = {
  tid?: number
  coin: string
  px: number
  notional: number
  ts: number
}

type CoinBars = {
  oneMinute: Map<number, MarketBar>
  fifteenMinutes: Map<number, MarketBar>
}

type PriceLevelAlertRule = Extract<AlertRuleItem, { kind: "price_level" }>

export function mergeTradeIntoBars(
  bars: Map<number, MarketBar>,
  trade: AlertTrade,
  intervalMs: number
) {
  const bucket = Math.floor(trade.ts / intervalMs) * intervalMs
  const existing = bars.get(bucket)
  bars.set(bucket, {
    ts: trade.ts,
    close: trade.px,
    quoteVolume: (existing?.quoteVolume ?? 0) + trade.notional,
  })
}

/** Evaluates each user's alerts against the shared mainnet market stream. */
export class TradingViewAlertEngine {
  private readonly info: InfoClient
  private readonly restBucket: RateLimiter
  private rules: AlertRuleItem[] = []
  private priceRules = new Map<string, PriceLevelAlertRule[]>()
  private readonly bars = new Map<string, CoinBars>()
  private readonly thresholdStates = new Map<string, ThresholdState>()
  private readonly priceStates = new Map<string, PriceLevelState>()
  private readonly triggerTimes = new Map<string, number>()
  private readonly warming = new Set<string>()
  private refreshTimer: NodeJS.Timeout | null = null
  private evaluateTimer: NodeJS.Timeout | null = null
  private triggerQueue: Promise<void> = Promise.resolve()
  private lastTouchedAt = 0
  private stopped = true
  private evaluating = false

  constructor(info: InfoClient, restBucket: RateLimiter) {
    this.info = info
    this.restBucket = restBucket
  }

  meta() {
    return {
      alertRules: this.rules.length,
      alertCoins: new Set(this.rules.map((rule) => rule.coin)).size,
    }
  }

  async start() {
    this.stopped = false
    const previous = await listAlertRuleTriggerTimes()
    for (const row of previous) {
      this.triggerTimes.set(
        `${row.ruleId}:${row.coin}`,
        row.occurredAt.getTime()
      )
    }
    await this.refresh()
    this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_MS)
    this.evaluateTimer = setInterval(() => void this.evaluate(), EVALUATE_MS)
  }

  stop() {
    this.stopped = true
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    if (this.evaluateTimer) clearInterval(this.evaluateTimer)
    this.refreshTimer = null
    this.evaluateTimer = null
    this.rules = []
    this.priceRules.clear()
    this.bars.clear()
    this.thresholdStates.clear()
    this.priceStates.clear()
    this.triggerTimes.clear()
    this.warming.clear()
  }

  onTrades(trades: AlertTrade[]) {
    for (const trade of trades) {
      if (
        !Number.isFinite(trade.px) ||
        !Number.isFinite(trade.notional) ||
        !Number.isFinite(trade.ts) ||
        typeof trade.tid !== "number" ||
        !Number.isSafeInteger(trade.tid) ||
        trade.px <= 0 ||
        trade.notional < 0
      ) {
        continue
      }

      const coinBars = this.bars.get(trade.coin)
      if (coinBars) {
        mergeTradeIntoBars(coinBars.oneMinute, trade, ONE_MINUTE_MS)
        mergeTradeIntoBars(coinBars.fifteenMinutes, trade, FIFTEEN_MINUTES_MS)
        trimBars(coinBars.oneMinute, MAX_ONE_MINUTE_BARS)
        trimBars(coinBars.fifteenMinutes, MAX_FIFTEEN_MINUTE_BARS)
      }

      for (const rule of this.priceRules.get(trade.coin) ?? []) {
        const key = `${rule.id}:${rule.coin}`
        const state = nextPriceLevelState(
          this.priceStates.get(key),
          trade.px,
          trade.ts,
          {
            level: rule.level,
            operator: rule.operator,
            triggerMode: rule.triggerMode,
            cooldownMs:
              rule.triggerMode === "repeat"
                ? ALERT_COOLDOWN_MS[rule.cooldown]
                : 0,
          },
          this.triggerTimes.get(key) ?? null
        )
        this.priceStates.set(key, state)
        if (state.shouldAlert) {
          this.queueTrigger(
            rule,
            trade.px,
            new Date(trade.ts),
            `${rule.id}:${rule.coin}:${trade.tid}`,
            key
          )
        }
      }
    }
  }

  private queueTrigger(
    rule: AlertRuleItem,
    observed: number,
    occurredAt: Date,
    eventKey: string,
    stateKey: string
  ) {
    this.triggerQueue = this.triggerQueue
      .then(async () => {
        const event = await recordAlertEvent({
          rule,
          observed,
          occurredAt,
          eventKey,
        })
        if (event) this.triggerTimes.set(stateKey, occurredAt.getTime())
      })
      .catch((error) => {
        this.priceStates.delete(stateKey)
        this.thresholdStates.delete(stateKey)
        console.error("price alerts: persistence failed", error)
      })
  }

  private async refresh() {
    try {
      const nextRules = await listActiveAlertRules()
      const nextIds = new Set(nextRules.map((rule) => rule.id))
      const priorVersions = new Map(
        this.rules.map((rule) => [rule.id, rule.updatedAt])
      )
      for (const rule of nextRules) {
        if (priorVersions.get(rule.id) !== rule.updatedAt) {
          this.clearRuleState(rule.id)
        }
      }
      for (const rule of this.rules) {
        if (!nextIds.has(rule.id)) this.clearRuleState(rule.id)
      }
      this.rules = nextRules
      this.priceRules = new Map()
      for (const rule of nextRules) {
        if (rule.kind !== "price_level") continue
        const coinRules = this.priceRules.get(rule.coin) ?? []
        coinRules.push(rule)
        this.priceRules.set(rule.coin, coinRules)
      }

      const needed = new Set(
        nextRules
          .filter((rule) => rule.kind !== "price_level")
          .map((rule) => rule.coin)
      )
      for (const coin of this.bars.keys()) {
        if (!needed.has(coin)) this.bars.delete(coin)
      }
      for (const coin of needed) {
        if (!this.bars.has(coin) && !this.warming.has(coin)) {
          this.bars.set(coin, {
            oneMinute: new Map(),
            fifteenMinutes: new Map(),
          })
          this.warming.add(coin)
          void this.warm(coin)
        }
      }
    } catch (error) {
      console.error("price alerts: refresh failed", error)
    }
  }

  private clearRuleState(ruleId: string) {
    for (const key of this.thresholdStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.thresholdStates.delete(key)
    }
    for (const key of this.priceStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.priceStates.delete(key)
    }
  }

  private async warm(coin: string) {
    try {
      const [oneMinute, fifteenMinutes] = await Promise.all([
        this.snapshot(coin, "1m", ONE_MINUTE_MS, MAX_ONE_MINUTE_BARS),
        this.snapshot(coin, "15m", FIFTEEN_MINUTES_MS, MAX_FIFTEEN_MINUTE_BARS),
      ])
      if (this.stopped || !this.bars.has(coin)) return
      this.bars.set(coin, { oneMinute, fifteenMinutes })
    } catch (error) {
      console.error(`price alerts: candle warmup failed for ${coin}`, error)
      if (!this.stopped) this.bars.delete(coin)
    } finally {
      this.warming.delete(coin)
    }
  }

  private async snapshot(
    coin: string,
    interval: "1m" | "15m",
    intervalMs: number,
    count: number
  ) {
    await this.restBucket.take()
    const fetchedAt = Date.now()
    const snapshot = await this.info.candleSnapshot({
      coin,
      interval,
      startTime: fetchedAt - intervalMs * count,
    })
    const bars = new Map<number, MarketBar>()
    for (const candle of snapshot) {
      const start = Number(candle.t)
      const end = Number(candle.T)
      const close = Number(candle.c)
      const volume = Number(candle.v)
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        !Number.isFinite(close) ||
        !Number.isFinite(volume) ||
        close <= 0 ||
        volume < 0
      ) {
        continue
      }
      bars.set(start, {
        ts: Math.min(end, fetchedAt),
        close,
        quoteVolume: volume * close,
      })
    }
    trimBars(bars, count)
    return bars
  }

  private async evaluate() {
    if (this.evaluating || this.rules.length === 0) return
    this.evaluating = true
    const evaluatedAt = Date.now()
    try {
      const sortedBars = new Map(
        [...this.bars].map(([coin, history]) => [
          coin,
          {
            oneMinute: [...history.oneMinute.values()].sort(
              (a, b) => a.ts - b.ts
            ),
            fifteenMinutes: [...history.fifteenMinutes.values()].sort(
              (a, b) => a.ts - b.ts
            ),
          },
        ])
      )
      for (const rule of this.rules) {
        if (rule.kind === "price_level" || this.warming.has(rule.coin)) continue
        const history = sortedBars.get(rule.coin)
        if (!history) continue
        const source =
          rule.window === "1m" || rule.window === "5m" || rule.window === "15m"
            ? history.oneMinute
            : history.fifteenMinutes
        const result = evaluateWindowAlert(rule, source, evaluatedAt)
        if (!result) continue

        const key = `${rule.id}:${rule.coin}`
        const state = nextThresholdState(
          this.thresholdStates.get(key),
          result.matched,
          evaluatedAt,
          rule.triggerMode === "repeat" ? ALERT_COOLDOWN_MS[rule.cooldown] : 0,
          rule.triggerMode,
          this.triggerTimes.get(key) ?? null
        )
        this.thresholdStates.set(key, state)
        if (!state.shouldAlert) continue

        const event = await recordAlertEvent({
          rule,
          observed: result.observed,
          occurredAt: new Date(evaluatedAt),
          eventKey: `${rule.id}:${rule.coin}:${evaluatedAt}`,
        })
        if (event) this.triggerTimes.set(key, evaluatedAt)
      }

      if (evaluatedAt - this.lastTouchedAt >= EVALUATED_TOUCH_MS) {
        await markAlertRulesEvaluated(
          this.rules.map((rule) => rule.id),
          new Date(evaluatedAt)
        )
        this.lastTouchedAt = evaluatedAt
      }
    } catch (error) {
      console.error("price alerts: evaluation failed", error)
    } finally {
      this.evaluating = false
    }
  }
}

function trimBars(bars: Map<number, MarketBar>, limit: number) {
  if (bars.size <= limit) return
  const keys = [...bars.keys()].sort((a, b) => a - b)
  for (const key of keys.slice(0, bars.size - limit)) bars.delete(key)
}
