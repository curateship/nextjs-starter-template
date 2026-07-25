import type { CandleWsEvent } from "@nktkas/hyperliquid"

import { computeBacktestStats } from "@/lib/backtest/stats"
import {
  MAX_TIMELINE_EVENTS,
  type BacktestCosts,
  type BacktestFill,
  type BacktestHalt,
  type BacktestResult,
  type BacktestTimelineEvent,
  type BacktestTrade,
} from "@/lib/backtest/types"
import {
  automationTakeProfitPct,
  type AutomationConfig,
} from "@/lib/strategies/strategy-config"
import type { CandleInterval, HistoryCandle } from "@/server/backtest/history"

import { diffOrders, type ExistingOrder } from "../order-differ"
import type {
  BrokerFill,
  DesiredOrder,
  Strategy,
  StrategyCtx,
  SharedWalletPortfolioControl,
} from "../strategies/contract"
import { SharedWalletPortfolio } from "../shared-wallet-portfolio"
import { BacktestBroker } from "./broker"

export type RunBacktestConfig = {
  strategy: Strategy<never, unknown>
  params: AutomationConfig
  /** Ascending candles including warmup history before simStartMs. */
  candles: HistoryCandle[]
  /** Trading begins on the first candle whose open time is ≥ this. */
  simStartMs: number
  startingEquity: number
  market: string
  interval: CandleInterval
  /** Fee/slippage assumptions in bps. */
  costs: BacktestCosts
  /** Shared only by synchronized basket runs on one wallet. */
  sharedWalletPortfolio?: SharedWalletPortfolioControl
  /**
   * The automation's higher-timeframe series (ascending, with its own
   * warmup). Served through ctx.candles(interval) with a strict
   * closed-before-now cursor so the strategy can never see a future candle.
   */
  htfCandles?: { interval: CandleInterval; candles: HistoryCandle[] }
}

type PendingFill = { fill: BrokerFill; purpose: string; cloid: string }

/** Round to micro precision so stored equity/JSON stays free of float noise. */
const round = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * Max pauses when walking one bar's price path. It only needs to exceed the
 * number of distinct resting-order + exit-trigger prices a bar can cross (a DCA
 * ladder allows up to 20 rungs plus its stop), and each pause strictly advances
 * toward the target, so the loop always terminates well under this.
 */
const MAX_PATH_PAUSES = 64

/**
 * Replays historical candles through a real strategy with the same
 * desiredOrders → diff → place/cancel loop as the live BotRunner.
 * Fully deterministic: identical inputs yield an identical result. Each bar is
 * walked as an OHLC price path so intrabar stops and limit fills are honored,
 * pausing at declared exit-trigger levels so TP/SL fills happen at their
 * trigger price rather than the bar's extreme.
 */
class BacktestRunner {
  private readonly strategy: Strategy<never, unknown>
  private readonly params: AutomationConfig
  private readonly candlesNum: HistoryCandle[]
  private readonly candlesWs: CandleWsEvent[]
  private readonly simStartMs: number
  private readonly startingEquity: number
  private readonly market: string
  private readonly sharedWalletPortfolio?: SharedWalletPortfolioControl

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

  // Replay tape: order/protection/strategy deltas, recorded once per bar.
  private readonly timeline: BacktestTimelineEvent[] = []
  private timelineTruncated = false
  /** What the tape currently shows resting, keyed by purpose. */
  private readonly loggedOrders = new Map<
    string,
    { side: "buy" | "sell"; px: number; sz: number }
  >()
  /** Resting orders that filled since the last tape entry. */
  private readonly barFilledOrders = new Map<
    string,
    { px: number; sz: number }
  >()
  private prevStopPx: number | null = null
  private prevTpPx: number | null = null
  private prevSnapshotJson = "null"

  // Round-trip tracking, driven off fill deltas.
  private legSzi = 0
  /**
   * Open buys as lots (a DCA rung each), newest last. A reduce sells them off
   * newest-first, so each closed lot books a round trip at its OWN real buy
   * price rather than the blended average.
   */
  private lots: Array<{
    entryTime: number
    price: number
    qty: number
    buyFee: number
  }> = []

  // Risk runtime, mirroring BotRunner.
  private dailyRealizedPnl = 0
  private dailyPnlDate: string
  private consecutiveLosses = 0
  private peakEquity: number
  private halt: BacktestHalt = { kind: null, reason: null }
  private stopped = false

  // Simulated clock/price for the current path step.
  private now = 0
  private price = 0
  private currentIndex = 0
  private cloidSeq = 0
  private htfInterval: CandleInterval | null = null
  private htfCandlesWs: CandleWsEvent[] = []
  private htfCursor = 0

  constructor(cfg: RunBacktestConfig) {
    this.strategy = cfg.strategy
    this.params = cfg.params
    this.candlesNum = cfg.candles
    this.simStartMs = cfg.simStartMs
    this.startingEquity = cfg.startingEquity
    this.market = cfg.market
    this.sharedWalletPortfolio = cfg.sharedWalletPortfolio
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

    this.htfInterval = cfg.htfCandles?.interval ?? null
    this.htfCandlesWs = (cfg.htfCandles?.candles ?? []).map((c) => ({
      t: c.t,
      T: c.T,
      s: cfg.market,
      i: cfg.htfCandles!.interval,
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
    this.begin()

    for (let i = 0; i < this.candlesNum.length; i += 1) {
      const candle = this.candlesNum[i]
      // Warmup bars only feed the indicator window; no trading yet.
      if (candle.t < this.simStartMs) continue
      this.processBarOpenPath(i)
      this.processBarCloseSignal(i)
      this.processBarCloseOrders(i)
    }

    return this.result()
  }

  begin() {
    if (this.equityCurve.length === 0) {
      this.equityCurve.push({ t: this.simStartMs, eq: this.startingEquity })
    }
  }

  processBarOpenPath(index: number) {
    this.currentIndex = index
    const candle = this.candlesNum[index]
    if (!candle || candle.t < this.simStartMs) return
    const szi = Number(this.broker.positionState()?.szi ?? 0)
    const path =
      szi < 0 ? [candle.o, candle.h, candle.l] : [candle.o, candle.l, candle.h]
    this.step(path[0], candle.t, null)
    this.stepThrough(path[1], candle.t, null)
    this.stepThrough(path[2], candle.t, null)
  }

  processBarCloseSignal(index: number) {
    this.currentIndex = index
    const candle = this.candlesNum[index]
    const ws = this.candlesWs[index]
    if (!candle || !ws || candle.t < this.simStartMs) return
    this.stepThroughToClose(candle.c, candle.T)
    this.price = candle.c
    this.now = candle.T
    this.broker.setPrice(candle.c)
    if (!this.stopped) {
      this.broker.matchBar(candle.c)
      this.drainFills()
      this.strategy.onCandleClose?.(
        this.ctx(),
        this.params as never,
        ws as never
      )
    }
    this.drainFills()
  }

  private stepThroughToClose(target: number, time: number) {
    for (let guard = 0; guard < MAX_PATH_PAUSES && !this.stopped; guard += 1) {
      const next = this.nextPauseLevel(this.price, target)
      if (next === null) break
      this.step(next, time, null)
    }
  }

  /**
   * The prices where something can happen between `from` and `target`: every
   * resting order's limit price plus the strategy's exit triggers. Pausing here
   * fills a ladder rung by rung, so the position — and the stop derived from its
   * average — builds up as price arrives, instead of the whole ladder filling at
   * the bar's extreme and the stop booking there (which faked huge losses on a
   * one-candle crash). Returns the nearest such level strictly between the two,
   * or null when the path can run straight to the target.
   */
  private nextPauseLevel(from: number, target: number): number | null {
    const rising = target > from
    let next: number | null = null
    const consider = (level: number) => {
      if (!Number.isFinite(level)) return
      if (rising ? level <= from || level >= target : level >= from || level <= target) {
        return
      }
      if (next === null || (rising ? level < next : level > next)) next = level
    }
    for (const level of this.strategy.exitTriggers?.(this.ctx(), this.params as never) ?? []) {
      consider(level)
    }
    for (const order of this.openOrders.values()) {
      consider(Number(order.px ?? 0))
    }
    return next
  }

  processBarCloseOrders(index: number) {
    this.currentIndex = index
    const candle = this.candlesNum[index]
    if (!candle || candle.t < this.simStartMs) return
    this.evaluate()
    this.drainFills()
    this.recordTimeline(candle)
    this.equityCurve.push({
      t: candle.T,
      eq: round(this.broker.equity(candle.c)),
    })
  }

  /**
   * Appends this bar's deltas to the replay tape. Runs once per bar after
   * orders settle, so the tape shows end-of-bar state; orders placed and
   * filled within a single bar never rest visibly and are skipped (their
   * fills are already in `fills`).
   */
  private recordTimeline(candle: HistoryCandle) {
    const t = candle.t

    // Resting-order deltas vs what the tape already shows.
    for (const [purpose, order] of this.openOrders) {
      const px = Number(order.px ?? 0)
      const sz = Number(order.remainingSz)
      const logged = this.loggedOrders.get(purpose)
      if (
        !logged ||
        logged.px !== px ||
        logged.sz !== sz ||
        logged.side !== order.side
      ) {
        this.pushTimelineEvent({
          t,
          k: "order",
          op: logged ? "move" : "place",
          purpose,
          side: order.side,
          px,
          sz,
        })
        this.loggedOrders.set(purpose, { side: order.side, px, sz })
      }
    }
    for (const [purpose, logged] of this.loggedOrders) {
      if (this.openOrders.has(purpose)) continue
      const filled = this.barFilledOrders.get(purpose)
      this.pushTimelineEvent({
        t,
        k: "order",
        op: filled ? "fill" : "cancel",
        purpose,
        side: logged.side,
        px: filled?.px ?? logged.px,
        sz: filled?.sz ?? logged.sz,
      })
      this.loggedOrders.delete(purpose)
    }
    this.barFilledOrders.clear()

    // TP/stop levels, classified against the close: the stop sits on the
    // adverse side of the current price, the take-profit on the winning side.
    const szi = Number(this.broker.positionState()?.szi ?? 0)
    let stopPx: number | null = null
    let tpPx: number | null = null
    if (szi !== 0) {
      const levels =
        this.strategy.exitTriggers?.(this.ctx(false), this.params as never) ??
        []
      for (const level of levels) {
        if (!Number.isFinite(level)) continue
        const below = level < candle.c
        if ((szi > 0 && below) || (szi < 0 && !below)) stopPx = level
        else tpPx = level
      }
    }
    if (stopPx !== this.prevStopPx || tpPx !== this.prevTpPx) {
      this.pushTimelineEvent({ t, k: "protect", stopPx, tpPx })
      this.prevStopPx = stopPx
      this.prevTpPx = tpPx
    }

    // Strategy-owned replay state (the DCA ladder), on change only.
    const snapshot =
      this.strategy.snapshot?.(this.ctx(false), this.params as never) ?? null
    const json = JSON.stringify(snapshot) ?? "null"
    if (json !== this.prevSnapshotJson) {
      this.prevSnapshotJson = json
      const qfl = snapshot?.qfl
      this.pushTimelineEvent({
        t,
        k: "qfl",
        base: qfl?.base ?? null,
        stopPx: qfl?.stopPx ?? null,
        rungs: qfl?.rungs ?? [],
      })
    }
  }

  private pushTimelineEvent(event: BacktestTimelineEvent) {
    if (this.timeline.length >= MAX_TIMELINE_EVENTS) {
      this.timelineTruncated = true
      return
    }
    this.timeline.push(event)
  }

  result(): BacktestResult {
    const pos = this.broker.positionState()
    const openPosition = pos
      ? {
          side: (Number(pos.szi) > 0 ? "long" : "short") as "long" | "short",
          szi: Number(pos.szi),
          entryPx: Number(pos.entryPx),
          entryTime: this.lots[0]?.entryTime ?? this.now,
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
    stats.warnings = this.credibilityWarnings()

    return {
      equityCurve: this.equityCurve,
      trades: this.trades,
      fills: this.fills,
      openPosition,
      stats,
      timeline: {
        events: this.timeline,
        truncated: this.timelineTruncated || undefined,
      },
    }
  }

  /**
   * Automatic tripwires that fire regardless of who is looking. Each one is a
   * pattern that historically meant "this result is lying" — the July 2026
   * TP-fill bug was visible for weeks in exactly these numbers and nobody
   * checked. Now every run checks itself.
   */
  private credibilityWarnings(): string[] {
    const warnings: string[] = []

    // A win can't beat the take-profit on a 24/7 market: the TP fires first.
    // If the average winner exceeds it, the fill model or data is broken.
    // Each strategy kind declares its own TP bound (DCA's sits above the
    // average entry, so the same logic holds).
    const tp = automationTakeProfitPct(this.params)
    if (tp) {
      const wins = this.trades.filter((t) => t.pnl > 0)
      if (wins.length >= 10) {
        const avgWin =
          wins.reduce((sum, t) => sum + t.returnPct, 0) / wins.length
        if (avgWin > tp) {
          warnings.push(
            `Average winning trade (${avgWin.toFixed(2)}%) exceeds the ${tp}% take-profit — fills are better than reality allows. Do not trust this result.`
          )
        }
      }
    }

    // The sim has no liquidation: equity at or below zero means a real
    // account was wiped and everything after that point is fiction.
    if (this.equityCurve.some((p) => p.eq <= 0)) {
      warnings.push(
        "Equity went to zero or below — a real account would have been liquidated; results past that point are fiction."
      )
    } else if (
      this.trades.some((t) => t.returnPct <= -100) ||
      this.equityCurve.some((p) => p.eq < this.startingEquity * 0.05)
    ) {
      warnings.push(
        "The account came within 5% of total wipeout (or a single trade lost ≥100% of its notional). Liquidation is not modeled — treat this result as unreliable."
      )
    }

    return warnings
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
    // Re-read the levels after every pause: a fill there can open or close the
    // position, add the stop that a fresh entry needs, or move an anchor —
    // changing (or clearing) what remains between here and the target.
    for (let guard = 0; guard < MAX_PATH_PAUSES && !this.stopped; guard += 1) {
      const next = this.nextPauseLevel(this.price, target)
      if (next === null) break
      this.step(next, time, null)
    }
    this.step(target, time, closingCandle)
  }

  private step(
    price: number,
    time: number,
    closingCandle: CandleWsEvent | null
  ) {
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

    const desired = this.strategy.desiredOrders(
      this.ctx(),
      this.params as never
    )
    const actions = diffOrders(desired, [...this.openOrders.values()])
    for (const action of actions) {
      if (action.kind === "cancel" || action.kind === "replace") {
        this.cancelOrder(action.existing)
      }
      if (action.kind === "place" || action.kind === "replace") {
        this.placeOrder(action.desired)
      }
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
        // A resting order the tape shows just filled — close its line as a
        // fill, not a cancel, when the bar's deltas are recorded.
        this.barFilledOrders.set(order.purpose, {
          px: Number(fill.px),
          sz: Number(fill.sz),
        })
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
    // Peak equity stays for the stats; the automated risk stops are retired.
    const equity = this.broker.equity(this.price)
    if (equity > this.peakEquity) this.peakEquity = equity
  }

  /** Builds round trips from fill deltas — one per lot (rung) closed. */
  private recordTrade(fill: BrokerFill) {
    const sz = Number(fill.sz)
    const px = Number(fill.px)
    const fee = Number(fill.fee)
    const delta = fill.side === "buy" ? sz : -sz
    const before = this.legSzi
    const raw = before + delta
    // Snap a position that nets to within dust of flat to exactly flat. Summing
    // many laddered rung fills leaves a residue like 1e-15 that would otherwise
    // read as a phantom open lot.
    const after =
      Math.abs(raw) < 1e-6 * Math.max(Math.abs(before), Math.abs(delta)) ? 0 : raw
    this.legSzi = after

    // Opening or scaling in: remember this buy as its own lot (rung).
    if (before === 0 || Math.sign(delta) === Math.sign(before)) {
      this.lots.push({ entryTime: fill.time, price: px, qty: sz, buyFee: fee })
      return
    }

    // Reducing/closing/flipping: sell lots off newest-first, booking each as its
    // own round trip at that lot's real buy price. `avgPx` records where the
    // whole position's average sat as this piece closed (for the chart's line).
    const side: "long" | "short" = before > 0 ? "long" : "short"
    const sideSign = before > 0 ? 1 : -1
    const avgPx = this.lotsAverage()
    let toClose = Math.min(Math.abs(delta), Math.abs(before))
    while (toClose > 1e-12 && this.lots.length > 0) {
      const lot = this.lots[this.lots.length - 1]
      const q = Math.min(toClose, lot.qty)
      const gross = (px - lot.price) * q * sideSign
      const buyFeeShare = lot.qty > 0 ? (lot.buyFee * q) / lot.qty : 0
      const sellFeeShare =
        Math.abs(delta) > 0 ? (fee * q) / Math.abs(delta) : 0
      const pnl = gross - buyFeeShare - sellFeeShare
      this.cumPnl += pnl
      const entryNotional = lot.price * q
      this.trades.push({
        n: this.trades.length + 1,
        side,
        entryTime: lot.entryTime,
        entryPx: lot.price,
        exitTime: fill.time,
        exitPx: px,
        qty: q,
        pnl: round(pnl),
        returnPct: entryNotional > 0 ? (pnl / entryNotional) * 100 : 0,
        cumPnl: round(this.cumPnl),
        avgPx: round(avgPx),
      })
      lot.qty -= q
      lot.buyFee -= buyFeeShare
      if (lot.qty <= 1e-12) this.lots.pop()
      toClose -= q
    }

    // Flipped through zero — the leftover opens a fresh lot the other way. Carry
    // the opening side's share of this fill's fee onto that new lot: the close
    // above only booked the fee for the portion it closed (q/|delta|), so the
    // rest belongs to what just opened. Without this the flip's opening fee is
    // silently dropped and the backtest overstates P&L. (Long-only DCA never
    // flips; this is for reverse/short strategies.)
    if (after !== 0 && Math.sign(after) !== Math.sign(before)) {
      const openFee =
        Math.abs(delta) > 0 ? (fee * Math.abs(after)) / Math.abs(delta) : 0
      this.lots = [
        {
          entryTime: fill.time,
          price: px,
          qty: Math.abs(after),
          buyFee: openFee,
        },
      ]
    } else if (after === 0) {
      this.lots = []
    }
  }

  /** The open position's blended average price across all held lots. */
  private lotsAverage(): number {
    let notional = 0
    let qty = 0
    for (const lot of this.lots) {
      notional += lot.price * lot.qty
      qty += lot.qty
    }
    return qty > 0 ? notional / qty : 0
  }

  /**
   * @param report Whether to report this market's equity to the shared-wallet portfolio
   *   coordinator. True for the strategy callbacks that drive the run; false
   *   for read-only recording (exitTriggers/snapshot in recordTimeline), so
   *   observing the tape can never shift a portfolio sibling's exposure math.
   */
  private ctx(report = true): StrategyCtx<unknown> {
    const localEquity = this.broker.equity(this.price)
    if (report) {
      this.sharedWalletPortfolio?.reportEquity?.(
        this.market,
        localEquity,
        this.startingEquity
      )
    }
    return {
      market: this.market,
      mid: String(this.price),
      candles: (interval, n) =>
        this.htfInterval !== null && interval === this.htfInterval
          ? this.htfWindowCandles(n)
          : this.windowCandles(n),
      position: this.broker.positionState(),
      equity: String(this.sharedWalletPortfolio?.equity?.(localEquity) ?? localEquity),
      startingEquity: String(this.startingEquity),
      sharedWalletPortfolio: this.sharedWalletPortfolio,
      state: this.strategyState,
      setState: (next) => {
        this.strategyState = next
      },
      // Strategy events land on the replay tape, stamped at the bar's open
      // time so they line up with the candles (fills are stamped the same way).
      emit: (type, message) =>
        this.pushTimelineEvent({
          t: this.candlesNum[this.currentIndex]?.t ?? this.now,
          k: "note",
          type,
          message,
        }),
      now: this.now,
    }
  }

  private windowCandles(n: number): CandleWsEvent[] {
    const end = this.currentIndex + 1
    const start = Math.max(0, end - n)
    return this.candlesWs.slice(start, end)
  }

  /**
   * Higher-timeframe candles closed at or before the sim clock. `now` only
   * moves forward, so a monotone cursor keeps this O(1) per call — and the
   * strategy can never be handed a candle from its own future.
   */
  private htfWindowCandles(n: number): CandleWsEvent[] {
    while (
      this.htfCursor < this.htfCandlesWs.length &&
      this.htfCandlesWs[this.htfCursor].T <= this.now
    ) {
      this.htfCursor += 1
    }
    const start = Math.max(0, this.htfCursor - n)
    return this.htfCandlesWs.slice(start, this.htfCursor)
  }
}

export function runBacktest(cfg: RunBacktestConfig): BacktestResult {
  return new BacktestRunner(cfg).run()
}

/**
 * A DCA basket shares one wallet capped at 100% of it — no leverage — so the
 * markets compete for one real balance instead of each getting its own private
 * account. Once the wallet is committed, a further market's crack is skipped
 * until room frees up, exactly like a single live account.
 */
const DCA_PORTFOLIO_MAX_PCT = 100

/**
 * Called every ~1% of the way through a portfolio replay with the fraction done
 * (0..1). The runner awaits it, so a handler can flush a progress write to the
 * DB — the replay is one long synchronous block otherwise, so without this the
 * whole basket shows no movement until it finishes all at once.
 */
export type PortfolioProgress = (fraction: number) => void | Promise<void>

/** Replays a DCA basket across markets on one shared $-wallet (see above). */
export async function runDcaPortfolioBacktests(
  configs: RunBacktestConfig[],
  onProgress?: PortfolioProgress
): Promise<Map<string, BacktestResult>> {
  if (configs.length === 0) return new Map()
  return runPortfolioBacktests(configs, DCA_PORTFOLIO_MAX_PCT, onProgress)
}

/**
 * The shared engine behind both portfolio runners: every market runs on one
 * clock, sizing off one shared equity number and reserving from one exposure
 * bank capped at `maximumPct`.
 */
async function runPortfolioBacktests(
  configs: RunBacktestConfig[],
  maximumPct: number,
  onProgress?: PortfolioProgress
): Promise<Map<string, BacktestResult>> {
  const portfolio = new SharedWalletPortfolio(
    maximumPct,
    configs.map((config) => config.market)
  )
  const runners = configs.map(
    (config) => new BacktestRunner({ ...config, sharedWalletPortfolio: portfolio })
  )
  for (const runner of runners) runner.begin()

  const times = [
    ...new Set(
      configs.flatMap((config) =>
        config.candles
          .filter((candle) => candle.t >= config.simStartMs)
          .map((candle) => candle.t)
      )
    ),
  ].sort((a, b) => a - b)
  const indexes = configs.map(
    (config) =>
      new Map(config.candles.map((candle, index) => [candle.t, index]))
  )

  // Report progress ~100 times across the replay (and yield so the write lands).
  const reportEvery = Math.max(1, Math.floor(times.length / 100))
  for (let ti = 0; ti < times.length; ti += 1) {
    const time = times[ti]
    const due = runners.flatMap((runner, runnerIndex) => {
      const index = indexes[runnerIndex].get(time)
      return index === undefined
        ? []
        : [{ runner, index, market: configs[runnerIndex].market }]
    })
    for (const item of due) item.runner.processBarOpenPath(item.index)
    // Every market submits its close candidate before any market can reserve.
    for (const item of due) item.runner.processBarCloseSignal(item.index)
    const dueMarkets = new Set(due.map((item) => item.market))
    for (const config of configs) {
      if (!dueMarkets.has(config.market)) portfolio.observe(config.market, time)
    }
    for (const item of due) item.runner.processBarCloseOrders(item.index)
    if (onProgress && ti % reportEvery === 0) {
      await onProgress((ti + 1) / times.length)
    }
  }

  const peakExposurePct = round(portfolio.peakReservedPct())
  return new Map(
    runners.map((runner, index) => {
      const result = runner.result()
      return [
        configs[index].market,
        {
          ...result,
          portfolio: {
            sharedAccount: true as const,
            marketCount: runners.length,
            peakExposurePct,
          },
        },
      ]
    })
  )
}
