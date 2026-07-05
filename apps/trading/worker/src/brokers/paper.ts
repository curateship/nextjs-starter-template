import type { L2BookWsEvent, TradesWsEvent } from "@nktkas/hyperliquid"

import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/order-preview"
import type { TradingNetwork } from "@/server/hyperliquid/types"
import type { MarketHub } from "../market-hub"
import {
  applyPaperFill,
  capReduceOnly,
  walkBookDepth,
} from "../paper-math"
import type { BrokerFill, DesiredOrder } from "../strategies/contract"

export type PaperOrder = {
  cloid: string
  purpose: string
  side: "buy" | "sell"
  px: number
  remainingSz: number
  reduceOnly: boolean
}

export type PaperPlacement =
  | { kind: "resting" }
  | { kind: "filled" }
  | { kind: "rejected"; reason: string }

export type PaperSnapshot = {
  cash: number
  position: { szi: number; entryPx: number } | null
  orders: PaperOrder[]
}

/**
 * Simulated execution against live market data. Market orders walk real
 * book depth with taker fees; resting limits fill when the trades tape
 * prints through their price, with maker fees. Testnet books are thin —
 * that thinness is deliberately reflected in fills.
 */
export class PaperBroker {
  private cash: number
  private position: { szi: number; entryPx: number } | null = null
  private orders = new Map<string, PaperOrder>()
  private book: L2BookWsEvent | null = null
  private unsubscribers: (() => void)[] = []
  private readonly network: TradingNetwork
  private readonly coin: string
  private readonly hub: MarketHub
  private readonly emitFill: (fill: BrokerFill, purpose: string, cloid: string) => void

  constructor(options: {
    network: TradingNetwork
    coin: string
    startingCash: number
    hub: MarketHub
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
  }) {
    this.network = options.network
    this.coin = options.coin
    this.cash = options.startingCash
    this.hub = options.hub
    this.emitFill = options.onFill
  }

  start() {
    this.unsubscribers.push(
      this.hub.subscribeBook(this.network, this.coin, (book) => {
        this.book = book
      }),
      this.hub.subscribeTrades(this.network, this.coin, (trades) => {
        this.onTrades(trades)
      })
    )
  }

  stop() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
  }

  restore(snapshot: PaperSnapshot) {
    this.cash = snapshot.cash
    this.position = snapshot.position
    this.orders = new Map(snapshot.orders.map((order) => [order.cloid, order]))
  }

  snapshot(): PaperSnapshot {
    return {
      cash: this.cash,
      position: this.position,
      orders: [...this.orders.values()],
    }
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

  place(cloid: string, order: DesiredOrder): PaperPlacement {
    const sz = Number(order.sz)
    const px = order.px ? Number(order.px) : null
    if (!(sz > 0)) return { kind: "rejected", reason: "size must be positive" }

    if (order.orderType === "market" || order.tif === "Ioc") {
      return this.fillMarket(cloid, order.purpose, order.side, sz, order.reduceOnly)
    }

    if (px === null || !(px > 0)) {
      return { kind: "rejected", reason: "limit order needs a price" }
    }

    const bestOpposing = this.bestPx(order.side === "buy" ? "ask" : "bid")
    const crosses =
      bestOpposing !== null &&
      (order.side === "buy" ? px >= bestOpposing : px <= bestOpposing)
    if (crosses) {
      if (order.tif === "Alo") {
        return { kind: "rejected", reason: "post-only order would cross" }
      }
      return this.fillMarket(cloid, order.purpose, order.side, sz, order.reduceOnly)
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

  /** Closes the whole position at market. Used by flatten and kill paths. */
  flatten(purpose = "flatten"): PaperPlacement | null {
    if (!this.position || this.position.szi === 0) return null
    const side = this.position.szi > 0 ? "sell" : "buy"
    return this.fillMarket(
      `paper:${purpose}:${Date.now()}`,
      purpose,
      side,
      Math.abs(this.position.szi),
      true
    )
  }

  private fillMarket(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean
  ): PaperPlacement {
    const capped = reduceOnly ? capReduceOnly(this.position, side, sz) : sz
    if (capped === null) {
      return { kind: "rejected", reason: "reduce-only does not reduce position" }
    }
    if (capped <= 0) return { kind: "rejected", reason: "nothing to reduce" }

    const levels = this.book?.levels[side === "buy" ? 1 : 0] ?? []
    const avgPx = walkBookDepth(levels, capped)
    if (avgPx === null) {
      return { kind: "rejected", reason: "no book depth for market fill" }
    }
    this.applyFill(cloid, purpose, side, avgPx, capped, TAKER_FEE_RATE)
    return { kind: "filled" }
  }

  private onTrades(trades: TradesWsEvent) {
    if (this.orders.size === 0) return
    for (const trade of trades) {
      const tradePx = Number(trade.px)
      for (const order of [...this.orders.values()]) {
        const crossed =
          order.side === "buy" ? tradePx <= order.px : tradePx >= order.px
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
            MAKER_FEE_RATE
          )
        }
      }
    }
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
        time: Date.now(),
        cloid,
        oid: null,
        hlTid: null,
      },
      purpose,
      cloid
    )
  }

  private bestPx(side: "bid" | "ask"): number | null {
    const level = this.book?.levels[side === "bid" ? 0 : 1]?.[0]
    return level ? Number(level.px) : null
  }
}
