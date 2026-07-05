import { sql } from "drizzle-orm"
import type { SubscriptionClient } from "@nktkas/hyperliquid"

import { db } from "@/server/db"
import { getScannerUniverse } from "@/server/scanner/info"
import { scannerAlerts, scannerBookMetrics } from "@/server/schema"
import { now, uuid } from "@/server/util"
import {
  bookMetrics,
  DEFAULT_BOOK_OPTIONS,
  type BookMetricsResult,
  type BookWall,
} from "./book-metrics"
import { formatUsd } from "./format"

const DEFAULT_WATCH_COUNT = 20
const UPSERT_INTERVAL_MS = 5_000
const ALERT_BUCKET_MS = 15 * 60_000
const NEAR_PRICE = 0.005
const IMBALANCE_ALERT = 3
// Alert-only floors (the persisted metrics keep the lower display floor).
// Books flicker constantly; alerts need to be rare enough to mean something.
const WALL_ALERT_MIN_USD = 500_000
const IMBALANCE_MIN_BAND_USD = 500_000
// Thin book: 1% band under this fraction of the coin's rolling median.
const THIN_RATIO = 0.25
const MEDIAN_SAMPLES = 60

/**
 * Watches mainnet l2Book for the highest-volume coins (SCANNER_BOOK_COINS
 * overrides), computes liquidity metrics, and keeps a latest-only row per
 * coin. Wall and imbalance alerts compare successive snapshots.
 */
export class BookWatcher {
  private readonly subs: SubscriptionClient
  private unsubscribers: (() => void)[] = []
  private readonly lastUpsert = new Map<string, number>()
  private readonly prevWalls = new Map<string, BookWall[]>()
  private readonly liquiditySamples = new Map<string, number[]>()
  private coins: string[] = []

  constructor(subs: SubscriptionClient) {
    this.subs = subs
  }

  meta() {
    return { bookCoins: this.coins.length }
  }

  async start() {
    const override = (process.env.SCANNER_BOOK_COINS ?? "")
      .split(",")
      .map((coin) => coin.trim())
      .filter(Boolean)
    if (override.length > 0) {
      this.coins = override
    } else {
      const universe = await getScannerUniverse()
      this.coins = universe.slice(0, DEFAULT_WATCH_COUNT).map((a) => a.coin)
    }

    const results = await Promise.allSettled(
      this.coins.map(async (coin) => {
        const subscription = await this.subs.l2Book({ coin }, (event) => {
          void this.onBook(coin, event.levels[0] ?? [], event.levels[1] ?? [])
        })
        this.unsubscribers.push(
          () => void subscription.unsubscribe().catch(() => {})
        )
      })
    )
    const ok = results.filter((r) => r.status === "fulfilled").length
    console.log(`scanner: watching order books on ${ok}/${this.coins.length} coins`)
  }

  stop() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers = []
  }

  private async onBook(
    coin: string,
    bids: { px: string; sz: string }[],
    asks: { px: string; sz: string }[]
  ) {
    const last = this.lastUpsert.get(coin) ?? 0
    if (Date.now() - last < UPSERT_INTERVAL_MS) return
    this.lastUpsert.set(coin, Date.now())

    const metrics = bookMetrics(bids, asks, DEFAULT_BOOK_OPTIONS)
    if (!metrics) return

    try {
      await this.persist(coin, metrics)
      await this.evaluateAlerts(coin, metrics)
    } catch (error) {
      console.error(`scanner: book update failed for ${coin}`, error)
    }
  }

  private async persist(coin: string, metrics: BookMetricsResult) {
    await db
      .insert(scannerBookMetrics)
      .values({
        coin,
        mid: String(metrics.mid),
        spreadBps: String(metrics.spreadBps),
        bidLiquidity: Object.fromEntries(
          metrics.bands.map((band) => [String(band.pct), band.bidUsd])
        ),
        askLiquidity: Object.fromEntries(
          metrics.bands.map((band) => [String(band.pct), band.askUsd])
        ),
        imbalance: metrics.imbalance === null ? null : String(metrics.imbalance),
        walls: metrics.walls,
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: scannerBookMetrics.coin,
        set: {
          mid: sql`excluded.mid`,
          spreadBps: sql`excluded.spread_bps`,
          bidLiquidity: sql`excluded.bid_liquidity`,
          askLiquidity: sql`excluded.ask_liquidity`,
          imbalance: sql`excluded.imbalance`,
          walls: sql`excluded.walls`,
          updatedAt: sql`excluded.updated_at`,
        },
      })
  }

  private async evaluateAlerts(coin: string, metrics: BookMetricsResult) {
    const bucket = Math.floor(Date.now() / ALERT_BUCKET_MS)
    const prev = this.prevWalls.get(coin)
    const nearWalls = metrics.walls.filter(
      (wall) => wall.distance <= NEAR_PRICE && wall.usd >= WALL_ALERT_MIN_USD
    )

    if (prev !== undefined) {
      const prevNear = prev.filter(
        (p) => p.distance <= NEAR_PRICE && p.usd >= WALL_ALERT_MIN_USD
      )
      for (const wall of nearWalls) {
        const existed = prevNear.some((p) => p.side === wall.side)
        if (!existed) {
          await this.insertAlert({
            type: "wall_appeared",
            coin,
            title: `${coin}: ${formatUsd(wall.usd)} ${wall.side} wall appeared within 0.5% of price`,
            // One wall alert per coin+side per bucket — walls flicker.
            dedupeKey: `wall:${coin}:${wall.side}:${bucket}`,
            data: wall,
          })
        }
      }
      for (const wall of prevNear) {
        const still = nearWalls.some((w) => w.side === wall.side)
        // Only count it "pulled" if price did not simply trade through it.
        const crossed =
          wall.side === "bid" ? metrics.mid < wall.px : metrics.mid > wall.px
        if (!still && !crossed) {
          await this.insertAlert({
            type: "wall_pulled",
            coin,
            title: `${coin}: ${formatUsd(wall.usd)} ${wall.side} wall pulled`,
            dedupeKey: `wall-pulled:${coin}:${wall.side}:${bucket}`,
            data: wall,
          })
        }
      }
    }
    this.prevWalls.set(coin, metrics.walls)

    const bandTotal = metrics.bands[1].bidUsd + metrics.bands[1].askUsd
    if (metrics.imbalance !== null && bandTotal >= IMBALANCE_MIN_BAND_USD) {
      if (metrics.imbalance >= IMBALANCE_ALERT) {
        await this.insertAlert({
          type: "book_imbalance",
          coin,
          title: `${coin}: ${metrics.imbalance.toFixed(1)}x more bids than asks near price`,
          dedupeKey: `imbalance:${coin}:bid:${bucket}`,
          data: { imbalance: metrics.imbalance },
        })
      } else if (metrics.imbalance <= 1 / IMBALANCE_ALERT) {
        await this.insertAlert({
          type: "book_imbalance",
          coin,
          title: `${coin}: ${(1 / metrics.imbalance).toFixed(1)}x more asks than bids near price`,
          dedupeKey: `imbalance:${coin}:ask:${bucket}`,
          data: { imbalance: metrics.imbalance },
        })
      }
    }

    const onePct = metrics.bands[1]
    const total = onePct.bidUsd + onePct.askUsd
    const samples = this.liquiditySamples.get(coin) ?? []
    samples.push(total)
    if (samples.length > MEDIAN_SAMPLES) samples.shift()
    this.liquiditySamples.set(coin, samples)
    if (samples.length >= MEDIAN_SAMPLES / 2) {
      const median = [...samples].sort((a, b) => a - b)[
        Math.floor(samples.length / 2)
      ]
      if (median > 0 && total < median * THIN_RATIO) {
        const side = onePct.bidUsd < onePct.askUsd ? "below" : "above"
        await this.insertAlert({
          type: "thin_book",
          coin,
          title: `${coin}: book got thin (${formatUsd(total)} within 1%, ${side} side weakest)`,
          dedupeKey: `thin:${coin}:${bucket}`,
          data: { totalUsd: total, medianUsd: median },
        })
      }
    }
  }

  private async insertAlert(draft: {
    type: string
    coin: string
    title: string
    dedupeKey: string
    data?: unknown
  }) {
    await db
      .insert(scannerAlerts)
      .values({
        id: uuid(),
        type: draft.type,
        coin: draft.coin,
        address: null,
        title: draft.title,
        body: null,
        data: draft.data ?? null,
        dedupeKey: draft.dedupeKey,
        createdAt: now(),
      })
      .onConflictDoNothing({
        target: scannerAlerts.dedupeKey,
        where: sql`dedupe_key is not null`,
      })
  }
}
