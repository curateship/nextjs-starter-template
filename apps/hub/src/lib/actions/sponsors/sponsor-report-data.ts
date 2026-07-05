import 'server-only'

import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sponsorDailyAnalytics, sponsorPortalLinks, sponsors } from '@/lib/db/schema'
import { hashSponsorReportToken, isValidSponsorReportTokenFormat } from '@/lib/utils/sponsor-report-token'

export type SponsorReportRange = '7d' | '30d' | '90d'

export const SPONSOR_REPORT_RANGES: SponsorReportRange[] = ['7d', '30d', '90d']
export const DEFAULT_SPONSOR_REPORT_RANGE: SponsorReportRange = '30d'

const RANGE_DAYS: Record<SponsorReportRange, number> = { '7d': 7, '30d': 30, '90d': 90 }

export function normalizeSponsorReportRange(value: string | undefined | null): SponsorReportRange {
  return SPONSOR_REPORT_RANGES.includes(value as SponsorReportRange)
    ? (value as SponsorReportRange)
    : DEFAULT_SPONSOR_REPORT_RANGE
}

export interface SponsorReportDay {
  day: string
  impressions: number
  clicks: number
}

export interface SponsorReportPlacement {
  source_path: string
  impressions: number
  clicks: number
  ctr: number
}

export interface SponsorReport {
  sponsor_title: string
  range: SponsorReportRange
  start_day: string
  end_day: string
  total_impressions: number
  total_clicks: number
  ctr: number
  daily: SponsorReportDay[]
  top_placements: SponsorReportPlacement[]
}

export function calculateCtr(impressions: number, clicks: number): number {
  if (impressions <= 0) return 0
  return Math.round((clicks / impressions) * 10000) / 100
}

/**
 * Resolve a portal token to its sponsor. Returns null for malformed, unknown,
 * expired, or revoked tokens without distinguishing between those cases.
 */
export async function resolveSponsorReportToken(token: string | undefined | null) {
  if (!isValidSponsorReportTokenFormat(token)) return null

  const tokenHash = hashSponsorReportToken(token)
  const now = new Date()

  const [row] = await db
    .select({
      linkId: sponsorPortalLinks.id,
      sponsorId: sponsors.id,
      sponsorTitle: sponsors.title,
    })
    .from(sponsorPortalLinks)
    .innerJoin(sponsors, eq(sponsors.id, sponsorPortalLinks.sponsorId))
    .where(and(
      eq(sponsorPortalLinks.tokenHash, tokenHash),
      isNull(sponsorPortalLinks.revokedAt),
      gte(sponsorPortalLinks.expiresAt, now)
    ))
    .limit(1)

  if (!row) return null

  db.update(sponsorPortalLinks)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(sponsorPortalLinks.id, row.linkId))
    .catch(() => {})

  return { sponsor_id: row.sponsorId, sponsor_title: row.sponsorTitle }
}

function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Aggregate report for a single sponsor over the selected range. Aggregate data only. */
export async function getSponsorReport(sponsorId: string, sponsorTitle: string, range: SponsorReportRange): Promise<SponsorReport> {
  const days = RANGE_DAYS[range]
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  const startDay = toDayString(start)
  const endDay = toDayString(end)

  const rows = await db
    .select({
      day: sponsorDailyAnalytics.day,
      sourcePath: sponsorDailyAnalytics.sourcePath,
      impressions: sponsorDailyAnalytics.impressions,
      clicks: sponsorDailyAnalytics.clicks,
    })
    .from(sponsorDailyAnalytics)
    .where(and(
      eq(sponsorDailyAnalytics.sponsorId, sponsorId),
      gte(sponsorDailyAnalytics.day, startDay),
      lte(sponsorDailyAnalytics.day, endDay)
    ))

  const byDay = new Map<string, SponsorReportDay>()
  for (let i = 0; i < days; i++) {
    const day = toDayString(new Date(start.getTime() + i * 86_400_000))
    byDay.set(day, { day, impressions: 0, clicks: 0 })
  }

  const byPath = new Map<string, { impressions: number; clicks: number }>()
  let totalImpressions = 0
  let totalClicks = 0

  for (const row of rows) {
    totalImpressions += row.impressions
    totalClicks += row.clicks

    const dayEntry = byDay.get(row.day)
    if (dayEntry) {
      dayEntry.impressions += row.impressions
      dayEntry.clicks += row.clicks
    }

    const pathEntry = byPath.get(row.sourcePath) ?? { impressions: 0, clicks: 0 }
    pathEntry.impressions += row.impressions
    pathEntry.clicks += row.clicks
    byPath.set(row.sourcePath, pathEntry)
  }

  const topPlacements = Array.from(byPath.entries())
    .map(([sourcePath, totals]) => ({
      source_path: sourcePath,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: calculateCtr(totals.impressions, totals.clicks),
    }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, 20)

  return {
    sponsor_title: sponsorTitle,
    range,
    start_day: startDay,
    end_day: endDay,
    total_impressions: totalImpressions,
    total_clicks: totalClicks,
    ctr: calculateCtr(totalImpressions, totalClicks),
    daily: Array.from(byDay.values()),
    top_placements: topPlacements,
  }
}

/** Record a sponsor click against today's aggregate row. Never throws. */
export async function recordSponsorClick(siteId: string, sponsorId: string, sourcePath: string, placement = 'post_editor') {
  try {
    const day = new Date().toISOString().slice(0, 10)
    await db.execute(sql`
      INSERT INTO sponsor_daily_analytics (site_id, sponsor_id, day, placement, source_path, impressions, clicks, updated_at)
      VALUES (${siteId}::uuid, ${sponsorId}::uuid, ${day}::date, ${placement}, ${sourcePath}, 0, 1, now())
      ON CONFLICT (sponsor_id, day, placement, source_path) DO UPDATE SET
        clicks = sponsor_daily_analytics.clicks + 1,
        updated_at = now()
    `)
  } catch (error) {
    console.error('Sponsor click tracking error:', error)
  }
}
