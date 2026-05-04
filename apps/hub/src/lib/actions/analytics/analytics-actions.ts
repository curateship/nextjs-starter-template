'use server'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAnalyticsAccess(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return false

  const user = await getAuthenticatedUser()
  if (!user) return false
  if (user.role === 'super_admin') return true

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)

  return !!site
}

function clampLimit(limit: number) {
  return Math.min(100, Math.max(1, Math.floor(limit || 10)))
}

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
  if (!await verifyAnalyticsAccess(siteId)) {
    return { pageViews: 0, uniqueVisitors: 0 }
  }

  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`
      SELECT
        (
          SELECT COALESCE(SUM(page_views), 0)::int
          FROM analytic_daily_visitors
          WHERE site_id = ${siteId}::uuid
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
        ) AS page_views,
        (
          SELECT COALESCE(SUM(unique_visitors), 0)::int
          FROM analytic_daily_visitors
          WHERE site_id = ${siteId}::uuid
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
        ) AS unique_visitors
    `)

    if (!result.rows || result.rows.length === 0) {
      return { pageViews: 0, uniqueVisitors: 0 }
    }

    const data = (result.rows[0] as any) || {}
    return {
      pageViews: Number(data.page_views ?? 0),
      uniqueVisitors: Number(data.unique_visitors ?? 0),
    } as { pageViews: number; uniqueVisitors: number }
  } catch {
    return { pageViews: 0, uniqueVisitors: 0 }
  }
}

export async function getTopPages(siteId: string, period: string, limit = 10) {
  if (!await verifyAnalyticsAccess(siteId)) return []

  const { from, to } = getDateRange(period)
  const safeLimit = clampLimit(limit)

  try {
    const result = await db.execute(sql`
      SELECT page_counts.path, SUM(page_counts.views::int)::int AS views
      FROM analytic_daily_visitors ads
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(ads.pages, '{}'::jsonb)) AS page_counts(path, views)
      WHERE ads.site_id = ${siteId}::uuid
        AND ads.day >= ${from}::timestamptz::date
        AND ads.day <= ${to}::timestamptz::date
      GROUP BY page_counts.path
      ORDER BY views DESC
      LIMIT ${safeLimit}
    `)

    return (result.rows || []).map((row: any) => ({
      path: String(row.path),
      views: Number(row.views),
    }))
  } catch {
    return []
  }
}

export async function getTopReferrers(siteId: string, period: string, limit = 10) {
  if (!await verifyAnalyticsAccess(siteId)) return []

  const { from, to } = getDateRange(period)
  const safeLimit = clampLimit(limit)

  try {
    const result = await db.execute(sql`
      SELECT referrer_counts.domain, SUM(referrer_counts.visits::int)::int AS visits
      FROM analytic_daily_visitors ads
      CROSS JOIN LATERAL jsonb_each_text(COALESCE(ads.referrers, '{}'::jsonb)) AS referrer_counts(domain, visits)
      WHERE ads.site_id = ${siteId}::uuid
        AND ads.day >= ${from}::timestamptz::date
        AND ads.day <= ${to}::timestamptz::date
      GROUP BY referrer_counts.domain
      ORDER BY visits DESC
      LIMIT ${safeLimit}
    `)

    return (result.rows || []).map((row: any) => ({
      domain: String(row.domain),
      visits: Number(row.visits),
    }))
  } catch {
    return []
  }
}

export async function getTrafficOverTime(siteId: string, period: string) {
  if (!await verifyAnalyticsAccess(siteId)) return []

  const { from, to } = getDateRange(period)

  try {
    const result = await db.execute(sql`
      SELECT
        to_char(ads.day, 'Mon DD') AS date,
        ads.page_views::int AS views,
        ads.unique_visitors::int AS visitors
      FROM analytic_daily_visitors ads
      WHERE ads.site_id = ${siteId}::uuid
        AND ads.day >= ${from}::timestamptz::date
        AND ads.day <= ${to}::timestamptz::date
      ORDER BY ads.day
    `)

    return (result.rows || []).map((row: any) => ({
      date: String(row.date),
      views: Number(row.views),
      visitors: Number(row.visitors),
    }))
  } catch {
    return []
  }
}

/**
 * Lightweight site fetch for dashboard — skips auth since admin layout already verified.
 * Only fetches fields needed for display.
 */
export async function getSiteForDashboard(siteId: string) {
  if (!await verifyAnalyticsAccess(siteId)) return null

  const result = await db
    .select({
      id: sites.id,
      name: sites.name,
      status: sites.status,
      subdomain: sites.subdomain,
      customDomain: sites.customDomain,
      settings: sites.settings,
    })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1)

  return (result[0] as {
    id: string
    name: string
    status: string
    subdomain: string
    customDomain: string | null
    settings: Record<string, unknown>
  } | undefined) ?? null
}
