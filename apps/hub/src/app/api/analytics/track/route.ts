import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { campaigns, sites, sponsors } from '@/lib/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX } from '@/lib/utils/validation'

interface TrackEvent {
  type: string
  page_path?: string
  referrer?: string
  daily_visitor?: boolean
  timestamp?: string
  sponsor_id?: string
  placement?: string
  post_id?: string
  campaign_id?: string
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

function canUseDevelopmentSiteFallback(host: string) {
  if (process.env.NODE_ENV === 'production') return false
  const hostname = normalizeHost(host)
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
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

const MAX_PLACEMENT_LENGTH = 64

interface SponsorImpressionGroup {
  sponsorId: string
  day: string
  placement: string
  sourcePath: string
  postId: string | null
  impressions: number
}

function cleanPlacement(placement: string | undefined): string {
  if (typeof placement !== 'string') return 'post_editor'
  const trimmed = placement.trim().slice(0, MAX_PLACEMENT_LENGTH)
  return /^[a-z0-9_-]+$/i.test(trimmed) ? trimmed : 'post_editor'
}

// Sponsor impressions are client-reported and unauthenticated by design (same as
// pageviews). Counts are advisory, not billing-grade: within the rate limit a client
// can inflate impressions for a sponsor on this site. Cross-site inflation is blocked
// by persistSponsorImpressions verifying the sponsor belongs to the resolved site.
function collectSponsorImpressions(events: TrackEvent[]): Map<string, SponsorImpressionGroup> {
  const groups = new Map<string, SponsorImpressionGroup>()

  for (const event of events) {
    if (!event || event.type !== 'sponsor_impression') continue
    if (typeof event.sponsor_id !== 'string' || !UUID_REGEX.test(event.sponsor_id)) continue

    const sourcePath = cleanPagePath(event.page_path)
    if (!sourcePath) continue

    const day = getEventDay(event.timestamp)
    const placement = cleanPlacement(event.placement)
    const postId = typeof event.post_id === 'string' && UUID_REGEX.test(event.post_id) ? event.post_id : null

    const key = `${event.sponsor_id}|${day}|${placement}|${sourcePath}`
    const group = groups.get(key) ?? { sponsorId: event.sponsor_id, day, placement, sourcePath, postId, impressions: 0 }
    group.impressions += 1
    groups.set(key, group)
  }

  return groups
}

async function persistSponsorImpressions(siteId: string, groups: Map<string, SponsorImpressionGroup>) {
  if (!groups.size) return

  const sponsorIds = Array.from(new Set(Array.from(groups.values()).map((group) => group.sponsorId)))
  const validRows = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(and(eq(sponsors.siteId, siteId), inArray(sponsors.id, sponsorIds)))
  const validIds = new Set(validRows.map((row) => row.id))

  const validGroups = Array.from(groups.values()).filter((group) => validIds.has(group.sponsorId))
  if (!validGroups.length) return

  // Each group is unique on (sponsor_id, day, placement, source_path) — the conflict
  // target — so a single multi-row upsert can't affect the same row twice.
  const rows = validGroups.map((group) => sql`(
    ${siteId}::uuid,
    ${group.sponsorId}::uuid,
    ${group.day}::date,
    ${group.placement},
    ${group.sourcePath},
    ${group.postId}::uuid,
    ${group.impressions},
    0,
    now()
  )`)

  await db.execute(sql`
    INSERT INTO sponsor_daily_analytics (site_id, sponsor_id, day, placement, source_path, post_id, impressions, clicks, updated_at)
    VALUES ${sql.join(rows, sql`, `)}
    ON CONFLICT (sponsor_id, day, placement, source_path) DO UPDATE SET
      impressions = sponsor_daily_analytics.impressions + EXCLUDED.impressions,
      updated_at = now()
  `)
}

type CampaignCounter = { views: number; dismissals: number; submissions: number }

async function persistCampaignCounters(siteId: string, events: TrackEvent[]) {
  const counters = new Map<string, CampaignCounter>()
  for (const event of events) {
    if (!event?.campaign_id || !UUID_REGEX.test(event.campaign_id)) continue
    if (!['campaign_view', 'campaign_dismiss', 'campaign_submit'].includes(event.type)) continue
    const count = counters.get(event.campaign_id) ?? { views: 0, dismissals: 0, submissions: 0 }
    if (event.type === 'campaign_view') count.views += 1
    if (event.type === 'campaign_dismiss') count.dismissals += 1
    if (event.type === 'campaign_submit') count.submissions += 1
    counters.set(event.campaign_id, count)
  }
  if (!counters.size) return

  const ids = [...counters.keys()]
  const valid = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.siteId, siteId), inArray(campaigns.id, ids)))
  for (const row of valid) {
    const count = counters.get(row.id)!
    await db.update(campaigns).set({
      views: sql`${campaigns.views} + ${count.views}`,
      dismissals: sql`${campaigns.dismissals} + ${count.dismissals}`,
      submissions: sql`${campaigns.submissions} + ${count.submissions}`,
      updatedAt: new Date(),
    }).where(eq(campaigns.id, row.id))
  }
}

export async function POST(request: NextRequest) {
  try {
    const host = request.headers.get('host') || ''
    let site = await resolveSiteByHost(host)
    if (!site && canUseDevelopmentSiteFallback(host)) {
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

    const sponsorGroups = collectSponsorImpressions(events)
    const hasCampaignEvents = events.some((event) => event && ['campaign_view', 'campaign_dismiss', 'campaign_submit'].includes(event.type))

    if (!groups.size && !sponsorGroups.size && !hasCampaignEvents) return new NextResponse(null, { status: 204 })

    await Promise.all([persistSponsorImpressions(site.id, sponsorGroups), persistCampaignCounters(site.id, events)])

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
