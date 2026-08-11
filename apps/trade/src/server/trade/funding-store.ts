import { and, asc, eq, gt, gte, lt, sql } from "drizzle-orm"

import { parseMarketKey, type FundingRate, type MarketKey } from "@/lib/protocols/contracts"
import { db, type CustomShellDb } from "@/server/db"
import { fundingOf, getProtocol } from "@/server/protocols/registry"
import {
  tradeFundingCoverage,
  tradeFundingGaps,
  tradeFundingRates,
} from "@/server/trade/schema"

const HOUR_MS = 3_600_000
const WRITE_BATCH = 500

export type FundingGap = { from: number; to: number; reason: string }
export type FundingCoverageReport = {
  rateCount: number
  gaps: readonly FundingGap[]
}

/** Fetch only the uncovered ends of a historical funding window. */
export async function ensureFundingCoverage(
  marketKey: MarketKey,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<FundingCoverageReport> {
  const ref = parseMarketKey(marketKey)
  if (!ref) throw new Error(`"${marketKey}" is not a market this app knows.`)
  if (!(to > from)) return { rateCount: 0, gaps: [] }

  const [covered] = await database
    .select()
    .from(tradeFundingCoverage)
    .where(eq(tradeFundingCoverage.marketKey, marketKey))

  const missing: Array<{ from: number; to: number }> = []
  if (!covered) missing.push({ from, to })
  else {
    if (from < covered.fromTime) {
      missing.push({ from, to: Math.min(to, covered.fromTime) })
    }
    if (to > covered.toTime) {
      missing.push({ from: Math.max(from, covered.toTime), to })
    }
  }

  const feed = fundingOf(getProtocol(ref.protocol))
  for (const end of missing) {
    if (!(end.to > end.from)) continue
    await writeRates(
      marketKey,
      await feed.fetch(ref.network, ref.marketId, end.from, end.to),
      database
    )
  }

  if (missing.length > 0) {
    await database
      .insert(tradeFundingCoverage)
      .values({
        marketKey,
        fromTime: Math.min(from, covered?.fromTime ?? from),
        toTime: Math.max(to, covered?.toTime ?? to),
      })
      .onConflictDoUpdate({
        target: tradeFundingCoverage.marketKey,
        set: {
          fromTime: sql`least(${tradeFundingCoverage.fromTime}, ${from})`,
          toTime: sql`greatest(${tradeFundingCoverage.toTime}, ${to})`,
          updatedAt: sql`now()`,
        },
      })
  }

  const rates = await loadStoredFunding(marketKey, from, to, database)
  const gaps = fundingGaps(from, to, rates, feed.intervalMs(ref.marketId))
  await recordGaps(marketKey, from, to, gaps, database)
  return { rateCount: rates.length, gaps }
}

async function writeRates(
  marketKey: MarketKey,
  rates: readonly FundingRate[],
  database: CustomShellDb
): Promise<void> {
  for (let start = 0; start < rates.length; start += WRITE_BATCH) {
    await database
      .insert(tradeFundingRates)
      .values(
        rates.slice(start, start + WRITE_BATCH).map((one) => ({
          marketKey,
          time: one.time,
          rate: one.rate,
        }))
      )
      .onConflictDoNothing()
  }
}

/** Every expected settlement absent from a window, joined into spans. */
export function fundingGaps(
  from: number,
  to: number,
  rates: readonly FundingRate[],
  intervalMs = HOUR_MS
): FundingGap[] {
  const present = new Set(
    rates.map((one) => Math.floor(one.time / HOUR_MS) * HOUR_MS)
  )
  const first = Math.ceil(from / intervalMs) * intervalMs
  const gaps: FundingGap[] = []
  let gapFrom: number | null = null

  for (let time = first; time < to; time += intervalMs) {
    if (!present.has(time) && gapFrom === null) gapFrom = time
    if (present.has(time) && gapFrom !== null) {
      gaps.push(missingGap(gapFrom, time))
      gapFrom = null
    }
  }
  if (gapFrom !== null) gaps.push(missingGap(gapFrom, to))
  return gaps
}

function missingGap(from: number, to: number): FundingGap {
  return {
    from,
    to,
    reason: "The exchange has no funding history for this stretch.",
  }
}

async function recordGaps(
  marketKey: MarketKey,
  from: number,
  to: number,
  gaps: readonly FundingGap[],
  database: CustomShellDb
): Promise<void> {
  await database
    .delete(tradeFundingGaps)
    .where(
      and(
        eq(tradeFundingGaps.marketKey, marketKey),
        lt(tradeFundingGaps.fromTime, to),
        gt(tradeFundingGaps.toTime, from)
      )
    )
  if (gaps.length === 0) return
  await database
    .insert(tradeFundingGaps)
    .values(
      gaps.map((gap) => ({
        marketKey,
        fromTime: gap.from,
        toTime: gap.to,
        reason: gap.reason,
      }))
    )
    .onConflictDoUpdate({
      target: [tradeFundingGaps.marketKey, tradeFundingGaps.fromTime],
      set: { toTime: sql`excluded.to_time`, reason: sql`excluded.reason` },
    })
}

export async function loadStoredFunding(
  marketKey: MarketKey,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<FundingRate[]> {
  return database
    .select({ time: tradeFundingRates.time, rate: tradeFundingRates.rate })
    .from(tradeFundingRates)
    .where(
      and(
        eq(tradeFundingRates.marketKey, marketKey),
        gte(tradeFundingRates.time, from),
        lt(tradeFundingRates.time, to)
      )
    )
    .orderBy(asc(tradeFundingRates.time))
}

export async function listFundingGaps(
  marketKey: MarketKey,
  from: number,
  to: number,
  database: CustomShellDb = db
): Promise<FundingGap[]> {
  const rows = await database
    .select()
    .from(tradeFundingGaps)
    .where(
      and(
        eq(tradeFundingGaps.marketKey, marketKey),
        lt(tradeFundingGaps.fromTime, to),
        gte(tradeFundingGaps.toTime, from)
      )
    )
    .orderBy(asc(tradeFundingGaps.fromTime))
  return rows.map((row) => ({
    from: row.fromTime,
    to: row.toTime,
    reason: row.reason,
  }))
}
