import { sql } from "drizzle-orm"
import type { InfoClient } from "@nktkas/hyperliquid"

import { db } from "@/server/db"
import { scannerWallets, scannerWalletStats } from "@/server/schema"
import { now } from "@/server/util"
import { classifyWallet } from "./classify"
import { TokenBucket } from "./rate-limiter"
import {
  computeFillStats,
  downsampleHistory,
  extractAccountValue,
  extractWindowPnl,
  type PortfolioPeriod,
} from "./stats-math"

// HL info request weights: portfolio 20 + userFillsByTime 20 + clearinghouseState 2.
const REFRESH_WEIGHT = 42
const IDLE_SLEEP_MS = 10_000
const UNIVERSE_CAP = 500
const FILLS_WINDOW_MS = 30 * 86_400_000

/**
 * Throttled wallet stats refresher: one wallet at a time, tracked wallets
 * first (15 min staleness), then the ~500 most recently active (2 h
 * staleness). The token bucket keeps REST usage within the scanner budget,
 * so stats can lag hours behind on a busy universe — the UI shows
 * stats_updated_at for that reason.
 */
export class WalletStatsRefresher {
  private readonly info: InfoClient
  private readonly bucket: TokenBucket
  private stopped = false
  private loopPromise: Promise<void> | null = null
  private refreshed = 0

  constructor(info: InfoClient, bucket: TokenBucket) {
    this.info = info
    this.bucket = bucket
  }

  meta() {
    return { statsRefreshed: this.refreshed }
  }

  start() {
    this.stopped = false
    this.loopPromise = this.loop()
  }

  async stop() {
    this.stopped = true
    await this.loopPromise?.catch(() => {})
  }

  private async loop() {
    while (!this.stopped) {
      let address: string | null = null
      try {
        address = await this.pickNext()
      } catch (error) {
        console.error("scanner: stats pick failed", error)
      }
      if (!address) {
        await sleep(IDLE_SLEEP_MS)
        continue
      }
      await this.bucket.take(REFRESH_WEIGHT)
      if (this.stopped) return
      try {
        await this.refresh(address)
        this.refreshed += 1
      } catch (error) {
        console.error(
          `scanner: stats refresh failed for ${address}:`,
          error instanceof Error ? error.message.slice(0, 200) : error
        )
        // Stamp the row anyway so a permanently failing wallet cannot pin
        // itself to the front of the queue.
        await this.stampFailure(address).catch(() => {})
      }
    }
  }

  private async pickNext(): Promise<string | null> {
    const rows = await db.execute<{ address: string }>(sql`
      select w.address
      from scanner_wallets w
      left join scanner_wallet_stats s on s.address = w.address
      where not w.ignored
        and w.address in (
          select address from scanner_wallets
          order by tracked desc, last_seen_at desc
          limit ${UNIVERSE_CAP}
        )
        and (
          s.address is null
          or (w.tracked and s.stats_updated_at < now() - interval '15 minutes')
          or s.stats_updated_at < now() - interval '2 hours'
        )
      order by w.tracked desc, s.stats_updated_at asc nulls first
      limit 1
    `)
    return rows.rows[0]?.address ?? null
  }

  private async refresh(address: string) {
    const user = address as `0x${string}`
    const [portfolio, fills, clearing] = await Promise.all([
      this.info.portfolio({ user }),
      this.info.userFillsByTime({
        user,
        startTime: Date.now() - FILLS_WINDOW_MS,
      }),
      this.info.clearinghouseState({ user }),
    ])

    const periods = new Map(portfolio as [string, PortfolioPeriod][])
    const week = periods.get("week")
    const month = periods.get("month")
    const pnl7d = extractWindowPnl(week)
    const pnl30d = extractWindowPnl(month)
    const accountValue =
      extractAccountValue(periods.get("day")) ?? extractAccountValue(month)

    const fillStats = computeFillStats(
      fills.map((f) => ({
        coin: f.coin,
        px: f.px,
        sz: f.sz,
        side: f.side,
        time: f.time,
        startPosition: f.startPosition,
        closedPnl: f.closedPnl,
        dir: f.dir,
        crossed: f.crossed,
      }))
    )

    const openPositions = clearing.assetPositions.map(({ position }) => ({
      coin: position.coin,
      szi: position.szi,
      entryPx: position.entryPx,
      positionValue: position.positionValue,
      unrealizedPnl: position.unrealizedPnl,
      leverage: position.leverage.value,
    }))
    const maxOpenLeverage = openPositions.reduce<number | null>(
      (max, position) =>
        max === null
          ? Number(position.leverage)
          : Math.max(max, Number(position.leverage)),
      null
    )

    const [wallet] = await db
      .select({ firstSeenAt: scannerWallets.firstSeenAt })
      .from(scannerWallets)
      .where(sql`${scannerWallets.address} = ${address}`)

    const { labels, qualityScore } = classifyWallet({
      pnl7d,
      pnl30d,
      winRate: fillStats.winRate,
      fillCount30d: fillStats.fillCount,
      accountValue,
      avgHoldMinutes: fillStats.avgHoldMinutes,
      takerRatio: fillStats.takerRatio,
      maxOpenLeverage,
      firstSeenAt: wallet?.firstSeenAt?.getTime() ?? null,
      oldestFillAt: fillStats.oldestFillAt,
      now: Date.now(),
    })

    const history = month?.accountValueHistory ?? []
    await db
      .insert(scannerWalletStats)
      .values({
        address,
        accountValue: toNumeric(accountValue),
        pnl7d: toNumeric(pnl7d),
        pnl30d: toNumeric(pnl30d),
        winRate: toNumeric(fillStats.winRate),
        fillCount30d: fillStats.fillCount,
        avgTradeNotional: toNumeric(fillStats.avgTradeNotional),
        largestWin: toNumeric(fillStats.largestWin),
        largestLoss: toNumeric(fillStats.largestLoss),
        topCoins: fillStats.topCoins,
        openPositions,
        avgHoldMinutes: toNumeric(fillStats.avgHoldMinutes),
        portfolioHistory: downsampleHistory(history),
        statsUpdatedAt: now(),
      })
      .onConflictDoUpdate({
        target: scannerWalletStats.address,
        set: {
          accountValue: sql`excluded.account_value`,
          pnl7d: sql`excluded.pnl_7d`,
          pnl30d: sql`excluded.pnl_30d`,
          winRate: sql`excluded.win_rate`,
          fillCount30d: sql`excluded.fill_count_30d`,
          avgTradeNotional: sql`excluded.avg_trade_notional`,
          largestWin: sql`excluded.largest_win`,
          largestLoss: sql`excluded.largest_loss`,
          topCoins: sql`excluded.top_coins`,
          openPositions: sql`excluded.open_positions`,
          avgHoldMinutes: sql`excluded.avg_hold_minutes`,
          portfolioHistory: sql`excluded.portfolio_history`,
          statsUpdatedAt: sql`excluded.stats_updated_at`,
        },
      })

    await db
      .update(scannerWallets)
      .set({ autoLabels: labels, qualityScore, updatedAt: now() })
      .where(sql`${scannerWallets.address} = ${address}`)
  }

  private async stampFailure(address: string) {
    await db
      .insert(scannerWalletStats)
      .values({ address, statsUpdatedAt: now() })
      .onConflictDoUpdate({
        target: scannerWalletStats.address,
        set: { statsUpdatedAt: sql`excluded.stats_updated_at` },
      })
  }
}

function toNumeric(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : String(value)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
