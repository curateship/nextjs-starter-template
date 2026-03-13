import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    // page_path might just be a path, but could include query params
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
      const { data } = await supabaseAdmin
        .from('sites')
        .select('id, subdomain, custom_domain')
        .eq('status', 'active')
        .limit(1)
        .single()
      if (data) site = data
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
      // Strip query params from page_path for storage
      let cleanPath = event.page_path
      try {
        if (cleanPath) cleanPath = new URL(cleanPath, 'http://localhost').pathname
      } catch { /* keep as-is */ }

      return {
        site_id: site.id,
        session_id: event.session_id,
        visitor_hash: visitorHash,
        event_type: event.type,
        page_path: cleanPath,
        referrer: event.referrer || null,
        referrer_domain: referrerDomain,
        utm_source: utmParams.utm_source || null,
        utm_medium: utmParams.utm_medium || null,
        utm_campaign: utmParams.utm_campaign || null,
        device_type: deviceType,
        browser,
        event_data: event.event_data || {},
        created_at: event.timestamp || new Date().toISOString(),
      }
    })

    // Batch insert events
    await supabaseAdmin.from('analytics_events').insert(rows)

    // Upsert session — find existing or create
    const sessionId = events[0].session_id
    const pageviewEvents = events.filter(e => e.type === 'pageview')

    if (pageviewEvents.length > 0) {
      const firstEvent = rows[0]
      const lastPageview = rows.filter(r => r.event_type === 'pageview').pop()

      const { data: existingSession } = await supabaseAdmin
        .from('analytics_sessions')
        .select('id, page_count, entry_page, started_at')
        .eq('site_id', site.id)
        .eq('session_id', sessionId)
        .single()

      if (existingSession) {
        const newPageCount = existingSession.page_count + pageviewEvents.length
        const durationSeconds = Math.floor(
          (new Date().getTime() - new Date(existingSession.started_at).getTime()) / 1000
        )
        await supabaseAdmin
          .from('analytics_sessions')
          .update({
            exit_page: lastPageview?.page_path || null,
            page_count: newPageCount,
            duration_seconds: durationSeconds,
            is_bounce: newPageCount <= 1,
            ended_at: new Date().toISOString(),
          })
          .eq('id', existingSession.id)
      } else {
        await supabaseAdmin.from('analytics_sessions').insert({
          site_id: site.id,
          session_id: sessionId,
          visitor_hash: visitorHash,
          entry_page: firstEvent.page_path,
          exit_page: lastPageview?.page_path || firstEvent.page_path,
          page_count: pageviewEvents.length,
          referrer_domain: firstEvent.referrer_domain,
          utm_source: firstEvent.utm_source,
          device_type: deviceType,
          is_bounce: pageviewEvents.length <= 1,
          started_at: firstEvent.created_at,
          ended_at: new Date().toISOString(),
        })
      }
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Analytics track error:', error)
    return new NextResponse(null, { status: 204 }) // Never fail visibly
  }
}
