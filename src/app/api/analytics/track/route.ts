import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyticsEvents, analyticsSessions, sites } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'

interface TrackEvent {
  type: string
  page_path?: string
  referrer?: string
  session_id: string
  event_data?: Record<string, unknown>
  timestamp?: string
}

function parseDeviceType(ua: string): string {
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) return 'mobile'
  if (/iPad|Android(?!.*Mobile)|Tablet/.test(ua)) return 'tablet'
  return 'desktop'
}

function parseBrowser(ua: string): string {
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chrome'
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari'
  return 'Other'
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

function extractUtmParams(pagePath: string): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  try {
    const url = new URL(pagePath, 'http://localhost')
    return {
      utm_source: url.searchParams.get('utm_source') || undefined,
      utm_medium: url.searchParams.get('utm_medium') || undefined,
      utm_campaign: url.searchParams.get('utm_campaign') || undefined,
    }
  } catch {
    return {}
  }
}

async function hashVisitor(ip: string, ua: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${ip}:${ua}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
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

    const body = await request.json()
    const events: TrackEvent[] = body.events
    if (!events?.length) return new NextResponse(null, { status: 204 })

    const ua = request.headers.get('user-agent') || ''
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               '0.0.0.0'

    const visitorHash = await hashVisitor(ip, ua)
    const deviceType = parseDeviceType(ua)
    const browser = parseBrowser(ua)

    // Build event rows
    const rows = events.map(event => {
      const utmParams = event.page_path ? extractUtmParams(event.page_path) : {}
      const referrerDomain = event.referrer ? extractDomain(event.referrer) : null
      let cleanPath = event.page_path
      try {
        if (cleanPath) cleanPath = new URL(cleanPath, 'http://localhost').pathname
      } catch { /* keep as-is */ }

      return {
        siteId: site!.id,
        sessionId: event.session_id,
        visitorHash,
        eventType: event.type,
        pagePath: cleanPath,
        referrer: event.referrer || null,
        referrerDomain,
        utmSource: utmParams.utm_source || null,
        utmMedium: utmParams.utm_medium || null,
        utmCampaign: utmParams.utm_campaign || null,
        deviceType,
        browser,
        eventData: event.event_data || {},
        createdAt: event.timestamp ? new Date(event.timestamp) : new Date(),
      }
    })

    // Batch insert events
    await db.insert(analyticsEvents).values(rows)

    // Upsert session
    const sessionId = events[0].session_id
    const pageviewEvents = events.filter(e => e.type === 'pageview')

    if (pageviewEvents.length > 0) {
      const firstEvent = rows[0]
      const lastPageview = rows.filter(r => r.eventType === 'pageview').pop()

      const [existingSession] = await db
        .select({
          id: analyticsSessions.id,
          pageCount: analyticsSessions.pageCount,
          entryPage: analyticsSessions.entryPage,
          startedAt: analyticsSessions.startedAt,
        })
        .from(analyticsSessions)
        .where(and(
          eq(analyticsSessions.siteId, site.id),
          eq(analyticsSessions.sessionId, sessionId),
        ))

      if (existingSession) {
        const newPageCount = (existingSession.pageCount ?? 0) + pageviewEvents.length
        const durationSeconds = Math.floor(
          (new Date().getTime() - new Date(existingSession.startedAt).getTime()) / 1000
        )
        await db
          .update(analyticsSessions)
          .set({
            exitPage: lastPageview?.pagePath || null,
            pageCount: newPageCount,
            durationSeconds,
            isBounce: newPageCount <= 1,
            endedAt: new Date(),
          })
          .where(eq(analyticsSessions.id, existingSession.id))
      } else {
        await db.insert(analyticsSessions).values({
          siteId: site.id,
          sessionId,
          visitorHash,
          entryPage: firstEvent.pagePath,
          exitPage: lastPageview?.pagePath || firstEvent.pagePath,
          pageCount: pageviewEvents.length,
          referrerDomain: firstEvent.referrerDomain,
          utmSource: firstEvent.utmSource,
          deviceType,
          isBounce: pageviewEvents.length <= 1,
          startedAt: firstEvent.createdAt,
          endedAt: new Date(),
        })
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Analytics track error:', error)
    return new NextResponse(null, { status: 204 }) // Never fail visibly
  }
}
