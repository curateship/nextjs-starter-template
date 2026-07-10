import type { L2BookWsEvent, TradesWsEvent } from "@nktkas/hyperliquid"

import type { TradingNetwork } from "@/server/hyperliquid/types"
import type { MarketHub } from "../market-hub"
import { walkBookDepth } from "../paper-math"
import type { BrokerFill } from "../strategies/contract"
import { SimulatedBroker, type RestingOrder } from "./paper-core"
import type { Placement } from "./types"

export type PaperSnapshot = {
  cash: number
  position: { szi: number; entryPx: number } | null
  orders: RestingOrder[]
}

/**
 * Simulated execution against live market data. Market orders walk real
 * book depth with taker fees; resting limits fill when the trades tape
 * prints through their price, with maker fees. Testnet books are thin —
 * that thinness is deliberately reflected in fills.
 */
export class PaperBroker extends SimulatedBroker {
  protected readonly venueTag = "paper"
  private book: L2BookWsEvent | null = null
  private unsubscribers: (() => void)[] = []
  private readonly network: TradingNetwork
  private readonly coin: string
  private readonly hub: MarketHub

  constructor(options: {
    network: TradingNetwork
    coin: string
    startingCash: number
    hub: MarketHub
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
  }) {
    super(options)
    this.network = options.network
    this.coin = options.coin
    this.hub = options.hub
  }

  protected now() {
    return Date.now()
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

  protected crossesMarket(side: "buy" | "sell", px: number): boolean {
    const bestOpposing = this.bestPx(side === "buy" ? "ask" : "bid")
    return (
      bestOpposing !== null &&
      (side === "buy" ? px >= bestOpposing : px <= bestOpposing)
    )
  }

  protected fillTaker(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean
  ): Placement {
    return this.fillCapped(
      cloid,
      purpose,
      side,
      sz,
      reduceOnly,
      this.takerFeeRate,
      (cappedSz) =>
        walkBookDepth(this.book?.levels[side === "buy" ? 1 : 0] ?? [], cappedSz)
    )
  }

  private onTrades(trades: TradesWsEvent) {
    if (this.orders.size === 0) return
    for (const trade of trades) {
      this.fillCrossedOrders(Number(trade.px))
    }
  }

  private bestPx(side: "bid" | "ask"): number | null {
    const level = this.book?.levels[side === "bid" ? 0 : 1]?.[0]
    return level ? Number(level.px) : null
  }
}
