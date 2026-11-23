/**
 * Client-side execution engine for manual practice sessions: the user draws
 * long/short position boxes on the replay chart, and this engine trades them
 * as history plays forward. The entry line is a waiting order, the far red
 * edge is the stop and the far green edge is the take-profit. A waiting order
 * rests until price reaches it or its box is deleted.
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
  /** Total open notional ÷ equity; 0 when flat. */
  leverage: number
  pendingOrders: number
  /** Every open position — each drawn box trades independently. */
  positions: {
    boxId: string
    side: "long" | "short"
    entryPx: number
    qty: number
    stop: number
    target: number
  }[]
  /**
   * Waiting orders, for the on-chart "waiting" lines — and so the session can
   * tell which boxes are still resting orders rather than filled trades.
   */
  pendingEntries: { boxId: string; side: "long" | "short"; px: number }[]
  halted: boolean
  haltReason: string | null
}

export class ManualSession {
  private readonly startingEquity: number
  private readonly riskPct: number
  private readonly costs: BacktestCosts

  private cash: number
  private orders = new Map<string, ManualOrder>()
  /** Open positions, keyed by their box — every drawn box trades on its own. */
  private positions = new Map<string, ManualOpenPosition>()
  private trades: BacktestTrade[] = []
  private fills: BacktestFill[] = []
  private equityCurve: BacktestEquityPoint[] = []
  private events: BacktestTimelineEvent[] = []
  private eventsTruncated = false
  /** Boxes the engine used up (a closed position) — the UI removes them. */
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
   * the live stop/TP while their position is open), and deleting a box either
   * cancels its waiting order or, if it already filled, closes the position at
   * market.
   *
   * A waiting order rests until price reaches it or its box is deleted. It used
   * to expire when the tape walked past the box's right edge, which read as a
   * feature and behaved as a bug: a clicked box is a couple of hours wide, the
   * tape runs 60 candles a real second by default, and price seldom returns to
   * an entry inside that window — so orders were cancelled unfilled, in about a
   * second and a half of watching, over and over. Deleting the box is the
   * cancel; nothing else takes an order away.
   */
  syncBoxes(boxes: ChartPosition[]): void {
    const seen = new Set<string>()
    for (const box of boxes) {
      seen.add(box.id)
      if (this.consumed.includes(box.id)) continue

      const openPosition = this.positions.get(box.id)
      if (openPosition) {
        if (
          openPosition.stop !== box.stop ||
          openPosition.target !== box.target
        ) {
          openPosition.stop = box.stop
          openPosition.target = box.target
          this.recordProtect(openPosition)
        }
        continue
      }

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
        }
        this.orders.set(box.id, order)
        this.recordOrder(order, "place")
        continue
      }
      const moved =
        existing.entry !== box.entry ||
        existing.stop !== box.stop ||
        existing.target !== box.target
      if (moved) {
        existing.entry = box.entry
        existing.stop = box.stop
        existing.target = box.target
        this.recordOrder(existing, "move")
      }
    }

    for (const [boxId, order] of this.orders) {
      if (!seen.has(boxId)) {
        this.orders.delete(boxId)
        this.recordOrder(order, "cancel")
      }
    }

    // Deleting an open position's box is the user's market exit for it.
    for (const boxId of [...this.positions.keys()]) {
      if (!seen.has(boxId)) this.closePositionById(boxId, "manual:close")
    }
  }

  /** Advances the simulation by one candle. Forward-only. */
  processBar(candle: HistoryCandle): void {
    this.barsProcessed += 1
    if (this.firstClose === null) this.firstClose = candle.c

    if (!this.halted) {
      for (const position of [...this.positions.values()]) {
        this.checkExit(position, candle, true)
      }
      const entered = this.checkEntries(candle)
      // Entry and exit inside the same candle: assume the adverse path —
      // the stop is checked first, never the optimistic read.
      for (const boxId of entered) {
        const position = this.positions.get(boxId)
        if (position) this.checkExit(position, candle, false)
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
    let notional = 0
    if (mark !== null) {
      for (const position of this.positions.values()) {
        notional += position.qty * mark
      }
    }
    return {
      equity,
      openPnl,
      realizedPnl: this.trades.reduce((sum, trade) => sum + trade.pnl, 0),
      tradeCount: this.trades.length,
      wins: this.trades.filter((trade) => trade.pnl > 0).length,
      maxDrawdownPct: this.maxDrawdownPct,
      leverage: equity > 0 && notional > 0 ? notional / equity : 0,
      pendingOrders: this.orders.size,
      positions: [...this.positions.values()].map((position) => ({
        boxId: position.boxId,
        side: position.side,
        entryPx: position.entryPx,
        qty: position.qty,
        stop: position.stop,
        target: position.target,
      })),
      pendingEntries: [...this.orders.values()].map((order) => ({
        boxId: order.boxId,
        side: order.side,
        px: order.entry,
      })),
      halted: this.halted,
      haltReason: this.haltReason,
    }
  }

  /**
   * Ends the session: any open position is closed at the last processed price,
   * and everything is totaled into a normal BacktestResult.
   */
  finalize(): BacktestResult {
    for (const boxId of [...this.positions.keys()]) {
      this.closePositionById(boxId, "manual:close")
    }
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

  /**
   * Fills EVERY waiting order the candle triggers — each drawn box trades
   * independently. An entry fills at its own price when the bar's range
   * trades through it; a bar that gapped past the entry at the open fills at
   * the open instead. Sizing risks the chosen percent of current cash, so
   * each additional concurrent trade naturally sizes off what's left.
   */
  private checkEntries(candle: HistoryCandle): string[] {
    const entered: string[] = []
    if (this.halted) return entered
    for (const [boxId, order] of this.orders) {
      const fillPx = this.entryFillPrice(order.entry, candle)
      if (fillPx === null) continue

      const equity = this.cash
      if (!(equity > 0)) break
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
      const position: ManualOpenPosition = {
        boxId,
        side: order.side,
        qty,
        entryPx: fillPx,
        entryTime: candle.t,
        entryFee: fee,
        stop: order.stop,
        target: order.target,
      }
      this.positions.set(boxId, position)
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
      this.recordProtect(position, candle.t)
      entered.push(boxId)
    }
    return entered
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
   * Checks one position's exits inside this candle, stop before target.
   * `allowGap` is false when the position was opened this same bar — the open
   * price happened before the entry, so gap-at-open branches don't apply.
   */
  private checkExit(
    position: ManualOpenPosition,
    candle: HistoryCandle,
    allowGap: boolean
  ): void {
    if (!this.positions.has(position.boxId)) return
    const long = position.side === "long"

    const stopGapped = long
      ? candle.o <= position.stop
      : candle.o >= position.stop
    const stopTouched = long
      ? candle.l <= position.stop
      : candle.h >= position.stop
    if (allowGap && stopGapped) {
      // Gapped through the stop: exit at the open, not the stop — honest slippage.
      this.exitPosition(position, candle.o, candle.t, "taker", "manual:sl")
      return
    }
    if (stopTouched) {
      this.exitPosition(position, position.stop, candle.t, "taker", "manual:sl")
      return
    }

    const targetGapped = long
      ? candle.o >= position.target
      : candle.o <= position.target
    const targetTouched = long
      ? candle.h >= position.target
      : candle.l <= position.target
    if (allowGap && targetGapped) {
      // A favorable gap on a resting limit really does fill at the open.
      this.exitPosition(position, candle.o, candle.t, "maker", "manual:tp")
      return
    }
    if (targetTouched) {
      this.exitPosition(
        position,
        position.target,
        candle.t,
        "maker",
        "manual:tp"
      )
    }
  }

  /** Market-closes one position at the last processed price. */
  private closePositionById(boxId: string, purpose: string): void {
    const position = this.positions.get(boxId)
    if (!position) return
    if (this.lastClose === null) {
      // Nothing has been processed yet, so nothing can really be open.
      this.positions.delete(boxId)
      return
    }
    this.exitPosition(position, this.lastClose, this.lastTimeMs, "taker", purpose)
  }

  private exitPosition(
    position: ManualOpenPosition,
    px: number,
    t: number,
    feeKind: "taker" | "maker",
    purpose: string
  ): void {
    if (!this.positions.delete(position.boxId)) return
    const direction = position.side === "long" ? 1 : -1
    const gross = (px - position.entryPx) * position.qty * direction
    const fee = this.fee(position.qty * px, feeKind)
    this.cash += gross - fee

    const pnl = gross - position.entryFee - fee
    this.cumPnl += pnl
    const notional = position.entryPx * position.qty
    this.trades.push({
      n: this.trades.length + 1,
      side: position.side,
      entryTime: position.entryTime,
      entryPx: position.entryPx,
      exitTime: t,
      exitPx: px,
      qty: position.qty,
      pnl,
      returnPct: notional > 0 ? (pnl / notional) * 100 : 0,
      cumPnl: this.cumPnl,
    })
    this.fills.push({
      t,
      side: position.side === "long" ? "sell" : "buy",
      px,
      sz: position.qty,
      fee,
      closedPnl: gross,
      purpose,
    })
    // The replay tape's protect line follows whichever position remains (or
    // clears when the last one closes).
    const remaining = [...this.positions.values()]
    const nextProtect = remaining[remaining.length - 1]
    if (nextProtect) this.recordProtect(nextProtect, t)
    else this.recordEvent({ t, k: "protect", stopPx: null, tpPx: null })
    this.consumed.push(position.boxId)
  }

  private halt(candle: HistoryCandle): void {
    this.halted = true
    this.haltReason = "Wallet depleted — equity reached zero."
    for (const position of [...this.positions.values()]) {
      this.exitPosition(position, candle.c, candle.T, "taker", "manual:close")
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
    let total = 0
    for (const position of this.positions.values()) {
      const direction = position.side === "long" ? 1 : -1
      total += (mark - position.entryPx) * position.qty * direction
    }
    return total
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

  private recordProtect(position: ManualOpenPosition, atMs?: number): void {
    this.recordEvent({
      t: atMs ?? this.lastTimeMs,
      k: "protect",
      stopPx: position.stop,
      tpPx: position.target,
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
