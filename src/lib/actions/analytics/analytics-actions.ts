'use server'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

interface DateRange {
  from: string  // ISO date string
  to: string    // ISO date string
}

function getDateRange(period: string): DateRange {
  const now = new Date()
  const to = new Date(now)
  to.setHours(23, 59, 59, 999)

  const from = new Date(now)
  switch (period) {
    case 'today':
      from.setHours(0, 0, 0, 0)
      break
    case 'yesterday':
      from.setDate(from.getDate() - 1)
      from.setHours(0, 0, 0, 0)
      to.setDate(to.getDate() - 1)
      to.setHours(23, 59, 59, 999)
      break
    case '30d':
      from.setDate(from.getDate() - 30)
      from.setHours(0, 0, 0, 0)
      break
    case '7d':
    default:
      from.setDate(from.getDate() - 7)
      from.setHours(0, 0, 0, 0)
      break
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

export async function getAnalyticsOverview(siteId: string, period: string) {
  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`SELECT * FROM get_analytics_overview(${siteId}::uuid, ${from}::timestamptz, ${to}::timestamptz)`)

    if (!result.rows || result.rows.length === 0) {
      return { pageViews: 0, uniqueVisitors: 0, bounceRate: 0, avgDuration: 0 }
    }

    const row = result.rows[0] as Record<string, unknown>
    return {
      pageViews: Number(row.page_views ?? row.pageviews ?? 0),
      uniqueVisitors: Number(row.unique_visitors ?? row.uniquevisitors ?? 0),
      bounceRate: Number(row.bounce_rate ?? row.bouncerate ?? 0),
      avgDuration: Number(row.avg_duration ?? row.avgduration ?? 0),
    } as { pageViews: number; uniqueVisitors: number; bounceRate: number; avgDuration: number }
  } catch (error) {
    console.error('Failed to get analytics overview:', error)
    return { pageViews: 0, uniqueVisitors: 0, bounceRate: 0, avgDuration: 0 }
  }
}

export async function getTopPages(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`SELECT * FROM get_top_pages(${siteId}::uuid, ${from}::timestamptz, ${to}::timestamptz, ${limit}::int)`)

    return (result.rows as { path: string; views: number }[]) || []
  } catch (error) {
    console.error('Failed to get top pages:', error)
    return []
  }
}

export async function getTopReferrers(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`SELECT * FROM get_top_referrers(${siteId}::uuid, ${from}::timestamptz, ${to}::timestamptz, ${limit}::int)`)

    return (result.rows as { domain: string; visits: number }[]) || []
  } catch (error) {
    console.error('Failed to get top referrers:', error)
    return []
  }
}

export async function getTrafficOverTime(siteId: string, period: string) {
  const { from, to } = getDateRange(period)
  const useHourly = period === 'today' || period === 'yesterday'

  try {
    const result = await db.execute(sql`SELECT * FROM get_traffic_over_time(${siteId}::uuid, ${from}::timestamptz, ${to}::timestamptz, ${useHourly}::bool)`)

    return (result.rows as { date: string; views: number; visitors: number }[]) || []
  } catch (error) {
    console.error('Failed to get traffic over time:', error)
    return []
  }
}

export async function getUserJourneys(siteId: string, period: string, limit = 10) {
  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`SELECT * FROM get_user_journeys(${siteId}::uuid, ${from}::timestamptz, ${to}::timestamptz, ${limit}::int)`)

    return (result.rows as { path: string; count: number }[]) || []
  } catch (error) {
    console.error('Failed to get user journeys:', error)
    return []
  }
}

/**
 * Lightweight site fetch for dashboard — skips auth since admin layout already verified.
 * Only fetches fields needed for display.
 */
export async function getSiteForDashboard(siteId: string) {
  const result = await db
    .select({ id: sites.id, name: sites.name, subdomain: sites.subdomain })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1)

  return (result[0] as { id: string; name: string; subdomain: string } | undefined) ?? null
}
