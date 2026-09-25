import type { InfoClient } from "@nktkas/hyperliquid"

import {
  ALERT_COOLDOWN_MS,
  evaluateWindowAlert,
  nextLineTouchState,
  nextPriceLevelState,
  nextThresholdState,
  type AlertRuleItem,
  type LineTouchState,
  type MarketBar,
  type PriceLevelState,
  type ThresholdState,
} from "@/lib/alerts"
import { trendlinePriceAt, type Trendline } from "@/lib/trading/trendlines"
import {
  deleteAlertRulesById,
  listActiveAlertRules,
  listAlertRuleTriggerTimes,
  markAlertRulesEvaluated,
  recordAlertEvent,
  resolveTrendlineRuleLines,
  type TrendlineAlertRule,
} from "@/server/alerts"

type RateLimiter = { take: (weight?: number) => Promise<void> }

const REFRESH_MS = 10_000
const PRICE_TRADE_BUFFER_MS = REFRESH_MS * 3
const MAX_PRICE_TRADES_PER_COIN = 10_000
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

/** An active drawn-line rule together with the drawing it points at. */
type ArmedTrendlineRule = { rule: TrendlineAlertRule; line: Trendline }

type RecoveryCandle = {
  t: number
  T: number
  h: string
  l: string
  c: string
}

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
  private trendlineRules = new Map<string, ArmedTrendlineRule[]>()
  private readonly recentPriceTrades = new Map<string, AlertTrade[]>()
  private readonly bars = new Map<string, CoinBars>()
  private readonly thresholdStates = new Map<string, ThresholdState>()
  private readonly priceStates = new Map<string, PriceLevelState>()
  private readonly lineStates = new Map<string, LineTouchState>()
  /** Close-mode drawn-line rules: last one-minute bucket already judged. */
  private readonly lineClosedBuckets = new Map<string, number>()
  private readonly triggerTimes = new Map<string, number>()
  private readonly warming = new Set<string>()
  private readonly recoveringPriceRules = new Set<string>()
  private refreshTimer: NodeJS.Timeout | null = null
  private evaluateTimer: NodeJS.Timeout | null = null
  private triggerQueue: Promise<void> = Promise.resolve()
  private lastTouchedAt = 0
  private stopped = true
  private evaluating = false
  private refreshing = false

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
    if (this.stopped) return
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
    this.trendlineRules.clear()
    this.recentPriceTrades.clear()
    this.bars.clear()
    this.thresholdStates.clear()
    this.priceStates.clear()
    this.lineStates.clear()
    this.lineClosedBuckets.clear()
    this.triggerTimes.clear()
    this.warming.clear()
    this.recoveringPriceRules.clear()
  }

  onTrades(trades: AlertTrade[]) {
    if (this.stopped) return
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

      this.rememberPriceTrade(trade)
      const coinBars = this.bars.get(trade.coin)
      if (coinBars) {
        mergeTradeIntoBars(coinBars.oneMinute, trade, ONE_MINUTE_MS)
        mergeTradeIntoBars(coinBars.fifteenMinutes, trade, FIFTEEN_MINUTES_MS)
        trimBars(coinBars.oneMinute, MAX_ONE_MINUTE_BARS)
        trimBars(coinBars.fifteenMinutes, MAX_FIFTEEN_MINUTE_BARS)
      }

      for (const rule of this.priceRules.get(trade.coin) ?? []) {
        if (this.recoveringPriceRules.has(rule.id)) continue
        this.evaluatePriceRule(rule, trade)
      }

      for (const armed of this.trendlineRules.get(trade.coin) ?? []) {
        if (armed.rule.touch === "wick") this.evaluateLineWick(armed, trade)
      }
    }
  }

  private evaluateLineWick(armed: ArmedTrendlineRule, trade: AlertTrade) {
    const { rule, line } = armed
    const linePrice = trendlinePriceAt(line, trade.ts)
    if (linePrice === null) return
    const key = `${rule.id}:${rule.coin}`
    const state = nextLineTouchState(
      this.lineStates.get(key),
      trade.px,
      linePrice,
      trade.ts,
      {
        triggerMode: rule.triggerMode,
        cooldownMs:
          rule.triggerMode === "repeat" ? ALERT_COOLDOWN_MS[rule.cooldown] : 0,
        exactTouchFires: true,
      },
      this.triggerTimes.get(key) ?? null
    )
    this.lineStates.set(key, state)
    if (!state.shouldAlert) return
    this.queueTrigger(
      rule,
      trade.px,
      new Date(trade.ts),
      `${rule.id}:${rule.coin}:${trade.tid}`,
      key,
      linePrice
    )
  }

  private rememberPriceTrade(trade: AlertTrade) {
    const recent = this.recentPriceTrades.get(trade.coin) ?? []
    recent.push(trade)
    const cutoff = trade.ts - PRICE_TRADE_BUFFER_MS
    const firstFresh = recent.findIndex((item) => item.ts >= cutoff)
    if (firstFresh > 0) recent.splice(0, firstFresh)
    if (recent.length > MAX_PRICE_TRADES_PER_COIN) {
      recent.splice(0, recent.length - MAX_PRICE_TRADES_PER_COIN)
    }
    this.recentPriceTrades.set(trade.coin, recent)
  }

  private evaluatePriceRule(
    rule: PriceLevelAlertRule,
    trade: AlertTrade,
    eventKey = `${rule.id}:${rule.coin}:${trade.tid}`
  ) {
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
          rule.triggerMode === "repeat" ? ALERT_COOLDOWN_MS[rule.cooldown] : 0,
      },
      this.triggerTimes.get(key) ?? null
    )
    this.priceStates.set(key, state)
    if (!state.shouldAlert) return
    this.queueTrigger(rule, trade.px, new Date(trade.ts), eventKey, key)
  }

  private replayPriceRule(
    rule: PriceLevelAlertRule,
    recoveredThrough?: number
  ) {
    const activatedAt = Date.parse(rule.updatedAt)
    if (!Number.isFinite(activatedAt)) return
    const recent = [...(this.recentPriceTrades.get(rule.coin) ?? [])].sort(
      (left, right) => left.ts - right.ts || (left.tid ?? 0) - (right.tid ?? 0)
    )
    if (recoveredThrough !== undefined) {
      for (const trade of recent) {
        if (trade.ts > recoveredThrough) this.evaluatePriceRule(rule, trade)
      }
      return
    }

    let before: AlertTrade | undefined
    for (const trade of recent) {
      if (trade.ts > activatedAt) break
      before = trade
    }
    if (before) this.evaluatePriceRule(rule, before)
    for (const trade of recent) {
      if (trade.ts > activatedAt) this.evaluatePriceRule(rule, trade)
    }
  }

  private async recoverPriceRules(rules: PriceLevelAlertRule[]) {
    const byCoin = new Map<string, PriceLevelAlertRule[]>()
    for (const rule of rules) {
      const coinRules = byCoin.get(rule.coin) ?? []
      coinRules.push(rule)
      byCoin.set(rule.coin, coinRules)
    }

    await Promise.all(
      [...byCoin].map(async ([coin, coinRules]) => {
        const recent = [...(this.recentPriceTrades.get(coin) ?? [])].sort(
          (left, right) =>
            left.ts - right.ts || (left.tid ?? 0) - (right.tid ?? 0)
        )
        const needsHistory = coinRules.filter((rule) => {
          const start = recoveryStart(rule)
          return !recent.some((trade) => trade.ts <= start)
        })
        if (needsHistory.length === 0) {
          for (const rule of coinRules) this.replayPriceRule(rule)
          return
        }

        let candles: RecoveryCandle[] = []
        const fetchedAt = Date.now()
        try {
          await this.restBucket.take()
          if (this.stopped) return
          const earliest = Math.min(...needsHistory.map(recoveryStart))
          candles = (await this.info.candleSnapshot({
            coin,
            interval: "1m",
            startTime: Math.max(0, earliest - ONE_MINUTE_MS),
            endTime: fetchedAt,
          })) as RecoveryCandle[]
          if (this.stopped) return
        } catch (error) {
          console.error(`price alerts: recovery failed for ${coin}`, error)
        }

        for (const rule of coinRules) {
          if (!needsHistory.some((candidate) => candidate.id === rule.id)) {
            this.replayPriceRule(rule)
            continue
          }
          const start = recoveryStart(rule)
          const firstBufferedAt = recent[0]?.ts ?? fetchedAt
          const recoveredThrough = candles.length
            ? this.recoverPriceRule(rule, candles, start, firstBufferedAt)
            : undefined
          this.replayPriceRule(rule, recoveredThrough)
        }
      })
    )
  }

  private recoverPriceRule(
    rule: PriceLevelAlertRule,
    candles: RecoveryCandle[],
    start: number,
    cutoff: number
  ) {
    const valid = candles
      .map((candle) => ({
        start: Number(candle.t),
        end: Number(candle.T),
        high: Number(candle.h),
        low: Number(candle.l),
        close: Number(candle.c),
      }))
      .filter(
        (candle) =>
          Number.isFinite(candle.start) &&
          Number.isFinite(candle.end) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close) &&
          candle.high > 0 &&
          candle.low > 0 &&
          candle.close > 0 &&
          candle.low <= candle.high
      )
      .sort((left, right) => left.start - right.start)
    let baseline: (typeof valid)[number] | undefined
    for (const candle of valid) {
      if (candle.end > start) break
      baseline = candle
    }
    if (!baseline) return undefined

    this.evaluatePriceRule(rule, {
      coin: rule.coin,
      px: baseline.close,
      notional: 0,
      ts: baseline.end,
    })
    let recoveredThrough = Math.max(start, baseline.end)
    const interrupted = valid.find(
      (candle) =>
        candle.start <= start && candle.end > start && candle.end < cutoff
    )
    if (interrupted) {
      const key = `${rule.id}:${rule.coin}`
      const state = this.priceStates.get(key)
      if (state) {
        this.priceStates.set(key, {
          ...state,
          previousPrice: interrupted.close,
        })
        recoveredThrough = interrupted.end
      }
    }

    for (const candle of valid) {
      if (candle.end <= recoveredThrough || candle.end >= cutoff) continue
      const key = `${rule.id}:${rule.coin}:recovery:${candle.end}`
      const previous = this.priceStates.get(`${rule.id}:${rule.coin}`)
      if (!previous || previous.stopped) break

      if (previous.previousPrice < rule.level && candle.high >= rule.level) {
        this.evaluatePriceRule(
          rule,
          {
            coin: rule.coin,
            px: candle.high,
            notional: 0,
            ts: candle.end - 1,
          },
          `${key}:up`
        )
      } else if (
        previous.previousPrice > rule.level &&
        candle.low <= rule.level
      ) {
        this.evaluatePriceRule(
          rule,
          {
            coin: rule.coin,
            px: candle.low,
            notional: 0,
            ts: candle.end - 1,
          },
          `${key}:down`
        )
      }

      this.evaluatePriceRule(
        rule,
        {
          coin: rule.coin,
          px: candle.close,
          notional: 0,
          ts: candle.end,
        },
        `${key}:close`
      )
      recoveredThrough = candle.end
    }
    return recoveredThrough
  }

  private queueTrigger(
    rule: AlertRuleItem,
    observed: number,
    occurredAt: Date,
    eventKey: string,
    stateKey: string,
    linePrice?: number
  ) {
    this.triggerQueue = this.triggerQueue
      .then(async () => {
        const event = await recordAlertEvent({
          rule,
          observed,
          occurredAt,
          eventKey,
          ...(linePrice !== undefined ? { linePrice } : {}),
        })
        if (event) this.triggerTimes.set(stateKey, occurredAt.getTime())
      })
      .catch((error) => {
        this.priceStates.delete(stateKey)
        this.thresholdStates.delete(stateKey)
        this.lineStates.delete(stateKey)
        console.error("price alerts: persistence failed", error)
      })
  }

  private async refresh() {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const nextRules = await listActiveAlertRules()
      if (this.stopped) return
      const nextIds = new Set(nextRules.map((rule) => rule.id))
      const priorVersions = new Map(
        this.rules.map((rule) => [rule.id, rule.updatedAt])
      )
      const changedPriceRules: PriceLevelAlertRule[] = []
      for (const rule of nextRules) {
        if (priorVersions.get(rule.id) !== rule.updatedAt) {
          this.clearRuleState(rule.id)
          if (rule.kind === "price_level") {
            changedPriceRules.push(rule)
            this.recoveringPriceRules.add(rule.id)
          }
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
      await this.refreshTrendlineRules(
        nextRules.filter((rule) => rule.kind === "trendline")
      )
      if (this.stopped) return
      await this.recoverPriceRules(changedPriceRules)
      if (this.stopped) return

      const needed = new Set(
        nextRules
          .filter(
            (rule) =>
              rule.kind === "price_move" ||
              rule.kind === "volume_spike" ||
              (rule.kind === "trendline" && rule.touch === "close")
          )
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
    } finally {
      for (const rule of this.rules) {
        this.recoveringPriceRules.delete(rule.id)
      }
      this.refreshing = false
    }
  }

  /**
   * Pairs each active drawn-line rule with its saved drawing. Rules whose
   * line was deleted are retired outright (the app already does this on
   * save; this is the safety net). A line whose geometry changed since the
   * last look re-arms from scratch, so dragging a line across the market
   * price does not itself count as a touch.
   */
  private async refreshTrendlineRules(rules: TrendlineAlertRule[]) {
    let lines: Map<string, Trendline | null>
    try {
      lines = await resolveTrendlineRuleLines(rules)
    } catch (error) {
      // Keep the previous geometry pairing rather than dropping live rules.
      console.error("price alerts: loading drawn lines failed", error)
      return
    }
    if (this.stopped) return

    const previousLines = new Map<string, Trendline>()
    for (const armedList of this.trendlineRules.values()) {
      for (const armed of armedList) previousLines.set(armed.rule.id, armed.line)
    }

    const orphaned = rules.filter((rule) => !lines.get(rule.id))
    if (orphaned.length > 0) {
      try {
        await deleteAlertRulesById(orphaned.map((rule) => rule.id))
        for (const rule of orphaned) this.clearRuleState(rule.id)
      } catch (error) {
        console.error("price alerts: retiring line-less rules failed", error)
      }
    }
    if (this.stopped) return

    this.trendlineRules = new Map()
    for (const rule of rules) {
      const line = lines.get(rule.id)
      if (!line) continue
      const previous = previousLines.get(rule.id)
      if (
        previous &&
        (previous.start.time !== line.start.time ||
          previous.start.price !== line.start.price ||
          previous.end.time !== line.end.time ||
          previous.end.price !== line.end.price)
      ) {
        this.clearRuleState(rule.id)
      }
      const coinRules = this.trendlineRules.get(rule.coin) ?? []
      coinRules.push({ rule, line })
      this.trendlineRules.set(rule.coin, coinRules)
    }
  }

  private clearRuleState(ruleId: string) {
    for (const key of this.thresholdStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.thresholdStates.delete(key)
    }
    for (const key of this.priceStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.priceStates.delete(key)
    }
    for (const key of this.lineStates.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.lineStates.delete(key)
    }
    for (const key of this.lineClosedBuckets.keys()) {
      if (key.startsWith(`${ruleId}:`)) this.lineClosedBuckets.delete(key)
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
        if (
          rule.kind === "price_level" ||
          rule.kind === "trendline" ||
          this.warming.has(rule.coin)
        )
          continue
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

      this.evaluateLineCloses(evaluatedAt)

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

  /** Judges close-mode drawn-line rules on each completed one-minute candle. */
  private evaluateLineCloses(now: number) {
    for (const armedList of this.trendlineRules.values()) {
      for (const armed of armedList) {
        if (armed.rule.touch !== "close") continue
        const { rule } = armed
        if (this.warming.has(rule.coin)) continue
        const coinBars = this.bars.get(rule.coin)
        if (!coinBars) continue
        const closed = [...coinBars.oneMinute.keys()]
          .filter((bucket) => bucket + ONE_MINUTE_MS <= now)
          .sort((a, b) => a - b)
        if (closed.length === 0) continue

        const key = `${rule.id}:${rule.coin}`
        const last = this.lineClosedBuckets.get(key)
        if (last === undefined) {
          // First look after arming: record which side the latest finished
          // candle closed on, without judging candles from before arming.
          const bucket = closed[closed.length - 1]
          this.judgeLineClose(armed, bucket)
          this.lineClosedBuckets.set(key, bucket)
          continue
        }
        for (const bucket of closed) {
          if (bucket <= last) continue
          this.judgeLineClose(armed, bucket)
          this.lineClosedBuckets.set(key, bucket)
        }
      }
    }
  }

  private judgeLineClose(armed: ArmedTrendlineRule, bucket: number) {
    const { rule, line } = armed
    const bar = this.bars.get(rule.coin)?.oneMinute.get(bucket)
    if (!bar) return
    const closedAt = bucket + ONE_MINUTE_MS
    const linePrice = trendlinePriceAt(line, closedAt)
    if (linePrice === null) return
    const key = `${rule.id}:${rule.coin}`
    const state = nextLineTouchState(
      this.lineStates.get(key),
      bar.close,
      linePrice,
      closedAt,
      {
        triggerMode: rule.triggerMode,
        cooldownMs:
          rule.triggerMode === "repeat" ? ALERT_COOLDOWN_MS[rule.cooldown] : 0,
        exactTouchFires: false,
      },
      this.triggerTimes.get(key) ?? null
    )
    this.lineStates.set(key, state)
    if (!state.shouldAlert) return
    this.queueTrigger(
      rule,
      bar.close,
      new Date(closedAt),
      `${rule.id}:${rule.coin}:close:${bucket}`,
      key,
      linePrice
    )
  }
}

function trimBars(bars: Map<number, MarketBar>, limit: number) {
  if (bars.size <= limit) return
  const keys = [...bars.keys()].sort((a, b) => a - b)
  for (const key of keys.slice(0, bars.size - limit)) bars.delete(key)
}

function recoveryStart(rule: PriceLevelAlertRule) {
  const updatedAt = Date.parse(rule.updatedAt)
  const evaluatedAt = rule.lastEvaluatedAt
    ? Date.parse(rule.lastEvaluatedAt)
    : Number.NaN
  return Math.max(
    Number.isFinite(updatedAt) ? updatedAt : 0,
    Number.isFinite(evaluatedAt) ? evaluatedAt : 0
  )
}
