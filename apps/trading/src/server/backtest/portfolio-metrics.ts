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
type MarketCurve = { start: number; curve: BacktestEquityPoint[] }

/** One point on the summed basket curve: bar time and total basket equity. */
type CombinedPoint = { t: number; total: number }

/**
 * Blends every market's equity curve into one combined basket curve. Equal-
 * weight, no rebalancing: each market compounds from its own starting capital
 * and we sum them at each bar. A market's capital sits idle (flat at its start)
 * before its history begins, so markets with shorter histories don't distort
 * the early basket. Returns the total starting capital plus the summed curve.
 */
function blendCurves(
  markets: MarketCurve[]
): { totalStart: number; series: CombinedPoint[] } | null {
  const ms = markets
    .filter((m) => Array.isArray(m.curve) && m.curve.length > 0)
    .map((m) => ({
      start: m.start,
      pts: [...m.curve].sort((a, b) => a.t - b.t),
    }))
  if (ms.length === 0) return null
  const totalStart = ms.reduce((sum, m) => sum + m.start, 0)
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
    let total = 0
    for (const v of cur) total += v
    series.push({ t, total })
  }
  return { totalStart, series }
}

/** Reads the combined basket's risk (drawdown + underwater low) from its curve. */
function computeCombined(markets: MarketCurve[]): GroupPortfolioMetrics | null {
  const blended = blendCurves(markets)
  if (!blended) return null
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
    markets: markets.filter(
      (m) => Array.isArray(m.curve) && m.curve.length > 0
    ).length,
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
  { sig: string; metrics: GroupPortfolioMetrics | null }
>()

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
    const hit = cache.get(`${userId}:${groupId}`)
    if (hit && hit.sig === sig) {
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
      cache.set(`${userId}:${groupId}`, {
        sig: sigByGroup.get(groupId) ?? "0:",
        metrics,
      })
      if (metrics) result[groupId] = metrics
    }
  }

  return result
}

/**
 * The combined equity curve for a single run group — the same blend as the risk
 * metrics, downsampled for the results-page P&L chart. Returns null when the
 * group has no completed markets with equity curves.
 */
export async function loadGroupCombinedCurve(
  userId: string,
  groupId: string,
  database: CustomShellDb = db
): Promise<GroupCombinedCurve | null> {
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
  const markets: MarketCurve[] = []
  for (const row of rows) {
    if (!row.curve) continue
    markets.push({ start: Number(row.startingEquity), curve: row.curve })
  }
  const blended = blendCurves(markets)
  if (!blended) return null
  return {
    startEquity: blended.totalStart,
    points: downsample(blended.series),
  }
}
