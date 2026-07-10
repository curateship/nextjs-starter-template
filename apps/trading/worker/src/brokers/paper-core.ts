import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/order-preview"

import { applyPaperFill, capReduceOnly } from "../paper-math"
import type { BrokerFill, DesiredOrder } from "../strategies/contract"
import type { Placement } from "./types"

export type RestingOrder = {
  cloid: string
  purpose: string
  side: "buy" | "sell"
  px: number
  remainingSz: number
  reduceOnly: boolean
}

/**
 * Cash / position / resting-order core shared by the simulated venues.
 * PaperBroker (live market data) and BacktestBroker (candle price path)
 * differ only in how taker fills are priced, what counts as crossing the
 * market, and which clock stamps fills.
 */
export abstract class SimulatedBroker {
  protected cash: number
  protected position: { szi: number; entryPx: number } | null = null
  protected orders = new Map<string, RestingOrder>()
  protected readonly takerFeeRate: number
  protected readonly makerFeeRate: number
  private readonly emitFill: (
    fill: BrokerFill,
    purpose: string,
    cloid: string
  ) => void

  constructor(options: {
    startingCash: number
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
    takerFeeRate?: number
    makerFeeRate?: number
  }) {
    this.cash = options.startingCash
    this.emitFill = options.onFill
    this.takerFeeRate = options.takerFeeRate ?? TAKER_FEE_RATE
    this.makerFeeRate = options.makerFeeRate ?? MAKER_FEE_RATE
  }

  /** Cloid prefix for synthetic orders, e.g. "paper" or "bt". */
  protected abstract readonly venueTag: string

  /** Fill timestamp source: wall clock live, bar clock in backtests. */
  protected abstract now(): number

  /** Would a limit at px execute against the current market? */
  protected abstract crossesMarket(side: "buy" | "sell", px: number): boolean

  /** Immediate taker execution at venue-specific pricing. */
  protected abstract fillTaker(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean
  ): Placement

  positionState(): { szi: string; entryPx: string } | null {
    if (!this.position || this.position.szi === 0) return null
    return {
      szi: String(this.position.szi),
      entryPx: String(this.position.entryPx),
    }
  }

  equity(mid: number): number {
    let value = this.cash
    if (this.position && this.position.szi !== 0 && mid > 0) {
      value += (mid - this.position.entryPx) * this.position.szi
    }
    return value
  }

  openOrderCount() {
    return this.orders.size
  }

  cancel(cloid: string): boolean {
    return this.orders.delete(cloid)
  }

  cancelAll() {
    this.orders.clear()
  }

  place(cloid: string, order: DesiredOrder): Placement {
    const sz = Number(order.sz)
    const px = order.px ? Number(order.px) : null
    if (!(sz > 0)) return { kind: "rejected", reason: "size must be positive" }

    if (order.orderType === "market" || order.tif === "Ioc") {
      return this.fillTaker(cloid, order.purpose, order.side, sz, order.reduceOnly)
    }

    if (px === null || !(px > 0)) {
      return { kind: "rejected", reason: "limit order needs a price" }
    }

    // A limit that would execute against the current price fills as a taker;
    // a post-only (Alo) that would cross is rejected instead.
    if (this.crossesMarket(order.side, px)) {
      if (order.tif === "Alo") {
        return { kind: "rejected", reason: "post-only order would cross" }
      }
      return this.fillTaker(cloid, order.purpose, order.side, sz, order.reduceOnly)
    }

    this.orders.set(cloid, {
      cloid,
      purpose: order.purpose,
      side: order.side,
      px,
      remainingSz: sz,
      reduceOnly: order.reduceOnly,
    })
    return { kind: "resting" }
  }

  /** Closes the whole position at market (taker, reduce-only). */
  flatten(purpose = "flatten"): Placement | null {
    if (!this.position || this.position.szi === 0) return null
    const side = this.position.szi > 0 ? "sell" : "buy"
    return this.fillTaker(
      `${this.venueTag}:${purpose}:${this.now()}`,
      purpose,
      side,
      Math.abs(this.position.szi),
      true
    )
  }

  /**
   * Caps a reduce-only order, prices it via pxFor (null = no liquidity),
   * then applies and emits the fill.
   */
  protected fillCapped(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean,
    feeRate: number,
    pxFor: (cappedSz: number) => number | null
  ): Placement {
    const capped = reduceOnly ? capReduceOnly(this.position, side, sz) : sz
    if (capped === null) {
      return { kind: "rejected", reason: "reduce-only does not reduce position" }
    }
    if (capped <= 0) return { kind: "rejected", reason: "nothing to reduce" }
    const px = pxFor(capped)
    if (px === null) {
      return { kind: "rejected", reason: "no book depth for market fill" }
    }
    this.applyFill(cloid, purpose, side, px, capped, feeRate)
    return { kind: "filled" }
  }

  /** Fills every resting order the given price has crossed, at its limit price (maker). */
  protected fillCrossedOrders(px: number) {
    for (const order of [...this.orders.values()]) {
      const crossed = order.side === "buy" ? px <= order.px : px >= order.px
      if (!crossed) continue
      this.orders.delete(order.cloid)
      const sz = order.reduceOnly
        ? (capReduceOnly(this.position, order.side, order.remainingSz) ?? 0)
        : order.remainingSz
      if (sz > 0) {
        this.applyFill(
          order.cloid,
          order.purpose,
          order.side,
          order.px,
          sz,
          this.makerFeeRate
        )
      }
    }
  }

  protected applyFill(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    px: number,
    sz: number,
    feeRate: number
  ) {
    const result = applyPaperFill(this.position, this.cash, side, px, sz, feeRate)
    this.position = result.position
    this.cash = result.cash

    this.emitFill(
      {
        side,
        px: String(px),
        sz: String(sz),
        fee: String(result.fee),
        closedPnl: String(result.closedPnl),
        time: this.now(),
        cloid,
        oid: null,
        hlTid: null,
      },
      purpose,
      cloid
    )
  }
}
