import type { SubscriptionClient } from "@nktkas/hyperliquid"

import { getScannerUniverse } from "@/server/scanner/info"
import type { MarketTrade } from "./alert-engine"

type RawMarketTrade = {
  coin: string
  px: string
  sz: string
  time: number
  tid: number
}

type NormalizedMarketTrade = MarketTrade & { tid: number }
const SUBSCRIPTION_RETRY_MS = 10_000

export function normalizeMarketTrades(
  events: RawMarketTrade[]
): NormalizedMarketTrade[] {
  return events.flatMap((event) => {
    const px = Number(event.px)
    const size = Number(event.sz)
    const notional = px * size
    if (
      !Number.isFinite(px) ||
      !Number.isFinite(size) ||
      px <= 0 ||
      size < 0 ||
      !Number.isFinite(event.time) ||
      !Number.isSafeInteger(event.tid) ||
      event.coin.trim().length === 0
    ) {
      return []
    }
    return [{
      coin: event.coin,
      px,
      notional,
      ts: event.time,
      tid: event.tid,
    }]
  })
}

/** Shared mainnet trade stream for Market Scanner and price alerts. */
export class MarketTradeStream {
  private readonly subs: SubscriptionClient
  private readonly emit: (trades: MarketTrade[]) => void
  private readonly getUniverse: () => Promise<{ coin: string }[]>
  private readonly seen = new Set<number>()
  private seenOrder: number[] = []
  private unsubscribers: (() => void)[] = []
  private subscribed = 0
  private pending = new Set<string>()
  private retryTimer: NodeJS.Timeout | null = null
  private stopped = true
  private subscribing = false

  constructor(
    subs: SubscriptionClient,
    emit: (trades: MarketTrade[]) => void,
    getUniverse: () => Promise<{ coin: string }[]> = getScannerUniverse
  ) {
    this.subs = subs
    this.emit = emit
    this.getUniverse = getUniverse
  }

  meta() {
    return { marketScannerSubscriptions: this.subscribed }
  }

  async start() {
    this.stopped = false
    const universe = await this.getUniverse()
    this.pending = new Set(universe.map((asset) => asset.coin))
    await this.subscribePending()
    this.scheduleRetry()
  }

  private async subscribePending() {
    if (this.stopped || this.subscribing || this.pending.size === 0) return
    this.subscribing = true
    const coins = [...this.pending]
    const results = await Promise.allSettled(
      coins.map(async (coin) => {
        const subscription = await this.subs.trades(
          { coin },
          (events) => this.onTrades(events)
        )
        if (this.stopped) {
          await subscription.unsubscribe().catch(() => {})
          return
        }
        this.pending.delete(coin)
        this.subscribed += 1
        this.unsubscribers.push(() =>
          void subscription.unsubscribe().catch(() => {})
        )
      })
    )
    this.subscribing = false
    const failed = results.filter((result) => result.status === "rejected").length
    console.log(
      `market scanner: subscribed to ${this.subscribed}/${this.subscribed + this.pending.size} markets` +
        (failed ? ` (${failed} failed)` : "")
    )
  }

  private scheduleRetry() {
    if (this.stopped || this.pending.size === 0 || this.retryTimer) return
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null
      await this.subscribePending()
      this.scheduleRetry()
    }, SUBSCRIPTION_RETRY_MS)
  }

  stop() {
    this.stopped = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    this.seen.clear()
    this.seenOrder = []
    this.subscribed = 0
    this.pending.clear()
  }

  private onTrades(events: RawMarketTrade[]) {
    const trades = normalizeMarketTrades(events).filter((trade) => {
      if (this.seen.has(trade.tid)) return false
      this.seen.add(trade.tid)
      this.seenOrder.push(trade.tid)
      return true
    })
    if (this.seenOrder.length > 200_000) {
      for (const tid of this.seenOrder.splice(0, 100_000)) this.seen.delete(tid)
    }
    if (trades.length > 0) this.emit(trades)
  }
}
