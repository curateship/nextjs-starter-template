'use server'

import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'

/**
 * Verify the authenticated user owns the given site.
 */
async function verifySiteOwnership(siteId: string): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) throw new Error('Authentication required')

  const result = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)

  if (result.length === 0) throw new Error('Site not found or access denied')
}

/**
 * Date range helper — duplicated from analytics-actions.ts to avoid cross-file 'use server' imports.
 */
interface DateRange {
  from: string
  to: string
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

/** Per-product row returned from the overview query */
export interface ProductAnalyticsRow {
  id: string
  title: string
  slug: string
  featuredImage: string | null
  views: number
  visitors: number
  checkoutClicks: number
  orders: number
  freeSignups: number
  paidPurchases: number
  revenue: number
}

/** Aggregated totals across all products */
export interface ProductAnalyticsTotals {
  totalViews: number
  totalVisitors: number
  totalCheckoutClicks: number
  totalOrders: number
  totalRevenue: number
}

function isMissingRollupTableError(err: unknown): boolean {
  const cause = (err as { cause?: { code?: string } })?.cause
  return cause?.code === '42P01'
}

function mapProductAnalyticsRows(rows: any[]): ProductAnalyticsRow[] {
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    featuredImage: r.featured_image,
    views: Number(r.views),
    visitors: Number(r.visitors),
    checkoutClicks: Number(r.checkout_clicks),
    orders: Number(r.orders),
    freeSignups: Number(r.free_signups),
    paidPurchases: Number(r.paid_purchases),
    revenue: Number(r.revenue),
  }))
}

function getProductAnalyticsTotals(products: ProductAnalyticsRow[]): ProductAnalyticsTotals {
  return {
    totalViews: products.reduce((sum, p) => sum + p.views, 0),
    totalVisitors: products.reduce((sum, p) => sum + p.visitors, 0),
    totalCheckoutClicks: products.reduce((sum, p) => sum + p.checkoutClicks, 0),
    totalOrders: products.reduce((sum, p) => sum + p.orders, 0),
    totalRevenue: products.reduce((sum, p) => sum + p.revenue, 0),
  }
}

async function getRawProductAnalyticsOverview(siteId: string, from: string, to: string) {
  const result = await db.execute(sql`
    SELECT
      p.id,
      p.title,
      p.slug,
      p.featured_image,
      COALESCE(ev.views, 0)::int AS views,
      COALESCE(ev.visitors, 0)::int AS visitors,
      COALESCE(chk.checkout_clicks, 0)::int AS checkout_clicks,
      COALESCE(ord.total_orders, 0)::int AS orders,
      COALESCE(ord.free_signups, 0)::int AS free_signups,
      COALESCE(ord.paid_purchases, 0)::int AS paid_purchases,
      COALESCE(ord.revenue, 0)::int AS revenue
    FROM products p
    LEFT JOIN (
      SELECT
        page_path,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM analytics_events
      WHERE site_id = ${siteId}::uuid
        AND created_at >= ${from}::timestamptz
        AND created_at <= ${to}::timestamptz
        AND event_type = 'pageview'
        AND page_path LIKE '/products/%'
      GROUP BY page_path
    ) ev ON ev.page_path = '/products/' || p.slug
    LEFT JOIN (
      SELECT
        COALESCE(
          NULLIF(ae.event_data ->> 'product_id', ''),
          NULLIF(ae.event_data ->> 'content_id', ''),
          matched_products.id::text
        ) AS product_id,
        COUNT(*)::int AS checkout_clicks
      FROM analytics_events ae
      LEFT JOIN products matched_products ON matched_products.site_id = ae.site_id
        AND matched_products.slug = COALESCE(
          NULLIF(ae.event_data ->> 'product_slug', ''),
          NULLIF(ae.event_data ->> 'content_slug', ''),
          NULLIF(split_part(trim(leading '/' from COALESCE(ae.page_path, '')), '/', 2), '')
        )
      WHERE ae.site_id = ${siteId}::uuid
        AND ae.created_at >= ${from}::timestamptz
        AND ae.created_at <= ${to}::timestamptz
        AND ae.event_type = 'product_checkout_click'
      GROUP BY COALESCE(
        NULLIF(ae.event_data ->> 'product_id', ''),
        NULLIF(ae.event_data ->> 'content_id', ''),
        matched_products.id::text
      )
    ) chk ON chk.product_id = p.id::text
    LEFT JOIN (
      SELECT
        product_id,
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE order_type = 'lead_magnet')::int AS free_signups,
        COUNT(*) FILTER (WHERE order_type = 'paid_purchase')::int AS paid_purchases,
        COALESCE(SUM(amount_total) FILTER (WHERE order_type = 'paid_purchase'), 0)::int AS revenue
      FROM product_orders
      WHERE site_id = ${siteId}::uuid
        AND created_at >= ${from}::timestamptz
        AND created_at <= ${to}::timestamptz
      GROUP BY product_id
    ) ord ON ord.product_id = p.id
    WHERE p.site_id = ${siteId}::uuid
    ORDER BY COALESCE(ev.views, 0) DESC
  `)

  const products = mapProductAnalyticsRows((result.rows || []) as any[])
  return { products, totals: getProductAnalyticsTotals(products) }
}

async function getRawProductTrafficOverTime(siteId: string, from: string, to: string, bucket: string) {
  const result = await db.execute(sql`
    SELECT
      date_trunc(${bucket}, created_at)::text AS date,
      COUNT(*)::int AS views,
      COUNT(DISTINCT visitor_hash)::int AS visitors
    FROM analytics_events
    WHERE site_id = ${siteId}::uuid
      AND created_at >= ${from}::timestamptz
      AND created_at <= ${to}::timestamptz
      AND event_type = 'pageview'
      AND page_path LIKE '/products/%'
    GROUP BY 1
    ORDER BY 1
  `)

  return (result.rows || []).map((r: any) => ({
    date: r.date,
    views: Number(r.views),
    visitors: Number(r.visitors),
  }))
}

/**
 * Get per-product analytics + totals for the given period.
 * Joins generic analytics rollups with product_orders.
 */
export async function getProductAnalyticsOverview(
  siteId: string,
  period: string
): Promise<{ products: ProductAnalyticsRow[]; totals: ProductAnalyticsTotals }> {
  await verifySiteOwnership(siteId)
  const { from, to } = getDateRange(period)

  try {
    // Query per-product metrics by joining products with generic analytics rollups and orders.
    const result = await db.execute(sql`
      WITH rolled_days AS (
        SELECT DISTINCT day
        FROM analytics_daily_events
        WHERE site_id = ${siteId}::uuid
          AND day >= ${from}::timestamptz::date
          AND day <= ${to}::timestamptz::date
      ),
      daily_event_rollups AS (
        SELECT
          COALESCE(ade.content_id, matched_products.id::text) AS product_id,
          COALESCE(SUM(ade."count") FILTER (WHERE ade.event_type = 'pageview'), 0)::int AS views,
          COALESCE(SUM(ade."count") FILTER (WHERE ade.event_type = 'product_checkout_click'), 0)::int AS checkout_clicks
        FROM analytics_daily_events ade
        LEFT JOIN products matched_products ON matched_products.site_id = ade.site_id
          AND ade.content_id IS NULL
          AND matched_products.slug = ade.content_slug
        WHERE ade.site_id = ${siteId}::uuid
          AND ade.day >= ${from}::timestamptz::date
          AND ade.day <= ${to}::timestamptz::date
          AND ade.content_type = 'product'
          AND ade.event_type IN ('pageview', 'product_checkout_click')
        GROUP BY COALESCE(ade.content_id, matched_products.id::text)
      ),
      raw_event_rollups AS (
        SELECT
          COALESCE(
            NULLIF(ae.event_data ->> 'content_id', ''),
            NULLIF(ae.event_data ->> 'product_id', ''),
            matched_products.id::text
          ) AS product_id,
          COUNT(*) FILTER (WHERE ae.event_type = 'pageview')::int AS views,
          COUNT(*) FILTER (WHERE ae.event_type = 'product_checkout_click')::int AS checkout_clicks
        FROM analytics_events ae
        LEFT JOIN products matched_products ON matched_products.site_id = ae.site_id
          AND matched_products.slug = COALESCE(
            NULLIF(ae.event_data ->> 'content_slug', ''),
            NULLIF(ae.event_data ->> 'product_slug', ''),
            NULLIF(split_part(trim(leading '/' from COALESCE(ae.page_path, '')), '/', 2), '')
          )
        WHERE ae.site_id = ${siteId}::uuid
          AND ae.created_at >= ${from}::timestamptz
          AND ae.created_at <= ${to}::timestamptz
          AND NOT EXISTS (
            SELECT 1
            FROM rolled_days rd
            WHERE rd.day = (ae.created_at AT TIME ZONE 'UTC')::date
          )
          AND (
            (ae.event_type = 'pageview' AND ae.page_path LIKE '/products/%')
            OR (
              ae.event_type = 'product_checkout_click'
              AND (
                ae.event_data ->> 'content_type' = 'product'
                OR COALESCE(ae.event_data ->> 'product_id', ae.event_data ->> 'product_slug') IS NOT NULL
                OR ae.page_path LIKE '/products/%'
              )
            )
          )
        GROUP BY COALESCE(
          NULLIF(ae.event_data ->> 'content_id', ''),
          NULLIF(ae.event_data ->> 'product_id', ''),
          matched_products.id::text
        )
      ),
      event_rollups AS (
        SELECT
          product_id,
          SUM(views)::int AS views,
          SUM(checkout_clicks)::int AS checkout_clicks
        FROM (
          SELECT * FROM daily_event_rollups
          UNION ALL
          SELECT * FROM raw_event_rollups
        ) combined_events
        WHERE product_id IS NOT NULL
        GROUP BY product_id
      ),
      daily_visitor_rollups AS (
        SELECT
          COALESCE(adv.content_id, matched_products.id::text) AS product_id,
          adv.visitor_hash
        FROM analytics_daily_visitors adv
        LEFT JOIN products matched_products ON matched_products.site_id = adv.site_id
          AND adv.content_id IS NULL
          AND matched_products.slug = adv.content_slug
        WHERE adv.site_id = ${siteId}::uuid
          AND adv.day >= ${from}::timestamptz::date
          AND adv.day <= ${to}::timestamptz::date
          AND adv.content_type = 'product'
      ),
      raw_visitor_rollups AS (
        SELECT
          COALESCE(
            NULLIF(ae.event_data ->> 'content_id', ''),
            NULLIF(ae.event_data ->> 'product_id', ''),
            matched_products.id::text
          ) AS product_id,
          ae.visitor_hash
        FROM analytics_events ae
        LEFT JOIN products matched_products ON matched_products.site_id = ae.site_id
          AND matched_products.slug = COALESCE(
            NULLIF(ae.event_data ->> 'content_slug', ''),
            NULLIF(ae.event_data ->> 'product_slug', ''),
            NULLIF(split_part(trim(leading '/' from COALESCE(ae.page_path, '')), '/', 2), '')
          )
        WHERE ae.site_id = ${siteId}::uuid
          AND ae.created_at >= ${from}::timestamptz
          AND ae.created_at <= ${to}::timestamptz
          AND ae.event_type = 'pageview'
          AND ae.page_path LIKE '/products/%'
          AND ae.visitor_hash IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM rolled_days rd
            WHERE rd.day = (ae.created_at AT TIME ZONE 'UTC')::date
          )
      ),
      visitor_rollups AS (
        SELECT
          product_id,
          COUNT(DISTINCT visitor_hash)::int AS visitors
        FROM (
          SELECT * FROM daily_visitor_rollups
          UNION ALL
          SELECT * FROM raw_visitor_rollups
        ) combined_visitors
        WHERE product_id IS NOT NULL
        GROUP BY product_id
      )
      SELECT
        p.id,
        p.title,
        p.slug,
        p.featured_image,
        COALESCE(ev.views, 0)::int AS views,
        COALESCE(vis.visitors, 0)::int AS visitors,
        COALESCE(ev.checkout_clicks, 0)::int AS checkout_clicks,
        COALESCE(ord.total_orders, 0)::int AS orders,
        COALESCE(ord.free_signups, 0)::int AS free_signups,
        COALESCE(ord.paid_purchases, 0)::int AS paid_purchases,
        COALESCE(ord.revenue, 0)::int AS revenue
      FROM products p
      LEFT JOIN event_rollups ev ON ev.product_id = p.id::text
      LEFT JOIN visitor_rollups vis ON vis.product_id = p.id::text
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*)::int AS total_orders,
          COUNT(*) FILTER (WHERE order_type = 'lead_magnet')::int AS free_signups,
          COUNT(*) FILTER (WHERE order_type = 'paid_purchase')::int AS paid_purchases,
          COALESCE(SUM(amount_total) FILTER (WHERE order_type = 'paid_purchase'), 0)::int AS revenue
        FROM product_orders
        WHERE site_id = ${siteId}::uuid
          AND created_at >= ${from}::timestamptz
          AND created_at <= ${to}::timestamptz
        GROUP BY product_id
      ) ord ON ord.product_id = p.id
      WHERE p.site_id = ${siteId}::uuid
      ORDER BY COALESCE(ev.views, 0) DESC
    `)

    const rows = (result.rows || []) as any[]

    const products = mapProductAnalyticsRows(rows)
    const totals = getProductAnalyticsTotals(products)

    return { products, totals }
  } catch (err) {
    if (isMissingRollupTableError(err)) {
      return getRawProductAnalyticsOverview(siteId, from, to)
    }

    console.error('Failed to load product analytics overview:', err)
    return { products: [], totals: { totalViews: 0, totalVisitors: 0, totalCheckoutClicks: 0, totalOrders: 0, totalRevenue: 0 } }
  }
}

/**
 * Daily time series of product page views + unique visitors.
 * For today/yesterday, uses hourly buckets.
 */
export async function getProductTrafficOverTime(
  siteId: string,
  period: string
): Promise<{ date: string; views: number; visitors: number }[]> {
  await verifySiteOwnership(siteId)
  const { from, to } = getDateRange(period)
  const useHourly = period === 'today' || period === 'yesterday'
  const bucket = useHourly ? 'hour' : 'day'

  try {
    const result = useHourly
      ? { rows: await getRawProductTrafficOverTime(siteId, from, to, bucket) }
      : await db.execute(sql`
        WITH rolled_days AS (
          SELECT DISTINCT day
          FROM analytics_daily_events
          WHERE site_id = ${siteId}::uuid
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
        ),
        daily_view_rollups AS (
          SELECT
            day,
            SUM("count")::int AS views
          FROM analytics_daily_events
          WHERE site_id = ${siteId}::uuid
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
            AND content_type = 'product'
            AND event_type = 'pageview'
          GROUP BY day
        ),
        raw_view_rollups AS (
          SELECT
            (created_at AT TIME ZONE 'UTC')::date AS day,
            COUNT(*)::int AS views
          FROM analytics_events
          WHERE site_id = ${siteId}::uuid
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
            AND event_type = 'pageview'
            AND page_path LIKE '/products/%'
            AND NOT EXISTS (
              SELECT 1
              FROM rolled_days rd
              WHERE rd.day = (created_at AT TIME ZONE 'UTC')::date
            )
          GROUP BY 1
        ),
        view_rollups AS (
          SELECT day, SUM(views)::int AS views
          FROM (
            SELECT * FROM daily_view_rollups
            UNION ALL
            SELECT * FROM raw_view_rollups
          ) combined_views
          GROUP BY day
        ),
        daily_visitor_rows AS (
          SELECT
            day,
            visitor_hash
          FROM analytics_daily_visitors
          WHERE site_id = ${siteId}::uuid
            AND day >= ${from}::timestamptz::date
            AND day <= ${to}::timestamptz::date
            AND content_type = 'product'
        ),
        raw_visitor_rows AS (
          SELECT
            (created_at AT TIME ZONE 'UTC')::date AS day,
            visitor_hash
          FROM analytics_events
          WHERE site_id = ${siteId}::uuid
            AND created_at >= ${from}::timestamptz
            AND created_at <= ${to}::timestamptz
            AND event_type = 'pageview'
            AND page_path LIKE '/products/%'
            AND visitor_hash IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM rolled_days rd
              WHERE rd.day = (created_at AT TIME ZONE 'UTC')::date
            )
        ),
        visitor_rollups AS (
          SELECT
            day,
            COUNT(DISTINCT visitor_hash)::int AS visitors
          FROM (
            SELECT * FROM daily_visitor_rows
            UNION ALL
            SELECT * FROM raw_visitor_rows
          ) combined_visitors
          GROUP BY day
        )
        SELECT
          COALESCE(view_rollups.day, visitor_rollups.day)::text AS date,
          COALESCE(view_rollups.views, 0)::int AS views,
          COALESCE(visitor_rollups.visitors, 0)::int AS visitors
        FROM view_rollups
        FULL JOIN visitor_rollups ON visitor_rollups.day = view_rollups.day
        ORDER BY 1
      `)

    return (result.rows || []).map((r: any) => ({
      date: r.date,
      views: Number(r.views),
      visitors: Number(r.visitors),
    }))
  } catch (err) {
    if (isMissingRollupTableError(err)) {
      return getRawProductTrafficOverTime(siteId, from, to, bucket)
    }

    console.error('Failed to load product traffic over time:', err)
    return []
  }
}

/**
 * Daily time series of product orders + revenue.
 * For today/yesterday, uses hourly buckets.
 */
export async function getProductOrdersOverTime(
  siteId: string,
  period: string
): Promise<{ date: string; orders: number; revenue: number }[]> {
  await verifySiteOwnership(siteId)
  const { from, to } = getDateRange(period)
  const useHourly = period === 'today' || period === 'yesterday'
  const bucket = useHourly ? 'hour' : 'day'

  try {
    const result = await db.execute(sql`
      SELECT
        date_trunc(${bucket}, created_at)::text AS date,
        COUNT(*)::int AS orders,
        COALESCE(SUM(amount_total) FILTER (WHERE order_type = 'paid_purchase'), 0)::int AS revenue
      FROM product_orders
      WHERE site_id = ${siteId}::uuid
        AND created_at >= ${from}::timestamptz
        AND created_at <= ${to}::timestamptz
      GROUP BY 1
      ORDER BY 1
    `)

    return (result.rows || []).map((r: any) => ({
      date: r.date,
      orders: Number(r.orders),
      revenue: Number(r.revenue),
    }))
  } catch (err) {
    console.error('Failed to load product orders over time:', err)
    return []
  }
}
