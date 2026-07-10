'use server'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { cache } from 'react'
import { UUID_REGEX } from '@/lib/utils/validation'

const verifyAnalyticsAccess = cache(async (siteId: string) => {
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
})

function clampLimit(limit: number) {
  return Math.min(100, Math.max(1, Math.floor(limit || 10)))
}

function normalizeAnalyticsHost(host: string) {
  return host
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.replace(/^www\./i, '')
    .toLowerCase() || 'localhost'
}

interface DateRange {
  from: string  // ISO date string
  to: string    // ISO date string
}

export type DashboardRange = 'today' | 'yesterday' | '7d' | '30d' | '365d'

interface DashboardChartPoint {
  label: string
  pageViews: number
  visitors: number
  contacts: number
  orders: number
  revenue: number
}

export interface SiteDashboardMetrics {
  totals: {
    visitors: number
    contacts: number
    orders: number
    revenue: number
  }
  previousTotals: {
    visitors: number
    contacts: number
    orders: number
    revenue: number
  }
  chartData: DashboardChartPoint[]
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
    case '365d':
      from.setDate(from.getDate() - 365)
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

function normalizeDashboardRange(range: string): DashboardRange {
  return range === 'today' ||
    range === 'yesterday' ||
    range === '30d' ||
    range === '365d'
    ? range
    : '7d'
}

function getUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getDashboardDateRange(range: DashboardRange) {
  const today = getUtcDay(new Date())
  const endOfToday = new Date(today)
  endOfToday.setUTCHours(23, 59, 59, 999)

  if (range === 'today') {
    return { from: today.toISOString(), to: endOfToday.toISOString(), days: 1, groupBy: 'day' as const }
  }

  if (range === 'yesterday') {
    const yesterday = addUtcDays(today, -1)
    const endOfYesterday = new Date(yesterday)
    endOfYesterday.setUTCHours(23, 59, 59, 999)
    return { from: yesterday.toISOString(), to: endOfYesterday.toISOString(), days: 1, groupBy: 'day' as const }
  }

  if (range === '30d') {
    return { from: addUtcDays(today, -29).toISOString(), to: endOfToday.toISOString(), days: 30, groupBy: 'day' as const }
  }

  if (range === '365d') {
    return { from: addUtcDays(today, -364).toISOString(), to: endOfToday.toISOString(), days: 365, groupBy: 'month' as const }
  }

  return { from: addUtcDays(today, -6).toISOString(), to: endOfToday.toISOString(), days: 7, groupBy: 'day' as const }
}

function getPreviousDashboardDateRange(from: string, days: number) {
  const currentFrom = new Date(from)
  const previousFrom = addUtcDays(currentFrom, -days)
  const previousTo = new Date(currentFrom)
  previousTo.setUTCMilliseconds(-1)

  return { from: previousFrom.toISOString(), to: previousTo.toISOString() }
}

async function getDashboardTotalsForRange(siteId: string, from: string, to: string) {
  const result = await db.execute(sql`
    SELECT
      (
        SELECT COALESCE(SUM(unique_visitors), 0)::int
        FROM analytic_daily_visitors
        WHERE site_id = ${siteId}::uuid
          AND day >= ${from}::timestamptz::date
          AND day <= ${to}::timestamptz::date
      ) AS visitors,
      (
        SELECT COUNT(*)::int
        FROM newsletter_contacts
        WHERE site_id = ${siteId}::uuid
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
      ) AS contacts,
      (
        SELECT COUNT(*)::int
        FROM product_orders
        WHERE site_id = ${siteId}::uuid
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
      ) AS orders,
      (
        SELECT COALESCE(SUM(COALESCE(amount_total, 0)), 0)::int
        FROM product_orders
        WHERE site_id = ${siteId}::uuid
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
          AND order_type = 'paid_purchase'
      ) AS revenue_cents
  `)

  const row = (result.rows[0] as {
    visitors?: unknown
    contacts?: unknown
    orders?: unknown
    revenue_cents?: unknown
  } | undefined) || {}
  return {
    visitors: Number(row.visitors ?? 0),
    contacts: Number(row.contacts ?? 0),
    orders: Number(row.orders ?? 0),
    revenue: Number(row.revenue_cents ?? 0) / 100,
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
  const appDomain = normalizeAnalyticsHost(process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost')

  try {
    const result = await db.execute(sql`
      WITH daily AS (
        SELECT
          page_views::int AS page_views,
          COALESCE(referrers, '{}'::jsonb) AS referrers
        FROM analytic_daily_visitors
        WHERE site_id = ${siteId}::uuid
          AND day >= ${from}::timestamptz::date
          AND day <= ${to}::timestamptz::date
      ),
      external_referrers AS (
        SELECT referrer_counts.domain, SUM(referrer_counts.visits::int)::int AS visits
        FROM daily
        CROSS JOIN LATERAL jsonb_each_text(daily.referrers) AS referrer_counts(domain, visits)
        GROUP BY referrer_counts.domain
      ),
      email_referrer AS (
        SELECT 'Email' AS domain, COUNT(*)::int AS visits
        FROM newsletter_deliveries nd
        JOIN sites site_domains ON site_domains.id = nd.site_id
        CROSS JOIN LATERAL (
          SELECT lower(regexp_replace(
            split_part(split_part(regexp_replace(COALESCE(nd.last_clicked_url, ''), '^https?://', '', 'i'), '/', 1), ':', 1),
            '^www\\.',
            '',
            'i'
          )) AS host
        ) clicked_link
        WHERE nd.site_id = ${siteId}::uuid
          AND nd.first_clicked_at IS NOT NULL
          AND nd.first_clicked_at >= ${from}::timestamptz
          AND nd.first_clicked_at <= ${to}::timestamptz
          AND clicked_link.host <> ''
          AND clicked_link.host IN (
            lower(regexp_replace(
              split_part(split_part(regexp_replace(COALESCE(site_domains.custom_domain, ''), '^https?://', '', 'i'), '/', 1), ':', 1),
              '^www\\.',
              '',
              'i'
            )),
            lower(site_domains.subdomain || '.' || ${appDomain})
          )
      ),
      direct_referrer AS (
        SELECT
          'Direct' AS domain,
          GREATEST(
            COALESCE(SUM(page_views), 0)
              - COALESCE((SELECT SUM(visits) FROM external_referrers), 0)
              - COALESCE((SELECT visits FROM email_referrer), 0),
            0
          )::int AS visits
        FROM daily
      )
      SELECT domain, visits
      FROM (
        SELECT domain, visits FROM external_referrers
        UNION ALL
        SELECT domain, visits FROM email_referrer WHERE visits > 0
        UNION ALL
        SELECT domain, visits FROM direct_referrer WHERE visits > 0
      ) referrers
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

export async function getSiteDashboardMetrics(
  siteId: string,
  rangeValue: string
): Promise<SiteDashboardMetrics> {
  const empty = {
    totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
    previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
    chartData: [],
  }

  if (!await verifyAnalyticsAccess(siteId)) return empty

  const range = normalizeDashboardRange(rangeValue)
  const { from, to, days, groupBy } = getDashboardDateRange(range)
  const previousRange = getPreviousDashboardDateRange(from, days)

  try {
    const [result, previousTotals] = await Promise.all([
      groupBy === 'month'
        ? db.execute(sql`
          WITH buckets AS (
            SELECT generate_series(
              date_trunc('month', ${from}::timestamptz)::date,
              date_trunc('month', ${to}::timestamptz)::date,
              interval '1 month'
            )::date AS bucket_date
          ),
          visitors AS (
            SELECT
              date_trunc('month', day::timestamp)::date AS bucket_date,
              COALESCE(SUM(page_views), 0)::int AS page_views,
              COALESCE(SUM(unique_visitors), 0)::int AS visitors
            FROM analytic_daily_visitors
            WHERE site_id = ${siteId}::uuid
              AND day >= ${from}::timestamptz::date
              AND day <= ${to}::timestamptz::date
            GROUP BY 1
          ),
          contacts AS (
            SELECT
              date_trunc('month', created_at)::date AS bucket_date,
              COUNT(*)::int AS contacts
            FROM newsletter_contacts
            WHERE site_id = ${siteId}::uuid
              AND created_at >= ${from}::timestamptz
              AND created_at <= ${to}::timestamptz
            GROUP BY 1
          ),
          order_metrics AS (
            SELECT
              date_trunc('month', created_at)::date AS bucket_date,
              COUNT(*)::int AS orders,
              COALESCE(SUM(
                CASE
                  WHEN order_type = 'paid_purchase' THEN COALESCE(amount_total, 0)
                  ELSE 0
                END
              ), 0)::int AS revenue_cents
            FROM product_orders
            WHERE site_id = ${siteId}::uuid
              AND created_at >= ${from}::timestamptz
              AND created_at <= ${to}::timestamptz
            GROUP BY 1
          )
          SELECT
            to_char(buckets.bucket_date, 'Mon YYYY') AS label,
            COALESCE(visitors.page_views, 0)::int AS page_views,
            COALESCE(visitors.visitors, 0)::int AS visitors,
            COALESCE(contacts.contacts, 0)::int AS contacts,
            COALESCE(order_metrics.orders, 0)::int AS orders,
            COALESCE(order_metrics.revenue_cents, 0)::int AS revenue_cents
          FROM buckets
          LEFT JOIN visitors ON visitors.bucket_date = buckets.bucket_date
          LEFT JOIN contacts ON contacts.bucket_date = buckets.bucket_date
          LEFT JOIN order_metrics ON order_metrics.bucket_date = buckets.bucket_date
          ORDER BY buckets.bucket_date
        `)
        : db.execute(sql`
          WITH buckets AS (
            SELECT generate_series(
              ${from}::timestamptz::date,
              ${to}::timestamptz::date,
              interval '1 day'
            )::date AS bucket_date
          ),
          visitors AS (
            SELECT
              day::date AS bucket_date,
              COALESCE(SUM(page_views), 0)::int AS page_views,
              COALESCE(SUM(unique_visitors), 0)::int AS visitors
            FROM analytic_daily_visitors
            WHERE site_id = ${siteId}::uuid
              AND day >= ${from}::timestamptz::date
              AND day <= ${to}::timestamptz::date
            GROUP BY 1
          ),
          contacts AS (
            SELECT
              created_at::date AS bucket_date,
              COUNT(*)::int AS contacts
            FROM newsletter_contacts
            WHERE site_id = ${siteId}::uuid
              AND created_at >= ${from}::timestamptz
              AND created_at <= ${to}::timestamptz
            GROUP BY 1
          ),
          order_metrics AS (
            SELECT
              created_at::date AS bucket_date,
              COUNT(*)::int AS orders,
              COALESCE(SUM(
                CASE
                  WHEN order_type = 'paid_purchase' THEN COALESCE(amount_total, 0)
                  ELSE 0
                END
              ), 0)::int AS revenue_cents
            FROM product_orders
            WHERE site_id = ${siteId}::uuid
              AND created_at >= ${from}::timestamptz
              AND created_at <= ${to}::timestamptz
            GROUP BY 1
          )
          SELECT
            to_char(buckets.bucket_date, 'Mon DD') AS label,
            COALESCE(visitors.page_views, 0)::int AS page_views,
            COALESCE(visitors.visitors, 0)::int AS visitors,
            COALESCE(contacts.contacts, 0)::int AS contacts,
            COALESCE(order_metrics.orders, 0)::int AS orders,
            COALESCE(order_metrics.revenue_cents, 0)::int AS revenue_cents
          FROM buckets
          LEFT JOIN visitors ON visitors.bucket_date = buckets.bucket_date
          LEFT JOIN contacts ON contacts.bucket_date = buckets.bucket_date
          LEFT JOIN order_metrics ON order_metrics.bucket_date = buckets.bucket_date
          ORDER BY buckets.bucket_date
        `),
      getDashboardTotalsForRange(siteId, previousRange.from, previousRange.to),
    ])

    const chartData = (result.rows || []).map((row) => {
      const bucket = row as {
        label?: unknown
        page_views?: unknown
        visitors?: unknown
        contacts?: unknown
        orders?: unknown
        revenue_cents?: unknown
      }

      return {
        label: String(bucket.label),
        pageViews: Number(bucket.page_views ?? 0),
        visitors: Number(bucket.visitors ?? 0),
        contacts: Number(bucket.contacts ?? 0),
        orders: Number(bucket.orders ?? 0),
        revenue: Number(bucket.revenue_cents ?? 0) / 100,
      }
    })

    return {
      chartData,
      previousTotals,
      totals: chartData.reduce(
        (totals, point) => ({
          visitors: totals.visitors + point.visitors,
          contacts: totals.contacts + point.contacts,
          orders: totals.orders + point.orders,
          revenue: totals.revenue + point.revenue,
        }),
        { visitors: 0, contacts: 0, orders: 0, revenue: 0 }
      ),
    }
  } catch {
    return empty
  }
}

/**
 * Lightweight site fetch for dashboard.
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
