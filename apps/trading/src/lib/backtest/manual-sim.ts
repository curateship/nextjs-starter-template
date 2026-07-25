/**
 * Client-side execution engine for manual practice sessions: the user draws
 * long/short position boxes on the replay chart, and this engine trades them
 * as history plays forward. The entry line is a waiting order, the far red
 * edge is the stop, the far green edge is the take-profit, and the box's
 * right edge is the order's expiry.
 *
 * Forward-only and conservative: gaps fill at the open (honest slippage) and
 * when a single candle contains both the stop and the target, the stop wins.
 */

import type { ChartPosition } from "@/lib/trading/chart-positions"
import type { HistoryCandle } from "@/server/backtest/history"

import { computeBacktestStats } from "./stats"
import {
  MAX_TIMELINE_EVENTS,
  type BacktestCosts,
  type BacktestEquityPoint,
  type BacktestFill,
  type BacktestResult,
  type BacktestTimelineEvent,
  type BacktestTrade,
} from "./types"

/** Notional ceiling as a multiple of equity — caps absurd tiny-stop sizing. */
export const MANUAL_MAX_LEVERAGE = 10

type ManualOrder = {
  boxId: string
  /** Tape purpose ("manual:b:0" → "Buy 1") — one resting line per order. */
  purpose: string
  side: "long" | "short"
  entry: number
  stop: number
  target: number
  /** Waiting-order expiry, ms — the box's right edge. */
  endMs: number
}

type ManualOpenPosition = {
  boxId: string
  side: "long" | "short"
  qty: number
  entryPx: number
  entryTime: number
  entryFee: number
  stop: number
  target: number
}

/** Live readout for the session HUD, computed at the last processed bar. */
export type ManualSessionSnapshot = {
  equity: number
  openPnl: number
  realizedPnl: number
  tradeCount: number
  wins: number
  maxDrawdownPct: number
  /** Open notional ÷ equity; 0 when flat. */
  leverage: number
  pendingOrders: number
  openPosition: { side: "long" | "short"; entryPx: number; qty: number } | null
  halted: boolean
  haltReason: string | null
}

export class ManualSession {
  private readonly startingEquity: number
  private readonly riskPct: number
  private readonly costs: BacktestCosts

  private cash: number
  private orders = new Map<string, ManualOrder>()
  private open: ManualOpenPosition | null = null
  private trades: BacktestTrade[] = []
  private fills: BacktestFill[] = []
  private equityCurve: BacktestEquityPoint[] = []
  private events: BacktestTimelineEvent[] = []
  private eventsTruncated = false
  /** Boxes the engine used up (expired, or closed) — the UI removes them. */
  private consumed: string[] = []
  private orderSeq = 0
  private halted = false
  private haltReason: string | null = null

  private prevClose: number | null = null
  private lastClose: number | null = null
  private lastTimeMs: number
  private firstClose: number | null = null
  private totalFees = 0
  private peakEquity: number
  private maxDrawdownPct = 0
  private cumPnl = 0

  constructor(opts: {
    simStartMs: number
    startingEquity: number
    riskPct: number
    costs: BacktestCosts
  }) {
    this.startingEquity = opts.startingEquity
    this.riskPct = opts.riskPct
    this.costs = opts.costs
    this.cash = opts.startingEquity
    this.lastTimeMs = opts.simStartMs
    this.peakEquity = opts.startingEquity
  }

  /** Bars processed so far — the session screen's "has this started" check. */
  barsProcessed = 0

  /**
   * Reconciles the engine with the current drawing set. Called on every
   * drawings commit: new boxes become waiting orders, edits move them (or move
   * the live stop/TP while their position is open), and deleting the open
   * position's box is the manual market close.
   */
  syncBoxes(positions: ChartPosition[]): void {
    const seen = new Set<string>()
    for (const box of positions) {
      seen.add(box.id)
      if (this.consumed.includes(box.id)) continue

      if (this.open?.boxId === box.id) {
        if (this.open.stop !== box.stop || this.open.target !== box.target) {
          this.open.stop = box.stop
          this.open.target = box.target
          this.recordProtect()
        }
        continue
      }

      const endMs = box.endTime * 1000
      const existing = this.orders.get(box.id)
      if (!existing) {
        if (this.halted) continue
        const purpose = `manual:${box.side === "long" ? "b" : "s"}:${this.orderSeq}`
        this.orderSeq += 1
        const order: ManualOrder = {
          boxId: box.id,
          purpose,
          side: box.side,
          entry: box.entry,
          stop: box.stop,
          target: box.target,
          endMs,
        }
        this.orders.set(box.id, order)
        this.recordOrder(order, "place")
        continue
      }
      const moved =
        existing.entry !== box.entry ||
        existing.stop !== box.stop ||
        existing.target !== box.target ||
        existing.endMs !== endMs
      if (moved) {
        existing.entry = box.entry
        existing.stop = box.stop
        existing.target = box.target
        existing.endMs = endMs
        this.recordOrder(existing, "move")
      }
    }

    for (const [boxId, order] of this.orders) {
      if (!seen.has(boxId)) {
        this.orders.delete(boxId)
        this.recordOrder(order, "cancel")
      }
    }

    // Deleting the open position's box is the user's market exit.
    if (this.open && !seen.has(this.open.boxId)) {
      this.closeOpenPosition("manual:close")
    }
  }

  /** Advances the simulation by one candle. Forward-only. */
  processBar(candle: HistoryCandle): void {
    this.barsProcessed += 1
    if (this.firstClose === null) this.firstClose = candle.c

    this.expireOrders(candle)
    if (!this.halted) {
      if (this.open) {
        this.checkExit(candle, true)
      }
      if (!this.open) {
        const entered = this.checkEntries(candle)
        // Entry and exit inside the same candle: assume the adverse path —
        // the stop is checked first, never the optimistic read.
        if (entered && this.open) this.checkExit(candle, false)
      }
    }

    this.prevClose = candle.c
    this.lastClose = candle.c
    this.lastTimeMs = candle.T

    const equity = this.cash + this.unrealized(candle.c)
    this.equityCurve.push({ t: candle.T, eq: equity })
    if (equity > this.peakEquity) this.peakEquity = equity
    if (this.peakEquity > 0) {
      const dd = ((this.peakEquity - equity) / this.peakEquity) * 100
      if (dd > this.maxDrawdownPct) this.maxDrawdownPct = dd
    }

    if (!this.halted && equity <= 0) this.halt(candle)
  }

  /** Boxes the engine used up since last drained; the UI deletes them. */
  /** Every fill so far — the session chart's entry/exit arrows. */
  listFills(): readonly BacktestFill[] {
    return this.fills
  }

  drainConsumedBoxes(): string[] {
    if (this.consumed.length === 0) return []
    const drained = this.consumed
    this.consumed = []
    return drained
  }

  snapshot(): ManualSessionSnapshot {
    const mark = this.lastClose
    const openPnl = mark === null ? 0 : this.unrealized(mark)
    const equity = this.cash + openPnl
    const notional =
      this.open && mark !== null ? this.open.qty * mark : 0
    return {
      equity,
      openPnl,
      realizedPnl: this.trades.reduce((sum, trade) => sum + trade.pnl, 0),
      tradeCount: this.trades.length,
      wins: this.trades.filter((trade) => trade.pnl > 0).length,
      maxDrawdownPct: this.maxDrawdownPct,
      leverage: equity > 0 && notional > 0 ? notional / equity : 0,
      pendingOrders: this.orders.size,
      openPosition: this.open
        ? {
            side: this.open.side,
            entryPx: this.open.entryPx,
            qty: this.open.qty,
          }
        : null,
      halted: this.halted,
      haltReason: this.haltReason,
    }
  }

  /**
   * Ends the session: any open position is closed at the last processed price,
   * and everything is totaled into a normal BacktestResult.
   */
  finalize(): BacktestResult {
    if (this.open) this.closeOpenPosition("manual:close")
    for (const order of this.orders.values()) {
      this.recordOrder(order, "cancel")
    }
    this.orders.clear()

    const stats = computeBacktestStats(this.trades, this.equityCurve, {
      startingEquity: this.startingEquity,
      fees: this.totalFees,
      firstClose: this.firstClose ?? 0,
      lastClose: this.lastClose ?? 0,
      halt: { kind: null, reason: this.haltReason },
    })
    return {
      equityCurve: this.equityCurve,
      trades: this.trades,
      fills: this.fills,
      openPosition: null,
      stats,
      timeline: {
        events: this.events,
        ...(this.eventsTruncated ? { truncated: true } : {}),
      },
    }
  }

  // ---- internals ----

  private expireOrders(candle: HistoryCandle): void {
    for (const [boxId, order] of this.orders) {
      if (candle.t > order.endMs) {
        this.orders.delete(boxId)
        this.consumed.push(boxId)
        this.recordOrder(order, "cancel", candle.t)
      }
    }
  }

  /**
   * Fills the first waiting order the candle triggers. The entry fills at its
   * own price when the bar's range trades through it; a bar that gapped past
   * the entry at the open fills at the open instead.
   */
  private checkEntries(candle: HistoryCandle): boolean {
    if (this.halted) return false
    for (const [boxId, order] of this.orders) {
      const fillPx = this.entryFillPrice(order.entry, candle)
      if (fillPx === null) continue

      const equity = this.cash
      if (!(equity > 0)) return false
      const stopDistance = Math.abs(fillPx - order.stop)
      if (!(stopDistance > 0) || !(fillPx > 0)) continue
      const riskUsd = (equity * this.riskPct) / 100
      const qty = Math.min(
        riskUsd / stopDistance,
        (MANUAL_MAX_LEVERAGE * equity) / fillPx
      )
      if (!(qty > 0)) continue

      const crossed = fillPx !== order.entry
      const fee = this.fee(qty * fillPx, crossed ? "taker" : "maker")
      this.cash -= fee
      this.orders.delete(boxId)
      this.open = {
        boxId,
        side: order.side,
        qty,
        entryPx: fillPx,
        entryTime: candle.t,
        entryFee: fee,
        stop: order.stop,
        target: order.target,
      }
      this.fills.push({
        t: candle.t,
        side: order.side === "long" ? "buy" : "sell",
        px: fillPx,
        sz: qty,
        fee,
        closedPnl: 0,
        purpose: order.purpose,
      })
      this.recordEvent({
        t: candle.t,
        k: "order",
        op: "fill",
        purpose: order.purpose,
        side: order.side === "long" ? "buy" : "sell",
        px: fillPx,
        sz: qty,
      })
      this.recordProtect(candle.t)
      return true
    }
    return false
  }

  /** The entry's fill price for this candle, or null when it doesn't trigger. */
  private entryFillPrice(entry: number, candle: HistoryCandle): number | null {
    if (candle.l <= entry && entry <= candle.h) return entry
    // Not in the bar's range, but the bar OPENED through it (a gap across the
    // entry between the previous close and this open): fill at the open.
    const from = this.prevClose
    if (from !== null && from !== candle.o) {
      const lo = Math.min(from, candle.o)
      const hi = Math.max(from, candle.o)
      if (lo <= entry && entry <= hi) return candle.o
    }
    return null
  }

  /**
   * Checks the open position's exits inside this candle, stop before target.
   * `allowGap` is false when the position was opened this same bar — the open
   * price happened before the entry, so gap-at-open branches don't apply.
   */
  private checkExit(candle: HistoryCandle, allowGap: boolean): void {
    const open = this.open
    if (!open) return
    const long = open.side === "long"

    const stopGapped = long ? candle.o <= open.stop : candle.o >= open.stop
    const stopTouched = long ? candle.l <= open.stop : candle.h >= open.stop
    if (allowGap && stopGapped) {
      // Gapped through the stop: exit at the open, not the stop — honest slippage.
      this.exitOpenPosition(candle.o, candle.t, "taker", "manual:sl")
      return
    }
    if (stopTouched) {
      this.exitOpenPosition(open.stop, candle.t, "taker", "manual:sl")
      return
    }

    const targetGapped = long ? candle.o >= open.target : candle.o <= open.target
    const targetTouched = long ? candle.h >= open.target : candle.l <= open.target
    if (allowGap && targetGapped) {
      // A favorable gap on a resting limit really does fill at the open.
      this.exitOpenPosition(candle.o, candle.t, "maker", "manual:tp")
      return
    }
    if (targetTouched) {
      this.exitOpenPosition(open.target, candle.t, "maker", "manual:tp")
    }
  }

  /** Market-closes the open position at the last processed price. */
  private closeOpenPosition(purpose: string): void {
    if (!this.open || this.lastClose === null) {
      // Nothing has been processed yet, so nothing can be open.
      this.open = null
      return
    }
    this.exitOpenPosition(this.lastClose, this.lastTimeMs, "taker", purpose)
  }

  private exitOpenPosition(
    px: number,
    t: number,
    feeKind: "taker" | "maker",
    purpose: string
  ): void {
    const open = this.open
    if (!open) return
    const direction = open.side === "long" ? 1 : -1
    const gross = (px - open.entryPx) * open.qty * direction
    const fee = this.fee(open.qty * px, feeKind)
    this.cash += gross - fee

    const pnl = gross - open.entryFee - fee
    this.cumPnl += pnl
    const notional = open.entryPx * open.qty
    this.trades.push({
      n: this.trades.length + 1,
      side: open.side,
      entryTime: open.entryTime,
      entryPx: open.entryPx,
      exitTime: t,
      exitPx: px,
      qty: open.qty,
      pnl,
      returnPct: notional > 0 ? (pnl / notional) * 100 : 0,
      cumPnl: this.cumPnl,
    })
    this.fills.push({
      t,
      side: open.side === "long" ? "sell" : "buy",
      px,
      sz: open.qty,
      fee,
      closedPnl: gross,
      purpose,
    })
    this.recordEvent({ t, k: "protect", stopPx: null, tpPx: null })
    this.consumed.push(open.boxId)
    this.open = null
  }

  private halt(candle: HistoryCandle): void {
    this.halted = true
    this.haltReason = "Wallet depleted — equity reached zero."
    if (this.open) {
      this.exitOpenPosition(candle.c, candle.T, "taker", "manual:close")
    }
    for (const [boxId, order] of this.orders) {
      this.orders.delete(boxId)
      this.consumed.push(boxId)
      this.recordOrder(order, "cancel", candle.T)
    }
    // The flattened equity replaces this bar's pre-halt reading.
    this.equityCurve[this.equityCurve.length - 1] = {
      t: candle.T,
      eq: this.cash,
    }
  }

  private unrealized(mark: number): number {
    if (!this.open) return 0
    const direction = this.open.side === "long" ? 1 : -1
    return (mark - this.open.entryPx) * this.open.qty * direction
  }

  private fee(notional: number, kind: "taker" | "maker"): number {
    const bps =
      kind === "taker" ? this.costs.takerFeeBps : this.costs.makerFeeBps
    const fee = (notional * bps) / 10_000
    this.totalFees += fee
    return fee
  }

  private recordOrder(
    order: ManualOrder,
    op: "place" | "move" | "cancel",
    atMs?: number
  ): void {
    this.recordEvent({
      t: atMs ?? this.lastTimeMs,
      k: "order",
      op,
      purpose: order.purpose,
      side: order.side === "long" ? "buy" : "sell",
      px: order.entry,
      sz: 0,
    })
  }

  private recordProtect(atMs?: number): void {
    this.recordEvent({
      t: atMs ?? this.lastTimeMs,
      k: "protect",
      stopPx: this.open?.stop ?? null,
      tpPx: this.open?.target ?? null,
    })
  }

  private recordEvent(event: BacktestTimelineEvent): void {
    if (this.events.length >= MAX_TIMELINE_EVENTS) {
      this.eventsTruncated = true
      return
    }
    this.events.push(event)
  }
}
