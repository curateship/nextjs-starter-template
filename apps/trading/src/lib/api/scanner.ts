import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

export type ScannerWalletInfo = {
  address: string
  label: string | null
  tracked: boolean
  ignored: boolean
}

export type WhaleTradeItem = {
  id: string
  tid: number
  ts: string
  coin: string
  side: "buy" | "sell"
  px: string
  sz: string
  notional: string
  buyer: string
  seller: string
  buyerWallet: ScannerWalletInfo | null
  sellerWallet: ScannerWalletInfo | null
}

export type CoinOption = {
  coin: string
  dayNotionalVolume: number
}

export type WhalesPageResponse = {
  items: WhaleTradeItem[]
  total: number
  page: number
  pageSize: number
  coins: CoinOption[]
}

export type ScannerAlertItem = {
  id: string
  type: string
  coin: string | null
  address: string | null
  title: string
  body: string | null
  created_at: string
  read_at: string | null
}

export type AlertsPageResponse = {
  items: ScannerAlertItem[]
  total: number
  page: number
  pageSize: number
  unreadCount: number
}

export type AlertsPollResponse = {
  unreadCount: number
  latest: ScannerAlertItem[]
}

export type ScannerOpenPosition = {
  coin: string
  szi: string
  entryPx: string | null
  positionValue: string
  unrealizedPnl: string
  leverage: number
}

export type ScannerWalletStatsItem = {
  accountValue: string | null
  pnl7d: string | null
  pnl30d: string | null
  winRate: string | null
  fillCount30d: number | null
  avgTradeNotional: string | null
  largestWin: string | null
  largestLoss: string | null
  topCoins: { coin: string; notional: number; fills: number }[]
  openPositions: ScannerOpenPosition[]
  avgHoldMinutes: string | null
  portfolioHistory: { time: number; value: number }[]
  statsUpdatedAt: string
}

export type ScannerWalletDetail = {
  wallet: ScannerWalletInfo & {
    autoLabels: string[]
    qualityScore: number | null
    firstSeenAt: string | null
    lastSeenAt: string | null
  }
  stats: ScannerWalletStatsItem | null
  recentTrades: WhaleTradeItem[]
  positionEvents: PositionEventItem[]
}

export type LeaderboardItem = {
  address: string
  label: string | null
  tracked: boolean
  autoLabels: string[]
  qualityScore: number | null
  accountValue: string | null
  pnl7d: string | null
  pnl30d: string | null
  winRate: string | null
  fillCount30d: number | null
  avgTradeNotional: string | null
  largestWin: string | null
  largestLoss: string | null
  topCoins: { coin: string; notional: number; fills: number }[]
  openPositionCount: number
  statsUpdatedAt: string
}

export type LeaderboardResponse = {
  items: LeaderboardItem[]
  total: number
  page: number
  pageSize: number
}

export const LEADERBOARD_SORTS = [
  "wallet",
  "quality",
  "pnl30d",
  "pnl7d",
  "winRate",
  "accountValue",
  "fillCount",
  "topCoin",
  "open",
  "updated",
] as const

export const leaderboardFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sortBy: z.enum(LEADERBOARD_SORTS).default("quality"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  trackedOnly: z.boolean().optional(),
})

export type LeaderboardFilters = z.infer<typeof leaderboardFiltersSchema>

// The Whales directory reuses the leaderboard query (wallets + stats) but
// defaults to sorting by account value — i.e. the biggest wallets first.
export const whaleWalletsFiltersSchema = leaderboardFiltersSchema.extend({
  sortBy: z.enum(LEADERBOARD_SORTS).default("accountValue"),
})

export type WhaleWalletsFilters = z.infer<typeof whaleWalletsFiltersSchema>

export type PositionEventItem = {
  id: string
  address: string
  coin: string
  eventType: string
  prevSzi: string | null
  newSzi: string | null
  prevNotional: string | null
  newNotional: string | null
  ts: string
  wallet: ScannerWalletInfo | null
}

export type PositionEventsResponse = {
  items: PositionEventItem[]
  total: number
  page: number
  pageSize: number
}

export const POSITION_EVENT_TYPES = [
  "opened",
  "closed",
  "increased",
  "reduced",
  "flipped",
  "reopened",
] as const

export const POSITION_EVENT_SORTS = [
  "time",
  "wallet",
  "coin",
  "event",
  "from",
  "to",
] as const

export const positionEventsFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  coin: z.string().max(20).optional(),
  eventType: z.enum(POSITION_EVENT_TYPES).optional(),
  trackedOnly: z.boolean().optional(),
  sortBy: z.enum(POSITION_EVENT_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export type PositionEventsFilters = z.infer<typeof positionEventsFiltersSchema>

export type CrowdSignalItem = {
  id: string
  coin: string
  direction: "long" | "short"
  score: string
  walletCount: number
  notional: string
  avgQuality: string | null
  windowStart: string
  windowEnd: string
  createdAt: string
  topWallets: { taker: string; notional: number; quality: number | null }[]
  directionShare: number | null
}

export type CrowdSignalsResponse = {
  items: CrowdSignalItem[]
  total: number
  page: number
  pageSize: number
}

export const CROWD_SIGNAL_SORTS = [
  "time",
  "signal",
  "score",
  "wallets",
  "notional",
  "avgQuality",
  "agreement",
] as const

export const crowdSignalsFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  coin: z.string().max(20).optional(),
  direction: z.enum(["long", "short"]).optional(),
  sortBy: z.enum(CROWD_SIGNAL_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export type CrowdSignalsFilters = z.infer<typeof crowdSignalsFiltersSchema>

export type BookWallItem = {
  side: "bid" | "ask"
  px: number
  sz: number
  usd: number
  distance: number
}

export type BookMetricsItem = {
  coin: string
  mid: string | null
  spreadBps: string | null
  bidLiquidity: Record<string, number>
  askLiquidity: Record<string, number>
  imbalance: string | null
  walls: BookWallItem[]
  updatedAt: string
}

export type BookMetricsResponse = {
  items: BookMetricsItem[]
}

export const WHALES_SORTS = [
  "time",
  "coin",
  "side",
  "size",
  "price",
  "notional",
  "buyer",
  "seller",
] as const

export const whalesFiltersSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  minNotional: z.number().min(0).optional(),
  coin: z.string().max(20).optional(),
  side: z.enum(["buy", "sell"]).optional(),
  label: z.string().max(255).optional(),
  trackedOnly: z.boolean().optional(),
  hideIgnored: z.boolean().default(true),
  minCoinVolume: z.number().min(0).optional(),
  sortBy: z.enum(WHALES_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export type WhalesFilters = z.infer<typeof whalesFiltersSchema>

const updateWalletSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  label: z.string().max(255).nullable().optional(),
  tracked: z.boolean().optional(),
  ignored: z.boolean().optional(),
})

export const ALERT_SORTS = ["time", "title", "type", "coin"] as const

const alertsPageSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sortBy: z.enum(ALERT_SORTS).default("time"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export type AlertsSortBy = (typeof ALERT_SORTS)[number]

const walletDetailSchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
})

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

// Scanner state (wallet labels/tracking, alert read state, the global pause
// switch) is shared operational data, so mutations are admin-only — matching
// the app's other admin mutations (shell settings, feedback).
async function requireAdminUser() {
  const user = await requireUser()
  if (user.role !== "admin") {
    throw new Error("Not authorized")
  }
  return user
}

const loadWhalesPageFn = createServerFn({ method: "POST" })
  .inputValidator(whalesFiltersSchema)
  .handler(async ({ data }): Promise<WhalesPageResponse> => {
    await requireUser()
    const { and, count, eq, sql, inArray } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerTrades } = await import("@/server/schema")
    const { getScannerUniverse } = await import("@/server/scanner/info")

    const universe = await getScannerUniverse().catch(() => [])
    const coins = universe.map((asset) => ({
      coin: asset.coin,
      dayNotionalVolume: asset.dayNotionalVolume,
    }))

    const taker = sql`case when ${scannerTrades.side} = 'buy' then ${scannerTrades.buyer} else ${scannerTrades.seller} end`
    const conditions = []
    if (data.minNotional !== undefined && data.minNotional > 0) {
      conditions.push(sql`${scannerTrades.notional} >= ${data.minNotional}`)
    }
    if (data.coin) conditions.push(eq(scannerTrades.coin, data.coin))
    if (data.side) conditions.push(eq(scannerTrades.side, data.side))
    if (data.trackedOnly) {
      conditions.push(
        sql`exists (select 1 from scanner_wallets w where w.tracked and (w.address = ${scannerTrades.buyer} or w.address = ${scannerTrades.seller}))`
      )
    }
    if (data.hideIgnored) {
      // Manually ignored wallets plus auto-classified market makers.
      conditions.push(
        sql`not exists (select 1 from scanner_wallets w where (w.ignored or w.auto_labels @> '["Market maker"]'::jsonb) and w.address = ${taker})`
      )
    }
    if (data.label) {
      conditions.push(
        sql`exists (select 1 from scanner_wallets w where w.label ilike ${`%${data.label}%`} and (w.address = ${scannerTrades.buyer} or w.address = ${scannerTrades.seller}))`
      )
    }
    if (data.minCoinVolume !== undefined && data.minCoinVolume > 0) {
      const allowed = universe
        .filter((asset) => asset.dayNotionalVolume >= data.minCoinVolume!)
        .map((asset) => asset.coin)
      if (allowed.length === 0) {
        return {
          items: [],
          total: 0,
          page: data.page,
          pageSize: data.pageSize,
          coins,
        }
      }
      conditions.push(inArray(scannerTrades.coin, allowed))
    }

    const sortExpr = {
      time: sql`${scannerTrades.ts}`,
      coin: sql`${scannerTrades.coin}`,
      side: sql`${scannerTrades.side}`,
      size: sql`${scannerTrades.sz}`,
      price: sql`${scannerTrades.px}`,
      notional: sql`${scannerTrades.notional}`,
      buyer: sql`${scannerTrades.buyer}`,
      seller: sql`${scannerTrades.seller}`,
    }[data.sortBy]
    const dirSql = data.dir === "asc" ? sql`asc` : sql`desc`
    // tid is a stable tiebreaker so pagination doesn't shuffle rows.
    const orderBy = sql`${sortExpr} ${dirSql} nulls last, ${scannerTrades.tid} desc`

    const where = conditions.length > 0 ? and(...conditions) : undefined
    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(scannerTrades)
        .where(where)
        .orderBy(orderBy)
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db.select({ value: count() }).from(scannerTrades).where(where),
    ])

    const items = await attachWallets(rows)
    return { items, total, page: data.page, pageSize: data.pageSize, coins }
  })

const updateScannerWalletFn = createServerFn({ method: "POST" })
  .inputValidator(updateWalletSchema)
  .handler(async ({ data }): Promise<ScannerWalletInfo> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    await requireAdminUser()
    const { sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerWallets } = await import("@/server/schema")
    const { now } = await import("@/server/util")

    const address = data.address.toLowerCase()
    const [row] = await db
      .insert(scannerWallets)
      .values({
        address,
        label: data.label ?? null,
        tracked: data.tracked ?? false,
        ignored: data.ignored ?? false,
        firstSeenAt: now(),
        lastSeenAt: now(),
        updatedAt: now(),
      })
      .onConflictDoUpdate({
        target: scannerWallets.address,
        set: {
          ...(data.label !== undefined ? { label: data.label } : {}),
          ...(data.tracked !== undefined ? { tracked: data.tracked } : {}),
          ...(data.ignored !== undefined ? { ignored: data.ignored } : {}),
          updatedAt: sql`excluded.updated_at`,
        },
      })
      .returning()
    return {
      address: row.address,
      label: row.label,
      tracked: row.tracked,
      ignored: row.ignored,
    }
  })

const loadWalletDetailFn = createServerFn({ method: "POST" })
  .inputValidator(walletDetailSchema)
  .handler(async ({ data }): Promise<ScannerWalletDetail> => {
    await requireUser()
    const { desc, eq, or } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerTrades, scannerWallets, scannerWalletStats } = await import(
      "@/server/schema"
    )

    const { scannerPositionEvents } = await import("@/server/schema")
    const address = data.address.toLowerCase()
    const [[wallet], [stats], trades, events] = await Promise.all([
      db.select().from(scannerWallets).where(eq(scannerWallets.address, address)),
      db
        .select()
        .from(scannerWalletStats)
        .where(eq(scannerWalletStats.address, address)),
      db
        .select()
        .from(scannerTrades)
        .where(
          or(eq(scannerTrades.buyer, address), eq(scannerTrades.seller, address))
        )
        .orderBy(desc(scannerTrades.ts))
        .limit(50),
      db
        .select()
        .from(scannerPositionEvents)
        .where(eq(scannerPositionEvents.address, address))
        .orderBy(desc(scannerPositionEvents.ts))
        .limit(25),
    ])

    return {
      wallet: {
        address,
        label: wallet?.label ?? null,
        tracked: wallet?.tracked ?? false,
        ignored: wallet?.ignored ?? false,
        autoLabels: (wallet?.autoLabels as string[] | undefined) ?? [],
        qualityScore: wallet?.qualityScore ?? null,
        firstSeenAt: wallet?.firstSeenAt?.toISOString() ?? null,
        lastSeenAt: wallet?.lastSeenAt?.toISOString() ?? null,
      },
      stats: stats
        ? {
            accountValue: stats.accountValue,
            pnl7d: stats.pnl7d,
            pnl30d: stats.pnl30d,
            winRate: stats.winRate,
            fillCount30d: stats.fillCount30d,
            avgTradeNotional: stats.avgTradeNotional,
            largestWin: stats.largestWin,
            largestLoss: stats.largestLoss,
            topCoins:
              (stats.topCoins as ScannerWalletStatsItem["topCoins"]) ?? [],
            openPositions:
              (stats.openPositions as ScannerOpenPosition[]) ?? [],
            avgHoldMinutes: stats.avgHoldMinutes,
            portfolioHistory:
              (stats.portfolioHistory as {
                time: number
                value: number
              }[]) ?? [],
            statsUpdatedAt: stats.statsUpdatedAt.toISOString(),
          }
        : null,
      recentTrades: await attachWallets(trades),
      positionEvents: events.map((row) => ({
        id: row.id,
        address: row.address,
        coin: row.coin,
        eventType: row.eventType,
        prevSzi: row.prevSzi,
        newSzi: row.newSzi,
        prevNotional: row.prevNotional,
        newNotional: row.newNotional,
        ts: row.ts.toISOString(),
        wallet: null,
      })),
    }
  })

const loadLeaderboardFn = createServerFn({ method: "POST" })
  .inputValidator(leaderboardFiltersSchema)
  .handler(async ({ data }): Promise<LeaderboardResponse> => {
    await requireUser()
    const { and, count, eq, sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerWallets, scannerWalletStats } = await import(
      "@/server/schema"
    )

    const sortColumns = {
      wallet: sql`coalesce(lower(${scannerWallets.label}), ${scannerWallets.address})`,
      quality: sql`${scannerWallets.qualityScore}`,
      pnl30d: sql`${scannerWalletStats.pnl30d}`,
      pnl7d: sql`${scannerWalletStats.pnl7d}`,
      winRate: sql`${scannerWalletStats.winRate}`,
      accountValue: sql`${scannerWalletStats.accountValue}`,
      fillCount: sql`${scannerWalletStats.fillCount30d}`,
      topCoin: sql`(${scannerWalletStats.topCoins} -> 0 ->> 'coin')`,
      open: sql`jsonb_array_length(coalesce(${scannerWalletStats.openPositions}, '[]'::jsonb))`,
      updated: sql`${scannerWalletStats.statsUpdatedAt}`,
    }
    const sortColumn = sortColumns[data.sortBy]
    const dirSql = data.dir === "asc" ? sql`asc` : sql`desc`
    // address is a stable tiebreaker so pagination stays deterministic.
    const orderBy = sql`${sortColumn} ${dirSql} nulls last, ${scannerWallets.address} asc`

    const conditions = [eq(scannerWallets.ignored, false)]
    if (data.trackedOnly) conditions.push(eq(scannerWallets.tracked, true))
    const where = and(...conditions)

    const base = db
      .select({
        wallet: scannerWallets,
        stats: scannerWalletStats,
      })
      .from(scannerWalletStats)
      .innerJoin(
        scannerWallets,
        eq(scannerWallets.address, scannerWalletStats.address)
      )
      .where(where)

    const [rows, [{ value: total }]] = await Promise.all([
      base
        .orderBy(orderBy)
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db
        .select({ value: count() })
        .from(scannerWalletStats)
        .innerJoin(
          scannerWallets,
          eq(scannerWallets.address, scannerWalletStats.address)
        )
        .where(where),
    ])

    return {
      items: rows.map(({ wallet, stats }) => ({
        address: wallet.address,
        label: wallet.label,
        tracked: wallet.tracked,
        autoLabels: (wallet.autoLabels as string[]) ?? [],
        qualityScore: wallet.qualityScore,
        accountValue: stats.accountValue,
        pnl7d: stats.pnl7d,
        pnl30d: stats.pnl30d,
        winRate: stats.winRate,
        fillCount30d: stats.fillCount30d,
        avgTradeNotional: stats.avgTradeNotional,
        largestWin: stats.largestWin,
        largestLoss: stats.largestLoss,
        topCoins: (stats.topCoins as LeaderboardItem["topCoins"]) ?? [],
        openPositionCount: Array.isArray(stats.openPositions)
          ? (stats.openPositions as unknown[]).length
          : 0,
        statsUpdatedAt: stats.statsUpdatedAt.toISOString(),
      })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

const loadPositionEventsFn = createServerFn({ method: "POST" })
  .inputValidator(positionEventsFiltersSchema)
  .handler(async ({ data }): Promise<PositionEventsResponse> => {
    await requireUser()
    const { and, count, eq, inArray, sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerPositionEvents, scannerWallets } = await import(
      "@/server/schema"
    )

    const conditions = []
    if (data.coin) conditions.push(eq(scannerPositionEvents.coin, data.coin))
    if (data.eventType) {
      conditions.push(eq(scannerPositionEvents.eventType, data.eventType))
    }
    if (data.trackedOnly) {
      conditions.push(
        sql`exists (select 1 from scanner_wallets w where w.tracked and w.address = ${scannerPositionEvents.address})`
      )
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortExpr = {
      time: sql`${scannerPositionEvents.ts}`,
      wallet: sql`${scannerPositionEvents.address}`,
      coin: sql`${scannerPositionEvents.coin}`,
      event: sql`${scannerPositionEvents.eventType}`,
      from: sql`${scannerPositionEvents.prevNotional}`,
      to: sql`${scannerPositionEvents.newNotional}`,
    }[data.sortBy]
    const dirSql = data.dir === "asc" ? sql`asc` : sql`desc`
    const orderBy = sql`${sortExpr} ${dirSql} nulls last, ${scannerPositionEvents.id} desc`

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(scannerPositionEvents)
        .where(where)
        .orderBy(orderBy)
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db.select({ value: count() }).from(scannerPositionEvents).where(where),
    ])

    const addresses = [...new Set(rows.map((row) => row.address))]
    const wallets =
      addresses.length > 0
        ? await db
            .select({
              address: scannerWallets.address,
              label: scannerWallets.label,
              tracked: scannerWallets.tracked,
              ignored: scannerWallets.ignored,
            })
            .from(scannerWallets)
            .where(inArray(scannerWallets.address, addresses))
        : []
    const byAddress = new Map(wallets.map((wallet) => [wallet.address, wallet]))

    return {
      items: rows.map((row) => ({
        id: row.id,
        address: row.address,
        coin: row.coin,
        eventType: row.eventType,
        prevSzi: row.prevSzi,
        newSzi: row.newSzi,
        prevNotional: row.prevNotional,
        newNotional: row.newNotional,
        ts: row.ts.toISOString(),
        wallet: byAddress.get(row.address) ?? null,
      })),
      total,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

const loadCrowdSignalsFn = createServerFn({ method: "POST" })
  .inputValidator(crowdSignalsFiltersSchema)
  .handler(async ({ data }): Promise<CrowdSignalsResponse> => {
    await requireUser()
    const { and, count, eq, sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerCrowdSignals } = await import("@/server/schema")

    const conditions = []
    if (data.coin) conditions.push(eq(scannerCrowdSignals.coin, data.coin))
    if (data.direction) {
      conditions.push(eq(scannerCrowdSignals.direction, data.direction))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    const sortExpr = {
      time: sql`${scannerCrowdSignals.createdAt}`,
      signal: sql`${scannerCrowdSignals.coin}`,
      score: sql`${scannerCrowdSignals.score}`,
      wallets: sql`${scannerCrowdSignals.walletCount}`,
      notional: sql`${scannerCrowdSignals.notional}`,
      avgQuality: sql`${scannerCrowdSignals.avgQuality}`,
      agreement: sql`(${scannerCrowdSignals.data} ->> 'directionShare')::float`,
    }[data.sortBy]
    const dirSql = data.dir === "asc" ? sql`asc` : sql`desc`
    const orderBy = sql`${sortExpr} ${dirSql} nulls last, ${scannerCrowdSignals.createdAt} desc, ${scannerCrowdSignals.id} desc`

    const [rows, [{ value: total }]] = await Promise.all([
      db
        .select()
        .from(scannerCrowdSignals)
        .where(where)
        .orderBy(orderBy)
        .limit(data.pageSize)
        .offset((data.page - 1) * data.pageSize),
      db.select({ value: count() }).from(scannerCrowdSignals).where(where),
    ])

    return {
      items: rows.map((row) => {
        const detail = (row.data ?? {}) as {
          wallets?: { taker: string; notional: number; quality: number | null }[]
          directionShare?: number
        }
        return {
          id: row.id,
          coin: row.coin,
          direction: row.direction as "long" | "short",
          score: row.score,
          walletCount: row.walletCount,
          notional: row.notional,
          avgQuality: row.avgQuality,
          windowStart: row.windowStart.toISOString(),
          windowEnd: row.windowEnd.toISOString(),
          createdAt: row.createdAt.toISOString(),
          topWallets: detail.wallets ?? [],
          directionShare: detail.directionShare ?? null,
        }
      }),
      total,
      page: data.page,
      pageSize: data.pageSize,
    }
  })

const loadBookMetricsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<BookMetricsResponse> => {
    await requireUser()
    const { desc } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerBookMetrics } = await import("@/server/schema")

    const rows = await db
      .select()
      .from(scannerBookMetrics)
      .orderBy(desc(scannerBookMetrics.updatedAt))

    return {
      items: rows.map((row) => ({
        coin: row.coin,
        mid: row.mid,
        spreadBps: row.spreadBps,
        bidLiquidity: (row.bidLiquidity as Record<string, number>) ?? {},
        askLiquidity: (row.askLiquidity as Record<string, number>) ?? {},
        imbalance: row.imbalance,
        walls: (row.walls as BookWallItem[]) ?? [],
        updatedAt: row.updatedAt.toISOString(),
      })),
    }
  }
)

const loadAlertsPageFn = createServerFn({ method: "POST" })
  .inputValidator(alertsPageSchema)
  .handler(async ({ data }): Promise<AlertsPageResponse> => {
    await requireUser()
    const { count, isNull, sql } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerAlerts } = await import("@/server/schema")

    const sortExpr = {
      time: sql`${scannerAlerts.createdAt}`,
      title: sql`lower(${scannerAlerts.title})`,
      type: sql`${scannerAlerts.type}`,
      coin: sql`${scannerAlerts.coin}`,
    }[data.sortBy]
    const dirSql = data.dir === "asc" ? sql`asc` : sql`desc`
    const orderBy = sql`${sortExpr} ${dirSql} nulls last, ${scannerAlerts.createdAt} desc, ${scannerAlerts.id} desc`

    const [rows, [{ value: total }], [{ value: unreadCount }]] =
      await Promise.all([
        db
          .select()
          .from(scannerAlerts)
          .orderBy(orderBy)
          .limit(data.pageSize)
          .offset((data.page - 1) * data.pageSize),
        db.select({ value: count() }).from(scannerAlerts),
        db
          .select({ value: count() })
          .from(scannerAlerts)
          .where(isNull(scannerAlerts.readAt)),
      ])

    return {
      items: rows.map(serializeAlert),
      total,
      page: data.page,
      pageSize: data.pageSize,
      unreadCount,
    }
  })

const markAlertsReadFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    await requireAdminUser()
    const { isNull } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerAlerts } = await import("@/server/schema")
    const { now } = await import("@/server/util")

    await db
      .update(scannerAlerts)
      .set({ readAt: now() })
      .where(isNull(scannerAlerts.readAt))
    return { ok: true }
  }
)

const markAlertReadFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ id: string; readAt: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    await requireAdminUser()
    const { and, eq, isNull } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { scannerAlerts } = await import("@/server/schema")
    const { now } = await import("@/server/util")

    const readAt = now()
    await db
      .update(scannerAlerts)
      .set({ readAt })
      .where(and(eq(scannerAlerts.id, data.id), isNull(scannerAlerts.readAt)))
    return { id: data.id, readAt: readAt.toISOString() }
  })

type TradeRow = {
  id: string
  tid: number
  ts: Date
  coin: string
  side: string
  px: string
  sz: string
  notional: string
  buyer: string
  seller: string
}

async function attachWallets(rows: TradeRow[]): Promise<WhaleTradeItem[]> {
  const { inArray } = await import("drizzle-orm")
  const { db } = await import("@/server/db")
  const { scannerWallets } = await import("@/server/schema")

  const addresses = [
    ...new Set(rows.flatMap((row) => [row.buyer, row.seller])),
  ]
  const wallets =
    addresses.length > 0
      ? await db
          .select({
            address: scannerWallets.address,
            label: scannerWallets.label,
            tracked: scannerWallets.tracked,
            ignored: scannerWallets.ignored,
          })
          .from(scannerWallets)
          .where(inArray(scannerWallets.address, addresses))
      : []
  const byAddress = new Map(wallets.map((wallet) => [wallet.address, wallet]))

  return rows.map((row) => ({
    id: row.id,
    tid: row.tid,
    ts: row.ts.toISOString(),
    coin: row.coin,
    side: row.side as "buy" | "sell",
    px: row.px,
    sz: row.sz,
    notional: row.notional,
    buyer: row.buyer,
    seller: row.seller,
    buyerWallet: byAddress.get(row.buyer) ?? null,
    sellerWallet: byAddress.get(row.seller) ?? null,
  }))
}

function serializeAlert(row: {
  id: string
  type: string
  coin: string | null
  address: string | null
  title: string
  body: string | null
  createdAt: Date
  readAt: Date | null
}): ScannerAlertItem {
  return {
    id: row.id,
    type: row.type,
    coin: row.coin,
    address: row.address,
    title: row.title,
    body: row.body,
    created_at: row.createdAt.toISOString(),
    read_at: row.readAt?.toISOString() ?? null,
  }
}

export function loadWhalesPage(filters: Partial<WhalesFilters> = {}) {
  return loadWhalesPageFn({ data: whalesFiltersSchema.parse(filters) })
}

export function updateScannerWallet(input: z.infer<typeof updateWalletSchema>) {
  return updateScannerWalletFn({ data: input })
}

export function loadWalletDetail(address: string) {
  return loadWalletDetailFn({ data: { address } })
}

export function loadLeaderboard(filters: Partial<LeaderboardFilters> = {}) {
  return loadLeaderboardFn({ data: leaderboardFiltersSchema.parse(filters) })
}

export function loadWhaleWallets(filters: Partial<WhaleWalletsFilters> = {}) {
  return loadLeaderboardFn({ data: whaleWalletsFiltersSchema.parse(filters) })
}

export function loadPositionEvents(
  filters: Partial<PositionEventsFilters> = {}
) {
  return loadPositionEventsFn({
    data: positionEventsFiltersSchema.parse(filters),
  })
}

export function loadCrowdSignals(filters: Partial<CrowdSignalsFilters> = {}) {
  return loadCrowdSignalsFn({ data: crowdSignalsFiltersSchema.parse(filters) })
}

export function loadBookMetrics() {
  return loadBookMetricsFn()
}

export function loadAlertsPage(
  page = 1,
  pageSize = 25,
  sortBy: AlertsSortBy = "time",
  dir: "asc" | "desc" = "desc"
) {
  return loadAlertsPageFn({ data: { page, pageSize, sortBy, dir } })
}

export function markAlertsRead() {
  return markAlertsReadFn()
}

export function markAlertRead(id: string) {
  return markAlertReadFn({ data: { id } })
}
