import { sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getScannerUniverse } from "@/server/scanner/info"
import { scannerCrowdSignals } from "@/server/schema"
import { now, uuid } from "@/server/util"
import { crowdScore } from "./crowd-score"
import { formatUsd } from "./format"
import { insertAlerts } from "./insert-alerts"

const TICK_MS = 60_000
const WINDOW_MS = 30 * 60_000
const PERSIST_MIN_SCORE = 50
const ALERT_MIN_SCORE = 70
const EXIT_MIN_WALLETS = 3
// A crowd counts as "price flat" when 30-min move is under this.
const FLAT_PRICE_MOVE = 0.003

type ClusterRow = {
  coin: string
  side: "buy" | "sell"
  taker: string
  notional: string
  quality_score: number | null
  first_ts: Date
  last_ts: Date
}

/**
 * Every minute, scores coordinated whale positioning per coin+direction over
 * a rolling 30-minute window. Strong signals persist to scanner_crowd_signals
 * (30d retention) and the strongest raise alerts, including smart-money flow
 * against a flat price and quality wallets exiting via position events.
 */
export class CrowdDetector {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private signalsRecorded = 0
  /** coin → [sampledAtMs, markPx] ring for flat-price detection. */
  private readonly priceSamples = new Map<string, [number, number][]>()

  meta() {
    return { crowdSignals: this.signalsRecorded }
  }

  start() {
    this.timer = setInterval(() => void this.tick(), TICK_MS)
    void this.tick()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick() {
    if (this.running) return
    this.running = true
    try {
      await this.samplePrices()
      await this.detect()
      await this.detectExits()
    } catch (error) {
      console.error("scanner: crowd tick failed", error)
    } finally {
      this.running = false
    }
  }

  private async samplePrices() {
    try {
      const universe = await getScannerUniverse()
      const nowMs = Date.now()
      for (const asset of universe) {
        if (asset.markPx <= 0) continue
        const ring = this.priceSamples.get(asset.coin) ?? []
        ring.push([nowMs, asset.markPx])
        while (ring.length > 0 && ring[0][0] < nowMs - WINDOW_MS - TICK_MS) {
          ring.shift()
        }
        this.priceSamples.set(asset.coin, ring)
      }
    } catch (error) {
      console.error("scanner: price sampling failed", error)
    }
  }

  private priceMove(coin: string): number | null {
    const ring = this.priceSamples.get(coin)
    if (!ring || ring.length < 2) return null
    const [, first] = ring[0]
    const [, last] = ring[ring.length - 1]
    if (first <= 0) return null
    return (last - first) / first
  }

  private async detect() {
    const result = await db.execute<ClusterRow>(sql`
      with takers as (
        select
          t.coin,
          t.side,
          case when t.side = 'buy' then t.buyer else t.seller end as taker,
          t.notional,
          t.ts
        from scanner_trades t
        where t.ts > now() - interval '30 minutes'
      )
      select
        k.coin,
        k.side,
        k.taker,
        sum(k.notional) as notional,
        max(w.quality_score) as quality_score,
        min(k.ts) as first_ts,
        max(k.ts) as last_ts
      from takers k
      left join scanner_wallets w on w.address = k.taker
      where coalesce(w.ignored, false) = false
        and coalesce(w.auto_labels @> '["Market maker"]'::jsonb, false) = false
      group by k.coin, k.side, k.taker
    `)

    type Cluster = {
      coin: string
      direction: "long" | "short"
      wallets: { taker: string; notional: number; quality: number | null }[]
      notional: number
      firstTs: number
      lastTs: number
    }
    const clusters = new Map<string, Cluster>()
    const coinTotals = new Map<string, number>()

    for (const row of result.rows) {
      const direction = row.side === "buy" ? "long" : "short"
      const key = `${row.coin}:${direction}`
      const notional = Number(row.notional)
      coinTotals.set(row.coin, (coinTotals.get(row.coin) ?? 0) + notional)
      let cluster = clusters.get(key)
      if (!cluster) {
        cluster = {
          coin: row.coin,
          direction,
          wallets: [],
          notional: 0,
          firstTs: Number.POSITIVE_INFINITY,
          lastTs: 0,
        }
        clusters.set(key, cluster)
      }
      cluster.wallets.push({
        taker: row.taker,
        notional,
        quality: row.quality_score,
      })
      cluster.notional += notional
      cluster.firstTs = Math.min(cluster.firstTs, new Date(row.first_ts).getTime())
      cluster.lastTs = Math.max(cluster.lastTs, new Date(row.last_ts).getTime())
    }

    // One query for the latest score per coin+direction in the window, so we
    // only re-persist a signal if it strengthened (avoids a query per cluster).
    const recent = await db.execute<{
      coin: string
      direction: string
      score: string
    }>(sql`
      select distinct on (coin, direction) coin, direction, score
      from scanner_crowd_signals
      where created_at > now() - interval '30 minutes'
      order by coin, direction, created_at desc
    `)
    const lastScore = new Map<string, number>()
    for (const row of recent.rows) {
      lastScore.set(`${row.coin}:${row.direction}`, Number(row.score))
    }

    const timestamp = now()
    for (const cluster of clusters.values()) {
      if (cluster.wallets.length < 2) continue
      const qualities = cluster.wallets
        .map((wallet) => wallet.quality)
        .filter((quality): quality is number => quality !== null)
      const avgQuality =
        qualities.length > 0
          ? qualities.reduce((sum, q) => sum + q, 0) / qualities.length
          : null
      const directionShare =
        cluster.notional / (coinTotals.get(cluster.coin) ?? cluster.notional)
      const score = crowdScore({
        walletCount: cluster.wallets.length,
        totalNotional: cluster.notional,
        avgQuality,
        windowMs: WINDOW_MS,
        spanMs: Math.max(0, cluster.lastTs - cluster.firstTs),
        directionShare,
      })
      if (score < PERSIST_MIN_SCORE) continue

      const prev = lastScore.get(`${cluster.coin}:${cluster.direction}`)
      if (prev !== undefined && score <= prev + 5) continue

      await db.insert(scannerCrowdSignals).values({
        id: uuid(),
        coin: cluster.coin,
        direction: cluster.direction,
        score: String(score),
        walletCount: cluster.wallets.length,
        notional: String(cluster.notional),
        avgQuality: avgQuality === null ? null : String(avgQuality),
        windowStart: new Date(cluster.firstTs),
        windowEnd: new Date(cluster.lastTs),
        data: {
          wallets: cluster.wallets
            .sort((a, b) => b.notional - a.notional)
            .slice(0, 10),
          directionShare,
        },
        createdAt: timestamp,
      })
      this.signalsRecorded += 1

      if (score >= ALERT_MIN_SCORE) {
        const bucket = Math.floor(Date.now() / WINDOW_MS)
        const verb = cluster.direction === "long" ? "buying" : "shorting"
        await insertAlerts([{
          type: "crowd_signal",
          coin: cluster.coin,
          title: `${cluster.wallets.length} whales ${verb} ${cluster.coin} (score ${score}, ${formatUsd(cluster.notional)})`,
          dedupeKey: `crowd:${cluster.coin}:${cluster.direction}:${bucket}`,
          data: { score, wallets: cluster.wallets.length },
        }])

        const move = this.priceMove(cluster.coin)
        if (move !== null && Math.abs(move) < FLAT_PRICE_MOVE) {
          await insertAlerts([{
            type: "smart_flow_divergence",
            coin: cluster.coin,
            title: `Whales ${verb} ${cluster.coin} while price is flat (${(move * 100).toFixed(2)}% in 30m)`,
            dedupeKey: `crowd-flat:${cluster.coin}:${cluster.direction}:${bucket}`,
            data: { score, priceMove: move },
          }])
        }
      }
    }
  }

  /** Quality wallets closing/reducing the same coin inside the window. */
  private async detectExits() {
    const result = await db.execute<{ coin: string; wallets: string }>(sql`
      select e.coin, count(distinct e.address) as wallets
      from scanner_position_events e
      join scanner_wallets w on w.address = e.address
      where e.ts > now() - interval '30 minutes'
        and e.event_type in ('closed', 'reduced')
        and coalesce(w.quality_score, 0) >= 60
      group by e.coin
      having count(distinct e.address) >= ${EXIT_MIN_WALLETS}
    `)
    const bucket = Math.floor(Date.now() / WINDOW_MS)
    for (const row of result.rows) {
      await insertAlerts([{
        type: "crowd_exit",
        coin: row.coin,
        title: `${row.wallets} quality wallets exited ${row.coin} in 30 min`,
        dedupeKey: `crowd-exit:${row.coin}:${bucket}`,
        data: { wallets: Number(row.wallets) },
      }])
    }
  }

}
