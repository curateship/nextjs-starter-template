import type { CandleWsEvent } from "@nktkas/hyperliquid"

import { computeBacktestStats } from "@/lib/backtest/stats"
import type {
  BacktestCosts,
  BacktestFill,
  BacktestHalt,
  BacktestResult,
  BacktestTrade,
} from "@/lib/backtest/types"
import type { RiskParams, StrategyParams } from "@/lib/strategies/params"
import type { CandleInterval, HistoryCandle } from "@/server/backtest/history"

import { diffOrders, type ExistingOrder } from "../order-differ"
import { applyRiskFilter } from "../risk-filter"
import type {
  BrokerFill,
  DesiredOrder,
  Strategy,
  StrategyCtx,
} from "../strategies/contract"
import { BacktestBroker } from "./broker"

export type RunBacktestConfig = {
  strategy: Strategy<never, unknown>
  params: StrategyParams
  riskParams: RiskParams
  /** Ascending candles including warmup history before simStartMs. */
  candles: HistoryCandle[]
  /** Trading begins on the first candle whose open time is ≥ this. */
  simStartMs: number
  startingEquity: number
  market: string
  interval: CandleInterval
  /** Fee/slippage assumptions in bps. */
  costs: BacktestCosts
}

type PendingFill = { fill: BrokerFill; purpose: string; cloid: string }

/** Round to micro precision so stored equity/JSON stays free of float noise. */
const round = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * Replays historical candles through a real strategy with the same
 * desiredOrders → risk filter → diff → place/cancel loop and the same risk
 * monitors (drawdown kill, daily-loss pause, cooldown) as the live BotRunner.
 * Fully deterministic: identical inputs yield an identical result. Each bar is
 * walked as an OHLC price path so intrabar stops and limit fills are honored,
 * pausing at declared exit-trigger levels so TP/SL fills happen at their
 * trigger price rather than the bar's extreme.
 */
class BacktestRunner {
  private readonly strategy: Strategy<never, unknown>
  private readonly params: StrategyParams
  private readonly risk: RiskParams
  private readonly candlesNum: HistoryCandle[]
  private readonly candlesWs: CandleWsEvent[]
  private readonly simStartMs: number
  private readonly startingEquity: number
  private readonly market: string

  private readonly broker: BacktestBroker
  private strategyState: unknown
  private readonly openOrders = new Map<string, ExistingOrder>()
  private readonly pendingFills: PendingFill[] = []

  // Collected output.
  private readonly equityCurve: BacktestResult["equityCurve"] = []
  private readonly fills: BacktestFill[] = []
  private readonly trades: BacktestTrade[] = []
  private totalFees = 0
  private cumPnl = 0

  // Round-trip tracking, driven off fill deltas.
  private legSzi = 0
  private openLeg: {
    side: "long" | "short"
    entryTime: number
    qty: number
    entryNotional: number
    realized: number
    fees: number
  } | null = null

  // Risk runtime, mirroring BotRunner.
  private dailyRealizedPnl = 0
  private dailyPnlDate: string
  private consecutiveLosses = 0
  private cooldownUntil: number | null = null
  private peakEquity: number
  private halt: BacktestHalt = { kind: null, reason: null }
  private stopped = false

  // Simulated clock/price for the current path step.
  private now = 0
  private price = 0
  private currentIndex = 0
  private cloidSeq = 0

  constructor(cfg: RunBacktestConfig) {
    this.strategy = cfg.strategy
    this.params = cfg.params
    this.risk = cfg.riskParams
    this.candlesNum = cfg.candles
    this.simStartMs = cfg.simStartMs
    this.startingEquity = cfg.startingEquity
    this.market = cfg.market
    this.peakEquity = cfg.startingEquity
    this.dailyPnlDate = new Date(cfg.simStartMs).toISOString().slice(0, 10)

    this.candlesWs = cfg.candles.map((c) => ({
      t: c.t,
      T: c.T,
      s: cfg.market,
      i: cfg.interval,
      o: String(c.o),
      c: String(c.c),
      h: String(c.h),
      l: String(c.l),
      v: String(c.v),
      n: c.n,
    }))

    this.broker = new BacktestBroker({
      startingCash: cfg.startingEquity,
      getTime: () => this.now,
      onFill: (fill, purpose, cloid) =>
        this.pendingFills.push({ fill, purpose, cloid }),
      takerFeeRate: cfg.costs.takerFeeBps / 10_000,
      makerFeeRate: cfg.costs.makerFeeBps / 10_000,
      slippageRate: cfg.costs.slippageBps / 10_000,
    })
    this.strategyState = this.strategy.init(this.params as never)
  }

  run(): BacktestResult {
    this.equityCurve.push({ t: this.simStartMs, eq: this.startingEquity })

    for (let i = 0; i < this.candlesNum.length; i += 1) {
      this.currentIndex = i
      const candle = this.candlesNum[i]
      // Warmup bars only feed the indicator window; no trading yet.
      if (candle.t < this.simStartMs) continue
      this.processBar(candle, this.candlesWs[i])
    }

    const pos = this.broker.positionState()
    const openPosition = pos
      ? {
          side: (Number(pos.szi) > 0 ? "long" : "short") as "long" | "short",
          szi: Number(pos.szi),
          entryPx: Number(pos.entryPx),
          entryTime: this.openLeg?.entryTime ?? this.now,
        }
      : null

    const firstClose =
      this.candlesNum.find((c) => c.t >= this.simStartMs)?.c ?? 0
    const lastClose = this.candlesNum.length
      ? this.candlesNum[this.candlesNum.length - 1].c
      : 0

    const stats = computeBacktestStats(this.trades, this.equityCurve, {
      startingEquity: this.startingEquity,
      fees: round(this.totalFees),
      firstClose,
      lastClose,
      halt: this.halt,
    })

    return {
      equityCurve: this.equityCurve,
      trades: this.trades,
      fills: this.fills,
      openPosition,
      stats,
    }
  }

  private processBar(candle: HistoryCandle, ws: CandleWsEvent) {
    // Walk the adverse extreme first so intrabar stops trigger conservatively.
    const szi = Number(this.broker.positionState()?.szi ?? 0)
    const path = szi < 0 ? [candle.o, candle.h, candle.l] : [candle.o, candle.l, candle.h]
    // The open is a plain step: a gap across a trigger really fills at the open.
    this.step(path[0], candle.t, null)
    this.stepThrough(path[1], candle.t, null)
    this.stepThrough(path[2], candle.t, null)
    this.stepThrough(candle.c, candle.T, ws)
    this.equityCurve.push({ t: candle.T, eq: round(this.broker.equity(candle.c)) })
  }

  /**
   * Advances the simulated price to `target`, pausing at every exit-trigger
   * level (strategy.exitTriggers) the move crosses so threshold exits fill at
   * their trigger price. Without the pauses the path only visits the bar's
   * extremes, so a take-profit would be booked at the best price of the whole
   * bar (and a stop-loss at the worst) — systematically distorting results.
   */
  private stepThrough(
    target: number,
    time: number,
    closingCandle: CandleWsEvent | null
  ) {
    // Re-read the levels after every pause: a fill there can close the
    // position or move an anchor, changing (or clearing) what remains.
    for (let guard = 0; guard < 8 && !this.stopped; guard += 1) {
      const from = this.price
      const rising = target > from
      const levels =
        this.strategy.exitTriggers?.(this.ctx(), this.params as never) ?? []
      let next: number | null = null
      for (const level of levels) {
        if (!Number.isFinite(level)) continue
        if (rising ? level <= from || level >= target : level >= from || level <= target) {
          continue
        }
        if (next === null || (rising ? level < next : level > next)) next = level
      }
      if (next === null) break
      this.step(next, time, null)
    }
    this.step(target, time, closingCandle)
  }

  private step(price: number, time: number, closingCandle: CandleWsEvent | null) {
    this.price = price
    this.now = time
    this.broker.setPrice(price)
    if (!this.stopped) {
      // Resting orders fill as price arrives, before the strategy reacts —
      // otherwise a re-evaluation could cancel a level the bar just crossed.
      this.broker.matchBar(price)
      this.drainFills()
      if (closingCandle) {
        this.strategy.onCandleClose?.(
          this.ctx(),
          this.params as never,
          closingCandle as never
        )
      } else {
        this.strategy.onTick?.(this.ctx(), this.params as never)
      }
      this.evaluate()
    }
    this.drainFills()
  }

  private evaluate() {
    if (this.stopped) return
    if (this.cooldownUntil !== null) {
      if (this.now < this.cooldownUntil) return
      this.cooldownUntil = null
      this.consecutiveLosses = 0
    }

    const desired = this.strategy.desiredOrders(this.ctx(), this.params as never)
    const filtered = applyRiskFilter(desired, {
      mid: this.price,
      position: this.broker.positionState(),
      risk: this.risk,
    })
    const actions = diffOrders(filtered, [...this.openOrders.values()])
    for (const action of actions) {
      if (action.kind === "cancel" || action.kind === "replace") {
        this.cancelOrder(action.existing)
      }
      if (action.kind === "place" || action.kind === "replace") {
        this.placeOrder(action.desired)
      }
    }

    // Grid stop-loss/take-profit halts the whole strategy — position or not.
    // Recording the halt while flat matters: a TP/SL inside the historical
    // price range can trip within hours of the window start, and without the
    // halt the run just looks silently empty.
    if (
      this.params.strategyType === "grid" &&
      (this.strategyState as { stopped?: boolean }).stopped
    ) {
      const when = new Date(this.now).toISOString().slice(0, 16).replace("T", " ")
      this.setHalt(
        "grid_stop",
        `Grid stop-loss/take-profit crossed at ${when} UTC; trading halted for the rest of the window.`
      )
      if (this.broker.positionState()) this.broker.flatten("grid_stop")
    }
  }

  private placeOrder(desired: DesiredOrder) {
    const cloid = `bt:${desired.purpose}:${this.cloidSeq++}`
    const placement = this.broker.place(cloid, desired)
    if (placement.kind === "rejected") return
    if (placement.kind === "resting") {
      this.openOrders.set(desired.purpose, {
        cloid,
        purpose: desired.purpose,
        side: desired.side,
        px: desired.px ?? null,
        sz: desired.sz,
        remainingSz: desired.sz,
        tif: desired.tif,
        reduceOnly: desired.reduceOnly,
      })
    }
  }

  private cancelOrder(existing: ExistingOrder) {
    this.broker.cancel(existing.cloid)
    this.openOrders.delete(existing.purpose)
  }

  private drainFills() {
    while (this.pendingFills.length > 0) {
      const next = this.pendingFills.shift()
      if (next) this.handleFill(next.fill, next.purpose, next.cloid)
    }
  }

  private handleFill(fill: BrokerFill, purpose: string, cloid: string) {
    for (const [key, order] of this.openOrders) {
      if (order.cloid === cloid) {
        this.openOrders.delete(key)
        purpose = order.purpose
        break
      }
    }
    // Resolve the purpose onto the fill so strategy.onFill (e.g. DCA) can read it.
    fill.purpose = purpose

    // Stamp fills/trades at the bar's OPEN time so their chart markers line up
    // with the candles and indicator lines (both keyed by open time). The
    // close step runs at candle.T (= the next candle's open time), which would
    // otherwise push every signal marker one bar to the right of the cross.
    // `this.now` stays the close time for daily-PnL/cooldown bookkeeping.
    fill.time = this.candlesNum[this.currentIndex]?.t ?? fill.time

    this.fills.push({
      t: fill.time,
      side: fill.side,
      px: Number(fill.px),
      sz: Number(fill.sz),
      fee: Number(fill.fee),
      closedPnl: Number(fill.closedPnl),
      purpose,
    })
    this.totalFees += Number(fill.fee)
    this.recordTrade(fill)

    const realized = Number(fill.closedPnl) - Number(fill.fee)
    const today = new Date(this.now).toISOString().slice(0, 10)
    if (this.dailyPnlDate !== today) {
      this.dailyPnlDate = today
      this.dailyRealizedPnl = 0
    }
    this.dailyRealizedPnl += realized
    if (Number(fill.closedPnl) < 0) this.consecutiveLosses += 1
    else if (Number(fill.closedPnl) > 0) this.consecutiveLosses = 0

    this.strategy.onFill?.(this.ctx(), this.params as never, fill)
    this.checkRiskMonitors()
  }

  /** Builds flat→flat round trips from fill deltas for the trades table. */
  private recordTrade(fill: BrokerFill) {
    const sz = Number(fill.sz)
    const px = Number(fill.px)
    const fee = Number(fill.fee)
    const closedPnl = Number(fill.closedPnl)
    const delta = fill.side === "buy" ? sz : -sz
    const before = this.legSzi
    const after = before + delta
    this.legSzi = after

    if (!this.openLeg || before === 0) {
      if (after !== 0) this.openLeg = this.startLeg(after, px, fill.time, fee)
      return
    }

    const addingToPosition = Math.sign(delta) === Math.sign(before)
    if (addingToPosition) {
      this.openLeg.qty = Math.abs(after)
      this.openLeg.entryNotional += px * sz
      this.openLeg.fees += fee
      return
    }

    // Reducing, closing, or flipping through zero.
    this.openLeg.realized += closedPnl
    this.openLeg.fees += fee
    if (after === 0) {
      this.closeLeg(fill.time, px)
    } else if (Math.sign(after) !== Math.sign(before)) {
      this.closeLeg(fill.time, px)
      this.openLeg = this.startLeg(after, px, fill.time, 0)
    }
  }

  private startLeg(szi: number, px: number, time: number, fee: number) {
    return {
      side: (szi > 0 ? "long" : "short") as "long" | "short",
      entryTime: time,
      qty: Math.abs(szi),
      entryNotional: px * Math.abs(szi),
      realized: 0,
      fees: fee,
    }
  }

  private closeLeg(exitTime: number, exitPx: number) {
    const leg = this.openLeg
    if (!leg) return
    const pnl = leg.realized - leg.fees
    this.cumPnl += pnl
    this.trades.push({
      n: this.trades.length + 1,
      side: leg.side,
      entryTime: leg.entryTime,
      entryPx: leg.qty > 0 ? leg.entryNotional / leg.qty : exitPx,
      exitTime,
      exitPx,
      qty: leg.qty,
      pnl: round(pnl),
      returnPct: leg.entryNotional > 0 ? (pnl / leg.entryNotional) * 100 : 0,
      cumPnl: round(this.cumPnl),
    })
    this.openLeg = null
  }

  private checkRiskMonitors() {
    const equity = this.broker.equity(this.price)
    if (equity > this.peakEquity) this.peakEquity = equity

    const drawdownPct =
      this.peakEquity > 0
        ? ((this.peakEquity - equity) / this.peakEquity) * 100
        : 0
    if (drawdownPct > this.risk.maxDrawdownPct) {
      this.setHalt(
        "drawdown_kill",
        `Drawdown ${drawdownPct.toFixed(1)}% exceeded limit ${this.risk.maxDrawdownPct}%; flattened and stopped.`
      )
      this.broker.flatten("drawdown_kill")
      return
    }

    if (this.dailyRealizedPnl < -this.risk.dailyLossLimitUsd) {
      this.setHalt(
        "daily_loss_pause",
        `Daily loss $${(-this.dailyRealizedPnl).toFixed(2)} exceeded limit $${this.risk.dailyLossLimitUsd}; stopped trading.`
      )
      return
    }

    if (
      this.risk.cooldownLosses > 0 &&
      this.consecutiveLosses >= this.risk.cooldownLosses &&
      this.cooldownUntil === null
    ) {
      this.cooldownUntil = this.now + this.risk.cooldownMinutes * 60_000
      this.broker.cancelAll()
      this.openOrders.clear()
    }
  }

  /** Records a halt and stops issuing orders; the first halt wins. */
  private setHalt(kind: NonNullable<BacktestHalt["kind"]>, reason: string) {
    if (this.halt.kind) return
    this.halt = { kind, reason }
    this.stopped = true
    this.broker.cancelAll()
    this.openOrders.clear()
  }

  private ctx(): StrategyCtx<unknown> {
    return {
      market: this.market,
      mid: String(this.price),
      candles: (_interval, n) => this.windowCandles(n),
      position: this.broker.positionState(),
      equity: String(this.broker.equity(this.price)),
      startingEquity: String(this.startingEquity),
      state: this.strategyState,
      setState: (next) => {
        this.strategyState = next
      },
      emit: () => {},
      now: this.now,
    }
  }

  private windowCandles(n: number): CandleWsEvent[] {
    const end = this.currentIndex + 1
    const start = Math.max(0, end - n)
    return this.candlesWs.slice(start, end)
  }
}

export function runBacktest(cfg: RunBacktestConfig): BacktestResult {
  return new BacktestRunner(cfg).run()
}
