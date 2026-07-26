import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { directories, directoryClaims } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX } from '@/lib/utils/validation'

export type ListingAnalyticsRange = '30d' | '90d'

export interface ListingViewsPoint {
  day: string // 'YYYY-MM-DD'
  label: string // 'Jul 26'
  views: number
}

export interface ListingViewsAnalytics {
  range: ListingAnalyticsRange
  totalViews: number
  // Total over the previous equal-length window, for a simple period-over-period delta.
  previousTotalViews: number
  peakViews: number
  series: ListingViewsPoint[]
  error: string | null
}

const RANGE_DAYS: Record<ListingAnalyticsRange, number> = { '30d': 30, '90d': 90 }

function emptyAnalytics(range: ListingAnalyticsRange, error: string | null): ListingViewsAnalytics {
  return { range, totalViews: 0, previousTotalViews: 0, peakViews: 0, series: [], error }
}

function utcToday() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dayString(value: Date) {
  return value.toISOString().slice(0, 10)
}

/**
 * Daily view counts for a single claimed listing, gated to the approved claim owner.
 *
 * Reads the per-day `pages` JSONB written by the pageview tracker (path -> count),
 * keyed by the listing's *current* published path (/directory/<slug>). A slug change
 * therefore only reports views recorded under the current slug — the documented
 * path-based limitation. Windows are computed in UTC to match how the tracker stores
 * each day, so these numbers line up with the admin per-site page analytics.
 */
export async function getMyListingViewsAnalyticsActionImpl(input: {
  siteId: string
  directoryId: string
  range: ListingAnalyticsRange
}): Promise<ListingViewsAnalytics> {
  const range: ListingAnalyticsRange = input.range === '90d' ? '90d' : '30d'
  const days = RANGE_DAYS[range]

  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.directoryId)) {
    return emptyAnalytics(range, 'Invalid listing ID')
  }

  const user = await getAuthenticatedUser()
  if (!user) return emptyAnalytics(range, 'Authentication required')

  // Ownership gate: the caller must be the approved claim owner of this published
  // listing. This mirrors the owner-edit action so a foreign id can't read views.
  const [owned] = await db
    .select({ slug: directories.slug })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .where(and(
      eq(directoryClaims.siteId, input.siteId),
      eq(directoryClaims.directoryId, input.directoryId),
      eq(directoryClaims.userId, user.id),
      eq(directoryClaims.status, 'approved'),
      eq(directories.status, 'published'),
    ))
    .limit(1)

  if (!owned) return emptyAnalytics(range, 'Approved claim required')

  const path = `/directory/${owned.slug}`

  const today = utcToday()
  const currentFrom = dayString(addUtcDays(today, -(days - 1)))
  const currentTo = dayString(today)
  const previousFrom = dayString(addUtcDays(today, -(days * 2 - 1)))
  const previousTo = dayString(addUtcDays(today, -days))

  // pages[path] is always a non-negative integer from the tracker, but a guarded
  // cast keeps a malformed legacy value from turning a read into a 500.
  const dailyViews = sql`CASE WHEN adv.pages ->> ${path} ~ '^[0-9]+$' THEN (adv.pages ->> ${path})::int ELSE 0 END`
  const summedViews = sql`CASE WHEN pages ->> ${path} ~ '^[0-9]+$' THEN (pages ->> ${path})::int ELSE 0 END`

  try {
    const [seriesResult, previousResult] = await Promise.all([
      db.execute(sql`
        SELECT
          to_char(gs.day, 'YYYY-MM-DD') AS day_key,
          to_char(gs.day, 'Mon DD') AS label,
          COALESCE(${dailyViews}, 0) AS views
        FROM generate_series(${currentFrom}::date, ${currentTo}::date, interval '1 day') AS gs(day)
        LEFT JOIN analytic_daily_visitors adv
          ON adv.site_id = ${input.siteId}::uuid AND adv.day = gs.day::date
        ORDER BY gs.day
      `),
      db.execute(sql`
        SELECT COALESCE(SUM(${summedViews}), 0)::int AS total
        FROM analytic_daily_visitors
        WHERE site_id = ${input.siteId}::uuid
          AND day >= ${previousFrom}::date
          AND day <= ${previousTo}::date
      `),
    ])

    const series: ListingViewsPoint[] = (seriesResult.rows || []).map((row) => {
      const point = row as { day_key?: unknown; label?: unknown; views?: unknown }
      return {
        day: String(point.day_key),
        label: String(point.label),
        views: Number(point.views ?? 0),
      }
    })

    const totalViews = series.reduce((sum, point) => sum + point.views, 0)
    const peakViews = series.reduce((max, point) => Math.max(max, point.views), 0)
    const previousTotalViews = Number((previousResult.rows?.[0] as { total?: unknown } | undefined)?.total ?? 0)

    return { range, totalViews, previousTotalViews, peakViews, series, error: null }
  } catch (error) {
    console.error('getMyListingViewsAnalyticsActionImpl error:', error)
    return emptyAnalytics(range, 'Failed to load listing views')
  }
}
