import { sql } from "drizzle-orm"
import type { SubscriptionClient } from "@nktkas/hyperliquid"

import { db } from "@/server/db"
import { getScannerUniverse } from "@/server/scanner/info"
import {
  scannerTrades,
  scannerWalletDaily,
  scannerWallets,
} from "@/server/schema"
import { now, uuid } from "@/server/util"
import {
  DEFAULT_TRADE_ALERT_OPTIONS,
  evaluateTradeAlerts,
  takerOf,
  type ScannerTradeEvent,
} from "./alert-engine"
import { insertAlerts } from "./insert-alerts"

const FLUSH_INTERVAL_MS = 2_000
const IGNORED_REFRESH_MS = 60_000
const WINDOW_MS = 15 * 60_000

/**
 * Subscribes to the mainnet trades feed for every perp coin, keeps trades
 * above the notional floor, and batch-writes trades + wallet discovery +
 * daily rollups + alerts every couple of seconds.
 */
export class TradeCollector {
  private readonly subs: SubscriptionClient
  private readonly minNotional: number
  /** Notified with each flush's taker addresses (position re-poll queue). */
  onActivity: ((takers: string[]) => void) | null = null
  private buffer: ScannerTradeEvent[] = []
  private window: ScannerTradeEvent[] = []
  private seenTids = new Set<number>()
  private ignoredAddresses = new Set<string>()
  private flushTimer: NodeJS.Timeout | null = null
  private ignoredTimer: NodeJS.Timeout | null = null
  private unsubscribers: (() => void)[] = []
  private flushing = false
  private subscribed = 0
  private collected = 0

  constructor(subs: SubscriptionClient, minNotional: number) {
    this.subs = subs
    this.minNotional = minNotional
  }

  meta() {
    return { subscriptions: this.subscribed, tradesCollected: this.collected }
  }

  async start() {
    await this.refreshIgnored()
    const universe = await getScannerUniverse()

    const results = await Promise.allSettled(
      universe.map(async (asset) => {
        const subscription = await this.subs.trades(
          { coin: asset.coin },
          (events) => this.onTrades(events)
        )
        this.unsubscribers.push(() => void subscription.unsubscribe().catch(() => {}))
      })
    )
    this.subscribed = results.filter((r) => r.status === "fulfilled").length
    const failed = results.length - this.subscribed
    console.log(
      `scanner: subscribed to trades on ${this.subscribed}/${universe.length} coins` +
        (failed ? ` (${failed} failed)` : "")
    )

    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS)
    this.ignoredTimer = setInterval(
      () => void this.refreshIgnored(),
      IGNORED_REFRESH_MS
    )
  }

  async stop() {
    if (this.flushTimer) clearInterval(this.flushTimer)
    if (this.ignoredTimer) clearInterval(this.ignoredTimer)
    this.flushTimer = null
    this.ignoredTimer = null
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
    await this.flush()
  }

  private onTrades(
    events: {
      coin: string
      side: "B" | "A"
      px: string
      sz: string
      time: number
      tid: number
      users: [string, string]
    }[]
  ) {
    for (const event of events) {
      const px = Number(event.px)
      const sz = Number(event.sz)
      const notional = px * sz
      if (notional < this.minNotional) continue
      if (this.seenTids.has(event.tid)) continue
      this.seenTids.add(event.tid)
      this.buffer.push({
        tid: event.tid,
        ts: event.time,
        coin: event.coin,
        side: event.side === "B" ? "buy" : "sell",
        px,
        sz,
        notional,
        buyer: event.users[0].toLowerCase(),
        seller: event.users[1].toLowerCase(),
      })
    }
  }

  private async refreshIgnored() {
    try {
      // Manually ignored wallets plus auto-classified market makers.
      const rows = await db
        .select({ address: scannerWallets.address })
        .from(scannerWallets)
        .where(
          sql`${scannerWallets.ignored} = true or ${scannerWallets.autoLabels} @> '["Market maker"]'::jsonb`
        )
      this.ignoredAddresses = new Set(rows.map((row) => row.address))
    } catch (error) {
      console.error("scanner: ignored wallets refresh failed", error)
    }
  }

  private async flush() {
    if (this.flushing || this.buffer.length === 0) return
    this.flushing = true
    const trades = this.buffer
    this.buffer = []
    try {
      this.window.push(...trades)
      this.window.sort((a, b) => a.ts - b.ts)
      const cutoff = Date.now() - WINDOW_MS
      this.window = this.window.filter((trade) => trade.ts >= cutoff)
      if (this.seenTids.size > 50_000) {
        this.seenTids = new Set(this.window.map((trade) => trade.tid))
      }

      await db
        .insert(scannerTrades)
        .values(
          trades.map((trade) => ({
            id: uuid(),
            tid: trade.tid,
            ts: new Date(trade.ts),
            coin: trade.coin,
            side: trade.side,
            px: String(trade.px),
            sz: String(trade.sz),
            notional: String(trade.notional),
            buyer: trade.buyer,
            seller: trade.seller,
          }))
        )
        .onConflictDoNothing({ target: scannerTrades.tid })
      this.collected += trades.length

      await this.upsertWallets(trades)
      await this.upsertDailyRollups(trades)

      const drafts = evaluateTradeAlerts(this.window, trades, {
        ...DEFAULT_TRADE_ALERT_OPTIONS,
        ignoredAddresses: this.ignoredAddresses,
      })
      await insertAlerts(drafts)

      if (this.onActivity) {
        const takers = new Set<string>()
        for (const trade of trades) {
          const taker = takerOf(trade)
          if (!this.ignoredAddresses.has(taker)) takers.add(taker)
        }
        if (takers.size > 0) this.onActivity([...takers])
      }
    } catch (error) {
      console.error("scanner: trade flush failed", error)
    } finally {
      this.flushing = false
    }
  }

  private async upsertWallets(trades: ScannerTradeEvent[]) {
    const byAddress = new Map<string, { firstTs: number; lastTs: number }>()
    for (const trade of trades) {
      for (const address of [trade.buyer, trade.seller]) {
        const existing = byAddress.get(address)
        if (!existing) {
          byAddress.set(address, { firstTs: trade.ts, lastTs: trade.ts })
        } else {
          existing.firstTs = Math.min(existing.firstTs, trade.ts)
          existing.lastTs = Math.max(existing.lastTs, trade.ts)
        }
      }
    }
    await db
      .insert(scannerWallets)
      .values(
        [...byAddress.entries()].map(([address, seen]) => ({
          address,
          firstSeenAt: new Date(seen.firstTs),
          lastSeenAt: new Date(seen.lastTs),
          updatedAt: now(),
        }))
      )
      .onConflictDoUpdate({
        target: scannerWallets.address,
        set: {
          lastSeenAt: sql`greatest(${scannerWallets.lastSeenAt}, excluded.last_seen_at)`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  private async upsertDailyRollups(trades: ScannerTradeEvent[]) {
    const byKey = new Map<
      string,
      {
        address: string
        day: string
        tradeCount: number
        buyNotional: number
        sellNotional: number
      }
    >()
    for (const trade of trades) {
      const day = new Date(trade.ts).toISOString().slice(0, 10)
      for (const [address, bought] of [
        [trade.buyer, true],
        [trade.seller, false],
      ] as const) {
        const key = `${address}:${day}`
        let entry = byKey.get(key)
        if (!entry) {
          entry = { address, day, tradeCount: 0, buyNotional: 0, sellNotional: 0 }
          byKey.set(key, entry)
        }
        entry.tradeCount += 1
        if (bought) entry.buyNotional += trade.notional
        else entry.sellNotional += trade.notional
      }
    }
    await db
      .insert(scannerWalletDaily)
      .values(
        [...byKey.values()].map((entry) => ({
          address: entry.address,
          day: entry.day,
          tradeCount: entry.tradeCount,
          notional: String(entry.buyNotional + entry.sellNotional),
          buyNotional: String(entry.buyNotional),
          sellNotional: String(entry.sellNotional),
        }))
      )
      .onConflictDoUpdate({
        target: [scannerWalletDaily.address, scannerWalletDaily.day],
        set: {
          tradeCount: sql`${scannerWalletDaily.tradeCount} + excluded.trade_count`,
          notional: sql`${scannerWalletDaily.notional} + excluded.notional`,
          buyNotional: sql`${scannerWalletDaily.buyNotional} + excluded.buy_notional`,
          sellNotional: sql`${scannerWalletDaily.sellNotional} + excluded.sell_notional`,
        },
      })
  }

}
