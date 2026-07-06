import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/order-preview"

import type { BotBroker, Placement } from "../brokers/types"
import { applyPaperFill, capReduceOnly } from "../paper-math"
import type { BrokerFill, DesiredOrder } from "../strategies/contract"

type RestingOrder = {
  cloid: string
  purpose: string
  side: "buy" | "sell"
  px: number
  remainingSz: number
  reduceOnly: boolean
}

/**
 * Deterministic execution venue for backtests. Replaces PaperBroker's live
 * L2-book/tape machinery with a candle price path: market orders fill at the
 * current path price plus slippage (taker), resting limits fill when the path
 * crosses their price (maker, no slippage). Position/cash arithmetic is the
 * shared `applyPaperFill`, so fills and P&L match the paper broker exactly.
 * No wall-clock — fill times come from the injected bar clock.
 */
export class BacktestBroker implements BotBroker {
  private cash: number
  private position: { szi: number; entryPx: number } | null = null
  private orders = new Map<string, RestingOrder>()
  private price = 0
  private readonly takerFeeRate: number
  private readonly makerFeeRate: number
  private readonly slippageRate: number
  private readonly getTime: () => number
  private readonly emitFill: (
    fill: BrokerFill,
    purpose: string,
    cloid: string
  ) => void

  constructor(options: {
    startingCash: number
    getTime: () => number
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
    takerFeeRate?: number
    makerFeeRate?: number
    /** Adverse price fraction applied to taker fills (e.g. 0.0002 = 2bps). */
    slippageRate?: number
  }) {
    this.cash = options.startingCash
    this.getTime = options.getTime
    this.emitFill = options.onFill
    this.takerFeeRate = options.takerFeeRate ?? TAKER_FEE_RATE
    this.makerFeeRate = options.makerFeeRate ?? MAKER_FEE_RATE
    this.slippageRate = options.slippageRate ?? 0
  }

  /** Taker fill price after adverse slippage. */
  private slipped(side: "buy" | "sell", px: number): number {
    return side === "buy"
      ? px * (1 + this.slippageRate)
      : px * (1 - this.slippageRate)
  }

  start() {}
  stop() {}

  /** Advances the simulated price the broker fills against. */
  setPrice(px: number) {
    this.price = px
  }

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

  place(cloid: string, order: DesiredOrder): Placement {
    const sz = Number(order.sz)
    const px = order.px ? Number(order.px) : null
    if (!(sz > 0)) return { kind: "rejected", reason: "size must be positive" }

    if (order.orderType === "market" || order.tif === "Ioc") {
      return this.fill(
        cloid,
        order.purpose,
        order.side,
        sz,
        order.reduceOnly,
        this.slipped(order.side, this.price),
        this.takerFeeRate
      )
    }

    if (px === null || !(px > 0)) {
      return { kind: "rejected", reason: "limit order needs a price" }
    }

    // A limit that would execute against the current price fills as a taker;
    // a post-only (Alo) that would cross is rejected instead.
    const crosses = order.side === "buy" ? px >= this.price : px <= this.price
    if (crosses) {
      if (order.tif === "Alo") {
        return { kind: "rejected", reason: "post-only order would cross" }
      }
      return this.fill(
        cloid,
        order.purpose,
        order.side,
        sz,
        order.reduceOnly,
        this.slipped(order.side, this.price),
        this.takerFeeRate
      )
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

  cancel(cloid: string): boolean {
    return this.orders.delete(cloid)
  }

  cancelAll() {
    this.orders.clear()
  }

  /** Fills every resting order the given price has crossed, at its limit price (maker). */
  matchBar(px: number) {
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

  /** Closes the whole position at the current price (taker, reduce-only). */
  flatten(purpose = "flatten"): Placement | null {
    if (!this.position || this.position.szi === 0) return null
    const side = this.position.szi > 0 ? "sell" : "buy"
    return this.fill(
      `bt:${purpose}:${this.getTime()}`,
      purpose,
      side,
      Math.abs(this.position.szi),
      true,
      this.slipped(side, this.price),
      this.takerFeeRate
    )
  }

  private fill(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean,
    px: number,
    feeRate: number
  ): Placement {
    const capped = reduceOnly ? capReduceOnly(this.position, side, sz) : sz
    if (capped === null) {
      return { kind: "rejected", reason: "reduce-only does not reduce position" }
    }
    if (capped <= 0) return { kind: "rejected", reason: "nothing to reduce" }
    this.applyFill(cloid, purpose, side, px, capped, feeRate)
    return { kind: "filled" }
  }

  private applyFill(
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
        time: this.getTime(),
        cloid,
        oid: null,
        hlTid: null,
      },
      purpose,
      cloid
    )
  }
}
