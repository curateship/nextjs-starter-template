import type { InfoClient } from "@nktkas/hyperliquid"

import {
  COOLDOWN_MS,
  evaluateMarketRule,
  nextMarketRuleState,
  type MarketBar,
  type MarketRuleState,
  type MarketScannerRuleItem,
} from "@/lib/market-scanner"
import {
  insertMarketScannerAlert,
  listEnabledMarketScannerRules,
  listMarketScannerRuleTriggerTimes,
  markMarketScannerRulesEvaluated,
} from "@/server/market-scanner"
import { getScannerUniverse } from "@/server/scanner/info"
type RateLimiter = { take: (weight?: number) => Promise<void> }

const REFRESH_MS = 10_000
const EVALUATE_MS = 2_000
const EVALUATED_TOUCH_MS = 60_000
const ONE_MINUTE_MS = 60_000
const FIFTEEN_MINUTES_MS = 15 * ONE_MINUTE_MS
const MAX_ONE_MINUTE_BARS = 450
const MAX_FIFTEEN_MINUTE_BARS = 2_100

export type MarketTrade = {
  coin: string
  px: number
  notional: number
  ts: number
}

type CoinBars = {
  oneMinute: Map<number, MarketBar>
  fifteenMinutes: Map<number, MarketBar>
}

export function mergeTradeIntoBars(
  bars: Map<number, MarketBar>,
  trade: MarketTrade,
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

export function initialMarketRuleState(
  matched: boolean,
  lastTriggeredAt: number | null
): MarketRuleState {
  return { matched, lastTriggeredAt }
}

/** Evaluates each user's rules against the shared mainnet market stream. */
export class MarketAlertEngine {
  private readonly info: InfoClient
  private readonly restBucket: RateLimiter
  private rules: MarketScannerRuleItem[] = []
  private readonly bars = new Map<string, CoinBars>()
  private readonly states = new Map<string, MarketRuleState>()
  private readonly triggerTimes = new Map<string, number>()
  private readonly warming = new Set<string>()
  private refreshTimer: NodeJS.Timeout | null = null
  private evaluateTimer: NodeJS.Timeout | null = null
  private lastTouchedAt = 0
  private stopped = true
  private evaluating = false

  constructor(info: InfoClient, restBucket: RateLimiter) {
    this.info = info
    this.restBucket = restBucket
  }

  meta() {
    return {
      marketScannerRules: this.rules.length,
      marketScannerCoins: this.bars.size,
    }
  }

  async start() {
    this.stopped = false
    const previous = await listMarketScannerRuleTriggerTimes()
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
    this.bars.clear()
    this.warming.clear()
  }

  onTrades(trades: MarketTrade[]) {
    for (const trade of trades) {
      const coinBars = this.bars.get(trade.coin)
      if (!coinBars) continue
      if (
        !Number.isFinite(trade.px) ||
        !Number.isFinite(trade.notional) ||
        trade.px <= 0 ||
        trade.notional < 0
      ) {
        continue
      }
      mergeTradeIntoBars(coinBars.oneMinute, trade, ONE_MINUTE_MS)
      mergeTradeIntoBars(coinBars.fifteenMinutes, trade, FIFTEEN_MINUTES_MS)
      trimBars(coinBars.oneMinute, MAX_ONE_MINUTE_BARS)
      trimBars(coinBars.fifteenMinutes, MAX_FIFTEEN_MINUTE_BARS)
    }
  }

  private async refresh() {
    try {
      const nextRules = await listEnabledMarketScannerRules()
      const priorVersions = new Map(
        this.rules.map((rule) => [rule.id, rule.updatedAt])
      )
      for (const rule of nextRules) {
        if (priorVersions.get(rule.id) !== rule.updatedAt) {
          for (const key of this.states.keys()) {
            if (key.startsWith(`${rule.id}:`)) this.states.delete(key)
          }
        }
      }
      this.rules = nextRules

      const needed = new Set(nextRules.flatMap((rule) => rule.markets))
      if (nextRules.some((rule) => rule.marketScope === "all")) {
        for (const asset of await getScannerUniverse()) needed.add(asset.coin)
      }
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
      console.error("market scanner: rule refresh failed", error)
    }
  }

  private async warm(coin: string) {
    try {
      const [oneMinute, fifteenMinutes] = await Promise.all([
        this.snapshot(coin, "1m", ONE_MINUTE_MS, MAX_ONE_MINUTE_BARS),
        this.snapshot(
          coin,
          "15m",
          FIFTEEN_MINUTES_MS,
          MAX_FIFTEEN_MINUTE_BARS
        ),
      ])
      if (this.stopped || !this.bars.has(coin)) return
      this.bars.set(coin, { oneMinute, fifteenMinutes })
    } catch (error) {
      console.error(`market scanner: candle warmup failed for ${coin}`, error)
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
        const coins =
          rule.marketScope === "all" ? [...this.bars.keys()] : rule.markets
        for (const coin of coins) {
          if (this.warming.has(coin)) continue
          const history = sortedBars.get(coin)
          if (!history) continue
          const source =
            rule.window === "1m" ||
            rule.window === "5m" ||
            rule.window === "15m"
              ? history.oneMinute
              : history.fifteenMinutes
          const result = evaluateMarketRule(
            rule,
            source,
            evaluatedAt
          )
          if (!result) continue

          const key = `${rule.id}:${coin}`
          const prior = this.states.get(key)
          if (!prior) {
            this.states.set(
              key,
              initialMarketRuleState(
                result.matched,
                this.triggerTimes.get(key) ?? null
              )
            )
            continue
          }
          const state = nextMarketRuleState(
            prior,
            result.matched,
            evaluatedAt,
            COOLDOWN_MS[rule.cooldown]
          )
          this.states.set(key, state)
          if (!state.shouldAlert) continue

          const alert = await insertMarketScannerAlert({
            rule,
            coin,
            observed: result.observed,
            occurredAt: new Date(evaluatedAt),
            eventKey: `${rule.id}:${coin}:${evaluatedAt}`,
          })
          if (alert) this.triggerTimes.set(key, evaluatedAt)
        }
      }

      if (evaluatedAt - this.lastTouchedAt >= EVALUATED_TOUCH_MS) {
        await markMarketScannerRulesEvaluated(
          this.rules.map((rule) => rule.id),
          new Date(evaluatedAt)
        )
        this.lastTouchedAt = evaluatedAt
      }
    } catch (error) {
      console.error("market scanner: evaluation failed", error)
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
