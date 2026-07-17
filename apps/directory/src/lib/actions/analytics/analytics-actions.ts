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

// Cross-site totals for the multi-site admin dashboard, scoped to the user's non-template sites.
async function getMultiSiteTotalsForRange(userId: string, from: string, to: string) {
  const result = await db.execute(sql`
    WITH site_set AS (
      SELECT id FROM sites WHERE user_id = ${userId} AND is_template = false
    )
    SELECT
      (
        SELECT COALESCE(SUM(unique_visitors), 0)::int
        FROM analytic_daily_visitors
        WHERE site_id IN (SELECT id FROM site_set)
          AND day >= ${from}::timestamptz::date
          AND day <= ${to}::timestamptz::date
      ) AS visitors,
      (
        SELECT COUNT(*)::int
        FROM newsletter_contacts
        WHERE site_id IN (SELECT id FROM site_set)
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
      ) AS contacts,
      (
        SELECT COUNT(*)::int
        FROM product_orders
        WHERE site_id IN (SELECT id FROM site_set)
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
      ) AS orders,
      (
        SELECT COALESCE(SUM(COALESCE(amount_total, 0)), 0)::int
        FROM product_orders
        WHERE site_id IN (SELECT id FROM site_set)
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

export interface MultiSitePerSiteMetrics {
  siteId: string
  visitors: number
  contacts: number
  orders: number
  revenue: number
  sparkline: number[]
}

export interface MultiSiteDashboardData {
  range: DashboardRange
  chartData: SiteDashboardMetrics['chartData']
  totals: SiteDashboardMetrics['totals']
  previousTotals: SiteDashboardMetrics['totals']
  perSite: MultiSitePerSiteMetrics[]
}

/**
 * Combined analytics across all of the user's sites for the multi-site admin dashboard.
 * Totals honor the selected range; the chart keeps a fixed window (30d daily, or 365d
 * monthly for Year) like the per-site dashboard; sparklines are always 30d daily visitors.
 */
export async function getMultiSiteDashboardData(
  rangeValue: string,
  focusSiteId?: string | null
): Promise<MultiSiteDashboardData> {
  const range = normalizeDashboardRange(rangeValue)
  const empty: MultiSiteDashboardData = {
    range,
    chartData: [],
    totals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
    previousTotals: { visitors: 0, contacts: 0, orders: 0, revenue: 0 },
    perSite: [],
  }

  const user = await getAuthenticatedUser()
  if (!user) return empty

  // When scoped to a single site (the per-site dashboard), the chart and the metric-cell
  // totals narrow to that site while the "Your sites" table (perSite + sparklines) still
  // spans every site. Ownership is verified so a foreign id can't leak another user's data.
  const effectiveFocus = focusSiteId && (await verifyAnalyticsAccess(focusSiteId)) ? focusSiteId : null
  const chartFilter = effectiveFocus
    ? sql`site_id = ${effectiveFocus}::uuid`
    : sql`site_id IN (SELECT id FROM site_set)`

  const { from, to, days } = getDashboardDateRange(range)
  const previousRange = getPreviousDashboardDateRange(from, days)
  const chartWindow = getDashboardDateRange(range === '365d' ? '365d' : '30d')
  const sparkWindow = getDashboardDateRange('30d')

  try {
    const [chartResult, totals, previousTotals, perSiteResult, sparkResult] = await Promise.all([
      chartWindow.groupBy === 'month'
        ? db.execute(sql`
          WITH site_set AS (
            SELECT id FROM sites WHERE user_id = ${user.id} AND is_template = false
          ),
          buckets AS (
            SELECT generate_series(
              date_trunc('month', ${chartWindow.from}::timestamptz)::date,
              date_trunc('month', ${chartWindow.to}::timestamptz)::date,
              interval '1 month'
            )::date AS bucket_date
          ),
          visitors AS (
            SELECT
              date_trunc('month', day::timestamp)::date AS bucket_date,
              COALESCE(SUM(page_views), 0)::int AS page_views,
              COALESCE(SUM(unique_visitors), 0)::int AS visitors
            FROM analytic_daily_visitors
            WHERE ${chartFilter}
              AND day >= ${chartWindow.from}::timestamptz::date
              AND day <= ${chartWindow.to}::timestamptz::date
            GROUP BY 1
          ),
          contacts AS (
            SELECT
              date_trunc('month', created_at)::date AS bucket_date,
              COUNT(*)::int AS contacts
            FROM newsletter_contacts
            WHERE ${chartFilter}
              AND created_at >= ${chartWindow.from}::timestamptz
              AND created_at <= ${chartWindow.to}::timestamptz
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
            WHERE ${chartFilter}
              AND created_at >= ${chartWindow.from}::timestamptz
              AND created_at <= ${chartWindow.to}::timestamptz
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
          WITH site_set AS (
            SELECT id FROM sites WHERE user_id = ${user.id} AND is_template = false
          ),
          buckets AS (
            SELECT generate_series(
              ${chartWindow.from}::timestamptz::date,
              ${chartWindow.to}::timestamptz::date,
              interval '1 day'
            )::date AS bucket_date
          ),
          visitors AS (
            SELECT
              day::date AS bucket_date,
              COALESCE(SUM(page_views), 0)::int AS page_views,
              COALESCE(SUM(unique_visitors), 0)::int AS visitors
            FROM analytic_daily_visitors
            WHERE ${chartFilter}
              AND day >= ${chartWindow.from}::timestamptz::date
              AND day <= ${chartWindow.to}::timestamptz::date
            GROUP BY 1
          ),
          contacts AS (
            SELECT
              created_at::date AS bucket_date,
              COUNT(*)::int AS contacts
            FROM newsletter_contacts
            WHERE ${chartFilter}
              AND created_at >= ${chartWindow.from}::timestamptz
              AND created_at <= ${chartWindow.to}::timestamptz
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
            WHERE ${chartFilter}
              AND created_at >= ${chartWindow.from}::timestamptz
              AND created_at <= ${chartWindow.to}::timestamptz
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
      effectiveFocus
        ? getDashboardTotalsForRange(effectiveFocus, from, to)
        : getMultiSiteTotalsForRange(user.id, from, to),
      effectiveFocus
        ? getDashboardTotalsForRange(effectiveFocus, previousRange.from, previousRange.to)
        : getMultiSiteTotalsForRange(user.id, previousRange.from, previousRange.to),
      db.execute(sql`
        WITH site_set AS (
          SELECT id FROM sites WHERE user_id = ${user.id} AND is_template = false
        )
        SELECT
          s.id AS site_id,
          COALESCE(v.visitors, 0)::int AS visitors,
          COALESCE(c.contacts, 0)::int AS contacts,
          COALESCE(o.orders, 0)::int AS orders,
          COALESCE(o.revenue_cents, 0)::int AS revenue_cents
        FROM site_set s
        LEFT JOIN (
          SELECT site_id, COALESCE(SUM(unique_visitors), 0)::int AS visitors
          FROM analytic_daily_visitors
          WHERE site_id IN (SELECT id FROM site_set)
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
          GROUP BY site_id
        ) v ON v.site_id = s.id
        LEFT JOIN (
          SELECT site_id, COUNT(*)::int AS contacts
          FROM newsletter_contacts
          WHERE site_id IN (SELECT id FROM site_set)
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
          GROUP BY site_id
        ) c ON c.site_id = s.id
        LEFT JOIN (
          SELECT
            site_id,
            COUNT(*)::int AS orders,
            COALESCE(SUM(
              CASE
                WHEN order_type = 'paid_purchase' THEN COALESCE(amount_total, 0)
                ELSE 0
              END
            ), 0)::int AS revenue_cents
          FROM product_orders
          WHERE site_id IN (SELECT id FROM site_set)
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
          GROUP BY site_id
        ) o ON o.site_id = s.id
      `),
      db.execute(sql`
        SELECT
          site_id,
          to_char(day::date, 'YYYY-MM-DD') AS day_key,
          COALESCE(SUM(unique_visitors), 0)::int AS visitors
        FROM analytic_daily_visitors
        WHERE site_id IN (SELECT id FROM sites WHERE user_id = ${user.id} AND is_template = false)
          AND day >= ${sparkWindow.from}::timestamptz::date
          AND day <= ${sparkWindow.to}::timestamptz::date
        GROUP BY site_id, day::date
      `),
    ])

    const chartData = (chartResult.rows || []).map((row) => {
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

    const sparkDays: string[] = []
    for (let i = 0; i < sparkWindow.days; i++) {
      sparkDays.push(addUtcDays(new Date(sparkWindow.from), i).toISOString().slice(0, 10))
    }
    const sparkBySite = new Map<string, Map<string, number>>()
    for (const row of (sparkResult.rows || []) as Array<{ site_id?: unknown; day_key?: unknown; visitors?: unknown }>) {
      const siteId = String(row.site_id)
      const daily = sparkBySite.get(siteId) ?? new Map<string, number>()
      daily.set(String(row.day_key), Number(row.visitors ?? 0))
      sparkBySite.set(siteId, daily)
    }

    const perSite = ((perSiteResult.rows || []) as Array<{
      site_id?: unknown
      visitors?: unknown
      contacts?: unknown
      orders?: unknown
      revenue_cents?: unknown
    }>).map((row) => {
      const siteId = String(row.site_id)
      const daily = sparkBySite.get(siteId)
      return {
        siteId,
        visitors: Number(row.visitors ?? 0),
        contacts: Number(row.contacts ?? 0),
        orders: Number(row.orders ?? 0),
        revenue: Number(row.revenue_cents ?? 0) / 100,
        sparkline: sparkDays.map((day) => daily?.get(day) ?? 0),
      }
    })

    return { range, chartData, totals, previousTotals, perSite }
  } catch (error) {
    console.error('getMultiSiteDashboardData error:', error)
    return empty
  }
}
