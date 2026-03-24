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
  orders: number
  freeSignups: number
  paidPurchases: number
  revenue: number
}

/** Aggregated totals across all products */
export interface ProductAnalyticsTotals {
  totalViews: number
  totalVisitors: number
  totalOrders: number
  totalRevenue: number
}

/**
 * Get per-product analytics + totals for the given period.
 * Joins analytics_events (product page views) with product_orders.
 */
export async function getProductAnalyticsOverview(
  siteId: string,
  period: string
): Promise<{ products: ProductAnalyticsRow[]; totals: ProductAnalyticsTotals }> {
  await verifySiteOwnership(siteId)
  const { from, to } = getDateRange(period)

  try {
    // Query per-product metrics by joining products with analytics events and orders
    const result = await db.execute(sql`
      SELECT
        p.id,
        p.title,
        p.slug,
        p.featured_image,
        COALESCE(ev.views, 0)::int AS views,
        COALESCE(ev.visitors, 0)::int AS visitors,
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
          AND page_path LIKE '/products/%'
        GROUP BY page_path
      ) ev ON ev.page_path = '/products/' || p.slug
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

    // Map rows to typed product analytics
    const products: ProductAnalyticsRow[] = rows.map(r => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      featuredImage: r.featured_image,
      views: Number(r.views),
      visitors: Number(r.visitors),
      orders: Number(r.orders),
      freeSignups: Number(r.free_signups),
      paidPurchases: Number(r.paid_purchases),
      revenue: Number(r.revenue),
    }))

    // Compute totals across all products
    const totals: ProductAnalyticsTotals = {
      totalViews: products.reduce((sum, p) => sum + p.views, 0),
      totalVisitors: products.reduce((sum, p) => sum + p.visitors, 0),
      totalOrders: products.reduce((sum, p) => sum + p.orders, 0),
      totalRevenue: products.reduce((sum, p) => sum + p.revenue, 0),
    }

    return { products, totals }
  } catch (err) {
    console.error('Failed to load product analytics overview:', err)
    return { products: [], totals: { totalViews: 0, totalVisitors: 0, totalOrders: 0, totalRevenue: 0 } }
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
    const result = await db.execute(sql`
      SELECT
        date_trunc(${bucket}, created_at)::text AS date,
        COUNT(*)::int AS views,
        COUNT(DISTINCT visitor_hash)::int AS visitors
      FROM analytics_events
      WHERE site_id = ${siteId}::uuid
        AND created_at >= ${from}::timestamptz
        AND created_at <= ${to}::timestamptz
        AND page_path LIKE '/products/%'
      GROUP BY 1
      ORDER BY 1
    `)

    return (result.rows || []).map((r: any) => ({
      date: r.date,
      views: Number(r.views),
      visitors: Number(r.visitors),
    }))
  } catch (err) {
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
