import { and, eq, inArray, sql } from "drizzle-orm"

import type {
  BacktestEquityPoint,
  GroupCombinedCurve,
  GroupPortfolioMetrics,
} from "@/lib/backtest/types"
import { db, type CustomShellDb } from "@/server/db"
import { tradingBacktests } from "@/server/schema"

/**
 * One market's inputs to the blend: its starting capital and its equity curve.
 */
type MarketCurve = {
  start: number
  curve: BacktestEquityPoint[]
}

/** One point on the summed basket curve: bar time and total basket equity. */
type CombinedPoint = { t: number; total: number }
type BlendedCurve = { totalStart: number; series: CombinedPoint[] }

/**
 * Blends every market's equity curve into one combined basket curve.
 *
 * THE POT IS THE STARTING BALANCE, ONCE. Every market in a group runs the same
 * starting balance, and that one balance is the basket's capital — testing
 * four markets does not mean four accounts existed. So the curve starts at that
 * single number and each market adds its PROFIT to it, rather than each market
 * contributing a whole account to a summed total. Summing the accounts was
 * tried and reported a real loss at roughly a quarter of its size (July 26,
 * 2026), and it put this drawdown on a different denominator from the Net P&L
 * beside it.
 *
 * A market's profit is 0 (flat at its start) before its history begins, so
 * markets with shorter histories don't distort the early basket. Returns the
 * pot plus the combined curve.
 */
export function blendCurves(markets: MarketCurve[]): BlendedCurve | null {
  const ms = markets
    .filter((m) => Array.isArray(m.curve) && m.curve.length > 0)
    .map((m) => ({
      start: m.start,
      pts: [...m.curve].sort((a, b) => a.t - b.t),
    }))
  if (ms.length === 0) return null
  // Every market in a group runs the same starting balance, so this is just
  // "the pot" — taken as the largest rather than the first so a group that
  // somehow holds mixed balances still answers the same way whatever order the
  // rows come back in.
  const totalStart = Math.max(...ms.map((market) => market.start))
  if (totalStart <= 0) return null

  // Union of every bar time across all markets, in order.
  const tset = new Set<number>()
  for (const m of ms) for (const p of m.pts) tset.add(p.t)
  const times = [...tset].sort((a, b) => a - b)

  // Step-forward fill: hold each market's last equity between its own bars,
  // and its starting capital before its first bar.
  const idx = ms.map(() => 0)
  const cur = ms.map((m) => m.start)
  const series: CombinedPoint[] = []
  for (const t of times) {
    for (let i = 0; i < ms.length; i++) {
      const pts = ms[i].pts
      while (idx[i] < pts.length && pts[idx[i]].t <= t) {
        cur[i] = pts[idx[i]].eq
        idx[i]++
      }
    }
    let total = totalStart
    for (let index = 0; index < cur.length; index += 1) {
      total += cur[index] - ms[index].start
    }
    series.push({ t, total })
  }
  return { totalStart, series }
}

/** Reads the combined basket's risk (drawdown + underwater low) from its curve. */
function computeCombined(markets: MarketCurve[]): GroupPortfolioMetrics | null {
  const blended = blendCurves(markets)
  if (!blended) return null
  return computeCombinedFromBlend(
    blended,
    markets.filter((market) => market.curve.length > 0).length
  )
}

function computeCombinedFromBlend(
  blended: BlendedCurve,
  marketCount: number
): GroupPortfolioMetrics {
  const { totalStart, series } = blended

  let peak = -Infinity
  let maxDrawdown = 0
  let drawdownAt: number | null = null
  let minTotal = Infinity
  let minTotalAt: number | null = null
  for (const { t, total } of series) {
    if (total > peak) peak = total
    if (peak > 0) {
      const dd = (total - peak) / peak
      if (dd < maxDrawdown) {
        maxDrawdown = dd
        drawdownAt = t
      }
    }
    if (total < minTotal) {
      minTotal = total
      minTotalAt = t
    }
  }

  return {
    markets: marketCount,
    startEquity: totalStart,
    combinedDrawdownPct: maxDrawdown * 100,
    drawdownAt,
    bucketLowPct: Math.min(0, (minTotal / totalStart - 1) * 100),
    bucketLowAt: minTotalAt,
  }
}

/** UI point ceiling for the results-page P&L chart. */
const MAX_CURVE_POINTS = 300

/** Even-stride downsample that always keeps the first and last points. */
function downsample(series: CombinedPoint[]): BacktestEquityPoint[] {
  if (series.length <= MAX_CURVE_POINTS)
    return series.map((p) => ({ t: p.t, eq: p.total }))
  const step = (series.length - 1) / (MAX_CURVE_POINTS - 1)
  const out: BacktestEquityPoint[] = []
  for (let i = 0; i < MAX_CURVE_POINTS; i++) {
    const p = series[Math.round(i * step)]
    out.push({ t: p.t, eq: p.total })
  }
  return out
}

/**
 * Cache keyed by `${userId}:${groupId}`. The signature is a cheap fingerprint
 * of the group's completed rows (count + latest completion) so a re-run
 * invalidates it, but plain re-navigation reuses the last blend instead of
 * re-loading every equity curve.
 */
const cache = new Map<
  string,
  {
    sig: string
    metrics: GroupPortfolioMetrics | null
    expiresAt: number
  }
>()
const CACHE_MAX_GROUPS = 500
const CACHE_TTL_MS = 15 * 60_000

function readCache(key: string, sig: string) {
  const hit = cache.get(key)
  if (!hit || hit.sig !== sig || hit.expiresAt <= Date.now()) {
    if (hit) cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, hit)
  return hit
}

function writeCache(
  key: string,
  sig: string,
  metrics: GroupPortfolioMetrics | null
) {
  cache.delete(key)
  cache.set(key, {
    sig,
    metrics,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })
  while (cache.size > CACHE_MAX_GROUPS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/**
 * Combined-basket risk for each requested run group. Only completed markets
 * count. Groups with no finished markets are omitted from the result.
 */
export async function loadGroupPortfolioMetrics(
  userId: string,
  groupIds: string[],
  database: CustomShellDb = db
): Promise<Record<string, GroupPortfolioMetrics>> {
  const ids = [...new Set(groupIds)].filter(Boolean)
  if (ids.length === 0) return {}

  // Cheap fingerprint per group — no curves loaded yet.
  const sigRows = await database
    .select({
      groupId: tradingBacktests.groupId,
      count: sql<number>`count(*)::int`,
      last: sql<string | null>`max(${tradingBacktests.completedAt})`,
    })
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        inArray(tradingBacktests.groupId, ids),
        eq(tradingBacktests.status, "done")
      )
    )
    .groupBy(tradingBacktests.groupId)
  const sigByGroup = new Map<string, string>()
  for (const row of sigRows)
    sigByGroup.set(row.groupId, `${row.count}:${row.last ?? ""}`)

  const result: Record<string, GroupPortfolioMetrics> = {}
  const toLoad: string[] = []
  for (const groupId of ids) {
    const sig = sigByGroup.get(groupId) ?? "0:"
    const hit = readCache(`${userId}:${groupId}`, sig)
    if (hit) {
      if (hit.metrics) result[groupId] = hit.metrics
    } else {
      toLoad.push(groupId)
    }
  }

  if (toLoad.length > 0) {
    const rows = await database
      .select({
        groupId: tradingBacktests.groupId,
        startingEquity: tradingBacktests.startingEquity,
        curve: sql<
          BacktestEquityPoint[] | null
        >`${tradingBacktests.result} -> 'equityCurve'`,
      })
      .from(tradingBacktests)
      .where(
        and(
          eq(tradingBacktests.userId, userId),
          inArray(tradingBacktests.groupId, toLoad),
          eq(tradingBacktests.status, "done")
        )
      )
    const byGroup = new Map<string, MarketCurve[]>()
    for (const row of rows) {
      if (!row.curve) continue
      const list = byGroup.get(row.groupId) ?? []
      list.push({ start: Number(row.startingEquity), curve: row.curve })
      byGroup.set(row.groupId, list)
    }
    for (const groupId of toLoad) {
      const metrics = computeCombined(byGroup.get(groupId) ?? [])
      writeCache(
        `${userId}:${groupId}`,
        sigByGroup.get(groupId) ?? "0:",
        metrics
      )
      if (metrics) result[groupId] = metrics
    }
  }

  return result
}

export async function loadGroupPortfolioSummary(
  userId: string,
  groupId: string,
  database: CustomShellDb = db
): Promise<{
  metrics: GroupPortfolioMetrics | null
  curve: GroupCombinedCurve | null
}> {
  const rows = await database
    .select({
      startingEquity: tradingBacktests.startingEquity,
      curve: sql<
        BacktestEquityPoint[] | null
      >`${tradingBacktests.result} -> 'equityCurve'`,
    })
    .from(tradingBacktests)
    .where(
      and(
        eq(tradingBacktests.userId, userId),
        eq(tradingBacktests.groupId, groupId),
        eq(tradingBacktests.status, "done")
      )
    )
  const markets = rows.flatMap((row) =>
    row.curve && row.curve.length > 0
      ? [{ start: Number(row.startingEquity), curve: row.curve }]
      : []
  )
  const blended = blendCurves(markets)
  if (!blended) return { metrics: null, curve: null }
  return {
    metrics: computeCombinedFromBlend(blended, markets.length),
    curve: {
      startEquity: blended.totalStart,
      points: downsample(blended.series),
    },
  }
}
