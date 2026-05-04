import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'

interface TrackEvent {
  type: string
  page_path?: string
  referrer?: string
  daily_visitor?: boolean
  timestamp?: string
}

const MAX_EVENTS_PER_REQUEST = 20
const MAX_BODY_BYTES = 20_000
const MAX_PATH_LENGTH = 2048
const MAX_REFERRER_LENGTH = 2048
const TRACK_WINDOW_MS = 60_000
const TRACK_MAX_REQUESTS = 120

interface DailyPageviewGroup {
  pageViews: number
  uniqueVisitors: number
  pages: Record<string, number>
  referrers: Record<string, number>
}

function normalizeHost(host: string): string {
  return host.split(':')[0]?.replace(/^www\./, '').toLowerCase() || ''
}

function extractReferrerDomain(url: string | undefined, requestHost: string): string | null {
  if (typeof url !== 'string' || url.length > MAX_REFERRER_LENGTH) return null

  try {
    const domain = normalizeHost(new URL(url).hostname)
    if (!domain || domain === normalizeHost(requestHost)) return null
    return domain
  } catch {
    return null
  }
}

function cleanPagePath(pagePath: string | undefined): string | null {
  if (typeof pagePath !== 'string' || pagePath.length > MAX_PATH_LENGTH) return null

  try {
    const url = new URL(pagePath, 'http://localhost')
    return url.pathname || '/'
  } catch {
    return null
  }
}

function getEventDay(timestamp: string | undefined): string {
  const now = new Date()
  const parsed = typeof timestamp === 'string' ? new Date(timestamp) : null
  const date = parsed && Number.isFinite(parsed.getTime()) && Math.abs(parsed.getTime() - now.getTime()) <= 86_400_000
    ? parsed
    : now

  return date.toISOString().slice(0, 10)
}

function incrementCounter(counters: Record<string, number>, key: string) {
  counters[key] = (counters[key] ?? 0) + 1
}

export async function POST(request: NextRequest) {
  try {
    const host = request.headers.get('host') || ''
    let site = await resolveSiteByHost(host)
    // Fallback for localhost: grab first active site
    if (!site) {
      const [firstSite] = await db
        .select({ id: sites.id, subdomain: sites.subdomain, customDomain: sites.customDomain })
        .from(sites)
        .where(eq(sites.status, 'active'))
        .limit(1)
      if (firstSite) site = { id: firstSite.id, subdomain: firstSite.subdomain, custom_domain: firstSite.customDomain }
    }
    if (!site) return new NextResponse(null, { status: 204 })

    const contentLength = Number(request.headers.get('content-length') || 0)
    if (contentLength > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })

    const rawBody = await request.text().catch(() => '')
    if (!rawBody || rawBody.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 })

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return new NextResponse(null, { status: 204 })
    }
    const events: TrackEvent[] = typeof body === 'object' && body && Array.isArray((body as { events?: unknown }).events)
      ? ((body as { events: TrackEvent[] }).events).slice(0, MAX_EVENTS_PER_REQUEST)
      : []
    if (!events?.length) return new NextResponse(null, { status: 204 })

    const ip = getClientIp(request.headers)

    if (isRateLimited(`analytics:${site.id}:${ip}`, TRACK_MAX_REQUESTS, TRACK_WINDOW_MS)) {
      return new NextResponse(null, { status: 204 })
    }

    const groups = new Map<string, DailyPageviewGroup>()
    const countedDailyVisitorDays = new Set<string>()

    for (const event of events) {
      if (!event || event.type !== 'pageview') continue

      const pagePath = cleanPagePath(event.page_path)
      if (!pagePath) continue

      const day = getEventDay(event.timestamp)
      const group = groups.get(day) ?? { pageViews: 0, uniqueVisitors: 0, pages: {}, referrers: {} }
      group.pageViews += 1
      incrementCounter(group.pages, pagePath)

      if (event.daily_visitor === true && !countedDailyVisitorDays.has(day)) {
        group.uniqueVisitors += 1
        countedDailyVisitorDays.add(day)
      }

      const referrerDomain = extractReferrerDomain(event.referrer, host)
      if (referrerDomain) incrementCounter(group.referrers, referrerDomain)

      groups.set(day, group)
    }

    if (!groups.size) return new NextResponse(null, { status: 204 })

    await db.transaction(async (tx) => {
      for (const [day, group] of groups) {
        await tx.execute(sql`
          INSERT INTO analytic_daily_visitors (
            site_id,
            day,
            page_views,
            unique_visitors,
            pages,
            referrers,
            updated_at
          )
          VALUES (
            ${site!.id}::uuid,
            ${day}::date,
            ${group.pageViews},
            ${group.uniqueVisitors},
            ${JSON.stringify(group.pages)}::jsonb,
            ${JSON.stringify(group.referrers)}::jsonb,
            now()
          )
          ON CONFLICT (site_id, day) DO UPDATE SET
            page_views = analytic_daily_visitors.page_views + EXCLUDED.page_views,
            unique_visitors = analytic_daily_visitors.unique_visitors + EXCLUDED.unique_visitors,
            pages = COALESCE((
              SELECT jsonb_object_agg(key, to_jsonb(total::int))
              FROM (
                SELECT key, SUM(value::int) AS total
                FROM (
                  SELECT key, value FROM jsonb_each_text(COALESCE(analytic_daily_visitors.pages, '{}'::jsonb))
                  UNION ALL
                  SELECT key, value FROM jsonb_each_text(COALESCE(EXCLUDED.pages, '{}'::jsonb))
                ) page_counts
                GROUP BY key
              ) merged_pages
            ), '{}'::jsonb),
            referrers = COALESCE((
              SELECT jsonb_object_agg(key, to_jsonb(total::int))
              FROM (
                SELECT key, SUM(value::int) AS total
                FROM (
                  SELECT key, value FROM jsonb_each_text(COALESCE(analytic_daily_visitors.referrers, '{}'::jsonb))
                  UNION ALL
                  SELECT key, value FROM jsonb_each_text(COALESCE(EXCLUDED.referrers, '{}'::jsonb))
                ) referrer_counts
                GROUP BY key
              ) merged_referrers
            ), '{}'::jsonb),
            updated_at = now()
        `)
      }
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Analytics track error:', error)
    return new NextResponse(null, { status: 204 }) // Never fail visibly
  }
}
